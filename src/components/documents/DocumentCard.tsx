"use client";

import Link from "next/link";
import {
  FileText, FilePen, FileImage, Scale, Receipt,
  Shield, Wrench, Mail, Bell, File,
  Download, MoreHorizontal, Clock,
} from "lucide-react";
import { formatDate, formatBytes } from "@/lib/utils";
import { Badge }   from "@/components/ui/badge";
import { Button }  from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentCategory } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentCardItem {
  id:          string;
  title:       string;
  description: string | null;
  category:    DocumentCategory;
  groupId:     string;
  version:     number;
  s3Key:       string;
  sizeBytes:   number;
  mimeType:    string;
  isPublic:    boolean;
  createdAt:   string | Date;
  uploadedBy:  { id: string; name: string | null; image: string | null };
}

interface DocumentCardProps {
  document:    DocumentCardItem;
  buildingId:  string;
  onDownload:  (doc: DocumentCardItem) => void;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
  DocumentCategory,
  { label: string; Icon: React.ElementType; color: string }
> = {
  minutes:            { label: "Minutes",      Icon: FileText,   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"   },
  bylaw:              { label: "Bylaw",         Icon: Scale,      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  financial:          { label: "Financial",     Icon: Receipt,    color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"    },
  insurance:          { label: "Insurance",     Icon: Shield,     color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  maintenance_report: { label: "Maintenance",   Icon: Wrench,     color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  legal:              { label: "Legal",          Icon: Scale,      color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"            },
  correspondence:     { label: "Correspondence", Icon: Mail,       color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"            },
  notice:             { label: "Notice",         Icon: Bell,       color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"    },
  form:               { label: "Form",           Icon: FilePen,    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"        },
  other:              { label: "Other",          Icon: File,       color: "bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300"        },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentCard({ document: doc, buildingId, onDownload }: DocumentCardProps) {
  const meta = CATEGORY_META[doc.category] ?? CATEGORY_META.other;
  const { Icon } = meta;

  return (
    <article className="group flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm">
      {/* Category icon */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.color}`}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/documents/${doc.id}?building=${buildingId}`}
              className="truncate font-medium text-sm text-foreground hover:text-primary-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              {doc.title}
            </Link>
            {doc.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {doc.description}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDownload(doc)}
              aria-label={`Download ${doc.title}`}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem asChild>
                  <Link href={`/documents/${doc.id}?building=${buildingId}`}>
                    View details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownload(doc)}>
                  Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
            {meta.label}
          </Badge>

          {doc.version > 1 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              v{doc.version}
            </span>
          )}

          <span>{formatBytes(doc.sizeBytes)}</span>

          <span className="hidden sm:inline">
            {formatDate(doc.createdAt)}
          </span>

          {doc.uploadedBy.name && (
            <span className="hidden md:inline truncate max-w-[120px]">
              {doc.uploadedBy.name}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
