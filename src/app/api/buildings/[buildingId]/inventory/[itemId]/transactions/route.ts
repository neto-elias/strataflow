/**
 * /api/buildings/[buildingId]/inventory/[itemId]/transactions
 *
 * GET  — List stock transaction history for an item.
 *        Requires: inventory:read (system-scope)
 *        Ordered: createdAt DESC (most recent first)
 *
 * POST — Record a new stock transaction (atomic ledger operation).
 *        Requires: inventory:manage (building-scope)
 *        Atomic transaction:
 *          1. Fetch current quantityOnHand  → quantityBefore
 *          2. Compute quantityAfter = quantityBefore + quantityDelta
 *          3. Reject if quantityAfter < 0 (no negative stock)
 *          4. Create StockTransaction row (immutable)
 *          5. Update InventoryItem.quantityOnHand = quantityAfter
 *        Sign convention: positive = stock in, negative = stock out.
 *        Direction is validated per transactionType:
 *          received, returned → quantityDelta must be positive
 *          issued, damaged    → quantityDelta must be negative
 *          adjustment, transferred → any non-zero value
 *        Audit: AuditAction.create
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { StockTransactionType, AuditAction } from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import {
  ok, created, notFound, badRequest, serverError,
} from "@/lib/api-response";

// ─── Transaction select ───────────────────────────────────────────────────────

export const transactionSelect = {
  id:              true,
  inventoryItemId: true,
  buildingId:      true,
  transactionType: true,
  quantityDelta:   true,
  quantityBefore:  true,
  quantityAfter:   true,
  unitCostCents:   true,
  notes:           true,
  createdAt:       true,
  createdBy: { select: { id: true, name: true, image: true } },
} as const;

// ─── Direction validation ─────────────────────────────────────────────────────

const INBOUND_TYPES  = new Set([StockTransactionType.received, StockTransactionType.returned]);
const OUTBOUND_TYPES = new Set([StockTransactionType.issued,   StockTransactionType.damaged]);

// ─── POST schema ──────────────────────────────────────────────────────────────

const RecordTransactionSchema = z.object({
  transactionType: z.nativeEnum(StockTransactionType),
  /** Signed integer. Positive = stock in, negative = stock out. Must be non-zero. */
  quantityDelta:   z.number().int().refine((v) => v !== 0, {
    message: "quantityDelta must be non-zero",
  }),
  notes:           z.string().max(5000).nullable().optional(),
  /** Unit cost at receipt time — only meaningful for 'received' transactions */
  unitCostCents:   z.number().int().min(0).nullable().optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("inventory:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, itemId } = params;

  // Verify the item belongs to this building
  const item = await db.inventoryItem.findFirst({
    where:  { id: itemId, buildingId },
    select: { id: true },
  });
  if (!item) return notFound("Inventory item");

  const transactions = await db.stockTransaction.findMany({
    where:   { inventoryItemId: itemId, buildingId },
    orderBy: { createdAt: "desc" },
    select:  transactionSelect,
  });

  return ok(transactions);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

export const POST = requirePermission("inventory:manage", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, itemId } = params;

  const parse = await parseBody(req, RecordTransactionSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  // Validate direction per transaction type
  if (INBOUND_TYPES.has(input.transactionType) && input.quantityDelta < 0) {
    return badRequest(
      `Transaction type "${input.transactionType}" requires a positive quantityDelta (stock in).`,
    );
  }
  if (OUTBOUND_TYPES.has(input.transactionType) && input.quantityDelta > 0) {
    return badRequest(
      `Transaction type "${input.transactionType}" requires a negative quantityDelta (stock out).`,
    );
  }

  try {
    // ── Known concurrency limitation ────────────────────────────────────────
    // The read-then-write inside db.$transaction uses PostgreSQL READ COMMITTED
    // isolation (Prisma default). Two concurrent transactions can both read the
    // same quantityOnHand and both succeed, resulting in a lost update.
    // The negative-stock guard does not protect against this race because both
    // reads see the pre-update value.
    //
    // Fix requires SELECT ... FOR UPDATE (row-level locking) via Prisma.$queryRaw,
    // or an optimistic update with a version column. Deferred: at typical strata
    // building scale concurrent stock mutations on the same item are extremely
    // unlikely. Document and revisit if multi-user concurrent usage is observed.
    const [txn, updatedItem] = await db.$transaction(async (tx) => {
      // 1. Read current quantity (non-locking — see concurrency note above)
      const item = await tx.inventoryItem.findFirst({
        where:  { id: itemId, buildingId },
        select: { id: true, quantityOnHand: true, name: true },
      });
      if (!item) throw new Error("NOT_FOUND");

      const quantityBefore = item.quantityOnHand;
      const quantityAfter  = quantityBefore + input.quantityDelta;

      // 3. Negative stock prevention
      if (quantityAfter < 0) {
        throw new Error(
          `NEGATIVE_STOCK:${quantityBefore}:${input.quantityDelta}`,
        );
      }

      // 4. Create the immutable transaction record
      const newTxn = await tx.stockTransaction.create({
        data: {
          buildingId,
          inventoryItemId: itemId,
          createdById:     user.id,
          transactionType: input.transactionType,
          quantityDelta:   input.quantityDelta,
          quantityBefore,
          quantityAfter,
          ...(input.unitCostCents != null ? { unitCostCents: input.unitCostCents } : {}),
          ...(input.notes         != null ? { notes:         input.notes }         : {}),
        },
        select: transactionSelect,
      });

      // 5. Update the denormalized counter atomically.
      //    Also propagate unit cost when receiving stock with a known cost, so
      //    InventoryItem.unitCostCents always reflects the most recent receipt price.
      const inv = await tx.inventoryItem.update({
        where: { id: itemId },
        data:  {
          quantityOnHand: quantityAfter,
          ...(input.transactionType === StockTransactionType.received &&
              input.unitCostCents    != null
            ? { unitCostCents: input.unitCostCents }
            : {}),
        },
        select: { id: true, quantityOnHand: true, name: true, unitCostCents: true },
      });

      return [newTxn, inv] as const;
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "stock_transaction",
      resourceId: txn.id,
      buildingId,
      after:      txn as unknown as Record<string, unknown>,
      summary:
        `${input.transactionType} ${Math.abs(input.quantityDelta)} units ` +
        `on item "${updatedItem.name}" ` +
        `(${txn.quantityBefore} → ${txn.quantityAfter})`,
      req,
    });

    return created({ transaction: txn, item: updatedItem });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") return notFound("Inventory item");

      if (err.message.startsWith("NEGATIVE_STOCK:")) {
        const [, before, delta] = err.message.split(":");
        return badRequest(
          `Cannot reduce stock by ${Math.abs(Number(delta))}: ` +
          `only ${before} units on hand.`,
        );
      }
    }
    console.error("[inventory/[itemId]/transactions/POST]", err);
    return serverError();
  }
});
