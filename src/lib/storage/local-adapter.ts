/**
 * Local filesystem storage adapter — development only.
 *
 * Files are written to <project-root>/.uploads/ which should be .gitignored.
 * Upload tokens are held in a module-level Map (resets on hot-reload — just
 * retry the upload in the rare case this happens).
 *
 * The adapter exposes two extra exports used by the local upload API route:
 *   resolveUploadToken(token) — consume a one-time upload token
 *   keyToAbsPath(key)         — convert a storage key to an absolute FS path
 */

import path from "path";
import fs   from "fs/promises";
import { nanoid } from "nanoid";
import type { StorageAdapter, PresignUploadOptions, PresignedUpload } from "./types";

// ─── Token store ──────────────────────────────────────────────────────────────

interface TokenEntry {
  key:       string;
  mimeType:  string;
  expiresAt: Date;
}

// Module-level — fine for dev; does not need to survive restarts
const tokenStore = new Map<string, TokenEntry>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, entry] of tokenStore) {
    if (entry.expiresAt.getTime() < now) tokenStore.delete(token);
  }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function uploadsRoot(): string {
  return path.join(process.cwd(), ".uploads");
}

export function keyToAbsPath(key: string): string {
  // key uses forward slashes; normalise for the current OS
  return path.join(uploadsRoot(), ...key.split("/"));
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export function createLocalAdapter(): StorageAdapter {
  const base = process.env.AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return {
    async presignUpload(options: PresignUploadOptions): Promise<PresignedUpload> {
      pruneExpired();

      const expiresIn = options.expiresIn ?? 900; // 15 min
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      const token     = nanoid(32);

      tokenStore.set(token, { key: options.key, mimeType: options.mimeType, expiresAt });

      return {
        uploadUrl: `${base}/api/uploads/local?token=${token}`,
        key:       options.key,
        expiresAt,
        headers:   { "Content-Type": options.mimeType },
      };
    },

    async presignDownload(key: string, _expiresIn?: number): Promise<string> {
      return `${base}/api/uploads/local?key=${encodeURIComponent(key)}`;
    },

    async delete(key: string): Promise<void> {
      try {
        await fs.unlink(keyToAbsPath(key));
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },

    async exists(key: string): Promise<boolean> {
      return fs.access(keyToAbsPath(key)).then(() => true, () => false);
    },
  };
}

// ─── Token resolution (called by /api/uploads/local PUT handler) ──────────────

export interface ResolvedToken {
  key:      string;
  mimeType: string;
}

/**
 * Consumes a one-time upload token.
 * Returns the associated key+mimeType or null if missing/expired.
 */
export function resolveUploadToken(token: string): ResolvedToken | null {
  const entry = tokenStore.get(token);
  if (!entry) return null;
  if (entry.expiresAt.getTime() < Date.now()) {
    tokenStore.delete(token);
    return null;
  }
  tokenStore.delete(token); // single-use
  return { key: entry.key, mimeType: entry.mimeType };
}
