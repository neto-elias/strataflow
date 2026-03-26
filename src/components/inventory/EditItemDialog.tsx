"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
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
import { CATEGORY_META } from "./InventoryCard";
import type { InventoryListItem } from "./InventoryCard";

// ─── Validation ───────────────────────────────────────────────────────────────

const Schema = z.object({
  name:             z.string().min(1, "Name is required").max(255),
  category:         z.string().min(1, "Category is required"),
  unit:             z.string().min(1, "Unit is required").max(50),
  lowStockThreshold: z.number().int().min(0, "Must be 0 or more"),
  reorderQuantity:  z.number().int().min(1, "Must be at least 1"),
  description:      z.string().max(2000).optional(),
  sku:              z.string().max(100).optional(),
  location:         z.string().max(255).optional(),
  supplier:         z.string().max(255).optional(),
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buildingId:   string;
  item:         InventoryListItem;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSaved:      (updated: InventoryListItem) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EditItemDialog({ buildingId, item, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState({
    name:             item.name,
    description:      item.description ?? "",
    category:         item.category,
    sku:              item.sku ?? "",
    unit:             item.unit,
    location:         item.location ?? "",
    lowStockThreshold: String(item.lowStockThreshold),
    reorderQuantity:  String(item.reorderQuantity),
    unitCostDollars:  item.unitCostCents != null ? (item.unitCostCents / 100).toFixed(2) : "",
    supplier:         item.supplier ?? "",
    isActive:         item.isActive,
  });
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [apiError,   setApiError]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Re-populate form from current item each time the dialog opens.
  useEffect(() => {
    if (open) {
      setForm({
        name:             item.name,
        description:      item.description ?? "",
        category:         item.category,
        sku:              item.sku ?? "",
        unit:             item.unit,
        location:         item.location ?? "",
        lowStockThreshold: String(item.lowStockThreshold),
        reorderQuantity:  String(item.reorderQuantity),
        unitCostDollars:  item.unitCostCents != null ? (item.unitCostCents / 100).toFixed(2) : "",
        supplier:         item.supplier ?? "",
        isActive:         item.isActive,
      });
      setErrors({});
      setApiError(null);
    }
  }, [open, item]);

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => { const next = { ...e }; delete next[field]; return next; });
  };

  const handleSubmit = async () => {
    setApiError(null);

    const parsed = Schema.safeParse({
      ...form,
      lowStockThreshold: Number(form.lowStockThreshold),
      reorderQuantity:   Number(form.reorderQuantity),
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    const unitCostCents =
      form.unitCostDollars.trim()
        ? Math.round(parseFloat(form.unitCostDollars) * 100)
        : null;

    if (form.unitCostDollars.trim() && (isNaN(unitCostCents!) || unitCostCents! < 0)) {
      setErrors((e) => ({ ...e, unitCostDollars: "Invalid cost" }));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/buildings/${buildingId}/inventory/${item.id}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:             form.name,
            description:      form.description  || null,
            category:         form.category,
            sku:              form.sku          || null,
            unit:             form.unit,
            location:         form.location     || null,
            lowStockThreshold: Number(form.lowStockThreshold),
            reorderQuantity:   Number(form.reorderQuantity),
            unitCostCents:     unitCostCents,
            supplier:          form.supplier    || null,
            isActive:          form.isActive,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setApiError(data?.error ?? "Something went wrong.");
        return;
      }
      onSaved(data.data);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Inventory Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="edit-name">Name *</Label>
            <Input
              id="edit-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Category + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-xs text-red-500">{errors.category}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-unit">Unit *</Label>
              <Input
                id="edit-unit"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              />
              {errors.unit && <p className="text-xs text-red-500">{errors.unit}</p>}
            </div>
          </div>

          {/* Thresholds */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-threshold">Low Stock Threshold</Label>
              <Input
                id="edit-threshold"
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) => set("lowStockThreshold", e.target.value)}
              />
              {errors.lowStockThreshold && (
                <p className="text-xs text-red-500">{errors.lowStockThreshold}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-reorder">Reorder Quantity</Label>
              <Input
                id="edit-reorder"
                type="number"
                min="1"
                value={form.reorderQuantity}
                onChange={(e) => set("reorderQuantity", e.target.value)}
              />
              {errors.reorderQuantity && (
                <p className="text-xs text-red-500">{errors.reorderQuantity}</p>
              )}
            </div>
          </div>

          {/* SKU + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-sku">SKU / Item Code</Label>
              <Input
                id="edit-sku"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-location">Storage Location</Label>
              <Input
                id="edit-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Unit cost + Supplier */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-cost">Unit Cost ($)</Label>
              <Input
                id="edit-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.unitCostDollars}
                onChange={(e) => set("unitCostDollars", e.target.value)}
                placeholder="0.00"
              />
              {errors.unitCostDollars && (
                <p className="text-xs text-red-500">{errors.unitCostDollars}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-supplier">Supplier</Label>
              <Input
                id="edit-supplier"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
            />
          </div>

          {/* Active status */}
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5">
            <input
              type="checkbox"
              id="edit-isActive"
              checked={form.isActive}
              onChange={(e) =>
                setForm((f) => ({ ...f, isActive: e.target.checked }))
              }
              className="h-4 w-4 accent-primary"
            />
            <Label htmlFor="edit-isActive" className="cursor-pointer select-none">
              Active
              <span className="block text-xs font-normal text-muted-foreground">
                Inactive items are hidden from the main list
              </span>
            </Label>
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
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
