/**
 * GET /api/buildings/[buildingId]/documents/[documentId]/download
 *
 * Returns a short-lived presigned download URL for the document's file.
 * The client should redirect to this URL or open it in a new tab.
 *
 * URLs expire in 15 minutes — do not cache them long-term.
 *
 * Requires: document:read
 */

import { NextRequest } from "next/server";
import { db }                from "@/lib/db";
import { getStorage }        from "@/lib/storage";
import { requirePermission } from "@/lib/permissions";
import { ok, notFound, serverError } from "@/lib/api-response";

const DOWNLOAD_EXPIRY_SECONDS = 15 * 60; // 15 min

export const GET = requirePermission("document:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, documentId } = params;

  const doc = await db.document.findFirst({
    where:  { id: documentId, buildingId },
    select: { s3Key: true, title: true, mimeType: true },
  });

  if (!doc) return notFound("Document");

  try {
    const storage     = getStorage();
    const downloadUrl = await storage.presignDownload(doc.s3Key, DOWNLOAD_EXPIRY_SECONDS);

    return ok({
      downloadUrl,
      expiresIn: DOWNLOAD_EXPIRY_SECONDS,
      filename:  doc.title,
      mimeType:  doc.mimeType,
    });
  } catch (err) {
    console.error("[documents/download/GET]", err);
    return serverError("Failed to generate download URL");
  }
});
