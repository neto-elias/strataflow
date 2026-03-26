/**
 * StrataFlow — Audit Logging Service
 *
 * Writes append-only entries to the `audit_logs` table.
 *
 * Design principles:
 *   - Never throws / never aborts the caller's request.  Errors are caught
 *     internally and logged to stderr for monitoring.
 *   - Sensitive field values are masked before serialisation (see
 *     SENSITIVE_KEYS below).
 *   - Request metadata (IP, User-Agent) is extracted from the NextRequest
 *     when provided.
 *   - `before` / `after` snapshots are optional; include them on update/delete
 *     so the log is useful for rollback analysis.
 *
 * Usage:
 *
 *   // Minimal — fire-and-forget
 *   void logAudit({ userId, action: AuditAction.create, resource: "document",
 *                   resourceId: doc.id, buildingId, req });
 *
 *   // With before/after snapshot (update flow)
 *   const before = await db.meeting.findUnique(...);
 *   const after  = await db.meeting.update(...);
 *   await logAudit({ userId, action: AuditAction.update, resource: "meeting",
 *                    resourceId: after.id, buildingId, before, after, req });
 */

import { AuditAction } from "@prisma/client";
import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";

// ─── Sensitive field masking ──────────────────────────────────────────────────

/**
 * Field names whose values are always replaced with "[REDACTED]" regardless
 * of nesting depth.  Add any domain-specific secrets here.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // Auth / identity
  "password",
  "passwordHash",
  "hash",
  "salt",
  "secret",
  "clientSecret",
  // Tokens
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "verificationToken",
  "resetToken",
  // Keys
  "apiKey",
  "apiSecret",
  "privateKey",
  "encryptionKey",
  "webhookSecret",
  // HTTP
  "authorization",
  "cookie",
  // Payment provider raw payloads (may contain card data)
  "providerPayload",
]);

/**
 * Recursively traverses `obj` and replaces values whose key appears in
 * SENSITIVE_KEYS with the string "[REDACTED]".
 *
 * - Arrays are traversed element-by-element.
 * - Depth is capped at 10 to guard against pathological inputs.
 * - Primitives (string, number, boolean, null) are returned as-is.
 */
function maskSensitiveFields(obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveFields(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key)
      ? "[REDACTED]"
      : maskSensitiveFields(value, depth + 1);
  }
  return result;
}

// ─── Request metadata extraction ─────────────────────────────────────────────

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Extracts the real client IP and User-Agent from a Next.js request.
 * Respects the `x-forwarded-for` header for reverse-proxy deployments
 * (Vercel, Cloudflare, etc.).
 */
function extractRequestMeta(req?: NextRequest): RequestMeta {
  if (!req) return {};

  const forwarded = req.headers.get("x-forwarded-for");
  const realIp    = req.headers.get("x-real-ip");

  // x-forwarded-for may be a comma-separated list; the leftmost is the client
  const ipAddress = forwarded?.split(",")[0]?.trim() ?? realIp ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  return { ipAddress, userAgent };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AuditPayload {
  /** The authenticated user performing the action.  Nullable for system jobs. */
  userId?:     string;

  /** The action being performed (Prisma enum). */
  action:      AuditAction;

  /** Logical resource name, e.g. "document", "meeting", "invoice". */
  resource:    string;

  /** Primary key of the affected record. */
  resourceId:  string;

  /** Building context — omit for system-scope actions. */
  buildingId?: string;

  /**
   * Snapshot of the record before the mutation.
   * Include for update and delete operations.
   */
  before?:     Record<string, unknown>;

  /**
   * Snapshot of the record after the mutation.
   * Include for create and update operations.
   */
  after?:      Record<string, unknown>;

  /** Optional human-readable summary (auto-generated if omitted). */
  summary?:    string;

  /** Originating request — used to extract IP and User-Agent. */
  req?:        NextRequest;
}

/**
 * Write a single audit log entry.
 *
 * Safe to `await` (guaranteed to not throw) or to fire-and-forget with
 * `void logAudit(...)` when you don't need to wait on the write.
 *
 * @example
 * await logAudit({
 *   userId:     session.user.id,
 *   action:     AuditAction.create,
 *   resource:   "document",
 *   resourceId: doc.id,
 *   buildingId: params.buildingId,
 *   after:      doc,
 *   req,
 * });
 */
export async function logAudit(payload: AuditPayload): Promise<void> {
  const { ipAddress, userAgent } = extractRequestMeta(payload.req);

  // Mask sensitive fields before persisting snapshots
  const before = payload.before
    ? (maskSensitiveFields(payload.before) as Record<string, unknown>)
    : undefined;
  const after = payload.after
    ? (maskSensitiveFields(payload.after) as Record<string, unknown>)
    : undefined;

  const summary =
    payload.summary ?? buildSummary(payload.action, payload.resource, payload.resourceId);

  try {
    await db.auditLog.create({
      data: {
        id:         nanoid(),
        userId:     payload.userId,
        action:     payload.action,
        resource:   payload.resource,
        resourceId: payload.resourceId,
        buildingId: payload.buildingId,
        // Prisma accepts `InputJsonValue`; the cast is safe because we
        // masked the object but preserved its structure.
        before:     before as never,
        after:      after  as never,
        summary,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    // Audit failures must NEVER surface to users or abort the main flow.
    // Log to stderr so APM / log aggregators can alert on persistent failures.
    console.error("[audit] Failed to write audit log entry:", {
      action:     payload.action,
      resource:   payload.resource,
      resourceId: payload.resourceId,
      error:      err,
    });
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

// Past-tense verb map — covers every value in the AuditAction enum.
const PAST_TENSE: Record<AuditAction, string> = {
  [AuditAction.create]:   "Created",
  [AuditAction.update]:   "Updated",
  [AuditAction.delete]:   "Deleted",
  [AuditAction.restore]:  "Restored",
  [AuditAction.publish]:  "Published",
  [AuditAction.approve]:  "Approved",
  [AuditAction.reject]:   "Rejected",
  [AuditAction.assign]:   "Assigned",
  [AuditAction.upload]:   "Uploaded",
  [AuditAction.download]: "Downloaded",
  [AuditAction.login]:    "Logged in as",
  [AuditAction.logout]:   "Logged out of",
  [AuditAction.invite]:   "Invited",
  [AuditAction.revoke]:   "Revoked",
};

/**
 * Builds a default human-readable summary string when the caller doesn't
 * supply one.
 *
 * @example
 * buildSummary(AuditAction.create, "document", "abc123")
 * // → "Created document abc123"
 */
export function buildSummary(
  action:     AuditAction,
  resource:   string,
  resourceId: string,
): string {
  const verb = PAST_TENSE[action] ?? action;
  return `${verb} ${resource} ${resourceId}`;
}

// Re-export the enum so callers only need one import for everything audit-related.
export { AuditAction };
