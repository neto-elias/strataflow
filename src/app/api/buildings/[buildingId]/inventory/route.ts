/**
 * /api/buildings/[buildingId]/inventory
 *
 * GET  — List inventory items for a building.
 *        Requires: inventory:read (system-scope)
 *        Optional query filters: category, isActive (default "true"), search
 *
 * POST — Create a new inventory item.
 *        Requires: inventory:manage (building-scope)
 *        quantityOnHand is NOT accepted here — starts at 0.
 *        Use POST .../transactions to set initial stock.
 *        Audit: AuditAction.create
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { InventoryCategory, AuditAction } from "@prisma/client";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getCurrentUser }    from "@/lib/auth-helpers";
import { logAudit }          from "@/lib/audit";
import { parseBody, parseQuery } from "@/lib/validate";
import {
  ok, created, serverError,
} from "@/lib/api-response";

// ─── Shared select ────────────────────────────────────────────────────────────

export const inventoryListSelect = {
  id:               true,
  buildingId:       true,
  name:             true,
  description:      true,
  category:         true,
  sku:              true,
  unit:             true,
  quantityOnHand:   true,
  lowStockThreshold: true,
  reorderQuantity:  true,
  unitCostCents:    true,
  supplier:         true,
  location:         true,
  isActive:         true,
  createdAt:        true,
  updatedAt:        true,
  createdBy: { select: { id: true, name: true, image: true } },
} as const;

// ─── Query schema ─────────────────────────────────────────────────────────────

const ListQuerySchema = z.object({
  category: z.nativeEnum(InventoryCategory).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  search:   z.string().optional(),
});

// ─── POST schema ──────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  name:             z.string().min(1).max(255),
  description:      z.string().max(2000).nullable().optional(),
  category:         z.nativeEnum(InventoryCategory),
  sku:              z.string().max(100).nullable().optional(),
  unit:             z.string().min(1).max(50).default("each"),
  location:         z.string().max(255).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).default(0),
  reorderQuantity:  z.number().int().min(1).default(1),
  unitCostCents:    z.number().int().min(0).nullable().optional(),
  supplier:         z.string().max(255).nullable().optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export const GET = requirePermission("inventory:read", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const parse = parseQuery(req.nextUrl.searchParams, ListQuerySchema);
  if (!parse.success) return parse.response;
  const filters = parse.data;

  const isActive = filters.isActive === "false" ? false : true;

  const items = await db.inventoryItem.findMany({
    where: {
      buildingId,
      isActive,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { sku:  { contains: filters.search, mode: "insensitive" } },
              { location: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: "asc" }],
    select:  inventoryListSelect,
  });

  return ok(items);
});

// ─── POST ─────────────────────────────────────────────────────────────────────

export const POST = requirePermission("inventory:manage", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const parse = await parseBody(req, CreateSchema);
  if (!parse.success) return parse.response;
  const input = parse.data;

  const user = await getCurrentUser();
  if (!user) return serverError("Session missing after auth gate");

  try {
    const item = await db.inventoryItem.create({
      data: {
        buildingId,
        createdById:      user.id,
        name:             input.name,
        category:         input.category,
        unit:             input.unit,
        lowStockThreshold: input.lowStockThreshold,
        reorderQuantity:  input.reorderQuantity,
        ...(input.description  != null ? { description:  input.description }  : {}),
        ...(input.sku          != null ? { sku:          input.sku }          : {}),
        ...(input.location     != null ? { location:     input.location }     : {}),
        ...(input.unitCostCents != null ? { unitCostCents: input.unitCostCents } : {}),
        ...(input.supplier     != null ? { supplier:     input.supplier }     : {}),
      },
      select: inventoryListSelect,
    });

    void logAudit({
      userId:     user.id,
      action:     AuditAction.create,
      resource:   "inventory_item",
      resourceId: item.id,
      buildingId,
      after:      item as unknown as Record<string, unknown>,
      summary:    `Created inventory item "${item.name}"`,
      req,
    });

    return created(item);
  } catch (err) {
    console.error("[inventory/POST]", err);
    return serverError();
  }
});
