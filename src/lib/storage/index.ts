/**
 * Storage adapter factory.
 *
 * ─── Choosing a provider ─────────────────────────────────────────────────────
 *
 * Set STORAGE_PROVIDER in .env:
 *
 *   STORAGE_PROVIDER=local   → local filesystem adapter (default in dev)
 *   STORAGE_PROVIDER=s3      → S3-compatible adapter (default in production)
 *
 * When using "s3", also set the provider-specific env vars:
 *
 *   Provider         | S3_ENDPOINT                                  | Notes
 *   ─────────────────┼──────────────────────────────────────────────┼──────────────────
 *   AWS S3           | (leave unset)                                | Set S3_REGION
 *   Cloudflare R2    | https://<accountId>.r2.cloudflarestorage.com | Region ignored
 *   Backblaze B2     | https://s3.<region>.backblazeb2.com          | S3_FORCE_PATH_STYLE=true
 *
 * See s3-adapter.ts for the full env var reference.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { getStorage } from "@/lib/storage";
 *   const storage = getStorage();
 *   const presigned = await storage.presignUpload({ key, mimeType, sizeBytes });
 */

import type { StorageAdapter } from "./types";

export type { StorageAdapter };
export type { PresignUploadOptions, PresignedUpload, AllowedMimeType } from "./types";
export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "./types";

// Singleton — created once per process
let _adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (_adapter) return _adapter;

  const provider =
    process.env.STORAGE_PROVIDER ??
    (process.env.NODE_ENV === "production" ? "s3" : "local");

  if (provider === "s3") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createS3Adapter } = require("./s3-adapter") as typeof import("./s3-adapter");
    _adapter = createS3Adapter();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createLocalAdapter } = require("./local-adapter") as typeof import("./local-adapter");
    _adapter = createLocalAdapter();
  }

  return _adapter!;
}
