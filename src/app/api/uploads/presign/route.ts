/**
 * POST /api/uploads/presign
 *
 * Step 1 of the upload flow.
 *
 * Validates the file type and size, generates a storage key, then returns a
 * presigned PUT URL for the client to upload the file directly to storage.
 *
 * The client must:
 *   1. Call this endpoint to obtain { uploadUrl, key, headers }
 *   2. PUT the file to uploadUrl, including the returned headers
 *   3. Call POST /api/buildings/[buildingId]/documents with { s3Key: key, ... }
 *      to register the document in the database
 *
 * Requires: document:upload permission on the target building.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { DocumentCategory } from "@prisma/client";
import { nanoid } from "nanoid";

import { requirePermission }                 from "@/lib/permissions";
import { getStorage, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/storage";
import { parseBody }                         from "@/lib/validate";
import { ok, badRequest, serverError }       from "@/lib/api-response";

// ─── Schema ───────────────────────────────────────────────────────────────────

const PresignRequestSchema = z.object({
  buildingId: z.string().min(1),
  filename:   z.string().min(1).max(255),
  mimeType:   z.string().min(1),
  sizeBytes:  z.number().int().positive(),
  category:   z.nativeEnum(DocumentCategory),
});

// ─── POST /api/uploads/presign ────────────────────────────────────────────────

export const POST = requirePermission("document:upload", {
  buildingIdSource: "body",
})(async (req: NextRequest, _ctx) => {
  const parse = await parseBody(req, PresignRequestSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  // Validate MIME type against allowlist
  const allowedMimes = Object.keys(ALLOWED_MIME_TYPES);
  if (!allowedMimes.includes(input.mimeType)) {
    return badRequest(
      `File type not allowed. Accepted types: pdf, doc, docx, jpg, png`,
      { accepted: allowedMimes },
    );
  }

  // Validate size
  if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
    const maxMB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
    return badRequest(`File exceeds the ${maxMB} MB limit`);
  }

  // Build a deterministic-ish key: buildings/{id}/{category}/{uuid}.{ext}
  const ext = ALLOWED_MIME_TYPES[input.mimeType as keyof typeof ALLOWED_MIME_TYPES];
  const key = `buildings/${input.buildingId}/${input.category}/${nanoid()}.${ext}`;

  try {
    const storage  = getStorage();
    const presigned = await storage.presignUpload({
      key,
      mimeType:  input.mimeType,
      sizeBytes: input.sizeBytes,
      expiresIn: 3600,
    });

    return ok({
      uploadUrl: presigned.uploadUrl,
      key:       presigned.key,
      expiresAt: presigned.expiresAt.toISOString(),
      headers:   presigned.headers,
    });
  } catch (err) {
    console.error("[presign/POST]", err);
    return serverError("Failed to generate upload URL");
  }
});
