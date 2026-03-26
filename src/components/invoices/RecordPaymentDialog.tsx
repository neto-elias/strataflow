"use client";

import { useState } from "react";
import { useForm }  from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { CreditCard, AlertCircle } from "lucide-react";

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

import { formatCents } from "./InvoiceCard";

// ─── Method display map ───────────────────────────────────────────────────────

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer (EFT)",
  cheque:        "Cheque",
  credit_card:   "Credit Card",
  debit_card:    "Debit Card",
  cash:          "Cash",
  direct_debit:  "Direct Debit (PAD)",
  online_portal: "Online Portal",
  other:         "Other",
};

// ─── Form schema ──────────────────────────────────────────────────────────────

const FormSchema = z.object({
  amountDollars: z.string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Must be a positive amount"),
  method: z.nativeEnum(PaymentMethod),
  paidAt: z.string().optional(),
  notes:  z.string().max(5000).optional(),
});

type FormValues = z.infer<typeof FormSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buildingId:     string;
  invoiceId:      string;
  outstandingCents: number;
  onRecorded:     (result: { payment: unknown; invoice: unknown }) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordPaymentDialog({
  buildingId,
  invoiceId,
  outstandingCents,
  onRecorded,
}: Props) {
  const [open,     setOpen]     = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      method:        PaymentMethod.bank_transfer,
      amountDollars: (outstandingCents / 100).toFixed(2),
    },
  });

  async function onSubmit(values: FormValues) {
    setApiError(null);
    const amountCents = Math.round(parseFloat(values.amountDollars) * 100);

    const res = await fetch(
      `/api/buildings/${buildingId}/invoices/${invoiceId}/payments`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          method:   values.method,
          provider: "manual",
          status:   "completed",
          ...(values.paidAt ? { paidAt: new Date(values.paidAt).toISOString() } : {}),
          ...(values.notes  ? { notes:  values.notes } : {}),
        }),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setApiError(body.error ?? "Failed to record payment. Please try again.");
      return;
    }

    const { data } = await res.json();
    onRecorded(data);
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
        <Button size="sm" variant="default">
          <CreditCard className="h-4 w-4 mr-1.5" />
          Record Payment
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-1 pb-1">
          Outstanding balance: <span className="font-medium text-foreground">{formatCents(outstandingCents)}</span>
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Amount */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Amount Paid ($)</label>
            <Input
              {...register("amountDollars")}
              type="number"
              min="0.01"
              step="0.01"
              placeholder={(outstandingCents / 100).toFixed(2)}
            />
            {errors.amountDollars && (
              <p className="text-xs text-destructive">{errors.amountDollars.message}</p>
            )}
          </div>

          {/* Method */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Payment Method</label>
            <Select
              defaultValue={PaymentMethod.bank_transfer}
              onValueChange={(v) => setValue("method", v as PaymentMethod)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date paid */}
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Date Paid <span className="text-muted-foreground font-normal">(optional, defaults to today)</span>
            </label>
            <Input {...register("paidAt")} type="date" />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              {...register("notes")}
              placeholder="Reference number, cheque #, etc."
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
              {isSubmitting ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
