/**
 * GET /api/buildings/[buildingId]/documents/[documentId]/versions
 *
 * Returns the full version history for the document group that contains
 * [documentId].  The most recent version is listed first.
 *
 * Requires: document:read
 */

import { NextRequest } from "next/server";
import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { ok, notFound }      from "@/lib/api-response";

export const GET = requirePermission("document:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, documentId } = params;

  // Resolve the groupId from the given documentId
  const ref = await db.document.findFirst({
    where:  { id: documentId, buildingId },
    select: { groupId: true },
  });

  if (!ref) return notFound("Document");

  const versions = await db.document.findMany({
    where:   { groupId: ref.groupId, buildingId },
    orderBy: { version: "desc" },
    select: {
      id:               true,
      version:          true,
      isCurrentVersion: true,
      title:            true,
      s3Key:            true,
      sizeBytes:        true,
      mimeType:         true,
      createdAt:        true,
      uploadedBy: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  return ok(versions);
});
