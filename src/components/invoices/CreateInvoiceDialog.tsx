"use client";

import { useState } from "react";
import { useForm }  from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InvoiceType } from "@prisma/client";
import { Plus, AlertCircle } from "lucide-react";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { TYPE_META } from "./InvoiceCard";
import type { InvoiceListItem } from "./InvoiceCard";

// ─── Form schema ──────────────────────────────────────────────────────────────

const FormSchema = z.object({
  type:        z.nativeEnum(InvoiceType),
  description: z.string().min(1, "Description is required").max(2000),
  amountDollars: z.string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Must be a positive amount"),
  dueDate:     z.string().min(1, "Due date is required"),
  issuedToId:  z.string().min(1, "Recipient is required"),
  lotId:       z.string().optional(),
  notes:       z.string().max(5000).optional(),
});

type FormValues = z.infer<typeof FormSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buildingId:         string;
  eligibleRecipients: { id: string; name: string | null; email: string }[];
  lots:               { id: string; unitNumber: string }[];
  onCreated:          (invoice: InvoiceListItem) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateInvoiceDialog({
  buildingId,
  eligibleRecipients,
  lots,
  onCreated,
}: Props) {
  const [open,     setOpen]     = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { type: InvoiceType.strata_fee },
  });

  async function onSubmit(values: FormValues) {
    setApiError(null);
    const amountCents = Math.round(parseFloat(values.amountDollars) * 100);

    const res = await fetch(`/api/buildings/${buildingId}/invoices`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type:        values.type,
        description: values.description,
        amountCents,
        dueDate:     new Date(values.dueDate).toISOString(),
        issuedToId:  values.issuedToId,
        ...(values.lotId ? { lotId: values.lotId } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setApiError(body.error ?? "Failed to create invoice. Please try again.");
      return;
    }

    const { data } = await res.json();
    onCreated(data);
    reset();
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) { reset(); setApiError(null); }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          New Invoice
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Type */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Type</label>
            <Select
              defaultValue={InvoiceType.strata_fee}
              onValueChange={(v) => setValue("type", v as InvoiceType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as InvoiceType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              {...register("description")}
              placeholder="April 2025 strata fee — Unit 101"
              rows={2}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Amount + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount ($)</label>
              <Input
                {...register("amountDollars")}
                placeholder="125.50"
                type="number"
                min="0.01"
                step="0.01"
              />
              {errors.amountDollars && (
                <p className="text-xs text-destructive">{errors.amountDollars.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Due Date</label>
              <Input {...register("dueDate")} type="date" />
              {errors.dueDate && (
                <p className="text-xs text-destructive">{errors.dueDate.message}</p>
              )}
            </div>
          </div>

          {/* Recipient */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Bill To</label>
            <Select onValueChange={(v) => setValue("issuedToId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select recipient" />
              </SelectTrigger>
              <SelectContent>
                {eligibleRecipients.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.issuedToId && (
              <p className="text-xs text-destructive">{errors.issuedToId.message}</p>
            )}
          </div>

          {/* Lot (optional) */}
          {lots.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Unit <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Select onValueChange={(v) => setValue("lotId", v === "__none" ? undefined : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No specific unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No specific unit</SelectItem>
                  {lots.map((l) => (
                    <SelectItem key={l.id} value={l.id}>Unit {l.unitNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              {...register("notes")}
              placeholder="Additional notes visible to the recipient…"
              rows={2}
            />
          </div>

          {/* API error */}
          {apiError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
