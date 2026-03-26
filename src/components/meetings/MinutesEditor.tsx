"use client";

import { useState } from "react";
import type { MinutesStatus } from "@prisma/client";
import {
  FileText, Send, CheckCircle2, Globe, RotateCcw, Pencil, X, Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn }     from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MinutesData {
  id:          string;
  meetingId:   string;
  content:     string;
  status:      MinutesStatus;
  approvedAt:  string | Date | null;
  publishedAt: string | Date | null;
  updatedAt:   string | Date;
  createdBy:   { id: string; name: string | null };
  publishedBy: { id: string; name: string | null } | null;
}

interface MinutesEditorProps {
  meetingId:        string;
  buildingId:       string;
  initialMinutes:   MinutesData | null;
  canEdit:          boolean;   // meeting:update
  canPublish:       boolean;   // meeting:publish_minutes
}

// ─── Status metadata ──────────────────────────────────────────────────────────

const STATUS_META: Record<
  MinutesStatus,
  { label: string; className: string }
> = {
  draft:        { label: "Draft",          className: "bg-gray-100   text-gray-600   dark:bg-gray-800   dark:text-gray-400"   },
  under_review: { label: "Under Review",   className: "bg-blue-100   text-blue-700   dark:bg-blue-900/30 dark:text-blue-300"   },
  approved:     { label: "Approved",       className: "bg-green-100  text-green-700  dark:bg-green-900/30 dark:text-green-300" },
  published:    { label: "Published",      className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MinutesEditor({
  meetingId, buildingId, initialMinutes, canEdit, canPublish,
}: MinutesEditorProps) {
  const [minutes,   setMinutes]   = useState<MinutesData | null>(initialMinutes);
  const [editing,   setEditing]   = useState(false);
  const [draft,     setDraft]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const baseUrl = `/api/buildings/${buildingId}/meetings/${meetingId}/minutes`;

  // ── Create draft ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!draft.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(baseUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: draft }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create minutes");
      const { data } = await res.json();
      setMinutes(data as MinutesData);
      setEditing(false);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving minutes");
    } finally {
      setSaving(false);
    }
  };

  // ── Save content edits ──────────────────────────────────────────────────────

  const handleSaveContent = async () => {
    if (!draft.trim() || !minutes) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(baseUrl, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: draft }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save");
      const { data } = await res.json();
      setMinutes(data as MinutesData);
      setEditing(false);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving minutes");
    } finally {
      setSaving(false);
    }
  };

  // ── Status transition ───────────────────────────────────────────────────────

  const transitionStatus = async (newStatus: MinutesStatus) => {
    if (!minutes) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(baseUrl, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to update status");
      const { data } = await res.json();
      setMinutes(data as MinutesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating status");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    setDraft(minutes?.content ?? "");
    setEditing(true);
    setError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft("");
    setError(null);
  };

  // ── No minutes yet ──────────────────────────────────────────────────────────

  if (!minutes && !editing) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
        <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm font-medium">No minutes yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {canEdit ? "Draft the meeting minutes below." : "Minutes have not been created for this meeting."}
        </p>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={() => { setEditing(true); setDraft(""); }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Draft minutes
          </Button>
        )}
      </div>
    );
  }

  // ── New minutes form ─────────────────────────────────────────────────────────

  if (!minutes && editing) {
    return (
      <div className="space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter meeting minutes…"
          rows={12}
          disabled={saving}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-y"
        />
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={saving}>
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </div>
    );
  }

  if (!minutes) return null;

  const meta       = STATUS_META[minutes.status];
  const isPublished = minutes.status === "published";

  return (
    <div className="space-y-4">

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
            meta.className,
          )}
        >
          {meta.label}
        </span>

        {minutes.publishedAt && (
          <span className="text-xs text-muted-foreground">
            Published {new Date(minutes.publishedAt).toLocaleDateString()}
            {minutes.publishedBy && ` by ${minutes.publishedBy.name ?? "unknown"}`}
          </span>
        )}

        {minutes.approvedAt && !minutes.publishedAt && (
          <span className="text-xs text-muted-foreground">
            Approved {new Date(minutes.approvedAt).toLocaleDateString()}
          </span>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          Last updated {new Date(minutes.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Content */}
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-y"
          />
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={saving}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={handleSaveContent} disabled={saving || !draft.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm font-sans leading-relaxed text-foreground">
            {minutes.content}
          </pre>
          {canEdit && !isPublished && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startEditing}
              className="absolute right-2 top-2 h-7 gap-1.5 px-2 text-xs"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          {error && (
            <p className="mr-auto rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {canEdit && !isPublished && (
            <>
              {/* Revert to draft */}
              {minutes.status !== "draft" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={saving}
                  onClick={() => transitionStatus("draft" as MinutesStatus)}
                >
                  <RotateCcw className="h-3 w-3" />
                  Revert to draft
                </Button>
              )}

              {/* Submit for review */}
              {minutes.status === "draft" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={saving}
                  onClick={() => transitionStatus("under_review" as MinutesStatus)}
                >
                  <Send className="h-3 w-3" />
                  Submit for review
                </Button>
              )}

              {/* Approve */}
              {minutes.status === "under_review" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={saving}
                  onClick={() => transitionStatus("approved" as MinutesStatus)}
                >
                  <Check className="h-3 w-3" />
                  Approve
                </Button>
              )}
            </>
          )}

          {/* Publish (elevated permission) */}
          {canPublish && minutes.status === "approved" && (
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              disabled={saving}
              onClick={() => transitionStatus("published" as MinutesStatus)}
            >
              <Globe className="h-3 w-3" />
              Publish minutes
            </Button>
          )}

          {isPublished && (
            <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              These minutes are published and visible to all residents.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
