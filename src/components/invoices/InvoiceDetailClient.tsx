"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, User, Calendar, Hash, FileText,
  AlertTriangle, CheckCircle2, Clock, CreditCard,
  Ban, ChevronRight,
} from "lucide-react";
import { InvoiceStatus, InvoiceType, PaymentStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { cn }     from "@/lib/utils";

import {
  STATUS_META, TYPE_META,
  formatCents, formatDate,
} from "./InvoiceCard";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payment {
  id:          string;
  status:      PaymentStatus;
  method:      string;
  provider:    string;
  amountCents: number;
  paidAt:      string | Date | null;
  providerRef: string | null;
  notes:       string | null;
  createdAt:   string | Date;
  paidBy: { id: string; name: string | null; email: string; image: string | null };
}

interface Invoice {
  id:                  string;
  buildingId:          string;
  lotId:               string | null;
  maintenanceRequestId: string | null;
  type:                InvoiceType;
  status:              InvoiceStatus;
  description:         string;
  amountCents:         number;
  paidCents:           number;
  dueDate:             string | Date;
  issuedAt:            string | Date | null;
  periodStart:         string | Date | null;
  periodEnd:           string | Date | null;
  externalRef:         string | null;
  notes:               string | null;
  createdAt:           string | Date;
  updatedAt:           string | Date;
  issuedTo:  { id: string; name: string | null; email: string; image: string | null };
  createdBy: { id: string; name: string | null; image: string | null };
  lot:       { id: string; unitNumber: string; floor: number | null } | null;
  payments:  Payment[];
}

interface Props {
  invoice:    Invoice;
  canCreate:  boolean;
  canApprove: boolean;
}

// ─── Status transition config ─────────────────────────────────────────────────

const NEXT_MANUAL_TRANSITION: Partial<Record<InvoiceStatus, {
  label:   string;
  status:  InvoiceStatus;
  variant: "default" | "outline" | "destructive";
  icon:    React.ElementType;
  require: "canCreate" | "canApprove";
}>> = {
  [InvoiceStatus.draft]: {
    label:   "Issue Invoice",
    status:  InvoiceStatus.issued,
    variant: "default",
    icon:    ChevronRight,
    require: "canCreate",
  },
  [InvoiceStatus.issued]: {
    label:   "Void Invoice",
    status:  InvoiceStatus.void,
    variant: "destructive",
    icon:    Ban,
    require: "canApprove",
  },
  [InvoiceStatus.partially_paid]: {
    label:   "Void Invoice",
    status:  InvoiceStatus.void,
    variant: "destructive",
    icon:    Ban,
    require: "canApprove",
  },
  [InvoiceStatus.overdue]: {
    label:   "Void Invoice",
    status:  InvoiceStatus.void,
    variant: "destructive",
    icon:    Ban,
    require: "canApprove",
  },
};

const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  failed:    { label: "Failed",    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"         },
  refunded:  { label: "Refunded",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"    },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground"                                       },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoiceDetailClient({ invoice: initial, canCreate, canApprove }: Props) {
  const [invoice,      setInvoice]      = useState<Invoice>(initial);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const statusMeta = STATUS_META[invoice.status];
  const typeMeta   = TYPE_META[invoice.type];
  const TypeIcon   = typeMeta.icon;

  const outstanding    = invoice.amountCents - invoice.paidCents;
  const nextTransition = NEXT_MANUAL_TRANSITION[invoice.status];
  const canPayable     = ["issued", "partially_paid", "overdue"].includes(invoice.status);

  const canDoTransition = nextTransition
    ? (nextTransition.require === "canCreate" ? canCreate : canApprove)
    : false;

  // ── Status transition ───────────────────────────────────────────────────

  async function handleTransition(newStatus: InvoiceStatus) {
    setTransitioning(true);
    setTransitionError(null);

    const res = await fetch(
      `/api/buildings/${invoice.buildingId}/invoices/${invoice.id}`,
      {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: newStatus }),
      },
    );

    setTransitioning(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setTransitionError(body.error ?? "Failed to update invoice status.");
      return;
    }

    const { data } = await res.json();
    setInvoice(data);
  }

  // ── Handle payment recorded ─────────────────────────────────────────────

  function handlePaymentRecorded(result: { payment: unknown; invoice: unknown }) {
    const updatedInv = result.invoice as Partial<Invoice>;
    const newPayment = result.payment as Payment;
    setInvoice((prev) => ({
      ...prev,
      paidCents: updatedInv.paidCents ?? prev.paidCents,
      status:    updatedInv.status    ?? prev.status,
      payments:  [newPayment, ...prev.payments],
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-3xl mx-auto">
      {/* ── Back link ─────────────────────────────────────────────────────── */}
      <Link
        href={`/invoices?building=${invoice.buildingId}`}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </Link>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2.5 mt-0.5 shrink-0">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{invoice.description}</h1>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Badge className={cn("text-xs px-2 py-0.5", statusMeta.className)} variant="outline">
                {statusMeta.label}
              </Badge>
              <span className="text-sm text-muted-foreground">{typeMeta.label}</span>
              {invoice.lot && (
                <span className="text-sm text-muted-foreground">· Unit {invoice.lot.unitNumber}</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {canPayable && canCreate && outstanding > 0 && (
            <RecordPaymentDialog
              buildingId={invoice.buildingId}
              invoiceId={invoice.id}
              outstandingCents={outstanding}
              onRecorded={handlePaymentRecorded}
            />
          )}
          {nextTransition && canDoTransition && (
            <Button
              variant={nextTransition.variant}
              size="sm"
              disabled={transitioning}
              onClick={() => handleTransition(nextTransition.status)}
            >
              <nextTransition.icon className="h-4 w-4 mr-1.5" />
              {transitioning ? "Saving…" : nextTransition.label}
            </Button>
          )}
        </div>
      </div>

      {/* Transition error */}
      {transitionError && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{transitionError}</span>
        </div>
      )}

      {/* ── Financial summary ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border p-4 bg-muted/30">
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="text-lg font-semibold">{formatCents(invoice.amountCents)}</p>
        </div>
        <div className="text-center border-x border-border">
          <p className="text-xs text-muted-foreground mb-1">Paid</p>
          <p className="text-lg font-semibold text-green-700 dark:text-green-400">
            {formatCents(invoice.paidCents)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
          <p className={cn(
            "text-lg font-semibold",
            outstanding > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}>
            {formatCents(outstanding)}
          </p>
        </div>
      </div>

      {/* ── Details grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DetailRow icon={User} label="Issued To">
          {invoice.issuedTo.name
            ? <><span>{invoice.issuedTo.name}</span><span className="text-muted-foreground text-xs block">{invoice.issuedTo.email}</span></>
            : invoice.issuedTo.email}
        </DetailRow>

        <DetailRow icon={Calendar} label="Due Date">
          <span className={cn(
            new Date(invoice.dueDate) < new Date() && !["paid","void","written_off"].includes(invoice.status)
              ? "text-red-600 font-medium"
              : "",
          )}>
            {formatDate(invoice.dueDate)}
          </span>
        </DetailRow>

        {invoice.issuedAt && (
          <DetailRow icon={CheckCircle2} label="Issued">
            {formatDate(invoice.issuedAt)}
          </DetailRow>
        )}

        <DetailRow icon={Clock} label="Created">
          {formatDate(invoice.createdAt)}
        </DetailRow>

        {invoice.periodStart && invoice.periodEnd && (
          <DetailRow icon={Calendar} label="Billing Period" className="sm:col-span-2">
            {formatDate(invoice.periodStart)} — {formatDate(invoice.periodEnd)}
          </DetailRow>
        )}

        {invoice.externalRef && (
          <DetailRow icon={Hash} label="External Ref">
            {invoice.externalRef}
          </DetailRow>
        )}

        {invoice.notes && (
          <DetailRow icon={FileText} label="Notes" className="sm:col-span-2">
            <span className="whitespace-pre-wrap">{invoice.notes}</span>
          </DetailRow>
        )}
      </div>

      {/* ── Payment history ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Payment History · {invoice.payments.length}
        </h2>

        {invoice.payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No payments recorded</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {invoice.payments.map((p) => {
              const pmeta = PAYMENT_STATUS_META[p.status];
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {formatCents(p.amountCents)}
                      </span>
                      <Badge className={cn("text-xs px-1.5 py-0 h-5", pmeta.className)} variant="outline">
                        {pmeta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.paidBy.name ?? p.paidBy.email}
                      {" · "}
                      {p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}
                      {p.providerRef && ` · Ref: ${p.providerRef}`}
                    </p>
                    {p.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{p.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function DetailRow({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon:      React.ElementType;
  label:     string;
  children:  React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
