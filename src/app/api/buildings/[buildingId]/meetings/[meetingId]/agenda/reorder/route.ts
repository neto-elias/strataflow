/**
 * POST /api/buildings/[buildingId]/meetings/[meetingId]/agenda/reorder
 *
 * Atomically swaps the sortOrder of two adjacent agenda items.
 * Both updates run inside a single db.$transaction — partial writes
 * are impossible.
 *
 * Requires: meeting:update
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { MeetingStatus, AuditAction } from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import { ok, notFound, badRequest, serverError } from "@/lib/api-response";

const ReorderSchema = z.object({
  itemId:    z.string().min(1),
  direction: z.enum(["up", "down"]),
});

// Select shape that matches AgendaItemData on the frontend
const agendaItemSelect = {
  id:           true,
  title:        true,
  description:  true,
  sortOrder:    true,
  presenter:    true,
  durationMins: true,
  status:       true,
  resolution:   true,
} as const;

export const POST = requirePermission("meeting:update", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, meetingId } = params;

  const parse = await parseBody(req, ReorderSchema);
  if (!parse.success) return parse.response;
  const { itemId, direction } = parse.data;

  // Verify meeting exists and belongs to this building
  const meeting = await db.meeting.findFirst({
    where:  { id: meetingId, buildingId },
    select: { id: true, status: true },
  });
  if (!meeting) return notFound("Meeting");

  if (
    meeting.status === MeetingStatus.completed ||
    meeting.status === MeetingStatus.cancelled
  ) {
    return badRequest("Agenda cannot be reordered on completed or cancelled meetings");
  }

  // Fetch all items in current order to find the target pair
  const items = await db.agendaItem.findMany({
    where:   { meetingId },
    orderBy: { sortOrder: "asc" },
    select:  { id: true, title: true, sortOrder: true },
  });

  const index = items.findIndex((i) => i.id === itemId);
  if (index === -1) return notFound("Agenda item");

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return badRequest(`Cannot move item ${direction} — already at boundary`);
  }

  const item   = items[index];
  const target = items[targetIndex];

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  const now = new Date();

  try {
    // Atomic swap — both writes or neither
    await db.$transaction([
      db.agendaItem.update({
        where: { id: item.id },
        data:  { sortOrder: target.sortOrder, updatedAt: now },
      }),
      db.agendaItem.update({
        where: { id: target.id },
        data:  { sortOrder: item.sortOrder, updatedAt: now },
      }),
    ]);
  } catch (err) {
    console.error("[agenda/reorder]", err);
    return serverError();
  }

  // Return full ordered list after swap
  const updated = await db.agendaItem.findMany({
    where:   { meetingId },
    orderBy: { sortOrder: "asc" },
    select:  agendaItemSelect,
  });

  void logAudit({
    userId:     user.id,
    action:     AuditAction.update,
    resource:   "agenda_item",
    resourceId: itemId,
    buildingId,
    before: { id: item.id,   sortOrder: item.sortOrder   } as Record<string, unknown>,
    after:  { id: item.id,   sortOrder: target.sortOrder } as Record<string, unknown>,
    summary: `Reordered agenda: moved "${item.title}" ${direction} (swapped with "${target.title}")`,
    req,
  });

  return ok(updated);
});
