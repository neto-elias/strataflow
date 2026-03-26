/**
 * /documents — Documents list page.
 *
 * Server Component: authenticates, loads user's buildings and initial
 * document list, then hands off to DocumentsClient for all interactivity.
 *
 * URL: /documents?building=<buildingId>
 *
 * If no ?building= param:
 *   - Single accessible building  → auto-selects it (redirects)
 *   - Multiple buildings          → renders building selector
 */

import { redirect }        from "next/navigation";
import { requireAuth }     from "@/lib/auth-helpers";
import { serverHasPermission } from "@/lib/permissions";
import { db }              from "@/lib/db";
import { DocumentsClient } from "@/components/documents/DocumentsClient";

interface Props {
  searchParams: { building?: string };
}

export const metadata = { title: "Documents — StrataFlow" };

export default async function DocumentsPage({ searchParams }: Props) {
  const user       = await requireAuth();
  const buildingId = searchParams.building;

  // All buildings this user can access (council member, owner, or tenant)
  const buildings = await db.building.findMany({
    where: {
      OR: [
        { councilMemberships: { some: { userId: user.id, isActive: true } } },
        { strataLots:         { some: { OR: [
            { ownerId:  user.id },
            { tenantId: user.id },
          ]}},
        },
      ],
    },
    select:  { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Auto-select when there is exactly one building and no param yet
  if (!buildingId && buildings.length === 1) {
    redirect(`/documents?building=${buildings[0].id}`);
  }

  // Initial document list — only loaded when a building is selected
  const initialDocuments = buildingId
    ? await db.document.findMany({
        where:   { buildingId, isCurrentVersion: true },
        orderBy: { createdAt: "desc" },
        select: {
          id:          true,
          title:       true,
          description: true,
          category:    true,
          groupId:     true,
          version:     true,
          s3Key:       true,
          sizeBytes:   true,
          mimeType:    true,
          isPublic:    true,
          createdAt:   true,
          uploadedBy: {
            select: { id: true, name: true, image: true },
          },
        },
      })
    : [];

  const canUpload = buildingId
    ? await serverHasPermission("document:upload", buildingId)
    : false;

  return (
    <DocumentsClient
      buildings={buildings}
      initialDocuments={initialDocuments}
      selectedBuildingId={buildingId}
      canUpload={canUpload}
      userId={user.id}
    />
  );
}
