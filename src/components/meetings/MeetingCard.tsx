"use client";

import Link from "next/link";
import {
  CalendarDays, MapPin, Users, Video,
  CheckCircle2, Clock, XCircle, PlayCircle,
} from "lucide-react";
import { Badge }  from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import type { MeetingStatus, MeetingType } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeetingListItem {
  id:            string;
  title:         string;
  type:          MeetingType;
  status:        MeetingStatus;
  scheduledAt:   string | Date;
  endedAt:       string | Date | null;
  location:      string | null;
  attendeeCount: number | null;
  createdAt:     string | Date;
  createdBy:     { id: string; name: string | null };
  _count:        { agendaItems: number };
}

interface MeetingCardProps {
  meeting:    MeetingListItem;
  buildingId: string;
}

// ─── Metadata maps ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<MeetingType, string> = {
  agm:       "AGM",
  special:   "Special",
  council:   "Council",
  committee: "Committee",
};

const STATUS_META: Record<
  MeetingStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  scheduled:   { label: "Scheduled",   icon: Clock,        className: "bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-300"  },
  in_progress: { label: "In Progress", icon: PlayCircle,   className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  completed:   { label: "Completed",   icon: CheckCircle2, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  cancelled:   { label: "Cancelled",   icon: XCircle,      className: "bg-gray-100  text-gray-500  dark:bg-gray-800/60  dark:text-gray-400"  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetingCard({ meeting, buildingId }: MeetingCardProps) {
  const meta = STATUS_META[meeting.status];
  const StatusIcon = meta.icon;
  const isCancelled = meeting.status === "cancelled";

  const dateStr = formatDate(meeting.scheduledAt, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });

  const timeStr = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(meeting.scheduledAt));

  return (
    <Link
      href={`/meetings/${meeting.id}?building=${buildingId}`}
      className={cn(
        "group block rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
        isCancelled && "opacity-60",
      )}
    >
      <div className="flex items-start gap-4">
        {/* Status icon pill */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            meta.className,
          )}
          aria-hidden="true"
        >
          <StatusIcon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-sm group-hover:text-primary-600 transition-colors">
              {meeting.title}
            </h3>
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
              {TYPE_LABELS[meeting.type]}
            </Badge>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                meta.className,
              )}
            >
              <StatusIcon className="h-2.5 w-2.5" aria-hidden="true" />
              {meta.label}
            </span>
          </div>

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {dateStr} · {timeStr}
            </span>

            {meeting.location && (
              <span className="flex items-center gap-1 truncate max-w-[180px]">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                {meeting.location}
              </span>
            )}

            {meeting._count.agendaItems > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden="true" />
                {meeting._count.agendaItems} agenda item{meeting._count.agendaItems !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {meeting.attendeeCount !== null && (
          <div
            className="shrink-0 text-right"
            aria-label={`${meeting.attendeeCount} attendees`}
          >
            <p className="text-lg font-semibold tabular-nums leading-none">
              {meeting.attendeeCount}
            </p>
            <p className="text-[10px] text-muted-foreground">attendees</p>
          </div>
        )}
      </div>
    </Link>
  );
}
