/**
 * /api/buildings/[buildingId]/maintenance
 *
 * GET  — List maintenance requests for a building.
 *        Requires: maintenance:read
 *        Query:    status?, priority?, category?, assignedToId?
 *
 * POST — Submit a new maintenance request.
 *        Requires: maintenance:create
 *        Body:     title, description, category, priority?, lotId?,
 *                  estimatedCostCents?
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  MaintenanceStatus,
  MaintenancePriority,
  MaintenanceCategory,
  AuditAction,
} from "@prisma/client";
import { nanoid } from "nanoid";

import { db }                    from "@/lib/db";
import { requirePermission }     from "@/lib/permissions";
import { getCurrentUser }        from "@/lib/auth-helpers";
import { logAudit }              from "@/lib/audit";
import { parseBody, parseQuery } from "@/lib/validate";
import { getMaintenanceVisibilityScope } from "@/lib/maintenance-access";
import {
  ok,
  created,
  badRequest,
  serverError,
} from "@/lib/api-response";

// ─── Shared select ────────────────────────────────────────────────────────────

export const requestListSelect = {
  id:                 true,
  title:              true,
  category:           true,
  priority:           true,
  status:             true,
  lotId:              true,
  createdAt:          true,
  updatedAt:          true,
  resolvedAt:         true,
  closedAt:           true,
  estimatedCostCents: true,
  createdBy: {
    select: { id: true, name: true, image: true },
  },
  assignedTo: {
    select: { id: true, name: true, image: true },
  },
  lot: {
    select: { id: true, unitNumber: true },
  },
} as const;

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ListQuerySchema = z.object({
  status:       z.nativeEnum(MaintenanceStatus).optional(),
  priority:     z.nativeEnum(MaintenancePriority).optional(),
  category:     z.nativeEnum(MaintenanceCategory).optional(),
  assignedToId: z.string().optional(),
});

const CreateSchema = z.object({
  title:              z.string().min(1).max(255),
  description:        z.string().min(1).max(5000),
  category:           z.nativeEnum(MaintenanceCategory),
  priority:           z.nativeEnum(MaintenancePriority).optional(),
  lotId:              z.string().optional(),
  estimatedCostCents: z.number().int().min(0).optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("maintenance:read", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const qParse = parseQuery(req.nextUrl.searchParams, ListQuerySchema);
  if (!qParse.success) return qParse.response;
  const { status, priority, category, assignedToId } = qParse.data;

  // Resolve the caller so we can apply row-level visibility scoping.
  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // Apply role-based visibility: owners/tenants see only their own requests;
  // council members, managers, and admins see all. See maintenance-access.ts.
  const scope = await getMaintenanceVisibilityScope(user.id, user.role, buildingId);

  const requests = await db.maintenanceRequest.findMany({
    where: {
      buildingId,
      ...scope,
      ...(status       ? { status }       : {}),
      ...(priority     ? { priority }     : {}),
      ...(category     ? { category }     : {}),
      ...(assignedToId ? { assignedToId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select:  requestListSelect,
  });

  return ok(requests);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

export const POST = requirePermission("maintenance:create", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const parse = await parseBody(req, CreateSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // Validate lotId belongs to this building when supplied
  if (input.lotId) {
    const lot = await db.strataLot.findFirst({
      where:  { id: input.lotId, buildingId },
      select: { id: true },
    });
    if (!lot) return badRequest("Lot does not belong to this building");
  }

  try {
    const request = await db.maintenanceRequest.create({
      data: {
        id:                 nanoid(),
        buildingId,
        title:              input.title,
        description:        input.description,
        category:           input.category,
        priority:           input.priority ?? MaintenancePriority.medium,
        lotId:              input.lotId,
        estimatedCostCents: input.estimatedCostCents,
        createdById:        user.id,
        updatedAt:          new Date(),
      },
      select: requestListSelect,
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "maintenance_request",
      resourceId: request.id,
      buildingId,
      after:      request as unknown as Record<string, unknown>,
      summary:    `Submitted maintenance request "${input.title}" (${input.category}, ${input.priority ?? "medium"})`,
      req,
    });

    return created(request);
  } catch (err) {
    console.error("[maintenance/POST]", err);
    return serverError();
  }
});
