/**
 * S3-compatible storage adapter.
 *
 * Works with:
 *   AWS S3        — set S3_REGION, leave S3_ENDPOINT unset
 *   Cloudflare R2 — set S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 *   Backblaze B2  — set S3_ENDPOINT=https://s3.<region>.backblazeb2.com
 *                   and S3_FORCE_PATH_STYLE=true
 *
 * Required env vars: S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 * Optional env vars: S3_REGION, S3_ENDPOINT, S3_FORCE_PATH_STYLE, S3_PUBLIC_URL
 *
 * S3_PUBLIC_URL: if set, presignDownload returns
 *   `${S3_PUBLIC_URL}/${key}` for public documents instead of a signed URL.
 *   Useful when a CDN (CloudFront, Cloudflare) fronts the bucket.
 *   Private documents always use signed URLs regardless of this setting.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageAdapter, PresignUploadOptions, PresignedUpload } from "./types";

export function createS3Adapter(): StorageAdapter {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("[storage/s3] S3_BUCKET env var is required");

  const accessKeyId     = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("[storage/s3] S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required");
  }

  const client = new S3Client({
    region:          process.env.S3_REGION ?? "us-east-1",
    // undefined → AWS global endpoint; set to override for R2/B2
    endpoint:        process.env.S3_ENDPOINT || undefined,
    credentials:     { accessKeyId, secretAccessKey },
    // Backblaze B2 requires path-style; AWS and R2 use virtual-hosted-style (default)
    forcePathStyle:  process.env.S3_FORCE_PATH_STYLE === "true",
  });

  return {
    async presignUpload(options: PresignUploadOptions): Promise<PresignedUpload> {
      const expiresIn = options.expiresIn ?? 3600;

      const command = new PutObjectCommand({
        Bucket:      bucket,
        Key:         options.key,
        ContentType: options.mimeType,
        // Note: omitting ContentLength from the presign — R2 does not support
        // signing it.  Server-side size validation via PresignRequestSchema
        // is the authoritative check.
      });

      const uploadUrl = await getSignedUrl(client, command, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        uploadUrl,
        key:      options.key,
        expiresAt,
        // Client must include matching Content-Type for Signature V4 to verify
        headers:  { "Content-Type": options.mimeType },
      };
    },

    async presignDownload(key: string, expiresIn = 3600): Promise<string> {
      const publicUrl = process.env.S3_PUBLIC_URL;
      if (publicUrl) {
        return `${publicUrl.replace(/\/$/, "")}/${key}`;
      }
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn });
    },

    async delete(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async exists(key: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
