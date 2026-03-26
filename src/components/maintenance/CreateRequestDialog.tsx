"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MaintenanceCategory, MaintenancePriority } from "@prisma/client";
import { Plus } from "lucide-react";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CATEGORY_META, PRIORITY_META } from "./RequestCard";
import type { MaintenanceListItem } from "./RequestCard";

// ─── Schema ──────────────────────────────────────────────────────────────────

const schema = z.object({
  title:              z.string().min(1, "Title is required").max(255),
  description:        z.string().min(1, "Description is required").max(5000),
  category:           z.nativeEnum(MaintenanceCategory),
  priority:           z.nativeEnum(MaintenancePriority),
  estimatedCostCents: z.string().optional(), // entered as dollars, converted on submit
});

type FormValues = z.infer<typeof schema>;

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  buildingId: string;
  onCreated:  (request: MaintenanceListItem) => void;
}

export function CreateRequestDialog({ buildingId, onCreated }: Props) {
  const [open,    setOpen]    = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: MaintenancePriority.medium,
    },
  });

  const selectedCategory = watch("category");
  const selectedPriority = watch("priority");

  async function onSubmit(values: FormValues) {
    setApiError(null);

    // Convert dollars string → integer cents (0 if empty)
    const estimatedCostCents = values.estimatedCostCents
      ? Math.round(parseFloat(values.estimatedCostCents) * 100)
      : undefined;

    const res = await fetch(`/api/buildings/${buildingId}/maintenance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:       values.title,
        description: values.description,
        category:    values.category,
        priority:    values.priority,
        ...(estimatedCostCents !== undefined ? { estimatedCostCents } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setApiError(body.error ?? "Failed to submit request. Please try again.");
      return;
    }

    const { data } = await res.json();
    onCreated(data);
    reset();
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      setApiError(null);
    }
    setOpen(next);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-2">
        <Plus className="h-4 w-4" />
        New Request
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Maintenance Request</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                placeholder="e.g. Leaking pipe in Unit 12 bathroom"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
              <Textarea
                id="description"
                placeholder="Describe the issue in detail — location, when it started, severity…"
                rows={4}
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* Category + Priority (side-by-side on md+) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Category */}
              <div className="space-y-1.5">
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(v) =>
                    setValue("category", v as MaintenanceCategory, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_META) as MaintenanceCategory[]).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_META[cat].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-xs text-destructive">{errors.category.message}</p>
                )}
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={selectedPriority}
                  onValueChange={(v) =>
                    setValue("priority", v as MaintenancePriority, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_META) as MaintenancePriority[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Estimated cost (optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="estimatedCost">
                Estimated Cost (optional)
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="estimatedCost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-7"
                  {...register("estimatedCostCents")}
                />
              </div>
            </div>

            {/* API error */}
            {apiError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {apiError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
