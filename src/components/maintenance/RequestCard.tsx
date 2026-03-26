"use client";

import Link from "next/link";
import {
  Clock, Wrench, CheckCircle2, Archive,
  ArrowDown, Minus, ArrowUp, AlertTriangle,
  Droplets, Zap, Building2, Wind, ArrowUpDown,
  Flame, Leaf, Sparkles, Shield, Wifi,
  Settings, HelpCircle, User,
} from "lucide-react";
import { Badge }           from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate, initials, truncate }       from "@/lib/utils";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type MaintenanceListItem = {
  id:                 string;
  title:              string;
  category:           MaintenanceCategory;
  priority:           MaintenancePriority;
  status:             MaintenanceStatus;
  lotId:              string | null;
  createdAt:          string | Date;
  updatedAt:          string | Date;
  resolvedAt:         string | Date | null;
  closedAt:           string | Date | null;
  estimatedCostCents: number | null;
  createdBy:  { id: string; name: string | null; image: string | null };
  assignedTo: { id: string; name: string | null; image: string | null } | null;
  lot:        { id: string; unitNumber: string } | null;
};

// ─── Meta maps ───────────────────────────────────────────────────────────────

export const STATUS_META: Record<
  MaintenanceStatus,
  { label: string; icon: React.ElementType; badge: string }
> = {
  open:        { label: "Open",        icon: Clock,         badge: "info" },
  in_progress: { label: "In Progress", icon: Wrench,        badge: "warning" },
  resolved:    { label: "Resolved",    icon: CheckCircle2,  badge: "success" },
  closed:      { label: "Closed",      icon: Archive,       badge: "muted" },
};

export const PRIORITY_META: Record<
  MaintenancePriority,
  { label: string; icon: React.ElementType; classes: string }
> = {
  low:    { label: "Low",    icon: ArrowDown,     classes: "text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300" },
  medium: { label: "Medium", icon: Minus,         classes: "text-blue-600  bg-blue-100  dark:bg-blue-900/40 dark:text-blue-300" },
  high:   { label: "High",   icon: ArrowUp,       classes: "text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300" },
  urgent: { label: "Urgent", icon: AlertTriangle, classes: "text-red-600   bg-red-100   dark:bg-red-900/40   dark:text-red-300" },
};

export const CATEGORY_META: Record<
  MaintenanceCategory,
  { label: string; icon: React.ElementType }
> = {
  plumbing:    { label: "Plumbing",     icon: Droplets    },
  electrical:  { label: "Electrical",   icon: Zap         },
  structural:  { label: "Structural",   icon: Building2   },
  hvac:        { label: "HVAC",         icon: Wind        },
  elevator:    { label: "Elevator",     icon: ArrowUpDown },
  fire_safety: { label: "Fire Safety",  icon: Flame       },
  landscaping: { label: "Landscaping",  icon: Leaf        },
  cleaning:    { label: "Cleaning",     icon: Sparkles    },
  security:    { label: "Security",     icon: Shield      },
  it_telecom:  { label: "IT / Telecom", icon: Wifi        },
  appliance:   { label: "Appliance",    icon: Settings    },
  other:       { label: "Other",        icon: HelpCircle  },
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  request:    MaintenanceListItem;
  buildingId: string;
}

export function RequestCard({ request, buildingId }: Props) {
  const status   = STATUS_META[request.status];
  const priority = PRIORITY_META[request.priority];
  const category = CATEGORY_META[request.category];

  const StatusIcon   = status.icon;
  const PriorityIcon = priority.icon;
  const CategoryIcon = category.icon;

  return (
    <Link
      href={`/maintenance/${request.id}?building=${buildingId}`}
      className="block group"
    >
      <div className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Category icon */}
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <CategoryIcon className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="min-w-0">
              <p className="font-medium text-sm leading-snug group-hover:text-primary-600 transition-colors truncate">
                {request.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {category.label}
                {request.lot && (
                  <span> · Unit {request.lot.unitNumber}</span>
                )}
              </p>
            </div>
          </div>

          {/* Priority pill */}
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${priority.classes}`}
          >
            <PriorityIcon className="h-3 w-3" />
            {priority.label}
          </span>
        </div>

        {/* Footer row */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Status badge */}
            <Badge variant={status.badge as "info" | "warning" | "success" | "muted"} className="gap-1 text-xs">
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>

            {/* Assignee */}
            {request.assignedTo ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={request.assignedTo.image ?? undefined} />
                  <AvatarFallback className="text-[9px]">
                    {initials(request.assignedTo.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">
                  {truncate(request.assignedTo.name ?? "Unknown", 20)}
                </span>
              </div>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                Unassigned
              </span>
            )}
          </div>

          {/* Date */}
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDate(request.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
