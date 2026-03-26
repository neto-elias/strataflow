"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Wrench } from "lucide-react";
import { MaintenanceStatus, MaintenanceCategory, MaintenancePriority } from "@prisma/client";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { RequestCard, STATUS_META, PRIORITY_META, CATEGORY_META } from "./RequestCard";
import { CreateRequestDialog } from "./CreateRequestDialog";
import type { MaintenanceListItem } from "./RequestCard";

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  buildings:           { id: string; name: string }[];
  initialRequests:     MaintenanceListItem[];
  selectedBuildingId?: string;
  canCreate:           boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MaintenanceClient({
  buildings,
  initialRequests,
  selectedBuildingId,
  canCreate,
}: Props) {
  const router = useRouter();

  const [requests,    setRequests]   = useState<MaintenanceListItem[]>(initialRequests);
  const [search,      setSearch]     = useState("");
  const [statusFilter,   setStatusFilter]   = useState<MaintenanceStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<MaintenancePriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<MaintenanceCategory | "all">("all");

  // ── Building selector ───────────────────────────────────────────────────

  function handleBuildingChange(id: string) {
    router.push(`/maintenance?building=${id}`);
  }

  // ── Handle new request created ─────────────────────────────────────────

  const handleCreated = useCallback((newRequest: MaintenanceListItem) => {
    setRequests((prev) => [newRequest, ...prev]);
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────

  const filtered = requests.filter((r) => {
    if (statusFilter   !== "all" && r.status   !== statusFilter)   return false;
    if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.title.toLowerCase().includes(q) &&
        !CATEGORY_META[r.category].label.toLowerCase().includes(q) &&
        !(r.lot?.unitNumber ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // ── Counts for section headings ────────────────────────────────────────

  const activeCount = filtered.filter(
    (r) => r.status === "open" || r.status === "in_progress",
  ).length;
  const resolvedCount = filtered.filter(
    (r) => r.status === "resolved" || r.status === "closed",
  ).length;

  const hasFilters =
    statusFilter !== "all" || priorityFilter !== "all" ||
    categoryFilter !== "all" || search !== "";

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Maintenance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track and manage building maintenance requests
          </p>
        </div>
        {canCreate && selectedBuildingId && (
          <CreateRequestDialog
            buildingId={selectedBuildingId}
            onCreated={handleCreated}
          />
        )}
      </div>

      {/* ── Building selector (multi-building users) ─────────────────────── */}
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
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── No building selected ─────────────────────────────────────────── */}
      {!selectedBuildingId && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">Select a building</p>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a building above to view its maintenance requests.
          </p>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {selectedBuildingId && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search requests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full sm:w-48"
            />

            {/* Status */}
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as MaintenanceStatus | "all")}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(Object.keys(STATUS_META) as MaintenanceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Priority */}
            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v as MaintenancePriority | "all")}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {(Object.keys(PRIORITY_META) as MaintenancePriority[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Category */}
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as MaintenanceCategory | "all")}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(Object.keys(CATEGORY_META) as MaintenanceCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_META[c].label}</SelectItem>
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
                  setPriorityFilter("all");
                  setCategoryFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Empty state — no requests at all */}
          {requests.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
              <Wrench className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No maintenance requests yet</p>
              {canCreate ? (
                <p className="text-sm text-muted-foreground mt-1">
                  Submit the first request using the button above.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  No requests have been submitted for this building.
                </p>
              )}
            </div>
          )}

          {/* Empty state — filters exclude everything */}
          {requests.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
              <p className="font-medium">No requests match your filters</p>
              <Button
                variant="link"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPriorityFilter("all");
                  setCategoryFilter("all");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}

          {/* Active requests section */}
          {activeCount > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Active · {activeCount}
              </h2>
              <div className="space-y-2">
                {filtered
                  .filter((r) => r.status === "open" || r.status === "in_progress")
                  .map((r) => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      buildingId={selectedBuildingId}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* Resolved / closed section */}
          {resolvedCount > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Resolved & Closed · {resolvedCount}
              </h2>
              <div className="space-y-2">
                {filtered
                  .filter((r) => r.status === "resolved" || r.status === "closed")
                  .map((r) => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      buildingId={selectedBuildingId}
                    />
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
