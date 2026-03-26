/**
 * /api/buildings/[buildingId]/meetings/[meetingId]/agenda
 *
 * GET  — Return all agenda items for a meeting, ordered by sortOrder.
 *        Requires: meeting:read
 *
 * POST — Add a new agenda item to a scheduled or in_progress meeting.
 *        Requires: meeting:update
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { MeetingStatus, AuditAction } from "@prisma/client";
import { nanoid } from "nanoid";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import { ok, created, notFound, badRequest, serverError } from "@/lib/api-response";

const agendaSelect = {
  id:           true,
  meetingId:    true,
  title:        true,
  description:  true,
  sortOrder:    true,
  presenter:    true,
  durationMins: true,
  status:       true,
  resolution:   true,
  createdAt:    true,
  updatedAt:    true,
} as const;

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

  const items = await db.agendaItem.findMany({
    where:   { meetingId },
    orderBy: { sortOrder: "asc" },
    select:  agendaSelect,
  });

  return ok(items);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

const CreateAgendaItemSchema = z.object({
  title:        z.string().min(1).max(255),
  description:  z.string().max(2000).optional(),
  sortOrder:    z.number().int().min(0).optional(),
  presenter:    z.string().max(255).optional(),
  durationMins: z.number().int().positive().optional(),
});

export const POST = requirePermission("meeting:update", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, meetingId } = params;

  const parse = await parseBody(req, CreateAgendaItemSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const meeting = await db.meeting.findFirst({
    where:  { id: meetingId, buildingId },
    select: { id: true, title: true, status: true },
  });
  if (!meeting) return notFound("Meeting");

  // Agenda can only be edited on active meetings
  if (
    meeting.status === MeetingStatus.completed ||
    meeting.status === MeetingStatus.cancelled
  ) {
    return badRequest(
      "Agenda items cannot be added to completed or cancelled meetings",
    );
  }

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // Auto-assign sortOrder = last + 1 if not provided
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const last = await db.agendaItem.findFirst({
      where:   { meetingId },
      orderBy: { sortOrder: "desc" },
      select:  { sortOrder: true },
    });
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }

  try {
    const item = await db.agendaItem.create({
      data: {
        id:           nanoid(),
        meetingId,
        title:        input.title,
        description:  input.description,
        sortOrder,
        presenter:    input.presenter,
        durationMins: input.durationMins,
        updatedAt:    new Date(),
      },
      select: agendaSelect,
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "agenda_item",
      resourceId: item.id,
      buildingId,
      after:      item as unknown as Record<string, unknown>,
      summary:    `Added agenda item "${input.title}" to meeting "${meeting.title}"`,
      req,
    });

    return created(item);
  } catch (err) {
    console.error("[agenda/POST]", err);
    return serverError();
  }
});
