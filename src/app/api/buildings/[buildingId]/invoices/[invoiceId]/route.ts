/**
 * /api/buildings/[buildingId]/invoices/[invoiceId]
 *
 * GET   — Fetch a single invoice with full details and payment history.
 *         Requires: payment:read
 *         Row-level visibility applied.
 *
 * PATCH — Update invoice metadata or advance status.
 *         Requires: payment:create
 *         Allowed status transitions (manual):
 *           draft         → issued        (sets issuedAt)
 *           issued        → void
 *           partially_paid → void
 *         System-only transitions (via payments endpoint):
 *           issued/partially_paid/overdue → partially_paid | paid
 *         Terminal states: void, written_off — all fields locked.
 *         paid — metadata editable, but status cannot be changed via PATCH.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { InvoiceStatus, InvoiceType, AuditAction } from "@prisma/client";

import { db }                   from "@/lib/db";
import { requirePermission, serverHasPermission } from "@/lib/permissions";
import { getCurrentUser }       from "@/lib/auth-helpers";
import { logAudit }             from "@/lib/audit";
import { parseBody }            from "@/lib/validate";
import { getInvoiceVisibilityScope } from "@/lib/invoice-access";
import {
  ok, notFound, badRequest, forbidden, serverError,
} from "@/lib/api-response";

// ─── Shared full select ───────────────────────────────────────────────────────

const invoiceDetailSelect = {
  id:                  true,
  buildingId:          true,
  lotId:               true,
  maintenanceRequestId: true,
  type:                true,
  status:              true,
  description:         true,
  amountCents:         true,
  paidCents:           true,
  dueDate:             true,
  issuedAt:            true,
  periodStart:         true,
  periodEnd:           true,
  externalRef:         true,
  notes:               true,
  createdAt:           true,
  updatedAt:           true,
  issuedTo:  { select: { id: true, name: true, email: true, image: true } },
  createdBy: { select: { id: true, name: true, image: true } },
  lot:       { select: { id: true, unitNumber: true, floor: true } },
  payments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id:          true,
      status:      true,
      method:      true,
      provider:    true,
      amountCents: true,
      paidAt:      true,
      providerRef: true,
      notes:       true,
      createdAt:   true,
      paidBy: { select: { id: true, name: true, email: true, image: true } },
    },
  },
} as const;

// ─── Valid manual status transitions ─────────────────────────────────────────

const MANUAL_TRANSITIONS: Partial<Record<InvoiceStatus, InvoiceStatus[]>> = {
  [InvoiceStatus.draft]:          [InvoiceStatus.issued],
  [InvoiceStatus.issued]:         [InvoiceStatus.void],
  [InvoiceStatus.partially_paid]: [InvoiceStatus.void],
  [InvoiceStatus.overdue]:        [InvoiceStatus.void],
};

// Terminal states — completely locked
const TERMINAL_STATES = new Set<InvoiceStatus>([
  InvoiceStatus.void,
  InvoiceStatus.written_off,
]);

// ─── PATCH schema ─────────────────────────────────────────────────────────────

const PatchSchema = z
  .object({
    status:      z.nativeEnum(InvoiceStatus).optional(),
    type:        z.nativeEnum(InvoiceType).optional(),
    description: z.string().min(1).max(2000).optional(),
    amountCents: z.number().int().min(1).optional(),
    dueDate:     z.string().datetime().optional(),
    issuedToId:  z.string().min(1).optional(),
    lotId:       z.string().nullable().optional(),
    externalRef: z.string().max(255).nullable().optional(),
    notes:       z.string().max(5000).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("payment:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, invoiceId } = params;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  const scope = await getInvoiceVisibilityScope(user.id, user.role, buildingId);

  const invoice = await db.invoice.findFirst({
    where:  { id: invoiceId, buildingId, ...scope },
    select: invoiceDetailSelect,
  });

  if (!invoice) return notFound("Invoice");
  return ok(invoice);
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

export const PATCH = requirePermission("payment:create", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, invoiceId } = params;

  const parse = await parseBody(req, PatchSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const existing = await db.invoice.findFirst({
    where:  { id: invoiceId, buildingId },
    select: invoiceDetailSelect,
  });
  if (!existing) return notFound("Invoice");

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // ── Terminal state guard ─────────────────────────────────────────────────
  if (TERMINAL_STATES.has(existing.status)) {
    return badRequest(
      `Invoice is ${existing.status} and cannot be modified.`,
    );
  }

  // ── Paid guard — status is managed by the payment system ─────────────────
  if (existing.status === InvoiceStatus.paid && input.status !== undefined) {
    return badRequest("Paid invoice status cannot be changed via this endpoint.");
  }

  // ── Status transition validation ─────────────────────────────────────────
  if (input.status !== undefined && input.status !== existing.status) {
    const allowed = MANUAL_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(input.status)) {
      return badRequest(
        `Cannot transition from "${existing.status}" to "${input.status}". ` +
        `Allowed: ${allowed.join(", ") || "none"}`,
      );
    }

    // Voiding requires payment:approve in addition to the base payment:create gate.
    // UI also enforces this but the API must not rely on frontend gating alone.
    if (input.status === InvoiceStatus.void) {
      const canApprove = await serverHasPermission("payment:approve", buildingId);
      if (!canApprove) return forbidden("payment:approve");
    }
  }

  // ── amountCents reduction guard ───────────────────────────────────────────
  // Reducing amountCents below paidCents would leave paidCents > amountCents,
  // an impossible financial state (more paid than owed).
  if (input.amountCents !== undefined && input.amountCents < existing.paidCents) {
    return badRequest(
      `Cannot reduce invoice total to ${input.amountCents} cents: ` +
      `${existing.paidCents} cents have already been paid against this invoice.`,
    );
  }

  // ── issuedToId change validation ──────────────────────────────────────────
  // If the recipient is being changed, verify the new user exists.
  if (input.issuedToId !== undefined) {
    const recipient = await db.user.findUnique({
      where:  { id: input.issuedToId },
      select: { id: true },
    });
    if (!recipient) return badRequest("Issued-to user not found.");
  }

  // ── Derive server-managed timestamps ─────────────────────────────────────
  const now = new Date();
  const issuedAt =
    input.status === InvoiceStatus.issued && !existing.issuedAt ? now : undefined;

  try {
    const updated = await db.invoice.update({
      where: { id: invoiceId },
      data:  {
        ...(input.status      !== undefined ? { status:      input.status }                  : {}),
        ...(input.type        !== undefined ? { type:        input.type }                    : {}),
        ...(input.description !== undefined ? { description: input.description }             : {}),
        ...(input.amountCents !== undefined ? { amountCents: input.amountCents }             : {}),
        ...(input.dueDate     !== undefined ? { dueDate:     new Date(input.dueDate) }       : {}),
        ...(input.issuedToId  !== undefined ? { issuedToId:  input.issuedToId }              : {}),
        ...(input.lotId       !== undefined ? { lotId:       input.lotId }                   : {}),
        ...(input.externalRef !== undefined ? { externalRef: input.externalRef }             : {}),
        ...(input.notes       !== undefined ? { notes:       input.notes }                   : {}),
        ...(issuedAt          !== undefined ? { issuedAt }                                   : {}),
        updatedAt: now,
      },
      select: invoiceDetailSelect,
    });

    let summary: string;
    if (input.status && input.status !== existing.status) {
      summary = `Invoice "${existing.description}" status: ${existing.status} → ${input.status}`;
    } else {
      summary = `Updated invoice "${existing.description}"`;
    }

    void logAudit({
      userId:     user.id,
      action:     AuditAction.update,
      resource:   "invoice",
      resourceId: invoiceId,
      buildingId,
      before:     existing as unknown as Record<string, unknown>,
      after:      updated  as unknown as Record<string, unknown>,
      summary,
      req,
    });

    return ok(updated);
  } catch (err) {
    console.error("[invoices/[invoiceId]/PATCH]", err);
    return serverError();
  }
});
