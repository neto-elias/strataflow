/**
 * /api/buildings/[buildingId]/meetings
 *
 * GET  — List meetings for a building with optional status filter.
 *        Requires: meeting:read
 *
 * POST — Schedule a new meeting.
 *        Requires: meeting:create
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { MeetingStatus, MeetingType, AuditAction } from "@prisma/client";
import { nanoid } from "nanoid";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody, parseQuery } from "@/lib/validate";
import { ok, created, serverError } from "@/lib/api-response";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ListMeetingsQuerySchema = z.object({
  status: z.nativeEnum(MeetingStatus).optional(),
});

const CreateMeetingSchema = z.object({
  title:       z.string().min(1).max(255),
  type:        z.nativeEnum(MeetingType),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO 8601 datetime" }),
  location:    z.string().max(500).optional(),
  videoUrl:    z.string().url({ message: "videoUrl must be a valid URL" }).optional(),
  quorum:      z.number().int().positive().optional(),
  notes:       z.string().max(2000).optional(),
});

// ─── GET /api/buildings/[buildingId]/meetings ─────────────────────────────────

export const GET = requirePermission("meeting:read", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const qParse = parseQuery(req.nextUrl.searchParams, ListMeetingsQuerySchema);
  if (!qParse.success) return qParse.response;
  const { status } = qParse.data;

  const meetings = await db.meeting.findMany({
    where: {
      buildingId,
      ...(status ? { status } : {}),
    },
    orderBy: { scheduledAt: "desc" },
    select: {
      id:            true,
      title:         true,
      type:          true,
      status:        true,
      scheduledAt:   true,
      endedAt:       true,
      location:      true,
      videoUrl:      true,
      quorum:        true,
      attendeeCount: true,
      createdAt:     true,
      createdBy: {
        select: { id: true, name: true },
      },
      _count: {
        select: { agendaItems: true },
      },
    },
  });

  return ok(meetings);
});

// ─── POST /api/buildings/[buildingId]/meetings ────────────────────────────────

export const POST = requirePermission("meeting:create", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  // 1. Validate body
  const parse = await parseBody(req, CreateMeetingSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  // 2. Resolve caller
  const user = await getCurrentUser();
  if (!user) return serverError("Session unexpectedly missing after auth gate");

  // 3. Persist
  try {
    const meeting = await db.meeting.create({
      data: {
        id:          nanoid(),
        buildingId,
        title:       input.title,
        type:        input.type,
        scheduledAt: new Date(input.scheduledAt),
        location:    input.location,
        videoUrl:    input.videoUrl,
        quorum:      input.quorum,
        notes:       input.notes,
        createdById: user.id,
        updatedAt:   new Date(),
      },
      select: {
        id:          true,
        title:       true,
        type:        true,
        status:      true,
        scheduledAt: true,
        location:    true,
        quorum:      true,
        createdAt:   true,
      },
    });

    // 4. Audit log
    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "meeting",
      resourceId: meeting.id,
      buildingId,
      after:      meeting as Record<string, unknown>,
      summary:    `Scheduled ${input.type} meeting "${input.title}" for ${input.scheduledAt}`,
      req,
    });

    return created(meeting);
  } catch (err) {
    console.error("[meetings/POST]", err);
    return serverError();
  }
});
