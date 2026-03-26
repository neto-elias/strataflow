"use client";

import { useState } from "react";
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
  lowStockThreshold: z.number().int().min(0),
  reorderQuantity:  z.number().int().min(1),
  description:      z.string().max(2000).optional(),
  sku:              z.string().max(100).optional(),
  location:         z.string().max(255).optional(),
  unitCostDollars:  z.string().optional(),
  supplier:         z.string().max(255).optional(),
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buildingId: string;
  open:       boolean;
  onOpenChange: (open: boolean) => void;
  onCreated:  (item: InventoryListItem) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateItemDialog({ buildingId, open, onOpenChange, onCreated }: Props) {
  const [form, setForm] = useState({
    name:             "",
    category:         "",
    unit:             "each",
    lowStockThreshold: "0",
    reorderQuantity:  "1",
    description:      "",
    sku:              "",
    location:         "",
    unitCostDollars:  "",
    supplier:         "",
  });
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [apiError,   setApiError]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        : undefined;

    if (form.unitCostDollars.trim() && (isNaN(unitCostCents!) || unitCostCents! < 0)) {
      setErrors((e) => ({ ...e, unitCostDollars: "Invalid cost" }));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/buildings/${buildingId}/inventory`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:             form.name,
          category:         form.category,
          unit:             form.unit,
          lowStockThreshold: Number(form.lowStockThreshold),
          reorderQuantity:   Number(form.reorderQuantity),
          description:  form.description  || undefined,
          sku:          form.sku          || undefined,
          location:     form.location     || undefined,
          supplier:     form.supplier     || undefined,
          unitCostCents: unitCostCents,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data?.error ?? "Something went wrong.");
        return;
      }
      onCreated(data.data);
      onOpenChange(false);
      setForm({
        name: "", category: "", unit: "each",
        lowStockThreshold: "0", reorderQuantity: "1",
        description: "", sku: "", location: "", unitCostDollars: "", supplier: "",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. LED Bulb 9W"
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
              <Label htmlFor="unit">Unit *</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="each"
              />
              {errors.unit && <p className="text-xs text-red-500">{errors.unit}</p>}
            </div>
          </div>

          {/* Low stock threshold + Reorder qty */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) => set("lowStockThreshold", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reorderQuantity">Reorder Quantity</Label>
              <Input
                id="reorderQuantity"
                type="number"
                min="1"
                value={form.reorderQuantity}
                onChange={(e) => set("reorderQuantity", e.target.value)}
              />
            </div>
          </div>

          {/* SKU + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sku">SKU / Item Code</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Storage Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. B1 Storage, Shelf 3"
              />
            </div>
          </div>

          {/* Unit cost + Supplier */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="unitCostDollars">Unit Cost ($)</Label>
              <Input
                id="unitCostDollars"
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
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional notes about this item"
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
            {submitting ? "Adding…" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
