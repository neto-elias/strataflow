"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Wrench, Calendar, MapPin, User,
  DollarSign, FileText, ChevronRight, AlertTriangle,
} from "lucide-react";
import type {
  MaintenanceStatus, MaintenanceCategory, MaintenancePriority,
} from "@prisma/client";

import { Button }   from "@/components/ui/button";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge }    from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  STATUS_META, PRIORITY_META, CATEGORY_META,
} from "./RequestCard";
import { formatDate, formatCurrency, initials } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type AssignableUser = {
  id:    string;
  name:  string | null;
  email: string;
  image: string | null;
};

type MaintenanceDetail = {
  id:                 string;
  buildingId:         string;
  lotId:              string | null;
  title:              string;
  description:        string;
  category:           MaintenanceCategory;
  priority:           MaintenancePriority;
  status:             MaintenanceStatus;
  internalNotes:      string | null;
  estimatedCostCents: number | null;
  actualCostCents:    number | null;
  attachmentKeys:     string[];
  createdAt:          string | Date;
  updatedAt:          string | Date;
  resolvedAt:         string | Date | null;
  closedAt:           string | Date | null;
  createdBy:  { id: string; name: string | null; image: string | null; email: string };
  assignedTo: { id: string; name: string | null; image: string | null; email: string } | null;
  lot:        { id: string; unitNumber: string; floor: number | null } | null;
};

interface Props {
  request:         MaintenanceDetail;
  assignableUsers: AssignableUser[];
  canUpdate:       boolean;
  canAssign:       boolean;
  canClose:        boolean;
}

// ─── Status transition config ─────────────────────────────────────────────────

const NEXT_TRANSITION: Partial<Record<MaintenanceStatus, {
  label:       string;
  nextStatus:  MaintenanceStatus;
  requiresClose: boolean;
  variant:     "default" | "destructive" | "outline" | "secondary";
}>> = {
  open:        { label: "Start Work",      nextStatus: "in_progress", requiresClose: false, variant: "default"     },
  in_progress: { label: "Mark Resolved",   nextStatus: "resolved",    requiresClose: true,  variant: "default"     },
  resolved:    { label: "Close Request",   nextStatus: "closed",      requiresClose: true,  variant: "secondary"   },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function RequestDetailClient({
  request: initialRequest,
  assignableUsers,
  canUpdate,
  canAssign,
  canClose,
}: Props) {
  const [request,       setRequest]       = useState<MaintenanceDetail>(initialRequest);
  const [isSaving,      setIsSaving]      = useState(false);
  const [actionError,   setActionError]   = useState<string | null>(null);

  // Notes editing
  const [editingNotes,  setEditingNotes]  = useState(false);
  const [notesValue,    setNotesValue]    = useState(request.internalNotes ?? "");
  const [savingNotes,   setSavingNotes]   = useState(false);
  const [notesError,    setNotesError]    = useState<string | null>(null);

  // Assignment
  const [assignValue,   setAssignValue]   = useState(request.assignedTo?.id ?? "unassigned");
  const [savingAssign,  setSavingAssign]  = useState(false);
  const [assignError,   setAssignError]   = useState<string | null>(null);

  const patchUrl = `/api/buildings/${request.buildingId}/maintenance/${request.id}`;

  // ── Status transition ──────────────────────────────────────────────────────

  async function handleTransition(nextStatus: MaintenanceStatus) {
    setIsSaving(true);
    setActionError(null);
    try {
      const res = await fetch(patchUrl, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "Failed to update status.");
        return;
      }
      const { data } = await res.json();
      setRequest(data);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Save internal notes ────────────────────────────────────────────────────

  async function handleSaveNotes() {
    setSavingNotes(true);
    setNotesError(null);
    try {
      const res = await fetch(patchUrl, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ internalNotes: notesValue || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setNotesError(body.error ?? "Failed to save notes. Please try again.");
        return;
      }
      const { data } = await res.json();
      setRequest(data);
      setEditingNotes(false);
      setNotesError(null);
    } finally {
      setSavingNotes(false);
    }
  }

  // ── Assign / unassign ──────────────────────────────────────────────────────

  async function handleAssign() {
    setSavingAssign(true);
    setAssignError(null);
    try {
      const res = await fetch(patchUrl, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          assignedToId: assignValue === "unassigned" ? null : assignValue,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAssignError(body.error ?? "Failed to update assignment.");
        return;
      }
      const { data } = await res.json();
      setRequest(data);
    } finally {
      setSavingAssign(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const statusMeta   = STATUS_META[request.status];
  const priorityMeta = PRIORITY_META[request.priority];
  const categoryMeta = CATEGORY_META[request.category];

  const StatusIcon   = statusMeta.icon;
  const PriorityIcon = priorityMeta.icon;
  const CategoryIcon = categoryMeta.icon;

  const transition   = NEXT_TRANSITION[request.status];
  const canDoTransition = transition
    ? (transition.requiresClose ? canClose : canUpdate)
    : false;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-3xl mx-auto">
      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <Link
        href={`/maintenance?building=${request.buildingId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Maintenance
      </Link>

      {/* ── Header card ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <CategoryIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-snug">{request.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{categoryMeta.label}</p>
            </div>
          </div>

          {/* Status + priority badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={statusMeta.badge as "info" | "warning" | "success" | "muted"}
              className="gap-1"
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {statusMeta.label}
            </Badge>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityMeta.classes}`}
            >
              <PriorityIcon className="h-3.5 w-3.5" />
              {priorityMeta.label}
            </span>
          </div>
        </div>

        {/* Lifecycle action button */}
        {transition && canDoTransition && (
          <div className="mt-4 flex items-center gap-3">
            <Button
              variant={transition.variant}
              size="sm"
              disabled={isSaving}
              onClick={() => handleTransition(transition.nextStatus)}
              className="gap-2"
            >
              <ChevronRight className="h-4 w-4" />
              {isSaving ? "Saving…" : transition.label}
            </Button>
            {actionError && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {actionError}
              </p>
            )}
          </div>
        )}

        {/* Terminal state notice */}
        {request.status === "closed" && (
          <p className="mt-4 text-sm text-muted-foreground">
            This request is closed. No further status changes are possible.
          </p>
        )}
      </div>

      {/* ── Two-column grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* Description */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-2 md:col-span-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Description
          </h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {request.description}
          </p>
        </div>

        {/* Metadata */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Details</h2>

          <dl className="space-y-3 text-sm">
            {/* Location */}
            {request.lot && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Unit</dt>
                  <dd className="font-medium">
                    {request.lot.unitNumber}
                    {request.lot.floor !== null && ` · Floor ${request.lot.floor}`}
                  </dd>
                </div>
              </div>
            )}

            {/* Created by */}
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Reported by</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={request.createdBy.image ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {initials(request.createdBy.name)}
                    </AvatarFallback>
                  </Avatar>
                  {request.createdBy.name ?? request.createdBy.email}
                </dd>
              </div>
            </div>

            {/* Submitted date */}
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Submitted</dt>
                <dd className="font-medium">{formatDate(request.createdAt)}</dd>
              </div>
            </div>

            {/* Resolved / closed dates */}
            {request.resolvedAt && (
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Resolved</dt>
                  <dd className="font-medium">{formatDate(request.resolvedAt)}</dd>
                </div>
              </div>
            )}
            {request.closedAt && (
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Closed</dt>
                  <dd className="font-medium">{formatDate(request.closedAt)}</dd>
                </div>
              </div>
            )}
          </dl>
        </div>

        {/* Cost + Assignment */}
        <div className="space-y-4">

          {/* Cost card */}
          {(request.estimatedCostCents !== null || request.actualCostCents !== null) && (
            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Cost
              </h2>
              <dl className="space-y-2 text-sm">
                {request.estimatedCostCents !== null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Estimated</dt>
                    <dd className="font-medium">
                      {formatCurrency(request.estimatedCostCents)}
                    </dd>
                  </div>
                )}
                {request.actualCostCents !== null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Actual</dt>
                    <dd className="font-medium">
                      {formatCurrency(request.actualCostCents)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Assignment card */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Assignment
            </h2>

            {/* Current assignee display */}
            {request.assignedTo ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={request.assignedTo.image ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {initials(request.assignedTo.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {request.assignedTo.name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {request.assignedTo.email}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Unassigned</p>
            )}

            {/* Assign control (permission-gated) */}
            {canAssign && request.status !== "closed" && assignableUsers.length > 0 && (
              <div className="space-y-2 pt-1">
                <Select
                  value={assignValue}
                  onValueChange={setAssignValue}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">— Unassign —</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {assignError && (
                  <p className="text-xs text-destructive">{assignError}</p>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingAssign || assignValue === (request.assignedTo?.id ?? "unassigned")}
                  onClick={handleAssign}
                  className="w-full"
                >
                  {savingAssign ? "Saving…" : "Update Assignment"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Internal notes (council/manager only) ──────────────────────────── */}
      {canUpdate && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Internal Notes</h2>
            {!editingNotes && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingNotes(true)}
                disabled={request.status === "closed"}
              >
                {request.internalNotes ? "Edit" : "Add Notes"}
              </Button>
            )}
          </div>

          {editingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Internal notes visible to council and managers only…"
                rows={4}
                maxLength={5000}
              />
              {notesError && (
                <p className="flex items-center gap-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {notesError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNotesValue(request.internalNotes ?? "");
                    setNotesError(null);
                    setEditingNotes(false);
                  }}
                  disabled={savingNotes}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                  {savingNotes ? "Saving…" : "Save Notes"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {request.internalNotes ?? "No internal notes."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
