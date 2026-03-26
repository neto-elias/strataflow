/**
 * PATCH /api/buildings/[buildingId]/meetings/[meetingId]/agenda/[agendaItemId]
 *
 * Update an agenda item's content, order, status, or resolution text.
 * Requires: meeting:update
 *
 * Status transitions for agenda items:
 *   pending  → discussed
 *   discussed → resolved (resolution text required)
 *   discussed → tabled
 *   discussed → withdrawn
 *   Any non-resolved item can be reverted to pending.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { AgendaItemStatus, AuditAction } from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import { ok, notFound, badRequest, serverError } from "@/lib/api-response";

const PatchAgendaItemSchema = z
  .object({
    title:        z.string().min(1).max(255).optional(),
    description:  z.string().max(2000).nullable().optional(),
    sortOrder:    z.number().int().min(0).optional(),
    presenter:    z.string().max(255).nullable().optional(),
    durationMins: z.number().int().positive().nullable().optional(),
    status:       z.nativeEnum(AgendaItemStatus).optional(),
    resolution:   z.string().max(2000).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

export const PATCH = requirePermission("meeting:update", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, meetingId, agendaItemId } = params;

  const parse = await parseBody(req, PatchAgendaItemSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  // Verify the item belongs to this meeting+building
  const item = await db.agendaItem.findFirst({
    where: {
      id:      agendaItemId,
      meeting: { id: meetingId, buildingId },
    },
    select: {
      id:         true,
      title:      true,
      status:     true,
      resolution: true,
      sortOrder:  true,
    },
  });
  if (!item) return notFound("Agenda item");

  // Resolution is only allowed when status resolves to 'resolved'
  const newStatus = input.status ?? item.status;
  if (input.resolution !== undefined && input.resolution !== null) {
    if (newStatus !== AgendaItemStatus.resolved) {
      return badRequest("resolution can only be set when status is 'resolved'");
    }
  }

  // 'resolved' status requires a non-null resolution
  if (
    newStatus === AgendaItemStatus.resolved &&
    !input.resolution &&
    !item.resolution
  ) {
    return badRequest("A resolution text is required when marking an item as resolved");
  }

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  try {
    const updated = await db.agendaItem.update({
      where: { id: agendaItemId },
      data:  {
        ...(input.title        !== undefined ? { title:        input.title }        : {}),
        ...(input.description  !== undefined ? { description:  input.description }  : {}),
        ...(input.sortOrder    !== undefined ? { sortOrder:    input.sortOrder }    : {}),
        ...(input.presenter    !== undefined ? { presenter:    input.presenter }    : {}),
        ...(input.durationMins !== undefined ? { durationMins: input.durationMins } : {}),
        ...(input.status       !== undefined ? { status:       input.status }       : {}),
        ...(input.resolution   !== undefined ? { resolution:   input.resolution }   : {}),
        updatedAt: new Date(),
      },
      select: {
        id:           true,
        meetingId:    true,
        title:        true,
        description:  true,
        sortOrder:    true,
        presenter:    true,
        durationMins: true,
        status:       true,
        resolution:   true,
        updatedAt:    true,
      },
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.update,
      resource:   "agenda_item",
      resourceId: agendaItemId,
      buildingId,
      before:     item    as unknown as Record<string, unknown>,
      after:      updated as unknown as Record<string, unknown>,
      summary:    input.status
        ? `Agenda item "${item.title}" → ${input.status}`
        : `Updated agenda item "${item.title}"`,
      req,
    });

    return ok(updated);
  } catch (err) {
    console.error("[agenda/[agendaItemId]/PATCH]", err);
    return serverError();
  }
});
