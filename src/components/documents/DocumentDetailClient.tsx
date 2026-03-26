"use client";

import { useState }          from "react";
import Link                  from "next/link";
import {
  ArrowLeft, Download, Upload, FileText, Clock,
  Globe, Lock, Calendar, HardDrive, Tag,
} from "lucide-react";
import type { DocumentCategory } from "@prisma/client";

import { Button }          from "@/components/ui/button";
import { Badge }           from "@/components/ui/badge";
import { Separator }       from "@/components/ui/separator";
import { VersionHistory, type VersionItem } from "./VersionHistory";
import { UploadDialog }    from "./UploadDialog";
import { formatDate, formatBytes } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentDetail {
  id:               string;
  buildingId:       string;
  lotId:            string | null;
  meetingId:        string | null;
  title:            string;
  description:      string | null;
  category:         DocumentCategory;
  groupId:          string;
  version:          number;
  isCurrentVersion: boolean;
  s3Key:            string;
  sizeBytes:        number;
  mimeType:         string;
  isPublic:         boolean;
  createdAt:        string | Date;
  updatedAt:        string | Date;
  uploadedBy:       { id: string; name: string | null; image: string | null };
}

interface DocumentDetailClientProps {
  document:   DocumentDetail;
  versions:   VersionItem[];
  canUpload:  boolean;
  canEdit:    boolean;
  userId:     string;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  minutes:            "Minutes",
  bylaw:              "Bylaw",
  financial:          "Financial",
  insurance:          "Insurance",
  maintenance_report: "Maintenance Report",
  legal:              "Legal",
  correspondence:     "Correspondence",
  notice:             "Notice",
  form:               "Form",
  other:              "Other",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentDetailClient({
  document: doc,
  versions,
  canUpload,
  canEdit: _canEdit,
  userId: _userId,
}: DocumentDetailClientProps) {
  const [downloading,  setDownloading]  = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);

  // ── Download ────────────────────────────────────────────────────────────────

  const handleDownload = async (targetDoc: { id: string } = doc) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/buildings/${doc.buildingId}/documents/${targetDoc.id}/download`,
      );
      if (!res.ok) throw new Error("Failed to get download URL");
      const { data } = await res.json();
      window.open(data.downloadUrl as string, "_blank", "noopener,noreferrer");
    } catch {
      alert("Could not generate download link. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleVersionDownload = (v: VersionItem) => handleDownload(v);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <Link href={`/documents?building=${doc.buildingId}`}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to documents
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30"
          aria-hidden="true"
        >
          <FileText className="h-6 w-6 text-primary-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
              {doc.description && (
                <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {canUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNewVersionOpen(true)}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  New version
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => handleDownload()}
                disabled={downloading}
                className="gap-2"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {downloading ? "Preparing…" : "Download"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
        <MetaItem
          icon={<Tag className="h-4 w-4" />}
          label="Category"
          value={CATEGORY_LABELS[doc.category] ?? doc.category}
        />
        <MetaItem
          icon={<Clock className="h-4 w-4" />}
          label="Version"
          value={
            <span className="flex items-center gap-1.5">
              v{doc.version}
              {doc.isCurrentVersion && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  Current
                </Badge>
              )}
            </span>
          }
        />
        <MetaItem
          icon={<HardDrive className="h-4 w-4" />}
          label="File size"
          value={formatBytes(doc.sizeBytes)}
        />
        <MetaItem
          icon={<Calendar className="h-4 w-4" />}
          label="Uploaded"
          value={formatDate(doc.createdAt)}
        />
        <MetaItem
          icon={doc.isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          label="Visibility"
          value={doc.isPublic ? "All members" : "Council only"}
        />
        {doc.uploadedBy.name && (
          <MetaItem
            icon={<FileText className="h-4 w-4" />}
            label="Uploaded by"
            value={doc.uploadedBy.name}
          />
        )}
      </div>

      <Separator />

      {/* Version history */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Version history
          <span className="ml-2 font-normal text-muted-foreground">
            ({versions.length} version{versions.length !== 1 ? "s" : ""})
          </span>
        </h2>
        <VersionHistory
          versions={versions}
          buildingId={doc.buildingId}
          onDownload={handleVersionDownload}
        />
      </section>

      {/* New version upload dialog */}
      <UploadDialog
        open={newVersionOpen}
        onOpenChange={setNewVersionOpen}
        buildingId={doc.buildingId}
        groupId={doc.groupId}
        onSuccess={() => {
          setNewVersionOpen(false);
          // Reload the page to reflect the new version
          window.location.reload();
        }}
      />
    </div>
  );
}

// ─── Meta item ────────────────────────────────────────────────────────────────

function MetaItem({
  icon, label, value,
}: {
  icon:  React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="opacity-60" aria-hidden="true">{icon}</span>
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
