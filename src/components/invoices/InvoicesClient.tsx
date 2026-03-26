"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Receipt } from "lucide-react";
import { InvoiceStatus, InvoiceType } from "@prisma/client";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { InvoiceCard, STATUS_META, TYPE_META } from "./InvoiceCard";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import type { InvoiceListItem } from "./InvoiceCard";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buildings:           { id: string; name: string }[];
  initialInvoices:     InvoiceListItem[];
  selectedBuildingId?: string;
  canCreate:           boolean;
  eligibleRecipients:  { id: string; name: string | null; email: string }[];
  lots:                { id: string; unitNumber: string }[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicesClient({
  buildings,
  initialInvoices,
  selectedBuildingId,
  canCreate,
  eligibleRecipients,
  lots,
}: Props) {
  const router = useRouter();

  const [invoices,       setInvoices]       = useState<InvoiceListItem[]>(initialInvoices);
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<InvoiceStatus | "all">("all");
  const [typeFilter,     setTypeFilter]     = useState<InvoiceType   | "all">("all");

  // ── Building selector ──────────────────────────────────────────────────

  function handleBuildingChange(id: string) {
    router.push(`/invoices?building=${id}`);
  }

  // ── Handle new invoice created ─────────────────────────────────────────

  const handleCreated = useCallback((invoice: InvoiceListItem) => {
    setInvoices((prev) => [invoice, ...prev]);
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────

  const filtered = invoices.filter((inv) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (typeFilter   !== "all" && inv.type   !== typeFilter)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !inv.description.toLowerCase().includes(q) &&
        !(inv.issuedTo.name ?? "").toLowerCase().includes(q) &&
        !inv.issuedTo.email.toLowerCase().includes(q) &&
        !(inv.lot?.unitNumber ?? "").toLowerCase().includes(q) &&
        !TYPE_META[inv.type].label.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // ── Counts ────────────────────────────────────────────────────────────

  const openCount   = filtered.filter((i) => ["issued", "partially_paid", "overdue"].includes(i.status)).length;
  const closedCount = filtered.filter((i) => ["paid", "void", "written_off", "draft"].includes(i.status)).length;

  const hasFilters = statusFilter !== "all" || typeFilter !== "all" || search !== "";

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage strata fees, levies, and payment records
          </p>
        </div>
        {canCreate && selectedBuildingId && (
          <CreateInvoiceDialog
            buildingId={selectedBuildingId}
            eligibleRecipients={eligibleRecipients}
            lots={lots}
            onCreated={handleCreated}
          />
        )}
      </div>

      {/* ── Building selector ─────────────────────────────────────────────── */}
      {buildings.length > 1 && (
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select
            value={selectedBuildingId ?? ""}
            onValueChange={handleBuildingChange}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a building" />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── No building selected ──────────────────────────────────────────── */}
      {!selectedBuildingId && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">Select a building</p>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a building above to view its invoices.
          </p>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {selectedBuildingId && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search invoices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full sm:w-48"
            />

            {/* Status */}
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as InvoiceStatus | "all")}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(Object.keys(STATUS_META) as InvoiceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type */}
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as InvoiceType | "all")}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {(Object.keys(TYPE_META) as InvoiceType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setTypeFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Empty state — no invoices */}
          {invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No invoices yet</p>
              {canCreate ? (
                <p className="text-sm text-muted-foreground mt-1">
                  Create the first invoice using the button above.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  No invoices have been issued for this building.
                </p>
              )}
            </div>
          )}

          {/* Empty state — filters */}
          {invoices.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
              <p className="font-medium">No invoices match your filters</p>
              <Button
                variant="link"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setTypeFilter("all");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}

          {/* Active / outstanding invoices */}
          {openCount > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Outstanding · {openCount}
              </h2>
              <div className="space-y-2">
                {filtered
                  .filter((i) => ["issued", "partially_paid", "overdue"].includes(i.status))
                  .map((i) => (
                    <InvoiceCard key={i.id} invoice={i} buildingId={selectedBuildingId} />
                  ))}
              </div>
            </section>
          )}

          {/* Draft + settled invoices */}
          {closedCount > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Draft & Settled · {closedCount}
              </h2>
              <div className="space-y-2">
                {filtered
                  .filter((i) => ["paid", "void", "written_off", "draft"].includes(i.status))
                  .map((i) => (
                    <InvoiceCard key={i.id} invoice={i} buildingId={selectedBuildingId} />
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
