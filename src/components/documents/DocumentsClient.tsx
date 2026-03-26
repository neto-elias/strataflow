"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Upload, Search, X, SlidersHorizontal } from "lucide-react";
import { DocumentCategory } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Badge }  from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentCard, type DocumentCardItem } from "./DocumentCard";
import { UploadDialog }                         from "./UploadDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Building {
  id:   string;
  name: string;
}

interface DocumentsClientProps {
  buildings:           Building[];
  initialDocuments:    DocumentCardItem[];
  selectedBuildingId?: string;
  canUpload:           boolean;
  userId:              string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchDownloadUrl(buildingId: string, documentId: string): Promise<string> {
  const res = await fetch(
    `/api/buildings/${buildingId}/documents/${documentId}/download`,
  );
  if (!res.ok) throw new Error("Failed to get download URL");
  const { data } = await res.json();
  return data.downloadUrl as string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentsClient({
  buildings,
  initialDocuments,
  selectedBuildingId,
  canUpload,
  userId: _userId,
}: DocumentsClientProps) {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const [, startTransition] = useTransition();

  const [documents,      setDocuments]      = useState<DocumentCardItem[]>(initialDocuments);
  const [uploadOpen,     setUploadOpen]     = useState(false);
  const [search,         setSearch]         = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">("all");
  const [downloading,    setDownloading]    = useState<string | null>(null);

  // ── Building selection ──────────────────────────────────────────────────────

  const handleBuildingChange = (buildingId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("building", buildingId);
    router.push(`/documents?${params.toString()}`);
  };

  // ── Refresh documents after upload ─────────────────────────────────────────

  const refreshDocuments = useCallback(async () => {
    if (!selectedBuildingId) return;
    try {
      const res = await fetch(
        `/api/buildings/${selectedBuildingId}/documents`,
      );
      if (res.ok) {
        const { data } = await res.json();
        setDocuments(data as DocumentCardItem[]);
      }
    } catch {
      // Silently fall back to stale list; user can refresh manually
    }
  }, [selectedBuildingId]);

  const handleUploadSuccess = () => {
    startTransition(() => { void refreshDocuments(); });
  };

  // ── Download ────────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async (doc: DocumentCardItem) => {
    if (!selectedBuildingId || downloading) return;
    setDownloading(doc.id);
    try {
      const url = await fetchDownloadUrl(selectedBuildingId, doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("Could not generate download link. Please try again.");
    } finally {
      setDownloading(null);
    }
  }, [selectedBuildingId, downloading]);

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtered = documents.filter((doc) => {
    const matchSearch = !search ||
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || doc.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Manage bylaws, minutes, insurance policies, and other building records.
        </p>
      </div>

      {/* Building selector (shown when user has multiple buildings) */}
      {buildings.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Building:</span>
          <Select
            value={selectedBuildingId ?? ""}
            onValueChange={handleBuildingChange}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a building…" />
            </SelectTrigger>
            <SelectContent>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* No building access */}
      {buildings.length === 0 && (
        <EmptyState
          icon={<FileText className="h-10 w-10 text-muted-foreground/50" />}
          title="No buildings found"
          description="You are not associated with any building. Contact your strata manager."
        />
      )}

      {/* No building selected (multiple buildings, none chosen yet) */}
      {buildings.length > 1 && !selectedBuildingId && (
        <EmptyState
          icon={<FileText className="h-10 w-10 text-muted-foreground/50" />}
          title="Select a building"
          description="Choose a building above to view its documents."
        />
      )}

      {/* Main content — only when a building is selected */}
      {selectedBuildingId && (
        <>
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2 max-w-sm">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Search documents…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Search documents"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v as DocumentCategory | "all")}
              >
                <SelectTrigger className="w-[160px]" aria-label="Filter by category">
                  <SlidersHorizontal className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {filtered.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {filtered.length} document{filtered.length !== 1 ? "s" : ""}
                </span>
              )}
              {canUpload && (
                <Button onClick={() => setUploadOpen(true)} className="gap-2">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload
                </Button>
              )}
            </div>
          </div>

          {/* Document list */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10 text-muted-foreground/50" />}
              title={
                documents.length === 0
                  ? "No documents yet"
                  : "No documents match your filter"
              }
              description={
                documents.length === 0
                  ? canUpload
                    ? "Upload the first document using the button above."
                    : "No documents have been uploaded for this building yet."
                  : "Try adjusting your search or category filter."
              }
              action={
                documents.length === 0 && canUpload ? (
                  <Button
                    variant="outline"
                    onClick={() => setUploadOpen(true)}
                    className="gap-2 mt-4"
                  >
                    <Upload className="h-4 w-4" />
                    Upload first document
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2" aria-label="Documents">
              {filtered.map((doc) => (
                <li key={doc.id}>
                  <DocumentCard
                    document={doc}
                    buildingId={selectedBuildingId}
                    onDownload={handleDownload}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Upload dialog */}
      {selectedBuildingId && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          buildingId={selectedBuildingId}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  icon, title, description, action,
}: {
  icon:         React.ReactNode;
  title:        string;
  description:  string;
  action?:      React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
      <div className="mb-4" aria-hidden="true">{icon}</div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
