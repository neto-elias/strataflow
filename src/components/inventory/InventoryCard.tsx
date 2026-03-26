"use client";

import Link from "next/link";
import { Package, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Meta maps ────────────────────────────────────────────────────────────────

export const CATEGORY_META: Record<
  string,
  { label: string; color: string }
> = {
  electrical:   { label: "Electrical",   color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  plumbing:     { label: "Plumbing",     color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  hardware:     { label: "Hardware",     color: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300" },
  cleaning:     { label: "Cleaning",     color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  safety:       { label: "Safety",       color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  landscaping:  { label: "Landscaping",  color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  it_equipment: { label: "IT Equipment", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  furniture:    { label: "Furniture",    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  tools:        { label: "Tools",        color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  other:        { label: "Other",        color: "bg-muted text-muted-foreground" },
};

export const TRANSACTION_TYPE_META: Record<
  string,
  { label: string; sign: "positive" | "negative" | "either" }
> = {
  received:    { label: "Received",    sign: "positive" },
  issued:      { label: "Issued",      sign: "negative" },
  adjustment:  { label: "Adjustment",  sign: "either"   },
  returned:    { label: "Returned",    sign: "positive" },
  damaged:     { label: "Damaged",     sign: "negative" },
  transferred: { label: "Transferred", sign: "either"   },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventoryListItem {
  id:                string;
  buildingId:        string;
  name:              string;
  description:       string | null;
  category:          string;
  sku:               string | null;
  unit:              string;
  quantityOnHand:    number;
  lowStockThreshold: number;
  reorderQuantity:   number;
  unitCostCents:     number | null;
  supplier:          string | null;
  location:          string | null;
  isActive:          boolean;
  createdAt:         string | Date;
  updatedAt:         string | Date;
  createdBy:         { id: string; name: string | null; image: string | null };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  item:       InventoryListItem;
  buildingId: string;
}

export function InventoryCard({ item, buildingId }: Props) {
  const category = CATEGORY_META[item.category] ?? CATEGORY_META.other;
  const isLowStock = item.lowStockThreshold > 0 && item.quantityOnHand <= item.lowStockThreshold;
  const isOutOfStock = item.quantityOnHand === 0;

  return (
    <Link
      href={`/inventory/${item.id}?building=${buildingId}`}
      className="block rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{item.name}</p>
            {item.sku && (
              <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
            )}
            {item.location && (
              <p className="text-xs text-muted-foreground truncate">{item.location}</p>
            )}
          </div>
        </div>
        <Badge className={cn("shrink-0 text-[10px] px-1.5 py-0.5 font-medium border-0", category.color)}>
          {category.label}
        </Badge>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums",
              isOutOfStock  ? "text-red-600 dark:text-red-400"    :
              isLowStock    ? "text-amber-600 dark:text-amber-400" :
              "text-foreground",
            )}
          >
            {item.quantityOnHand}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {item.unit}
            </span>
          </p>
          {isLowStock && !isOutOfStock && (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              <AlertTriangle className="h-3 w-3" />
              Low stock (threshold: {item.lowStockThreshold})
            </p>
          )}
          {isOutOfStock && (
            <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mt-0.5">
              <AlertTriangle className="h-3 w-3" />
              Out of stock
            </p>
          )}
        </div>

        {item.unitCostCents != null && (
          <p className="text-xs text-muted-foreground">
            ${(item.unitCostCents / 100).toFixed(2)}/{item.unit}
          </p>
        )}
      </div>
    </Link>
  );
}
