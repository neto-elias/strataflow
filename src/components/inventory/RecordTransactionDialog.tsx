"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TRANSACTION_TYPE_META } from "./InventoryCard";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StockTransaction {
  id:              string;
  inventoryItemId: string;
  buildingId:      string;
  transactionType: string;
  quantityDelta:   number;
  quantityBefore:  number;
  quantityAfter:   number;
  unitCostCents:   number | null;
  notes:           string | null;
  createdAt:       string | Date;
  createdBy:       { id: string; name: string | null; image: string | null };
}

/**
 * Snapshot of the inventory item state returned by the transaction POST.
 * Includes unitCostCents so the UI can update the cost display immediately
 * after a 'received' transaction without a full page reload.
 */
export interface UpdatedItemSnapshot {
  quantityOnHand: number;
  unitCostCents:  number | null;
}

interface Props {
  buildingId:  string;
  itemId:      string;
  itemName:    string;
  unit:        string;
  currentQty:  number;
  open:        boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded:  (txn: StockTransaction, updatedItem: UpdatedItemSnapshot) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Transaction types that need cost input (inbound stock receipts) */
const COST_TYPES = new Set(["received"]);

/** For outbound types the user enters a positive quantity and we negate it */
const OUTBOUND_TYPES = new Set(["issued", "damaged"]);

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordTransactionDialog({
  buildingId, itemId, itemName, unit, currentQty,
  open, onOpenChange, onRecorded,
}: Props) {
  const [transactionType, setTransactionType] = useState("received");
  const [quantity,        setQuantity]        = useState("1");
  const [delta,           setDelta]           = useState(""); // for adjustment only
  const [unitCostDollars, setUnitCostDollars] = useState("");
  const [notes,           setNotes]           = useState("");
  const [apiError,        setApiError]        = useState<string | null>(null);
  const [submitting,      setSubmitting]      = useState(false);

  const isAdjustment  = transactionType === "adjustment" || transactionType === "transferred";
  const isOutbound    = OUTBOUND_TYPES.has(transactionType);
  const showCost      = COST_TYPES.has(transactionType);

  // Compute preview delta for display
  const previewDelta = (() => {
    if (isAdjustment) {
      const d = parseInt(delta, 10);
      return isNaN(d) ? null : d;
    }
    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) return null;
    return isOutbound ? -q : q;
  })();

  const previewAfter = previewDelta !== null ? currentQty + previewDelta : null;

  const handleSubmit = async () => {
    setApiError(null);

    let quantityDelta: number;
    if (isAdjustment) {
      quantityDelta = parseInt(delta, 10);
      if (isNaN(quantityDelta) || quantityDelta === 0) {
        setApiError("Enter a non-zero adjustment (positive to add, negative to remove).");
        return;
      }
    } else {
      const q = parseInt(quantity, 10);
      if (isNaN(q) || q <= 0) {
        setApiError("Quantity must be a positive integer.");
        return;
      }
      quantityDelta = isOutbound ? -q : q;
    }

    const unitCostCents =
      unitCostDollars.trim()
        ? Math.round(parseFloat(unitCostDollars) * 100)
        : undefined;

    if (unitCostDollars.trim() && (isNaN(unitCostCents!) || unitCostCents! < 0)) {
      setApiError("Invalid unit cost.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/buildings/${buildingId}/inventory/${itemId}/transactions`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionType,
            quantityDelta,
            notes:         notes || undefined,
            unitCostCents: unitCostCents,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setApiError(data?.error ?? "Something went wrong.");
        return;
      }
      onRecorded(data.data.transaction, {
        quantityOnHand: data.data.item.quantityOnHand,
        unitCostCents:  data.data.item.unitCostCents,
      });
      onOpenChange(false);
      // Reset
      setTransactionType("received");
      setQuantity("1");
      setDelta("");
      setUnitCostDollars("");
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Stock Transaction</DialogTitle>
          <p className="text-sm text-muted-foreground">{itemName}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Transaction type */}
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={transactionType} onValueChange={(v) => {
              setTransactionType(v);
              setApiError(null);
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRANSACTION_TYPE_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          {isAdjustment ? (
            <div className="space-y-1">
              <Label htmlFor="delta">
                Adjustment delta
                <span className="text-muted-foreground font-normal ml-1">(positive to add, negative to remove)</span>
              </Label>
              <Input
                id="delta"
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="e.g. +5 or -3"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="quantity">
                {isOutbound ? "Quantity to remove" : "Quantity to add"}
                <span className="ml-1 text-muted-foreground font-normal">({unit})</span>
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          )}

          {/* Stock preview */}
          {previewAfter !== null && (
            <div className={`rounded-md px-3 py-2 text-sm ${
              previewAfter < 0
                ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {currentQty} → <strong>{previewAfter}</strong> {unit}
              {previewAfter < 0 && " — would result in negative stock"}
            </div>
          )}

          {/* Unit cost (for received) */}
          {showCost && (
            <div className="space-y-1">
              <Label htmlFor="unitCost">Unit Cost ($) <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input
                id="unitCost"
                type="number"
                min="0"
                step="0.01"
                value={unitCostDollars}
                onChange={(e) => setUnitCostDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">optional</span></Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason, reference, or context"
              rows={2}
            />
          </div>

          {apiError && (
            <p className="rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {apiError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Recording…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
