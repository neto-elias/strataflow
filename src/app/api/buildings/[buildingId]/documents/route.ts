/**
 * /api/buildings/[buildingId]/documents
 *
 * GET  — List current-version documents for a building.
 *        Requires: document:read
 *
 * POST — Register a new document record after the caller has uploaded the
 *        file directly to S3.  Handles first-upload and new-version cases.
 *        Requires: document:upload
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { DocumentCategory, AuditAction } from "@prisma/client";
import { nanoid } from "nanoid";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody, parseQuery } from "@/lib/validate";
import { ok, created, notFound, serverError } from "@/lib/api-response";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ListDocumentsQuerySchema = z.object({
  category: z.nativeEnum(DocumentCategory).optional(),
  isPublic: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

const CreateDocumentSchema = z.object({
  title:       z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  category:    z.nativeEnum(DocumentCategory),
  s3Key:       z.string().min(1),
  sizeBytes:   z.number().int().positive(),
  mimeType:    z.string().min(1).max(127),
  isPublic:    z.boolean().default(false),
  meetingId:   z.string().optional(),
  lotId:       z.string().optional(),
  /**
   * Supply to add a new version to an existing document group.
   * Omit to create a brand-new group.
   */
  groupId:     z.string().optional(),
});

// ─── GET /api/buildings/[buildingId]/documents ────────────────────────────────

export const GET = requirePermission("document:read", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const qParse = parseQuery(req.nextUrl.searchParams, ListDocumentsQuerySchema);
  if (!qParse.success) return qParse.response;
  const { category, isPublic } = qParse.data;

  const documents = await db.document.findMany({
    where: {
      buildingId,
      isCurrentVersion: true,
      ...(category !== undefined ? { category } : {}),
      ...(isPublic  !== undefined ? { isPublic } : {}),
    },
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
  });

  return ok(documents);
});

// ─── POST /api/buildings/[buildingId]/documents ───────────────────────────────

export const POST = requirePermission("document:upload", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  // 1. Validate body
  const parse = await parseBody(req, CreateDocumentSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  // 2. Resolve caller
  const user = await getCurrentUser();
  if (!user) return serverError("Session unexpectedly missing after auth gate");

  // 3. Handle versioning within a transaction
  const groupId = input.groupId ?? nanoid();

  try {
    const doc = await db.$transaction(async (tx) => {
      let version = 1;

      if (input.groupId) {
        // Verify the group exists in this building
        const existing = await tx.document.findFirst({
          where:  { groupId, buildingId, isCurrentVersion: true },
          select: { version: true },
        });

        if (!existing) {
          // Bubble a sentinel so we can return 404 outside the transaction
          throw Object.assign(new Error("GROUP_NOT_FOUND"), { groupId });
        }

        version = existing.version + 1;

        await tx.document.updateMany({
          where: { groupId, isCurrentVersion: true },
          data:  { isCurrentVersion: false, updatedAt: new Date() },
        });
      }

      return tx.document.create({
        data: {
          id:               nanoid(),
          buildingId,
          lotId:            input.lotId,
          meetingId:        input.meetingId,
          title:            input.title,
          description:      input.description,
          category:         input.category,
          groupId,
          version,
          isCurrentVersion: true,
          s3Key:            input.s3Key,
          sizeBytes:        input.sizeBytes,
          mimeType:         input.mimeType,
          isPublic:         input.isPublic,
          uploadedById:     user.id,
          updatedAt:        new Date(),
        },
        select: {
          id:               true,
          title:            true,
          category:         true,
          groupId:          true,
          version:          true,
          isCurrentVersion: true,
          s3Key:            true,
          sizeBytes:        true,
          mimeType:         true,
          isPublic:         true,
          createdAt:        true,
        },
      });
    });

    // 4. Audit log — fire-and-forget, must not block response
    void logAudit({
      userId:     user.id,
      action:     AuditAction.upload,
      resource:   "document",
      resourceId: doc.id,
      buildingId,
      after:      doc as Record<string, unknown>,
      summary:    `Uploaded ${input.category} document "${input.title}" (v${doc.version})`,
      req,
    });

    return created(doc);
  } catch (err) {
    if (err instanceof Error && err.message === "GROUP_NOT_FOUND") {
      return notFound("Document group");
    }
    console.error("[documents/POST]", err);
    return serverError();
  }
});
