"use client";

import { useRef, useState, useCallback } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Upload, X, FileText, AlertCircle } from "lucide-react";
import { DocumentCategory } from "@prisma/client";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_MIME  = ["application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png"];
const ACCEPTED_EXT   = ".pdf,.doc,.docx,.jpg,.jpeg,.png";
const MAX_BYTES      = 50 * 1024 * 1024;

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

// ─── Form schema ──────────────────────────────────────────────────────────────

const formSchema = z.object({
  title:       z.string().min(1, "Title is required").max(255),
  category:    z.nativeEnum(DocumentCategory),
  description: z.string().max(1000).optional(),
  isPublic:    z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface UploadDialogProps {
  open:       boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  /** Pre-fill to upload a new version of an existing document group. */
  groupId?:   string;
  onSuccess:  () => void;
}

// ─── Upload stages ────────────────────────────────────────────────────────────

type Stage = "idle" | "presigning" | "uploading" | "registering" | "done" | "error";

// ─── Component ────────────────────────────────────────────────────────────────

export function UploadDialog({
  open, onOpenChange, buildingId, groupId, onSuccess,
}: UploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file,      setFile]      = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [stage,     setStage]     = useState<Stage>("idle");
  const [progress,  setProgress]  = useState(0);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", category: "other", description: "", isPublic: false },
  });

  // ── File selection ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((f: File) => {
    setFileError(null);
    if (!ACCEPTED_MIME.includes(f.type)) {
      setFileError("Unsupported file type. Accepted: PDF, Word, JPG, PNG.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`File is too large (${formatBytes(f.size)}). Maximum: 50 MB.`);
      setFile(null);
      return;
    }
    setFile(f);
    // Auto-fill title from filename (strip extension)
    if (!form.getValues("title")) {
      form.setValue("title", f.name.replace(/\.[^.]+$/, ""), { shouldValidate: true });
    }
  }, [form]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  // ── Reset ───────────────────────────────────────────────────────────────────

  const reset = () => {
    setFile(null);
    setFileError(null);
    setStage("idle");
    setProgress(0);
    setErrorMsg(null);
    form.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!file) { setFileError("Please select a file."); return; }
    setErrorMsg(null);

    try {
      // 1. Presign
      setStage("presigning");
      const presignRes = await fetch("/api/uploads/presign", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          buildingId,
          filename:  file.name,
          mimeType:  file.type,
          sizeBytes: file.size,
          category:  values.category,
        }),
      });

      if (!presignRes.ok) {
        const body = await presignRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to get upload URL");
      }

      const { data: presigned } = await presignRes.json();

      // 2. Upload via XHR (supports progress events)
      setStage("uploading");
      setProgress(0);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage upload failed (${xhr.status})`));
          }
        };

        xhr.onerror   = () => reject(new Error("Network error during upload"));
        xhr.ontimeout = () => reject(new Error("Upload timed out"));

        xhr.open("PUT", presigned.uploadUrl);
        for (const [key, val] of Object.entries(
          presigned.headers as Record<string, string>,
        )) {
          xhr.setRequestHeader(key, val);
        }
        xhr.send(file);
      });

      // 3. Register document in DB
      setStage("registering");
      const registerRes = await fetch(
        `/api/buildings/${buildingId}/documents`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            title:       values.title,
            category:    values.category,
            description: values.description || undefined,
            isPublic:    values.isPublic,
            s3Key:       presigned.key,
            sizeBytes:   file.size,
            mimeType:    file.type,
            groupId,
          }),
        },
      );

      if (!registerRes.ok) {
        const body = await registerRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to register document");
      }

      setStage("done");
      onSuccess();
      setTimeout(() => handleOpenChange(false), 600);
    } catch (err) {
      setStage("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    }
  });

  const isSubmitting = ["presigning", "uploading", "registering"].includes(stage);

  // ── Stage labels ────────────────────────────────────────────────────────────

  const stageLabel: Record<Stage, string> = {
    idle:        "Upload",
    presigning:  "Preparing…",
    uploading:   `Uploading… ${progress}%`,
    registering: "Saving…",
    done:        "Done!",
    error:       "Retry",
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {groupId ? "Upload new version" : "Upload document"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
              file
                ? "border-primary-400 bg-primary-50/50 dark:bg-primary-900/10"
                : "border-border bg-muted/30 hover:border-primary-400 hover:bg-muted/50"
            }`}
            aria-label="File drop zone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXT}
              className="sr-only"
              onChange={handleInputChange}
              aria-hidden="true"
            />

            {file ? (
              <div className="flex w-full items-center gap-3">
                <FileText className="h-8 w-8 shrink-0 text-primary-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); form.setValue("title", ""); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">
                  Drop a file or <span className="text-primary-600">browse</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, Word, JPG or PNG up to 50 MB
                </p>
              </>
            )}
          </div>

          {fileError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {fileError}
            </p>
          )}

          {/* Upload progress bar */}
          {stage === "uploading" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary-500 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title *</Label>
            <Input
              id="doc-title"
              {...form.register("title")}
              placeholder="e.g. April 2025 Council Minutes"
              disabled={isSubmitting}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-category">Category *</Label>
            <Select
              value={form.watch("category")}
              onValueChange={(v) => form.setValue("category", v as DocumentCategory)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="doc-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-desc">Description</Label>
            <Input
              id="doc-desc"
              {...form.register("description")}
              placeholder="Optional short description"
              disabled={isSubmitting}
            />
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-3">
            <input
              id="doc-public"
              type="checkbox"
              {...form.register("isPublic")}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-border accent-primary-600"
            />
            <Label htmlFor="doc-public" className="cursor-pointer font-normal">
              Visible to all building members (not just council)
            </Label>
          </div>

          {/* Error */}
          {stage === "error" && errorMsg && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{errorMsg}</p>
            </div>
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
            <Button
              type="submit"
              disabled={isSubmitting || stage === "done"}
              className="min-w-[100px]"
            >
              {stageLabel[stage]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
