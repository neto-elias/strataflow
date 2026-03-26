"use client";

import { useState } from "react";
import { useForm }  from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MeetingType } from "@prisma/client";

import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { Label }   from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  title:       z.string().min(1, "Title is required").max(255),
  type:        z.nativeEnum(MeetingType),
  scheduledAt: z.string().min(1, "Date and time are required"),
  location:    z.string().max(500).optional(),
  videoUrl:    z.string().url("Must be a valid URL").optional().or(z.literal("")),
  quorum:      z.coerce.number().int().positive().optional().or(z.literal("")),
  notes:       z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

const TYPE_LABELS: Record<MeetingType, string> = {
  agm:       "AGM (Annual General Meeting)",
  special:   "Special General Meeting",
  council:   "Council Meeting",
  committee: "Committee Meeting",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateMeetingDialogProps {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  buildingId:   string;
  onSuccess:    () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateMeetingDialog({
  open, onOpenChange, buildingId, onSuccess,
}: CreateMeetingDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", type: "council", scheduledAt: "", location: "", videoUrl: "", notes: "" },
  });

  const handleOpenChange = (v: boolean) => {
    if (!v) { form.reset(); setError(null); }
    onOpenChange(v);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);

    // Convert datetime-local to full ISO string
    const scheduledAt = new Date(values.scheduledAt).toISOString();

    try {
      const res = await fetch(`/api/buildings/${buildingId}/meetings`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title:       values.title,
          type:        values.type,
          scheduledAt,
          location:    values.location || undefined,
          videoUrl:    values.videoUrl || undefined,
          quorum:      values.quorum   ? Number(values.quorum) : undefined,
          notes:       values.notes    || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create meeting");
      }

      onSuccess();
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  });

  const err = (field: keyof FormValues) => form.formState.errors[field]?.message;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Title *</Label>
            <Input id="m-title" {...form.register("title")} placeholder="e.g. April 2025 Council Meeting" disabled={submitting} />
            {err("title") && <p className="text-xs text-destructive">{err("title")}</p>}
          </div>

          {/* Type + DateTime — side by side on sm+ */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-type">Type *</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as MeetingType)}
                disabled={submitting}
              >
                <SelectTrigger id="m-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as MeetingType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-date">Date &amp; time *</Label>
              <Input
                id="m-date"
                type="datetime-local"
                {...form.register("scheduledAt")}
                disabled={submitting}
              />
              {err("scheduledAt") && <p className="text-xs text-destructive">{err("scheduledAt")}</p>}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="m-loc">Location</Label>
            <Input id="m-loc" {...form.register("location")} placeholder="e.g. Community Room 1B" disabled={submitting} />
          </div>

          {/* Video URL */}
          <div className="space-y-1.5">
            <Label htmlFor="m-video">Video conference URL</Label>
            <Input id="m-video" {...form.register("videoUrl")} placeholder="https://meet.google.com/…" disabled={submitting} />
            {err("videoUrl") && <p className="text-xs text-destructive">{err("videoUrl")}</p>}
          </div>

          {/* Quorum */}
          <div className="space-y-1.5">
            <Label htmlFor="m-quorum">Quorum (minimum attendees)</Label>
            <Input id="m-quorum" type="number" min={1} {...form.register("quorum")} placeholder="e.g. 5" disabled={submitting} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="m-notes">Notes</Label>
            <textarea
              id="m-notes"
              {...form.register("notes")}
              rows={3}
              placeholder="Optional preparation notes"
              disabled={submitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-y"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Scheduling…" : "Schedule meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
