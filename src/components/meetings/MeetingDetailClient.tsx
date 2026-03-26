"use client";

import { useState } from "react";
import Link         from "next/link";
import {
  CalendarDays, MapPin, Video, Users, Clock,
  PlayCircle, CheckCircle2, XCircle, ChevronLeft,
} from "lucide-react";
import type { MeetingStatus, MeetingType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { AgendaEditor, type AgendaItemData } from "./AgendaEditor";
import { MinutesEditor, type MinutesData }   from "./MinutesEditor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeetingDetail {
  id:            string;
  buildingId:    string;
  title:         string;
  type:          MeetingType;
  status:        MeetingStatus;
  scheduledAt:   string | Date;
  endedAt:       string | Date | null;
  location:      string | null;
  videoUrl:      string | null;
  quorum:        number | null;
  attendeeCount: number | null;
  notes:         string | null;
  createdAt:     string | Date;
  updatedAt:     string | Date;
  createdBy:     { id: string; name: string | null; image: string | null };
}

interface MeetingDetailClientProps {
  meeting:           MeetingDetail;
  agendaItems:       AgendaItemData[];
  minutes:           MinutesData | null;
  canUpdate:         boolean;
  canCancel:         boolean;
  canPublishMinutes: boolean;
}

// ─── Metadata maps ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<MeetingType, string> = {
  agm:       "AGM (Annual General Meeting)",
  special:   "Special General Meeting",
  council:   "Council Meeting",
  committee: "Committee Meeting",
};

const STATUS_META: Record<
  MeetingStatus,
  { label: string; className: string; dotClass: string }
> = {
  scheduled:   { label: "Scheduled",   className: "bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-300",  dotClass: "bg-blue-500"  },
  in_progress: { label: "In Progress", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", dotClass: "bg-amber-500" },
  completed:   { label: "Completed",   className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", dotClass: "bg-green-500" },
  cancelled:   { label: "Cancelled",   className: "bg-gray-100  text-gray-500  dark:bg-gray-800/60  dark:text-gray-400",  dotClass: "bg-gray-400"  },
};

type Tab = "overview" | "agenda" | "minutes";

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetingDetailClient({
  meeting: initialMeeting,
  agendaItems,
  minutes,
  canUpdate,
  canCancel,
  canPublishMinutes,
}: MeetingDetailClientProps) {
  const [meeting,        setMeeting]        = useState(initialMeeting);
  const [activeTab,      setActiveTab]      = useState<Tab>("overview");
  const [transitioning,  setTransitioning]  = useState(false);
  const [actionError,    setActionError]    = useState<string | null>(null);
  // Inline cancel confirmation — avoids native confirm() dialog
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const meta       = STATUS_META[meeting.status];
  const isTerminal = meeting.status === "completed" || meeting.status === "cancelled";

  // ── Status transition ───────────────────────────────────────────────────────

  const transition = async (newStatus: MeetingStatus) => {
    setTransitioning(true); setActionError(null); setShowCancelConfirm(false);
    try {
      const res = await fetch(
        `/api/buildings/${meeting.buildingId}/meetings/${meeting.id}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to update");
      const { data } = await res.json();
      setMeeting((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error updating meeting");
    } finally {
      setTransitioning(false);
    }
  };

  // ── Date/time strings ───────────────────────────────────────────────────────

  const dateStr = formatDate(meeting.scheduledAt, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(meeting.scheduledAt));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Back link — deterministic, not router.back() */}
      <Link
        href={`/meetings?building=${meeting.buildingId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        All meetings
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                meta.className,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} aria-hidden="true" />
              {meta.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {TYPE_LABELS[meeting.type]} · {dateStr} at {timeStr}
          </p>
        </div>

        {/* Lifecycle actions */}
        {!isTerminal && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            {actionError && (
              <p className="text-xs text-destructive">{actionError}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {canUpdate && meeting.status === "scheduled" && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={transitioning}
                  onClick={() => transition("in_progress")}
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  Start meeting
                </Button>
              )}

              {canUpdate && meeting.status === "in_progress" && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={transitioning}
                  onClick={() => transition("completed")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complete
                </Button>
              )}

              {canCancel && !showCancelConfirm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={transitioning}
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel meeting
                </Button>
              )}
            </div>

            {/* Inline cancel confirmation — replaces native confirm() */}
            {showCancelConfirm && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-xs text-destructive font-medium">Cancel this meeting? This cannot be undone.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={transitioning}
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Keep it
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={transitioning}
                  onClick={() => transition("cancelled")}
                >
                  <XCircle className="h-3 w-3" />
                  {transitioning ? "Cancelling…" : "Yes, cancel"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6" aria-label="Meeting sections">
          {(["overview", "agenda", "minutes"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-3 text-sm font-medium capitalize transition-colors border-b-2",
                activeTab === tab
                  ? "border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetaItem icon={CalendarDays} label="Date & time">
              {dateStr}<br />
              <span className="text-muted-foreground">{timeStr}</span>
            </MetaItem>

            {meeting.location && (
              <MetaItem icon={MapPin} label="Location">
                {meeting.location}
              </MetaItem>
            )}

            {meeting.videoUrl && (
              <MetaItem icon={Video} label="Video link">
                <a
                  href={meeting.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline dark:text-primary-400 truncate"
                >
                  Join online
                </a>
              </MetaItem>
            )}

            {meeting.quorum !== null && (
              <MetaItem icon={Users} label="Quorum required">
                {meeting.quorum} attendees
              </MetaItem>
            )}

            {meeting.attendeeCount !== null && (
              <MetaItem icon={Users} label="Attendees">
                {meeting.attendeeCount}
              </MetaItem>
            )}

            {meeting.endedAt && (
              <MetaItem icon={Clock} label="Ended">
                {formatDate(meeting.endedAt, { year: "numeric", month: "short", day: "numeric" })}
              </MetaItem>
            )}
          </dl>

          {meeting.notes && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{meeting.notes}</p>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Created by {meeting.createdBy.name ?? "unknown"} ·{" "}
            {formatDate(meeting.createdAt, { year: "numeric", month: "short", day: "numeric" })}
          </div>
        </div>
      )}

      {/* Agenda tab */}
      {activeTab === "agenda" && (
        <AgendaEditor
          meetingId={meeting.id}
          buildingId={meeting.buildingId}
          meetingStatus={meeting.status}
          initialItems={agendaItems}
          canEdit={canUpdate}
        />
      )}

      {/* Minutes tab */}
      {activeTab === "minutes" && (
        <MinutesEditor
          meetingId={meeting.id}
          buildingId={meeting.buildingId}
          initialMinutes={minutes}
          canEdit={canUpdate}
          canPublish={canPublishMinutes}
        />
      )}
    </div>
  );
}

// ─── MetaItem ─────────────────────────────────────────────────────────────────

function MetaItem({
  icon: Icon, label, children,
}: {
  icon: React.ElementType; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm">{children}</dd>
      </div>
    </div>
  );
}
