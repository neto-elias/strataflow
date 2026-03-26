"use client";

import { useState, useMemo } from "react";
import { useRouter }         from "next/navigation";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InventoryCard, CATEGORY_META } from "./InventoryCard";
import { CreateItemDialog }             from "./CreateItemDialog";
import type { InventoryListItem }       from "./InventoryCard";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buildings:    { id: string; name: string }[];
  buildingId:   string | null;
  initialItems: InventoryListItem[];
  canManage:    boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InventoryClient({ buildings, buildingId, initialItems, canManage }: Props) {
  const router = useRouter();

  const [items,          setItems]          = useState<InventoryListItem[]>(initialItems);
  const [search,         setSearch]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showInactive,   setShowInactive]   = useState(false);
  const [createOpen,     setCreateOpen]     = useState(false);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!showInactive && !item.isActive) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          item.location?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, search, categoryFilter, showInactive]);

  const lowStockItems = filtered.filter(
    (i) => i.isActive && i.lowStockThreshold > 0 && i.quantityOnHand <= i.lowStockThreshold,
  );

  // ── Building selector ──────────────────────────────────────────────────────

  if (buildings.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">You are not associated with any buildings.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Inventory</h1>
            {buildingId && (
              <p className="text-sm text-muted-foreground">
                {items.filter((i) => i.isActive).length} active item
                {items.filter((i) => i.isActive).length !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Building selector (only when multiple) */}
            {buildings.length > 1 && (
              <Select
                value={buildingId ?? ""}
                onValueChange={(v) => router.push(`/inventory?building=${v}`)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select building…" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {canManage && buildingId && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            )}
          </div>
        </div>
      </div>

      {!buildingId ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Select a building to view inventory.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Low stock alert banner */}
          {lowStockItems.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <strong>{lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} low on stock:</strong>{" "}
                {lowStockItems.map((i) => i.name).join(", ")}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, SKU, or location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canManage && (
              <Button
                variant={showInactive ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowInactive((v) => !v)}
              >
                {showInactive ? "Hide inactive" : "Show inactive"}
              </Button>
            )}
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-muted-foreground">
                {items.length === 0
                  ? "No inventory items yet."
                  : "No items match the current filters."}
              </p>
              {canManage && items.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add first item
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((item) => (
                <InventoryCard key={item.id} item={item} buildingId={buildingId} />
              ))}
            </div>
          )}
        </div>
      )}

      {buildingId && (
        <CreateItemDialog
          buildingId={buildingId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(item) => setItems((prev) => [item, ...prev])}
        />
      )}
    </div>
  );
}
