"use client";

import { useState } from "react";
import { useForm }  from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, ChevronUp, ChevronDown, Check, Clock,
  TableProperties, Minus, X,
} from "lucide-react";
import type { AgendaItemStatus, MeetingStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { Badge }  from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgendaItemData {
  id:           string;
  title:        string;
  description:  string | null;
  sortOrder:    number;
  presenter:    string | null;
  durationMins: number | null;
  status:       AgendaItemStatus;
  resolution:   string | null;
}

interface AgendaEditorProps {
  meetingId:     string;
  buildingId:    string;
  meetingStatus: MeetingStatus;
  initialItems:  AgendaItemData[];
  canEdit:       boolean;
}

// ─── Status metadata ──────────────────────────────────────────────────────────

const ITEM_STATUS_META: Record<
  AgendaItemStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  pending:   { label: "Pending",   icon: Clock,           className: "bg-gray-100   text-gray-600   dark:bg-gray-800   dark:text-gray-400"   },
  discussed: { label: "Discussed", icon: TableProperties, className: "bg-blue-100   text-blue-700   dark:bg-blue-900/30 dark:text-blue-300"   },
  resolved:  { label: "Resolved",  icon: Check,           className: "bg-green-100  text-green-700  dark:bg-green-900/30 dark:text-green-300"  },
  tabled:    { label: "Tabled",    icon: TableProperties, className: "bg-amber-100  text-amber-700  dark:bg-amber-900/30 dark:text-amber-300"  },
  withdrawn: { label: "Withdrawn", icon: Minus,           className: "bg-red-100    text-red-600    dark:bg-red-900/30  dark:text-red-400"     },
};

const addSchema = z.object({
  title:        z.string().min(1, "Title is required").max(255),
  description:  z.string().max(2000).optional(),
  presenter:    z.string().max(255).optional(),
  durationMins: z.coerce.number().int().positive().optional().or(z.literal("")),
});
type AddForm = z.infer<typeof addSchema>;

const EDITABLE_STATUSES: MeetingStatus[] = ["scheduled", "in_progress"];

// ─── Component ────────────────────────────────────────────────────────────────

export function AgendaEditor({
  meetingId, buildingId, meetingStatus, initialItems, canEdit,
}: AgendaEditorProps) {
  const [items,          setItems]          = useState<AgendaItemData[]>(initialItems);
  const [adding,         setAdding]         = useState(false);
  const [addError,       setAddError]       = useState<string | null>(null);
  const [reordering,     setReordering]     = useState(false);
  const [reorderError,   setReorderError]   = useState<string | null>(null);
  const [opError,        setOpError]        = useState<string | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  // Inline resolution capture: set to the itemId when "resolved" is selected
  // without an existing resolution. Cleared on confirm or cancel.
  const [resolvingItemId,  setResolvingItemId]  = useState<string | null>(null);
  const [resolutionDraft,  setResolutionDraft]  = useState("");

  const isEditable = canEdit && EDITABLE_STATUSES.includes(meetingStatus);

  const form = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { title: "", description: "", presenter: "", durationMins: "" },
  });

  // ── PATCH a single item ────────────────────────────────────────────────────

  const patchItem = async (itemId: string, data: Partial<AgendaItemData>) => {
    const res = await fetch(
      `/api/buildings/${buildingId}/meetings/${meetingId}/agenda/${itemId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
    );
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
    const { data: updated } = await res.json();
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...updated } : i)));
    return updated as AgendaItemData;
  };

  // ── Add item ───────────────────────────────────────────────────────────────

  const handleAdd = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/buildings/${buildingId}/meetings/${meetingId}/agenda`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            title:        values.title,
            description:  values.description || undefined,
            presenter:    values.presenter    || undefined,
            durationMins: values.durationMins ? Number(values.durationMins) : undefined,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to add item");
      const { data: newItem } = await res.json();
      setItems((prev) => [...prev, newItem as AgendaItemData]);
      form.reset();
      setAdding(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Error adding item");
    } finally {
      setSubmitting(false);
    }
  });

  // ── Atomic reorder ─────────────────────────────────────────────────────────

  const move = async (itemId: string, direction: "up" | "down") => {
    setReordering(true);
    setReorderError(null);
    try {
      const res = await fetch(
        `/api/buildings/${buildingId}/meetings/${meetingId}/agenda/reorder`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ itemId, direction }),
        },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Reorder failed");
      const { data } = await res.json();
      setItems(data as AgendaItemData[]);
    } catch (err) {
      setReorderError(err instanceof Error ? err.message : "Reorder failed");
    } finally {
      setReordering(false);
    }
  };

  // ── Status change ──────────────────────────────────────────────────────────

  const changeStatus = async (item: AgendaItemData, newStatus: AgendaItemStatus) => {
    setOpError(null);
    // If marking resolved and no resolution exists, open the inline resolution form
    if (newStatus === "resolved" && !item.resolution) {
      setResolvingItemId(item.id);
      setResolutionDraft("");
      return;
    }
    try {
      await patchItem(item.id, { status: newStatus });
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Status update failed");
    }
  };

  // ── Resolve: confirm inline ────────────────────────────────────────────────

  const handleResolveConfirm = async () => {
    if (!resolutionDraft.trim() || !resolvingItemId) return;
    setOpError(null);
    try {
      await patchItem(resolvingItemId, { status: "resolved", resolution: resolutionDraft });
      setResolvingItemId(null);
      setResolutionDraft("");
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Failed to save resolution");
    }
  };

  const handleResolveCancel = () => {
    setResolvingItemId(null);
    setResolutionDraft("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Reorder error */}
      {reorderError && (
        <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{reorderError}</span>
          <button onClick={() => setReorderError(null)} className="ml-2 hover:opacity-70" aria-label="Dismiss">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Op error (status change / resolution) */}
      {opError && (
        <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{opError}</span>
          <button onClick={() => setOpError(null)} className="ml-2 hover:opacity-70" aria-label="Dismiss">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No agenda items yet.
          {isEditable && " Add the first item below."}
        </p>
      )}

      <ol className="space-y-2" aria-label="Agenda items">
        {items.map((item, index) => {
          const meta       = ITEM_STATUS_META[item.status];
          const StatusIcon = meta.icon;
          const isLast     = index === items.length - 1;
          const isFirst    = index === 0;
          const isResolving = resolvingItemId === item.id;

          return (
            <li
              key={item.id}
              className="rounded-lg border border-border bg-card px-3 py-3"
            >
              <div className="flex items-start gap-3">
                {/* Reorder controls */}
                {isEditable && (
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <button
                      onClick={() => move(item.id, "up")}
                      disabled={isFirst || reordering}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => move(item.id, "down")}
                      disabled={isLast || reordering}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Number */}
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{item.title}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        meta.className,
                      )}
                    >
                      <StatusIcon className="h-2.5 w-2.5" aria-hidden="true" />
                      {meta.label}
                    </span>
                    {item.durationMins && (
                      <span className="text-[10px] text-muted-foreground">
                        {item.durationMins} min
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}

                  {item.presenter && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Presenter: {item.presenter}
                    </p>
                  )}

                  {item.resolution && (
                    <div className="mt-1.5 rounded-md bg-green-50 px-2 py-1.5 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300">
                      <strong>Resolution:</strong> {item.resolution}
                    </div>
                  )}

                  {/* Inline resolution form — shown when this item is being resolved */}
                  {isResolving && (
                    <div className="mt-2 rounded-md border border-input bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-medium">Enter resolution text</p>
                      <textarea
                        value={resolutionDraft}
                        onChange={(e) => setResolutionDraft(e.target.value)}
                        rows={3}
                        placeholder="e.g. Motion carried unanimously to approve the budget."
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleResolveCancel}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!resolutionDraft.trim()}
                          onClick={handleResolveConfirm}
                        >
                          Save resolution
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status change dropdown (in_progress meetings only) */}
                {isEditable && meetingStatus === "in_progress" && !isResolving && (
                  <Select
                    value={item.status}
                    onValueChange={(v) => changeStatus(item, v as AgendaItemStatus)}
                  >
                    <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {(Object.keys(ITEM_STATUS_META) as AgendaItemStatus[]).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {ITEM_STATUS_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Add item form */}
      {isEditable && (
        <>
          {adding ? (
            <form
              onSubmit={handleAdd}
              className="rounded-lg border border-dashed border-primary-300 bg-primary-50/30 dark:bg-primary-900/10 p-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="a-title">Item title *</Label>
                  <Input id="a-title" {...form.register("title")} placeholder="e.g. Approval of previous minutes" disabled={submitting} />
                  {form.formState.errors.title && (
                    <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="a-presenter">Presenter</Label>
                  <Input id="a-presenter" {...form.register("presenter")} placeholder="Name (optional)" disabled={submitting} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="a-dur">Duration (min)</Label>
                  <Input id="a-dur" type="number" min={1} {...form.register("durationMins")} placeholder="15" disabled={submitting} />
                </div>
              </div>

              {/* Add form error */}
              {addError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{addError}</p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAdding(false); setAddError(null); form.reset(); }}
                  disabled={submitting}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Adding…" : "Add item"}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdding(true)}
              className="w-full gap-2 border-dashed"
            >
              <Plus className="h-4 w-4" />
              Add agenda item
            </Button>
          )}
        </>
      )}
    </div>
  );
}
