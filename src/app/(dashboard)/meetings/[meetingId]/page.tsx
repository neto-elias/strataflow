/**
 * /meetings/[meetingId] — Meeting detail page.
 *
 * Security: buildingId is mandatory. Without it we cannot scope the DB query
 * or verify the user has access to the building this meeting belongs to.
 * We enforce serverHasPermission("meeting:read", buildingId) before any
 * data fetch — authenticated-but-unauthorized users receive notFound().
 */

import { notFound, redirect }   from "next/navigation";
import { requireAuth }          from "@/lib/auth-helpers";
import { serverHasPermission }  from "@/lib/permissions";
import { db }                   from "@/lib/db";
import { MeetingDetailClient }  from "@/components/meetings/MeetingDetailClient";

interface Props {
  params:       { meetingId: string };
  searchParams: { building?: string };
}

export default async function MeetingDetailPage({ params, searchParams }: Props) {
  await requireAuth();

  const buildingId = searchParams.building;

  // buildingId is required — without it we cannot safely scope the query
  // or verify the user has access to this building.
  if (!buildingId) {
    redirect("/meetings");
  }

  // Permission check BEFORE any data fetch.
  // Authenticated users without building membership get notFound().
  const canRead = await serverHasPermission("meeting:read", buildingId);
  if (!canRead) {
    notFound();
  }

  // Always scope by BOTH meetingId AND buildingId.
  // A valid meetingId from a different building returns null → notFound().
  const meeting = await db.meeting.findFirst({
    where: { id: params.meetingId, buildingId },
    select: {
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
      createdBy:     { select: { id: true, name: true, image: true } },
    },
  });

  if (!meeting) notFound();

  const [agendaItems, minutes] = await Promise.all([
    db.agendaItem.findMany({
      where:   { meetingId: meeting.id },
      orderBy: { sortOrder: "asc" },
      select: {
        id:           true,
        title:        true,
        description:  true,
        sortOrder:    true,
        presenter:    true,
        durationMins: true,
        status:       true,
        resolution:   true,
        updatedAt:    true,
      },
    }),
    db.minutes.findUnique({
      where:  { meetingId: meeting.id },
      select: {
        id:          true,
        content:     true,
        status:      true,
        approvedAt:  true,
        publishedAt: true,
        updatedAt:   true,
        createdBy:   { select: { id: true, name: true } },
        publishedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  const [canUpdate, canCancel, canPublishMinutes] = await Promise.all([
    serverHasPermission("meeting:update",          meeting.buildingId),
    serverHasPermission("meeting:cancel",          meeting.buildingId),
    serverHasPermission("meeting:publish_minutes", meeting.buildingId),
  ]);

  return (
    <MeetingDetailClient
      meeting={meeting}
      agendaItems={agendaItems}
      minutes={minutes ?? null}
      canUpdate={canUpdate}
      canCancel={canCancel}
      canPublishMinutes={canPublishMinutes}
    />
  );
}
