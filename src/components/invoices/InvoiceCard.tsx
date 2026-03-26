"use client";

import Link from "next/link";
import {
  FileText, Clock, CheckCircle2, AlertTriangle, Ban,
  CreditCard, Receipt, Wrench, Zap, Home, DollarSign,
} from "lucide-react";
import { InvoiceType, InvoiceStatus } from "@prisma/client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface InvoiceListItem {
  id:          string;
  buildingId:  string;
  lotId:       string | null;
  type:        InvoiceType;
  status:      InvoiceStatus;
  description: string;
  amountCents: number;
  paidCents:   number;
  dueDate:     string | Date;
  issuedAt:    string | Date | null;
  createdAt:   string | Date;
  updatedAt:   string | Date;
  issuedTo: { id: string; name: string | null; email: string; image: string | null };
  createdBy: { id: string; name: string | null; image: string | null };
  lot:       { id: string; unitNumber: string } | null;
}

// ─── Meta maps ────────────────────────────────────────────────────────────────

export const STATUS_META: Record<InvoiceStatus, {
  label:     string;
  className: string;
  icon:      React.ElementType;
}> = {
  draft:          { label: "Draft",          className: "bg-muted text-muted-foreground",            icon: FileText       },
  issued:         { label: "Issued",         className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",    icon: Clock          },
  partially_paid: { label: "Partial",        className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: CreditCard     },
  paid:           { label: "Paid",           className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: CheckCircle2   },
  overdue:        { label: "Overdue",        className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",         icon: AlertTriangle  },
  void:           { label: "Void",           className: "bg-muted text-muted-foreground line-through",                         icon: Ban            },
  written_off:    { label: "Written Off",    className: "bg-muted text-muted-foreground",                                      icon: Ban            },
};

export const TYPE_META: Record<InvoiceType, {
  label: string;
  icon:  React.ElementType;
}> = {
  strata_fee:    { label: "Strata Fee",     icon: Home       },
  special_levy:  { label: "Special Levy",   icon: DollarSign },
  fine:          { label: "Fine",           icon: AlertTriangle },
  repair_charge: { label: "Repair Charge",  icon: Wrench     },
  utility:       { label: "Utility",        icon: Zap        },
  other:         { label: "Other",          icon: Receipt    },
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style:    "currency",
    currency: "CAD",
  }).format(cents / 100);
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", {
    year:  "numeric",
    month: "short",
    day:   "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  invoice:    InvoiceListItem;
  buildingId: string;
}

export function InvoiceCard({ invoice, buildingId }: Props) {
  const statusMeta = STATUS_META[invoice.status];
  const typeMeta   = TYPE_META[invoice.type];
  const TypeIcon   = typeMeta.icon;

  const outstanding = invoice.amountCents - invoice.paidCents;
  const isOverdue   = invoice.status === "overdue";
  const dueDate     = new Date(invoice.dueDate);
  const isPastDue   = dueDate < new Date() && invoice.status !== "paid" && invoice.status !== "void" && invoice.status !== "written_off";

  return (
    <Link
      href={`/invoices/${invoice.id}?building=${buildingId}`}
      className="block rounded-lg border border-border bg-card p-4 hover:bg-accent/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className="mt-0.5 rounded-md bg-muted p-2 shrink-0">
          <TypeIcon className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{invoice.description}</span>
            <Badge
              className={cn("text-xs px-1.5 py-0 h-5", statusMeta.className)}
              variant="outline"
            >
              {statusMeta.label}
            </Badge>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{typeMeta.label}</span>
            {invoice.lot && <span>Unit {invoice.lot.unitNumber}</span>}
            <span>{invoice.issuedTo.name ?? invoice.issuedTo.email}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
            <span className="font-medium">{formatCents(invoice.amountCents)}</span>
            {outstanding > 0 && outstanding < invoice.amountCents && (
              <span className="text-muted-foreground">
                {formatCents(outstanding)} outstanding
              </span>
            )}
            <span className={cn("text-muted-foreground", isPastDue && "text-red-600 font-medium")}>
              Due {formatDate(invoice.dueDate)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
