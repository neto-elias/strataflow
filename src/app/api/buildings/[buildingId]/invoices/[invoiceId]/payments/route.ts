/**
 * /api/buildings/[buildingId]/invoices/[invoiceId]/payments
 *
 * GET  — List all payments applied to this invoice.
 *        Requires: payment:read
 *
 * POST — Record a new payment against this invoice.
 *        Requires: payment:create
 *        Blocked when invoice status is: draft, void, written_off, paid
 *        Atomic transaction:
 *          1. Create Payment row
 *          2. Update Invoice.paidCents += payment.amountCents
 *          3. Recalculate Invoice.status:
 *               newPaidCents >= amountCents  → paid
 *               newPaidCents > 0             → partially_paid
 *               else                         → issued (or leave as-is)
 *        Audit: AuditAction.create (payment) + AuditAction.update (invoice)
 *
 * Deferred / not yet implemented:
 *   - overdue automation: no scheduled job flips invoice status to overdue.
 *     Needs a cron worker: WHERE status NOT IN ('paid','void','written_off') AND dueDate < now().
 *   - refund flow: schema supports negative-amountCents Payment rows (status=refunded),
 *     but there is no POST endpoint for refunds yet. paidCents must be decremented
 *     atomically and invoice status potentially reversed.
 *   - payment detail endpoint: GET /payments/[paymentId] does not exist.
 *     Currently payments are only accessible through the invoice detail.
 *   - write-off workflow: written_off cannot be reached via any current API transition.
 *     Requires a dedicated endpoint with payment:approve and clear audit semantics.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  InvoiceStatus,
  AuditAction,
} from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import { getInvoiceVisibilityScope } from "@/lib/invoice-access";
import {
  ok, created, notFound, badRequest, conflict, serverError,
} from "@/lib/api-response";

// ─── Payment select ───────────────────────────────────────────────────────────

const paymentSelect = {
  id:          true,
  invoiceId:   true,
  buildingId:  true,
  status:      true,
  method:      true,
  provider:    true,
  amountCents: true,
  paidAt:      true,
  providerRef: true,
  notes:       true,
  createdAt:   true,
  updatedAt:   true,
  paidBy: { select: { id: true, name: true, email: true, image: true } },
} as const;

// ─── Statuses that block new payments ────────────────────────────────────────
// draft:        invoice has not been issued; payment would bypass the draft→issued flow
// paid:         already fully settled
// void:         cancelled; no longer collectible
// written_off:  deemed uncollectable

const PAYMENT_BLOCKED: Set<InvoiceStatus> = new Set([
  InvoiceStatus.draft,
  InvoiceStatus.void,
  InvoiceStatus.written_off,
  InvoiceStatus.paid,
]);

// ─── POST schema ──────────────────────────────────────────────────────────────

const RecordPaymentSchema = z.object({
  amountCents: z.number().int().min(1),
  method:      z.nativeEnum(PaymentMethod),
  provider:    z.nativeEnum(PaymentProvider).default(PaymentProvider.manual),
  paidAt:      z.string().datetime().optional(),
  providerRef: z.string().max(255).nullable().optional(),
  notes:       z.string().max(5000).nullable().optional(),
  /** Record as completed immediately (default for manually-entered payments). */
  status:      z.nativeEnum(PaymentStatus).default(PaymentStatus.completed),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("payment:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, invoiceId } = params;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // Verify the invoice is visible to this user before exposing its payments
  const scope = await getInvoiceVisibilityScope(user.id, user.role, buildingId);
  const invoice = await db.invoice.findFirst({
    where:  { id: invoiceId, buildingId, ...scope },
    select: { id: true },
  });
  if (!invoice) return notFound("Invoice");

  const payments = await db.payment.findMany({
    where:   { invoiceId, buildingId },
    orderBy: { createdAt: "desc" },
    select:  paymentSelect,
  });

  return ok(payments);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

export const POST = requirePermission("payment:create", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, invoiceId } = params;

  const parse = await parseBody(req, RecordPaymentSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // Fetch the invoice to validate state
  const invoice = await db.invoice.findFirst({
    where:  { id: invoiceId, buildingId },
    select: { id: true, status: true, amountCents: true, paidCents: true, description: true },
  });
  if (!invoice) return notFound("Invoice");

  // Block payments on terminal or already-paid invoices
  if (PAYMENT_BLOCKED.has(invoice.status)) {
    return conflict(
      `Cannot record a payment against an invoice with status "${invoice.status}".`,
    );
  }

  // Prevent overpayment: new paidCents must not exceed amountCents
  const newPaidCents = invoice.paidCents + input.amountCents;
  if (newPaidCents > invoice.amountCents) {
    return badRequest(
      `Payment of ${input.amountCents} cents would exceed the invoice total. ` +
      `Outstanding balance: ${invoice.amountCents - invoice.paidCents} cents.`,
    );
  }

  // Derive the new invoice status from updated paidCents
  const newInvoiceStatus: InvoiceStatus =
    newPaidCents >= invoice.amountCents
      ? InvoiceStatus.paid
      : InvoiceStatus.partially_paid;

  const now    = new Date();
  const paidAt = input.paidAt ? new Date(input.paidAt) : now;

  try {
    const [payment, updatedInvoice] = await db.$transaction(async (tx) => {
      // 1. Create the payment record
      const newPayment = await tx.payment.create({
        data: {
          buildingId,
          invoiceId,
          paidById:    user.id,
          status:      input.status,
          method:      input.method,
          provider:    input.provider,
          amountCents: input.amountCents,
          paidAt:      input.status === PaymentStatus.completed ? paidAt : null,
          ...(input.providerRef != null ? { providerRef: input.providerRef } : {}),
          ...(input.notes       != null ? { notes:       input.notes }       : {}),
        },
        select: paymentSelect,
      });

      // 2 + 3. Update invoice.paidCents and recalculate status atomically
      const inv = await tx.invoice.update({
        where: { id: invoiceId },
        data:  {
          paidCents: newPaidCents,
          status:    newInvoiceStatus,
          updatedAt: now,
        },
        select: {
          id:          true,
          status:      true,
          paidCents:   true,
          amountCents: true,
          description: true,
        },
      });

      return [newPayment, inv] as const;
    });

    // Audit the payment creation
    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "payment",
      resourceId: payment.id,
      buildingId,
      after:      payment as unknown as Record<string, unknown>,
      summary:    `Recorded payment of ${input.amountCents} cents on invoice "${invoice.description}"`,
      req,
    });

    // Audit the invoice update only if status changed
    if (updatedInvoice.status !== invoice.status) {
      void logAudit({
        userId:     user.id,
        action:     AuditAction.update,
        resource:   "invoice",
        resourceId: invoiceId,
        buildingId,
        summary: `Invoice "${invoice.description}" status: ${invoice.status} → ${updatedInvoice.status}`,
        req,
      });
    }

    return created({ payment, invoice: updatedInvoice });
  } catch (err) {
    console.error("[invoices/[invoiceId]/payments/POST]", err);
    return serverError();
  }
});
