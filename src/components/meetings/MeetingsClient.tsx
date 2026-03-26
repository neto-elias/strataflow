"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Plus, Search, X } from "lucide-react";
import type { MeetingStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MeetingCard, type MeetingListItem } from "./MeetingCard";
import { CreateMeetingDialog }               from "./CreateMeetingDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Building { id: string; name: string }

interface MeetingsClientProps {
  buildings:           Building[];
  initialMeetings:     MeetingListItem[];
  selectedBuildingId?: string;
  canCreate:           boolean;
  userId:              string;
}

const STATUS_LABELS: Record<MeetingStatus | "all", string> = {
  all:         "All statuses",
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetingsClient({
  buildings,
  initialMeetings,
  selectedBuildingId,
  canCreate,
  userId: _userId,
}: MeetingsClientProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [meetings,      setMeetings]      = useState<MeetingListItem[]>(initialMeetings);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState<MeetingStatus | "all">("all");

  // ── Building change ────────────────────────────────────────────────────────

  const handleBuildingChange = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("building", id);
    router.push(`/meetings?${p.toString()}`);
  };

  // ── Refresh after create ───────────────────────────────────────────────────

  const refreshMeetings = async () => {
    if (!selectedBuildingId) return;
    try {
      const res = await fetch(`/api/buildings/${selectedBuildingId}/meetings`);
      if (res.ok) {
        const { data } = await res.json();
        setMeetings(data as MeetingListItem[]);
      }
    } catch { /* stale list is fine */ }
  };

  const handleCreateSuccess = () => {
    startTransition(() => { void refreshMeetings(); });
  };

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = meetings.filter((m) => {
    const matchSearch = !search || m.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Group into upcoming / past ─────────────────────────────────────────────

  const upcoming = filtered.filter(
    (m) => m.status === "scheduled" || m.status === "in_progress",
  );
  const past = filtered.filter(
    (m) => m.status === "completed" || m.status === "cancelled",
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="text-sm text-muted-foreground">
          Schedule and manage council meetings, AGMs, and committee sessions.
        </p>
      </div>

      {/* Building selector */}
      {buildings.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">Building:</span>
          <Select value={selectedBuildingId ?? ""} onValueChange={handleBuildingChange}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a building…" />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {buildings.length === 0 && (
        <EmptyState
          title="No buildings found"
          description="You are not associated with any building."
        />
      )}

      {buildings.length > 1 && !selectedBuildingId && (
        <EmptyState title="Select a building" description="Choose a building above to view its meetings." />
      )}

      {selectedBuildingId && (
        <>
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search meetings…"
                  className="pl-9"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MeetingStatus | "all")}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as (MeetingStatus | "all")[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {filtered.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {filtered.length} meeting{filtered.length !== 1 ? "s" : ""}
                </span>
              )}
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Schedule
                </Button>
              )}
            </div>
          </div>

          {/* Lists */}
          {filtered.length === 0 ? (
            <EmptyState
              title={meetings.length === 0 ? "No meetings yet" : "No matches"}
              description={
                meetings.length === 0
                  ? canCreate ? "Schedule the first meeting using the button above." : "No meetings have been scheduled yet."
                  : "Try adjusting your search or status filter."
              }
              action={meetings.length === 0 && canCreate ? (
                <Button variant="outline" onClick={() => setCreateOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Schedule first meeting
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-8">
              {upcoming.length > 0 && (
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Upcoming &amp; Active
                  </h2>
                  <ul className="space-y-2">
                    {upcoming.map((m) => (
                      <li key={m.id}>
                        <MeetingCard meeting={m} buildingId={selectedBuildingId} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {past.length > 0 && (
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Past
                  </h2>
                  <ul className="space-y-2">
                    {past.map((m) => (
                      <li key={m.id}>
                        <MeetingCard meeting={m} buildingId={selectedBuildingId} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {selectedBuildingId && (
        <CreateMeetingDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          buildingId={selectedBuildingId}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}

function EmptyState({
  title, description, action,
}: {
  title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
      <CalendarDays className="mb-4 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
