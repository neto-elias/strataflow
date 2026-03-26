/**
 * /documents/[documentId] — Document detail page.
 *
 * Server Component: fetches the document and its version history,
 * then renders DocumentDetailClient for download and versioning actions.
 */

import { notFound }        from "next/navigation";
import { requireAuth }     from "@/lib/auth-helpers";
import { serverHasPermission } from "@/lib/permissions";
import { db }              from "@/lib/db";
import { DocumentDetailClient } from "@/components/documents/DocumentDetailClient";

interface Props {
  params:      { documentId: string };
  searchParams: { building?: string };
}

export default async function DocumentDetailPage({ params, searchParams }: Props) {
  const user       = await requireAuth();
  const buildingId = searchParams.building;

  const doc = await db.document.findFirst({
    where: {
      id: params.documentId,
      ...(buildingId ? { buildingId } : {}),
    },
    select: {
      id:               true,
      buildingId:       true,
      lotId:            true,
      meetingId:        true,
      title:            true,
      description:      true,
      category:         true,
      groupId:          true,
      version:          true,
      isCurrentVersion: true,
      s3Key:            true,
      sizeBytes:        true,
      mimeType:         true,
      isPublic:         true,
      createdAt:        true,
      updatedAt:        true,
      uploadedBy: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  if (!doc) notFound();

  // Version history — all versions in the same group, newest first
  const versions = await db.document.findMany({
    where:   { groupId: doc.groupId, buildingId: doc.buildingId },
    orderBy: { version: "desc" },
    select: {
      id:               true,
      version:          true,
      isCurrentVersion: true,
      title:            true,
      sizeBytes:        true,
      mimeType:         true,
      createdAt:        true,
      uploadedBy: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  const canUpload = await serverHasPermission("document:upload", doc.buildingId);
  const canEdit   = await serverHasPermission("document:upload", doc.buildingId);

  return (
    <DocumentDetailClient
      document={doc}
      versions={versions}
      canUpload={canUpload}
      canEdit={canEdit}
      userId={user.id}
    />
  );
}
