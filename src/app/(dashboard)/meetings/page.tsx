/**
 * /meetings — Meetings list page.
 *
 * Server Component: authenticates, resolves building context, fetches initial
 * meeting list, checks permissions, then defers to MeetingsClient.
 *
 * URL: /meetings?building=<buildingId>
 */

import { redirect }        from "next/navigation";
import { requireAuth }     from "@/lib/auth-helpers";
import { serverHasPermission } from "@/lib/permissions";
import { db }              from "@/lib/db";
import { MeetingsClient }  from "@/components/meetings/MeetingsClient";

interface Props {
  searchParams: { building?: string };
}

export const metadata = { title: "Meetings — StrataFlow" };

export default async function MeetingsPage({ searchParams }: Props) {
  const user       = await requireAuth();
  const buildingId = searchParams.building;

  const buildings = await db.building.findMany({
    where: {
      OR: [
        { councilMemberships: { some: { userId: user.id, isActive: true } } },
        { strataLots:         { some: { OR: [{ ownerId: user.id }, { tenantId: user.id }] } } },
      ],
    },
    select:  { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (!buildingId && buildings.length === 1) {
    redirect(`/meetings?building=${buildings[0].id}`);
  }

  const initialMeetings = buildingId
    ? await db.meeting.findMany({
        where:   { buildingId },
        orderBy: { scheduledAt: "desc" },
        select: {
          id:            true,
          title:         true,
          type:          true,
          status:        true,
          scheduledAt:   true,
          endedAt:       true,
          location:      true,
          attendeeCount: true,
          createdAt:     true,
          createdBy:     { select: { id: true, name: true } },
          _count:        { select: { agendaItems: true } },
        },
      })
    : [];

  const canCreate = buildingId
    ? await serverHasPermission("meeting:create", buildingId)
    : false;

  return (
    <MeetingsClient
      buildings={buildings}
      initialMeetings={initialMeetings}
      selectedBuildingId={buildingId}
      canCreate={canCreate}
      userId={user.id}
    />
  );
}
