"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, AlertTriangle, Pencil, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Button }    from "@/components/ui/button";
import { Badge }     from "@/components/ui/badge";
import { cn }        from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CATEGORY_META, TRANSACTION_TYPE_META } from "./InventoryCard";
import { RecordTransactionDialog }              from "./RecordTransactionDialog";
import { EditItemDialog }                       from "./EditItemDialog";
import type { InventoryListItem }               from "./InventoryCard";
import type { StockTransaction, UpdatedItemSnapshot } from "./RecordTransactionDialog";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item:                InventoryListItem;
  initialTransactions: StockTransaction[];
  canManage:           boolean;
  buildingId:          string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 0) return <TrendingUp  className="h-4 w-4 text-green-600 dark:text-green-400" />;
  if (delta < 0) return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InventoryDetailClient({ item: initialItem, initialTransactions, canManage, buildingId }: Props) {
  const router = useRouter();

  const [item,         setItem]         = useState(initialItem);
  const [transactions, setTransactions] = useState<StockTransaction[]>(initialTransactions);
  const [txnOpen,      setTxnOpen]      = useState(false);
  const [editOpen,     setEditOpen]     = useState(false);

  const category     = CATEGORY_META[item.category] ?? CATEGORY_META.other;
  const isLowStock   = item.lowStockThreshold > 0 && item.quantityOnHand <= item.lowStockThreshold;
  const isOutOfStock = item.quantityOnHand === 0;

  // Called after a stock transaction is successfully recorded.
  // updatedItem carries the new quantityOnHand and (if received) unitCostCents.
  const handleTransactionRecorded = (txn: StockTransaction, updatedItem: UpdatedItemSnapshot) => {
    setItem((prev) => ({
      ...prev,
      quantityOnHand: updatedItem.quantityOnHand,
      unitCostCents:  updatedItem.unitCostCents,
    }));
    setTransactions((prev) => [txn, ...prev]);
  };

  // Called after item metadata is saved via the PATCH endpoint.
  const handleSaved = (updated: InventoryListItem) => {
    setItem(updated);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push(`/inventory?building=${buildingId}`)}
            className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to inventory"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold truncate">{item.name}</h1>
              <Badge className={cn("text-[10px] px-1.5 py-0.5 font-medium border-0", category.color)}>
                {category.label}
              </Badge>
              {!item.isActive && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Inactive
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
              {item.sku      && <span>SKU: {item.sku}</span>}
              {item.location && <span>Location: {item.location}</span>}
              {item.supplier && <span>Supplier: {item.supplier}</span>}
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                aria-label="Edit item metadata"
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              {item.isActive && (
                <Button size="sm" onClick={() => setTxnOpen(true)}>
                  Record Transaction
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Alerts */}
        {isOutOfStock && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-300">
              Out of stock — reorder quantity: {item.reorderQuantity} {item.unit}
            </p>
          </div>
        )}
        {!isOutOfStock && isLowStock && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Low stock (threshold: {item.lowStockThreshold} {item.unit}) — reorder quantity: {item.reorderQuantity} {item.unit}
            </p>
          </div>
        )}

        {/* Stock summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">On Hand</p>
            <p className={cn(
              "text-3xl font-bold tabular-nums",
              isOutOfStock ? "text-red-600 dark:text-red-400" :
              isLowStock   ? "text-amber-600 dark:text-amber-400" :
              "text-foreground",
            )}>
              {item.quantityOnHand}
              <span className="text-sm font-normal text-muted-foreground ml-1">{item.unit}</span>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Low Stock Alert</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {item.lowStockThreshold}
              <span className="text-sm font-normal text-muted-foreground ml-1">{item.unit}</span>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Reorder Quantity</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {item.reorderQuantity}
              <span className="text-sm font-normal text-muted-foreground ml-1">{item.unit}</span>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Unit Cost</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {item.unitCostCents != null
                ? `$${(item.unitCostCents / 100).toFixed(2)}`
                : "—"}
            </p>
          </div>
        </div>

        {/* Description */}
        {item.description && (
          <div>
            <h2 className="text-sm font-medium mb-2">Description</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
          </div>
        )}

        {/* Transaction history */}
        <div>
          <h2 className="text-sm font-medium mb-3">
            Transaction History
            <span className="ml-2 text-muted-foreground font-normal">({transactions.length})</span>
          </h2>

          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
              No transactions yet. Use "Record Transaction" to set initial stock.
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => {
                const typeMeta = TRANSACTION_TYPE_META[txn.transactionType] ?? {
                  label: txn.transactionType, sign: "either",
                };
                return (
                  <div
                    key={txn.id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="mt-0.5">
                      <DeltaIcon delta={txn.quantityDelta} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{typeMeta.label}</span>
                        <span className={cn(
                          "text-sm font-mono tabular-nums font-semibold",
                          txn.quantityDelta > 0 ? "text-green-600 dark:text-green-400" :
                          txn.quantityDelta < 0 ? "text-red-600 dark:text-red-400"   :
                          "text-muted-foreground",
                        )}>
                          {txn.quantityDelta > 0 ? "+" : ""}{txn.quantityDelta}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {txn.quantityBefore} → {txn.quantityAfter} {item.unit}
                        </span>
                      </div>
                      {txn.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{txn.notes}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={txn.createdBy.image ?? ""} />
                          <AvatarFallback className="text-[8px]">
                            {txn.createdBy.name?.[0] ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          {txn.createdBy.name ?? "Unknown"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(txn.createdAt)}
                      </p>
                      {txn.unitCostCents != null && (
                        <p className="text-xs text-muted-foreground">
                          ${(txn.unitCostCents / 100).toFixed(2)}/ea
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <>
          <RecordTransactionDialog
            buildingId={buildingId}
            itemId={item.id}
            itemName={item.name}
            unit={item.unit}
            currentQty={item.quantityOnHand}
            open={txnOpen}
            onOpenChange={setTxnOpen}
            onRecorded={handleTransactionRecorded}
          />
          <EditItemDialog
            buildingId={buildingId}
            item={item}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSaved={handleSaved}
          />
        </>
      )}
    </div>
  );
}
