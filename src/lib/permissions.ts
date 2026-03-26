/**
 * StrataFlow — Permission Check Service
 *
 * Provides:
 *   hasPermission()      — core async check (used in server components, API routes)
 *   requirePermission()  — Next.js API route middleware factory (throws on denial)
 *   getGrantedKeys()     — returns all permission keys for a user+building context
 *
 * Check order:
 *   1. admin short-circuit  → always true (no DB hit)
 *   2. system role          → query RolePermission WHERE systemRole = user.role
 *   3. council role         → query CouncilMembership for building, then RolePermission
 *
 * Caching strategy (production):
 *   Wrap hasPermission with Redis cache keyed on (userId, permissionKey, buildingId).
 *   TTL = 60s. Invalidate on: role change, membership change, grant change.
 *   The cache layer is NOT implemented here to keep this file infrastructure-agnostic.
 */

import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import type { PermissionKey } from "../../prisma/permission-definitions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PermissionContext {
  /** The user whose permissions are being checked. */
  userId: string;

  /** System role of the user — pulled once per request and passed through. */
  userRole: UserRole;

  /**
   * If provided, the check also evaluates council-role grants for this
   * building. Omit for platform-level (system-scope) checks.
   */
  buildingId?: string;
}

export type ApiHandler = (
  req: NextRequest,
  context: { params: Record<string, string> },
) => Promise<NextResponse> | NextResponse;

// ─── Core check ──────────────────────────────────────────────────────────────

/**
 * Returns true if the user has the given permission, false otherwise.
 *
 * @example
 * // In a Server Component or API route:
 * const allowed = await hasPermission(
 *   { userId: session.user.id, userRole: session.user.role },
 *   "document:upload",
 *   buildingId,
 * );
 */
export async function hasPermission(
  ctx: PermissionContext,
  key: PermissionKey | string,
): Promise<boolean> {
  // ── 1. Admin bypass ────────────────────────────────────────────────────────
  // Admins have unrestricted access.  Short-circuit before any DB query.
  if (ctx.userRole === UserRole.admin) return true;

  // ── 2. Fetch permission record ─────────────────────────────────────────────
  const permission = await db.permission.findUnique({
    where:  { key },
    select: { id: true, scope: true },
  });

  // Unknown permission key → deny (fail-closed)
  if (!permission) return false;

  // ── 3. System-scope check ─────────────────────────────────────────────────
  // Check whether the user's system role has been granted this permission.
  const systemGrant = await db.rolePermission.findFirst({
    where: {
      permissionId: permission.id,
      systemRole:   ctx.userRole,
    },
    select: { id: true },
  });
  if (systemGrant) return true;

  // ── 4. Building-scope council check ───────────────────────────────────────
  // Only meaningful if the permission is building-scoped AND a buildingId
  // was supplied.  Skip otherwise.
  if (permission.scope === "building" && ctx.buildingId) {
    const membership = await db.councilMembership.findFirst({
      where: {
        userId:     ctx.userId,
        buildingId: ctx.buildingId,
        isActive:   true,
      },
      select: { role: true },
    });

    if (membership) {
      const councilGrant = await db.rolePermission.findFirst({
        where: {
          permissionId: permission.id,
          councilRole:  membership.role,
        },
        select: { id: true },
      });
      if (councilGrant) return true;
    }
  }

  return false;
}

// ─── Bulk check ───────────────────────────────────────────────────────────────

/**
 * Returns the full set of permission keys granted to a user in a given context.
 * Useful for building a capability map on the frontend (e.g. hiding buttons).
 *
 * @example
 * const caps = await getGrantedKeys({ userId, userRole, buildingId });
 * // caps = Set { "document:read", "document:upload", "meeting:read", ... }
 */
export async function getGrantedKeys(ctx: PermissionContext): Promise<Set<string>> {
  if (ctx.userRole === UserRole.admin) {
    // Return all known permission keys
    const all = await db.permission.findMany({ select: { key: true } });
    return new Set(all.map((p) => p.key));
  }

  const granted = new Set<string>();

  // System grants
  const systemGrants = await db.rolePermission.findMany({
    where: { systemRole: ctx.userRole },
    include: { permission: { select: { key: true } } },
  });
  systemGrants.forEach((rp) => granted.add(rp.permission.key));

  // Council grants
  if (ctx.buildingId) {
    const membership = await db.councilMembership.findFirst({
      where: {
        userId:     ctx.userId,
        buildingId: ctx.buildingId,
        isActive:   true,
      },
      select: { role: true },
    });

    if (membership) {
      const councilGrants = await db.rolePermission.findMany({
        where: { councilRole: membership.role },
        include: { permission: { select: { key: true } } },
      });
      councilGrants.forEach((rp) => granted.add(rp.permission.key));
    }
  }

  return granted;
}

// ─── Middleware factory ───────────────────────────────────────────────────────

interface RequirePermissionOptions {
  /**
   * How to extract the buildingId from the request.
   *   "param"  → reads req.nextUrl route param (e.g. /buildings/[buildingId]/...)
   *   "query"  → reads ?buildingId=... query param
   *   "body"   → reads JSON body (async, only for POST/PUT)
   *   "none"   → system-scope check only (default)
   */
  buildingIdSource?: "param" | "query" | "body" | "none";

  /** The route param name when buildingIdSource = "param". Default: "buildingId" */
  buildingIdParam?: string;
}

/**
 * Wraps a Next.js App Router API handler with a permission gate.
 *
 * @example
 * // app/api/buildings/[buildingId]/documents/route.ts
 * export const POST = requirePermission("document:upload", {
 *   buildingIdSource: "param",
 * })(async (req, ctx) => {
 *   // handler only runs if the caller has document:upload for this building
 *   return NextResponse.json({ ok: true });
 * });
 */
export function requirePermission(
  key: PermissionKey | string,
  options: RequirePermissionOptions = {},
) {
  const {
    buildingIdSource = "none",
    buildingIdParam  = "buildingId",
  } = options;

  return function wrap(handler: ApiHandler): ApiHandler {
    return async function gated(req, routeCtx) {
      // 1. Authenticate
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
      }

      const userId   = session.user.id;
      const userRole = session.user.role;

      // 2. Resolve buildingId
      let buildingId: string | undefined;
      if (buildingIdSource === "param") {
        buildingId = routeCtx.params[buildingIdParam];
      } else if (buildingIdSource === "query") {
        buildingId = req.nextUrl.searchParams.get(buildingIdParam) ?? undefined;
      } else if (buildingIdSource === "body") {
        try {
          const body = await req.clone().json();
          buildingId = body[buildingIdParam];
        } catch {
          // malformed body — proceed without buildingId (system check only)
        }
      }

      // 3. Check permission
      const allowed = await hasPermission(
        { userId, userRole, buildingId },
        key,
      );

      if (!allowed) {
        return NextResponse.json(
          { error: "Forbidden", required: key },
          { status: 403 },
        );
      }

      return handler(req, routeCtx);
    };
  };
}

// ─── Server Component helper ─────────────────────────────────────────────────

/**
 * Convenience wrapper for use in React Server Components.
 * Reads the session internally so you don't have to pass it in.
 *
 * @example
 * // In a Server Component:
 * const canUpload = await serverHasPermission("document:upload", buildingId);
 */
export async function serverHasPermission(
  key: PermissionKey | string,
  buildingId?: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;

  const userRole = session.user.role;

  return hasPermission(
    { userId: session.user.id, userRole, buildingId },
    key,
  );
}
