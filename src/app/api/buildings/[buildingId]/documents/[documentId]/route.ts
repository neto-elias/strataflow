/**
 * /api/buildings/[buildingId]/documents/[documentId]
 *
 * GET   — Fetch a single document (any version).
 *         Requires: document:read
 *
 * PATCH — Update document metadata (title, description, category, isPublic).
 *         File content is immutable; only metadata can change.
 *         Requires: document:upload
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { DocumentCategory, AuditAction } from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import { ok, notFound, serverError } from "@/lib/api-response";

// ─── Shared select ────────────────────────────────────────────────────────────

const documentSelect = {
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
} as const;

// ─── GET /api/buildings/[buildingId]/documents/[documentId] ───────────────────

export const GET = requirePermission("document:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, documentId } = params;

  const doc = await db.document.findFirst({
    where:  { id: documentId, buildingId },
    select: documentSelect,
  });

  if (!doc) return notFound("Document");

  return ok(doc);
});

// ─── PATCH /api/buildings/[buildingId]/documents/[documentId] ─────────────────

const PatchDocumentSchema = z
  .object({
    title:       z.string().min(1).max(255).optional(),
    description: z.string().max(1000).nullable().optional(),
    isPublic:    z.boolean().optional(),
    category:    z.nativeEnum(DocumentCategory).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const PATCH = requirePermission("document:upload", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, documentId } = params;

  const parse = await parseBody(req, PatchDocumentSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  // Fetch current state for audit before snapshot
  const existing = await db.document.findFirst({
    where:  { id: documentId, buildingId },
    select: documentSelect,
  });
  if (!existing) return notFound("Document");

  const user = await getCurrentUser();
  if (!user) return serverError("Session unexpectedly missing after auth gate");

  try {
    const updated = await db.document.update({
      where:  { id: documentId },
      data:   { ...input, updatedAt: new Date() },
      select: documentSelect,
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.update,
      resource:   "document",
      resourceId: documentId,
      buildingId,
      before:     existing as unknown as Record<string, unknown>,
      after:      updated  as unknown as Record<string, unknown>,
      summary:    `Updated metadata for document "${updated.title}"`,
      req,
    });

    return ok(updated);
  } catch (err) {
    console.error("[documents/PATCH]", err);
    return serverError();
  }
});
