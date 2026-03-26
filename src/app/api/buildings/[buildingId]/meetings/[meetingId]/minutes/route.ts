/**
 * /api/buildings/[buildingId]/meetings/[meetingId]/minutes
 *
 * GET   — Return minutes for a meeting, or null if none exist yet.
 *         Requires: meeting:read
 *
 * POST  — Create a draft minutes record for a meeting.
 *         One record per meeting; returns 409 if already exists.
 *         Requires: meeting:update
 *
 * PATCH — Update content or advance the approval/publication lifecycle.
 *         Content edits: meeting:update
 *         Publish (approved → published): meeting:publish_minutes
 *
 * Status flow:
 *   draft → under_review → approved → published
 *   Any non-published status can revert to draft.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { MinutesStatus, AuditAction } from "@prisma/client";
import { nanoid } from "nanoid";

import { db }                  from "@/lib/db";
import { requirePermission }   from "@/lib/permissions";
import { serverHasPermission } from "@/lib/permissions";
import { getCurrentUser }      from "@/lib/auth-helpers";
import { logAudit }            from "@/lib/audit";
import { parseBody }           from "@/lib/validate";
import { ok, created, notFound, badRequest, conflict, forbidden, serverError } from "@/lib/api-response";

// ─── Shared select ────────────────────────────────────────────────────────────

const minutesSelect = {
  id:            true,
  meetingId:     true,
  content:       true,
  status:        true,
  approvedAt:    true,
  publishedAt:   true,
  createdAt:     true,
  updatedAt:     true,
  createdBy: {
    select: { id: true, name: true, image: true },
  },
  publishedBy: {
    select: { id: true, name: true },
  },
} as const;

// ─── Valid transitions ────────────────────────────────────────────────────────

const FORWARD: Partial<Record<MinutesStatus, MinutesStatus>> = {
  [MinutesStatus.draft]:        MinutesStatus.under_review,
  [MinutesStatus.under_review]: MinutesStatus.approved,
  [MinutesStatus.approved]:     MinutesStatus.published,
};

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("meeting:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, meetingId } = params;

  const meeting = await db.meeting.findFirst({
    where:  { id: meetingId, buildingId },
    select: { id: true },
  });
  if (!meeting) return notFound("Meeting");

  const minutes = await db.minutes.findUnique({
    where:  { meetingId },
    select: minutesSelect,
  });

  // Return null payload — 200 with data: null means "no minutes yet"
  return ok(minutes ?? null);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

const CreateMinutesSchema = z.object({
  content: z.string().min(1, "Minutes content cannot be empty"),
});

export const POST = requirePermission("meeting:update", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, meetingId } = params;

  const parse = await parseBody(req, CreateMinutesSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const meeting = await db.meeting.findFirst({
    where:  { id: meetingId, buildingId },
    select: { id: true, title: true },
  });
  if (!meeting) return notFound("Meeting");

  // Enforce one-per-meeting
  const existing = await db.minutes.findUnique({
    where:  { meetingId },
    select: { id: true },
  });
  if (existing) {
    return conflict("Minutes already exist for this meeting — use PATCH to update");
  }

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  try {
    const minutes = await db.minutes.create({
      data: {
        id:          nanoid(),
        meetingId,
        content:     input.content,
        createdById: user.id,
        updatedAt:   new Date(),
      },
      select: minutesSelect,
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "minutes",
      resourceId: minutes.id,
      buildingId,
      after:      { id: minutes.id, meetingId, status: minutes.status } as Record<string, unknown>,
      summary:    `Created draft minutes for meeting "${meeting.title}"`,
      req,
    });

    return created(minutes);
  } catch (err) {
    console.error("[minutes/POST]", err);
    return serverError();
  }
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

const PatchMinutesSchema = z
  .object({
    content: z.string().min(1).optional(),
    status:  z.nativeEnum(MinutesStatus).optional(),
  })
  .refine((d) => d.content !== undefined || d.status !== undefined, {
    message: "Provide content or status",
  });

export const PATCH = requirePermission("meeting:update", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, meetingId } = params;

  const parse = await parseBody(req, PatchMinutesSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const meeting = await db.meeting.findFirst({
    where:  { id: meetingId, buildingId },
    select: { id: true, title: true },
  });
  if (!meeting) return notFound("Meeting");

  const existing = await db.minutes.findUnique({
    where:  { meetingId },
    select: minutesSelect,
  });
  if (!existing) return notFound("Minutes");

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // ── Status transition checks ─────────────────────────────────────────────
  if (input.status && input.status !== existing.status) {
    const isForwardStep = FORWARD[existing.status] === input.status;
    const isRevert      = input.status === MinutesStatus.draft &&
                          existing.status !== MinutesStatus.published;

    if (!isForwardStep && !isRevert) {
      return badRequest(
        `Cannot transition minutes from "${existing.status}" to "${input.status}"`,
      );
    }

    // Publishing requires a separate, elevated permission
    if (input.status === MinutesStatus.published) {
      const canPublish = await serverHasPermission("meeting:publish_minutes", buildingId);
      if (!canPublish) return forbidden("meeting:publish_minutes");
    }

    // Published minutes are immutable
    if (existing.status === MinutesStatus.published) {
      return badRequest("Published minutes cannot be modified");
    }
  }

  // Content edits blocked once published
  if (input.content && existing.status === MinutesStatus.published) {
    return badRequest("Published minutes cannot be modified");
  }

  // ── Derive timestamps ──────────────────────────────────────────────────────
  const now = new Date();

  const approvedAt  =
    input.status === MinutesStatus.approved  && !existing.approvedAt  ? now  :
    input.status === MinutesStatus.draft                               ? null :
    undefined; // undefined = no change

  const publishedAt  =
    input.status === MinutesStatus.published && !existing.publishedAt ? now  :
    undefined;

  const publishedById =
    input.status === MinutesStatus.published ? user.id : undefined;

  try {
    const updated = await db.minutes.update({
      where: { meetingId },
      data:  {
        ...(input.content     !== undefined ? { content:      input.content }     : {}),
        ...(input.status      !== undefined ? { status:       input.status }      : {}),
        ...(approvedAt        !== undefined ? { approvedAt }                      : {}),
        ...(publishedAt       !== undefined ? { publishedAt }                     : {}),
        ...(publishedById     !== undefined ? { publishedById }                   : {}),
        updatedAt: now,
      },
      select: minutesSelect,
    });

    const auditAction =
      input.status === MinutesStatus.published ? AuditAction.publish :
      input.status === MinutesStatus.approved  ? AuditAction.approve :
      AuditAction.update;

    void logAudit({
      userId:     user.id,
      action:     auditAction,
      resource:   "minutes",
      resourceId: existing.id,
      buildingId,
      before:     { status: existing.status, updatedAt: existing.updatedAt } as Record<string, unknown>,
      after:      { status: updated.status,  updatedAt: updated.updatedAt  } as Record<string, unknown>,
      summary:    input.status
        ? `Minutes for "${meeting.title}" → ${input.status}`
        : `Updated draft minutes for "${meeting.title}"`,
      req,
    });

    return ok(updated);
  } catch (err) {
    console.error("[minutes/PATCH]", err);
    return serverError();
  }
});
