"use client";

import { Download, CheckCircle2, Clock } from "lucide-react";
import { formatDate, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VersionItem {
  id:               string;
  version:          number;
  isCurrentVersion: boolean;
  title:            string;
  sizeBytes:        number;
  mimeType:         string;
  createdAt:        string | Date;
  uploadedBy:       { id: string; name: string | null; image: string | null };
}

interface VersionHistoryProps {
  versions:   VersionItem[];
  buildingId: string;
  onDownload: (version: VersionItem) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VersionHistory({ versions, buildingId: _buildingId, onDownload }: VersionHistoryProps) {
  if (versions.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No version history available.
      </p>
    );
  }

  return (
    <ol className="space-y-1" aria-label="Version history">
      {versions.map((v) => (
        <li
          key={v.id}
          className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm"
        >
          {/* Version indicator */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
            {v.isCurrentVersion ? (
              <CheckCircle2 className="h-4 w-4 text-primary-600" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">v{v.version}</span>
              {v.isCurrentVersion && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  Current
                </Badge>
              )}
              <span className="text-muted-foreground">{formatBytes(v.sizeBytes)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDate(v.createdAt)}
              {v.uploadedBy.name && ` · ${v.uploadedBy.name}`}
            </p>
          </div>

          {/* Download */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onDownload(v)}
            aria-label={`Download version ${v.version}`}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ol>
  );
}
