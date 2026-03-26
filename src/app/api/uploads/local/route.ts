/**
 * /api/uploads/local — development-only file upload/download handler.
 *
 * PUT ?token=<token>  — receive a file upload (used by the local presign adapter)
 * GET ?key=<key>      — serve a stored file for download/preview
 *
 * This route is only active when STORAGE_PROVIDER=local (dev default).
 * In production (STORAGE_PROVIDER=s3), this route is unreachable because
 * the local adapter is never loaded and no tokens are ever generated.
 *
 * Security:
 *   - PUT requires a valid single-use token from resolveUploadToken()
 *   - GET validates the key is within .uploads/ to prevent path traversal
 *   - Both are development-only; production traffic never hits this route
 */

import path         from "path";
import fs           from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { resolveUploadToken, keyToAbsPath, uploadsRoot } from "@/lib/storage/local-adapter";

// Extension → MIME type for serving downloads
const EXT_MIME: Record<string, string> = {
  pdf:  "application/pdf",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
};

// ─── PUT — receive uploaded binary ────────────────────────────────────────────

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing upload token" }, { status: 400 });
  }

  const resolved = resolveUploadToken(token);
  if (!resolved) {
    return NextResponse.json(
      { error: "Invalid or expired upload token" },
      { status: 403 },
    );
  }

  const filePath = keyToAbsPath(resolved.key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const buffer = Buffer.from(await req.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return new NextResponse(null, { status: 204 });
}

// ─── GET — serve stored file ──────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  // Path traversal guard
  const root     = uploadsRoot();
  const filePath = keyToAbsPath(key);
  if (!filePath.startsWith(root)) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext      = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = EXT_MIME[ext] ?? "application/octet-stream";

  const filename = path.basename(filePath);

  return new NextResponse(buffer, {
    status:  200,
    headers: {
      "Content-Type":        mimeType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
