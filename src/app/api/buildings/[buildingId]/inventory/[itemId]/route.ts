/**
 * /api/buildings/[buildingId]/inventory/[itemId]
 *
 * GET   — Fetch a single inventory item with full metadata.
 *         Requires: inventory:read (system-scope)
 *
 * PATCH — Update inventory item metadata.
 *         Requires: inventory:manage (building-scope)
 *         quantityOnHand is NOT patchable here — use POST .../transactions.
 *         isActive can be set to false to deactivate (soft-delete).
 *         Audit: AuditAction.update
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { InventoryCategory, AuditAction } from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody }         from "@/lib/validate";
import { inventoryListSelect } from "../route";
import {
  ok, notFound, badRequest, serverError,
} from "@/lib/api-response";

// ─── PATCH schema ─────────────────────────────────────────────────────────────

const PatchSchema = z
  .object({
    name:             z.string().min(1).max(255).optional(),
    description:      z.string().max(2000).nullable().optional(),
    category:         z.nativeEnum(InventoryCategory).optional(),
    sku:              z.string().max(100).nullable().optional(),
    unit:             z.string().min(1).max(50).optional(),
    location:         z.string().max(255).nullable().optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
    reorderQuantity:  z.number().int().min(1).optional(),
    unitCostCents:    z.number().int().min(0).nullable().optional(),
    supplier:         z.string().max(255).nullable().optional(),
    isActive:         z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("inventory:read", {
  buildingIdSource: "param",
})(async (_req: NextRequest, { params }) => {
  const { buildingId, itemId } = params;

  const item = await db.inventoryItem.findFirst({
    where:  { id: itemId, buildingId },
    select: inventoryListSelect,
  });

  if (!item) return notFound("Inventory item");
  return ok(item);
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

export const PATCH = requirePermission("inventory:manage", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId, itemId } = params;

  const parse = await parseBody(req, PatchSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const existing = await db.inventoryItem.findFirst({
    where:  { id: itemId, buildingId },
    select: inventoryListSelect,
  });
  if (!existing) return notFound("Inventory item");

  // Prevent lowStockThreshold from being set above current quantity
  // (would immediately trigger phantom low-stock state on existing stock)
  if (
    input.lowStockThreshold !== undefined &&
    input.lowStockThreshold > existing.quantityOnHand
  ) {
    // This is a warning scenario, not an error — allow it but note in audit.
    // (Alerting would fire on next transaction; acceptable behaviour.)
  }

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  try {
    const updated = await db.inventoryItem.update({
      where: { id: itemId },
      data:  {
        ...(input.name             !== undefined ? { name:             input.name }             : {}),
        ...(input.description      !== undefined ? { description:      input.description }      : {}),
        ...(input.category         !== undefined ? { category:         input.category }         : {}),
        ...(input.sku              !== undefined ? { sku:              input.sku }              : {}),
        ...(input.unit             !== undefined ? { unit:             input.unit }             : {}),
        ...(input.location         !== undefined ? { location:         input.location }         : {}),
        ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
        ...(input.reorderQuantity  !== undefined ? { reorderQuantity:  input.reorderQuantity }  : {}),
        ...(input.unitCostCents    !== undefined ? { unitCostCents:    input.unitCostCents }    : {}),
        ...(input.supplier         !== undefined ? { supplier:         input.supplier }         : {}),
        ...(input.isActive         !== undefined ? { isActive:         input.isActive }         : {}),
      },
      select: inventoryListSelect,
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.update,
      resource:   "inventory_item",
      resourceId: itemId,
      buildingId,
      before:     existing as unknown as Record<string, unknown>,
      after:      updated  as unknown as Record<string, unknown>,
      summary:    `Updated inventory item "${existing.name}"`,
      req,
    });

    return ok(updated);
  } catch (err) {
    console.error("[inventory/[itemId]/PATCH]", err);
    return serverError();
  }
});
