/**
 * /api/buildings/[buildingId]/invoices
 *
 * GET  — List invoices for a building.
 *        Requires: payment:read
 *        Row-level visibility applied via getInvoiceVisibilityScope().
 *        Optional query filters: status, type, issuedToId
 *
 * POST — Create a new invoice.
 *        Requires: payment:create
 *        Validates: lotId belongs to building (if provided)
 *        Validates: issuedToId is a user that exists
 *        Audit: AuditAction.create
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { InvoiceType, InvoiceStatus, AuditAction } from "@prisma/client";

import { db }                   from "@/lib/db";
import { requirePermission, serverHasPermission } from "@/lib/permissions";
import { getCurrentUser }       from "@/lib/auth-helpers";
import { logAudit }             from "@/lib/audit";
import { parseBody, parseQuery } from "@/lib/validate";
import { getInvoiceVisibilityScope } from "@/lib/invoice-access";
import {
  ok, created, badRequest, serverError,
} from "@/lib/api-response";

// ─── Shared invoice select ────────────────────────────────────────────────────

const invoiceListSelect = {
  id:          true,
  buildingId:  true,
  lotId:       true,
  type:        true,
  status:      true,
  description: true,
  amountCents: true,
  paidCents:   true,
  dueDate:     true,
  issuedAt:    true,
  createdAt:   true,
  updatedAt:   true,
  issuedTo: { select: { id: true, name: true, email: true, image: true } },
  createdBy: { select: { id: true, name: true, image: true } },
  lot:       { select: { id: true, unitNumber: true } },
} as const;

// ─── Query schema ─────────────────────────────────────────────────────────────

const ListQuerySchema = z.object({
  status:     z.nativeEnum(InvoiceStatus).optional(),
  type:       z.nativeEnum(InvoiceType).optional(),
  issuedToId: z.string().optional(),
});

// ─── POST schema ──────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  type:                z.nativeEnum(InvoiceType),
  description:         z.string().min(1).max(2000),
  amountCents:         z.number().int().min(1),
  dueDate:             z.string().datetime(),
  issuedToId:          z.string().min(1),
  lotId:               z.string().nullable().optional(),
  maintenanceRequestId: z.string().nullable().optional(),
  periodStart:         z.string().datetime().nullable().optional(),
  periodEnd:           z.string().datetime().nullable().optional(),
  externalRef:         z.string().max(255).nullable().optional(),
  notes:               z.string().max(5000).nullable().optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("payment:read", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  const parse = parseQuery(req.nextUrl.searchParams, ListQuerySchema);
  if (!parse.success) return parse.response;
  const filters = parse.data;

  const scope = await getInvoiceVisibilityScope(user.id, user.role, buildingId);

  // Safety: if the user is visibility-restricted (scope contains issuedToId),
  // the caller-supplied issuedToId filter MUST NOT override it.
  // A restricted user passing ?issuedToId=someOtherUser would otherwise
  // silently see another person's invoices via object-spread key collision.
  const isRestricted = "issuedToId" in scope;

  const invoices = await db.invoice.findMany({
    where: {
      buildingId,
      ...scope,
      ...(filters.status                        ? { status: filters.status }             : {}),
      ...(filters.type                          ? { type:   filters.type }               : {}),
      ...(filters.issuedToId && !isRestricted   ? { issuedToId: filters.issuedToId }    : {}),
    },
    orderBy: { createdAt: "desc" },
    select:  invoiceListSelect,
  });

  return ok(invoices);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

export const POST = requirePermission("payment:create", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const parse = await parseBody(req, CreateSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // Validate lotId belongs to this building (if provided)
  if (input.lotId) {
    const lot = await db.strataLot.findFirst({
      where: { id: input.lotId, buildingId },
      select: { id: true },
    });
    if (!lot) return badRequest("Lot does not belong to this building.");
  }

  // Validate issuedToId points to an existing user
  const recipient = await db.user.findUnique({
    where:  { id: input.issuedToId },
    select: { id: true },
  });
  if (!recipient) return badRequest("Issued-to user not found.");

  // Validate maintenanceRequestId belongs to this building (if provided)
  if (input.maintenanceRequestId) {
    const mr = await db.maintenanceRequest.findFirst({
      where: { id: input.maintenanceRequestId, buildingId },
      select: { id: true },
    });
    if (!mr) return badRequest("Maintenance request does not belong to this building.");
  }

  try {
    const invoice = await db.invoice.create({
      data: {
        buildingId,
        type:                input.type,
        description:         input.description,
        amountCents:         input.amountCents,
        dueDate:             new Date(input.dueDate),
        issuedToId:          input.issuedToId,
        createdById:         user.id,
        ...(input.lotId               != null ? { lotId:               input.lotId }               : {}),
        ...(input.maintenanceRequestId != null ? { maintenanceRequestId: input.maintenanceRequestId } : {}),
        ...(input.periodStart          != null ? { periodStart:         new Date(input.periodStart) } : {}),
        ...(input.periodEnd            != null ? { periodEnd:           new Date(input.periodEnd) }   : {}),
        ...(input.externalRef          != null ? { externalRef:         input.externalRef }           : {}),
        ...(input.notes                != null ? { notes:               input.notes }                 : {}),
      },
      select: invoiceListSelect,
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "invoice",
      resourceId: invoice.id,
      buildingId,
      after:      invoice as unknown as Record<string, unknown>,
      summary:    `Created invoice "${invoice.description}" for ${invoice.issuedTo.name ?? invoice.issuedTo.email}`,
      req,
    });

    return created(invoice);
  } catch (err) {
    console.error("[invoices/POST]", err);
    return serverError();
  }
});
