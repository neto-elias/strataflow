/**
 * Storage adapter interface and shared constants.
 *
 * All storage interactions go through StorageAdapter — never call a cloud SDK
 * directly from API routes.  Swap the concrete implementation by changing
 * STORAGE_PROVIDER in .env without touching any API logic.
 */

// ─── Allowed types ─────────────────────────────────────────────────────────────

/** Exhaustive map of accepted MIME types → canonical file extension. */
export const ALLOWED_MIME_TYPES = {
  "application/pdf":                                                         "pdf",
  "application/msword":                                                      "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg":                                                              "jpg",
  "image/png":                                                               "png",
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_MIME_TYPES;

/** 50 MB — enforced server-side on every presign request. */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface PresignUploadOptions {
  /** The storage key to write the file to (e.g. `buildings/abc/bylaw/xyz.pdf`). */
  key:       string;
  mimeType:  string;
  sizeBytes: number;
  /** Seconds until the upload URL expires. Default: 3600 (1 hour). */
  expiresIn?: number;
}

export interface PresignedUpload {
  /** PUT to this URL directly from the browser. */
  uploadUrl: string;
  /** Confirmed storage key — pass this to the document register endpoint. */
  key:       string;
  expiresAt: Date;
  /**
   * Headers the client MUST include when sending the PUT request.
   * At minimum, `Content-Type` must match the value used to generate the URL
   * (required by AWS Signature V4 and compatible providers).
   */
  headers:   Record<string, string>;
}

export interface StorageAdapter {
  /** Generate a presigned PUT URL for direct browser-to-storage upload. */
  presignUpload(options: PresignUploadOptions): Promise<PresignedUpload>;

  /**
   * Generate a time-limited GET URL for private file access.
   * Default expiry: 3600 s.  For public documents you may bypass this and
   * use a CDN URL instead (see S3_PUBLIC_URL env var).
   */
  presignDownload(key: string, expiresIn?: number): Promise<string>;

  /** Hard-delete an object from storage. */
  delete(key: string): Promise<void>;

  /**
   * Returns true if the key exists in storage.
   * Call this after the client reports a successful upload to verify before
   * persisting the document record.
   */
  exists(key: string): Promise<boolean>;
}
