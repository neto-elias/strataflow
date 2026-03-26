/**
 * /api/buildings/[buildingId]/maintenance/[requestId]
 *
 * GET   — Fetch a single maintenance request with full details.
 *         Requires: maintenance:read
 *
 * PATCH — Update a request's metadata, status, or assignment.
 *         Base gate:  maintenance:update
 *         Assignment change also requires: maintenance:assign
 *         Status → resolved or → closed also requires: maintenance:close
 *
 * Status transitions (strict forward-only):
 *   open        → in_progress
 *   in_progress → resolved    (sets resolvedAt)
 *   resolved    → closed      (sets closedAt)
 *   closed      → terminal; no further transitions allowed
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  MaintenanceStatus,
  MaintenancePriority,
  AuditAction,
} from "@prisma/client";

import { db }                  from "@/lib/db";
import { requirePermission, serverHasPermission } from "@/lib/permissions";
import { getCurrentUser }      from "@/lib/auth-helpers";
import { logAudit }            from "@/lib/audit";
import { parseBody }           from "@/lib/validate";
import {
  getMaintenanceVisibilityScope,
  isEligibleAssignee,
} from "@/lib/maintenance-access";
import {
  ok,
  notFound,
  badRequest,
  forbidden,
  serverError,
} from "@/lib/api-response";

// ─── Shared full select ───────────────────────────────────────────────────────

const requestDetailSelect = {
  id:                 true,
  buildingId:         true,
  lotId:              true,
  title:              true,
  description:        true,
  category:           true,
  priority:           true,
  status:             true,
  internalNotes:      true,
  estimatedCostCents: true,
  actualCostCents:    true,
  attachmentKeys:     true,
  createdAt:          true,
  updatedAt:          true,
  resolvedAt:         true,
  closedAt:           true,
  createdBy: {
    select: { id: true, name: true, image: true, email: true },
  },
  assignedTo: {
    select: { id: true, name: true, image: true, email: true },
  },
  lot: {
    select: { id: true, unitNumber: true, floor: true },
  },
} as const;

// ─── Valid transitions ────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<MaintenanceStatus, MaintenanceStatus>> = {
  [MaintenanceStatus.open]:        MaintenanceStatus.in_progress,
  [MaintenanceStatus.in_progress]: MaintenanceStatus.resolved,
  [MaintenanceStatus.resolved]:    MaintenanceStatus.closed,
};

// Transitions that require maintenance:close in addition to maintenance:update
const REQUIRES_CLOSE = new Set<MaintenanceStatus>([
  MaintenanceStatus.resolved,
  MaintenanceStatus.closed,
]);

// ─── PATCH schema ─────────────────────────────────────────────────────────────

const PatchSchema = z
  .object({
    status:             z.nativeEnum(MaintenanceStatus).optional(),
    assignedToId:       z.string().nullable().optional(),
    priority:           z.nativeEnum(MaintenancePriority).optional(),
    internalNotes:      z.string().max(5000).nullable().optional(),
    estimatedCostCents: z.number().int().min(0).nullable().optional(),
    actualCostCents:    z.number().int().min(0).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("maintenance:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, requestId } = params;

  // Resolve the caller to apply row-level visibility scoping.
  // An owner/tenant attempting to read another user's request by ID receives
  // notFound() — same as if the request didn't exist — revealing nothing.
  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  const scope = await getMaintenanceVisibilityScope(user.id, user.role, buildingId);

  const request = await db.maintenanceRequest.findFirst({
    where:  { id: requestId, buildingId, ...scope },
    select: requestDetailSelect,
  });

  if (!request) return notFound("Maintenance request");
  return ok(request);
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

export const PATCH = requirePermission("maintenance:update", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, requestId } = params;

  const parse = await parseBody(req, PatchSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const existing = await db.maintenanceRequest.findFirst({
    where:  { id: requestId, buildingId },
    select: requestDetailSelect,
  });
  if (!existing) return notFound("Maintenance request");

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // ── Terminal state guard ─────────────────────────────────────────────────
  // Closed is terminal and fully immutable except for cost fields
  // (estimatedCostCents, actualCostCents), which remain editable for
  // post-close invoice reconciliation.
  // internalNotes is also locked: closed = no further documentation changes.
  if (existing.status === MaintenanceStatus.closed) {
    const lockedKeys: Array<keyof typeof input> = [
      "status", "assignedToId", "priority", "internalNotes",
    ];
    const hasLockedEdit = lockedKeys.some((k) => input[k] !== undefined);
    if (hasLockedEdit) {
      return badRequest(
        "Closed requests are immutable. Only cost fields may be updated after closing.",
      );
    }
  }

  // ── Status transition validation ─────────────────────────────────────────
  if (input.status !== undefined && input.status !== existing.status) {
    const allowedNext = VALID_TRANSITIONS[existing.status];
    if (!allowedNext || input.status !== allowedNext) {
      return badRequest(
        `Cannot transition from "${existing.status}" to "${input.status}". ` +
        `Allowed next status: "${allowedNext ?? "none (terminal)"}"`,
      );
    }

    // Advancing to resolved or closed requires maintenance:close
    if (REQUIRES_CLOSE.has(input.status)) {
      const canClose = await serverHasPermission("maintenance:close", buildingId);
      if (!canClose) return forbidden("maintenance:close");
    }
  }

  // ── Assignment permission check ───────────────────────────────────────────
  if (input.assignedToId !== undefined) {
    const canAssign = await serverHasPermission("maintenance:assign", buildingId);
    if (!canAssign) return forbidden("maintenance:assign");

    // Verify the assignee is building-eligible: must be admin, manager, or
    // an active council member for this specific building.
    // Unrelated system users are rejected even if they exist in the DB.
    if (input.assignedToId !== null) {
      const eligible = await isEligibleAssignee(input.assignedToId, buildingId);
      if (!eligible) {
        return badRequest(
          "Assigned user is not eligible for assignment in this building. " +
          "Assignees must be admins, managers, or active council members.",
        );
      }
    }
  }

  // ── Derive server-managed timestamps ─────────────────────────────────────
  const now = new Date();
  const resolvedAt =
    input.status === MaintenanceStatus.resolved && !existing.resolvedAt
      ? now
      : undefined;
  const closedAt =
    input.status === MaintenanceStatus.closed && !existing.closedAt
      ? now
      : undefined;

  // ── Determine audit action ────────────────────────────────────────────────
  // Use assign when the only meaningful change is the assignee; update otherwise.
  const isAssignmentOnly =
    input.assignedToId !== undefined &&
    input.status === undefined &&
    input.priority === undefined;
  const auditAction = isAssignmentOnly ? AuditAction.assign : AuditAction.update;

  try {
    const updated = await db.maintenanceRequest.update({
      where: { id: requestId },
      data:  {
        ...(input.status             !== undefined ? { status:             input.status }             : {}),
        ...(input.assignedToId       !== undefined ? { assignedToId:       input.assignedToId }       : {}),
        ...(input.priority           !== undefined ? { priority:           input.priority }           : {}),
        ...(input.internalNotes      !== undefined ? { internalNotes:      input.internalNotes }      : {}),
        ...(input.estimatedCostCents !== undefined ? { estimatedCostCents: input.estimatedCostCents } : {}),
        ...(input.actualCostCents    !== undefined ? { actualCostCents:    input.actualCostCents }    : {}),
        ...(resolvedAt               !== undefined ? { resolvedAt }                                   : {}),
        ...(closedAt                 !== undefined ? { closedAt }                                     : {}),
        updatedAt: now,
      },
      select: requestDetailSelect,
    });

    // Build a meaningful summary for the audit trail
    let summary: string;
    if (input.status && input.status !== existing.status) {
      summary = `Maintenance request "${existing.title}" status: ${existing.status} → ${input.status}`;
    } else if (input.assignedToId !== undefined) {
      summary = input.assignedToId
        ? `Assigned maintenance request "${existing.title}" to user ${input.assignedToId}`
        : `Unassigned maintenance request "${existing.title}"`;
    } else {
      summary = `Updated maintenance request "${existing.title}"`;
    }

    void logAudit({
      userId:     user.id,
      action:     auditAction,
      resource:   "maintenance_request",
      resourceId: requestId,
      buildingId,
      before:     existing as unknown as Record<string, unknown>,
      after:      updated  as unknown as Record<string, unknown>,
      summary,
      req,
    });

    return ok(updated);
  } catch (err) {
    console.error("[maintenance/[requestId]/PATCH]", err);
    return serverError();
  }
});
