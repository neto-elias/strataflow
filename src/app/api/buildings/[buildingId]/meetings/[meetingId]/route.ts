/**
 * /api/buildings/[buildingId]/meetings/[meetingId]
 *
 * GET   — Fetch a single meeting with agenda item count and minutes status.
 *         Requires: meeting:read
 *
 * PATCH — Update meeting metadata or advance its lifecycle status.
 *         Metadata edits: meeting:update
 *         Status → cancelled: meeting:cancel
 *
 * Valid status transitions:
 *   scheduled   → in_progress  (start meeting)
 *   scheduled   → cancelled
 *   in_progress → completed    (end meeting; sets endedAt)
 *   in_progress → cancelled
 *   completed   → (terminal — no further transitions)
 *   cancelled   → (terminal)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { MeetingStatus, MeetingType, AuditAction } from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { serverHasPermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import { ok, notFound, badRequest, forbidden, serverError } from "@/lib/api-response";

// ─── Shared select ────────────────────────────────────────────────────────────

const meetingSelect = {
  id:            true,
  buildingId:    true,
  title:         true,
  type:          true,
  status:        true,
  scheduledAt:   true,
  endedAt:       true,
  location:      true,
  videoUrl:      true,
  quorum:        true,
  attendeeCount: true,
  notes:         true,
  createdAt:     true,
  updatedAt:     true,
  createdBy: {
    select: { id: true, name: true, image: true },
  },
  _count: {
    select: { agendaItems: true },
  },
} as const;

// ─── Valid status transitions ─────────────────────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<MeetingStatus, MeetingStatus[]>> = {
  [MeetingStatus.scheduled]:   [MeetingStatus.in_progress, MeetingStatus.cancelled],
  [MeetingStatus.in_progress]: [MeetingStatus.completed,   MeetingStatus.cancelled],
};

// ─── PATCH schema ─────────────────────────────────────────────────────────────

const PatchMeetingSchema = z
  .object({
    title:         z.string().min(1).max(255).optional(),
    type:          z.nativeEnum(MeetingType).optional(),
    scheduledAt:   z.string().datetime().optional(),
    location:      z.string().max(500).nullable().optional(),
    videoUrl:      z.string().url().nullable().optional(),
    quorum:        z.number().int().positive().nullable().optional(),
    notes:         z.string().max(2000).nullable().optional(),
    attendeeCount: z.number().int().min(0).nullable().optional(),
    status:        z.nativeEnum(MeetingStatus).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("meeting:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, meetingId } = params;

  const meeting = await db.meeting.findFirst({
    where:  { id: meetingId, buildingId },
    select: meetingSelect,
  });

  if (!meeting) return notFound("Meeting");
  return ok(meeting);
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

export const PATCH = requirePermission("meeting:update", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, meetingId } = params;

  const parse = await parseBody(req, PatchMeetingSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const existing = await db.meeting.findFirst({
    where:  { id: meetingId, buildingId },
    select: meetingSelect,
  });
  if (!existing) return notFound("Meeting");

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // ── Status transition validation ────────────────────────────────────────────
  if (input.status && input.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(input.status)) {
      return badRequest(
        `Cannot transition from "${existing.status}" to "${input.status}"`,
      );
    }

    // Cancellation requires meeting:cancel in addition to the base gate
    if (input.status === MeetingStatus.cancelled) {
      const canCancel = await serverHasPermission("meeting:cancel", buildingId);
      if (!canCancel) return forbidden("meeting:cancel");
    }
  }

  // ── Guard metadata edits on terminal meetings ───────────────────────────────
  const metadataKeys = ["title", "type", "scheduledAt", "location", "videoUrl", "quorum"] as const;
  const hasMetaEdit  = metadataKeys.some((k) => input[k] !== undefined);
  const isTerminal   = existing.status === MeetingStatus.completed ||
                       existing.status === MeetingStatus.cancelled;

  if (hasMetaEdit && isTerminal) {
    return badRequest("Metadata cannot be changed on completed or cancelled meetings");
  }

  // ── Derive derived fields ───────────────────────────────────────────────────
  const now    = new Date();
  const endedAt = input.status === MeetingStatus.completed && !existing.endedAt
    ? now
    : undefined;

  try {
    const updated = await db.meeting.update({
      where: { id: meetingId },
      data:  {
        ...(input.title         !== undefined ? { title:         input.title }                    : {}),
        ...(input.type          !== undefined ? { type:          input.type }                     : {}),
        ...(input.scheduledAt   !== undefined ? { scheduledAt:   new Date(input.scheduledAt) }   : {}),
        ...(input.location      !== undefined ? { location:      input.location }                : {}),
        ...(input.videoUrl      !== undefined ? { videoUrl:      input.videoUrl }                : {}),
        ...(input.quorum        !== undefined ? { quorum:        input.quorum }                  : {}),
        ...(input.notes         !== undefined ? { notes:         input.notes }                   : {}),
        ...(input.attendeeCount !== undefined ? { attendeeCount: input.attendeeCount }           : {}),
        ...(input.status        !== undefined ? { status:        input.status }                  : {}),
        ...(endedAt             !== undefined ? { endedAt }                                      : {}),
        updatedAt: now,
      },
      select: meetingSelect,
    });

    // AuditAction has no "cancel" value. We use "update" (not "delete") because
    // the record is not removed — its status is changed. The summary string and
    // before/after snapshot make the cancellation unambiguous in the audit trail.
    const action = AuditAction.update;

    void logAudit({
      userId:     user.id,
      action,
      resource:   "meeting",
      resourceId: meetingId,
      buildingId,
      before:     existing as unknown as Record<string, unknown>,
      after:      updated  as unknown as Record<string, unknown>,
      summary:    input.status
        ? `Meeting "${existing.title}" status changed: ${existing.status} → ${input.status}`
        : `Updated meeting "${existing.title}"`,
      req,
    });

    return ok(updated);
  } catch (err) {
    console.error("[meetings/PATCH]", err);
    return serverError();
  }
});
