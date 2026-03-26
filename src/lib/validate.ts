/**
 * StrataFlow — Request Validation Helpers
 *
 * Thin wrappers around Zod that parse request bodies, query strings, and
 * route params, and return either typed data or a ready-to-return NextResponse.
 *
 * Usage pattern:
 *
 *   const parse = await parseBody(req, CreateDocumentSchema);
 *   if (!parse.success) return parse.response;
 *   const { title, s3Key, ... } = parse.data;   // fully typed
 *
 * The discriminated union shape means TypeScript narrows the type in each
 * branch without any casting.
 */

import type { NextRequest } from "next/server";
import type { ZodSchema, z } from "zod";
import { badRequest, validationError } from "@/lib/api-response";
import type { NextResponse } from "next/server";

// ─── Discriminated result type ────────────────────────────────────────────────

export type ParseOk<T>   = { success: true;  data: T;          response?: never };
export type ParseFail     = { success: false; data?: never;     response: NextResponse };
export type ParseResult<T> = ParseOk<T> | ParseFail;

// ─── Body parser ──────────────────────────────────────────────────────────────

/**
 * Parse and validate the JSON request body.
 *
 * Returns `{ success: true, data }` on success, or
 * `{ success: false, response }` with a 400 or 422 NextResponse ready to
 * return immediately from the route handler.
 *
 * @example
 * const parse = await parseBody(req, CreateMeetingSchema);
 * if (!parse.success) return parse.response;
 * const { title, scheduledAt } = parse.data;
 */
export async function parseBody<S extends ZodSchema>(
  req: NextRequest,
  schema: S,
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { success: false, response: badRequest("Invalid JSON body") };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: validationError(result.error) };
  }

  return { success: true, data: result.data };
}

// ─── Query string parser ───────────────────────────────────────────────────────

/**
 * Parse and validate URL search params against a Zod schema.
 * Converts `URLSearchParams` to a plain object before parsing, so your
 * schema works with string types (coerce as needed).
 *
 * @example
 * const parse = parseQuery(req.nextUrl.searchParams, ListMeetingsQuerySchema);
 * if (!parse.success) return parse.response;
 * const { status, page } = parse.data;
 */
export function parseQuery<S extends ZodSchema>(
  searchParams: URLSearchParams,
  schema: S,
): ParseResult<z.infer<S>> {
  const raw    = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);

  if (!result.success) {
    return { success: false, response: validationError(result.error) };
  }

  return { success: true, data: result.data };
}

// ─── Route params parser ──────────────────────────────────────────────────────

/**
 * Validate route segment params (e.g. `{ buildingId, documentId }`).
 * Useful when a route takes more than one dynamic segment and you want
 * co-located validation rather than inline checks.
 *
 * @example
 * const parse = parseParams(params, z.object({ buildingId: z.string().min(1) }));
 * if (!parse.success) return parse.response;
 */
export function parseParams<S extends ZodSchema>(
  params: Record<string, string | string[]>,
  schema: S,
): ParseResult<z.infer<S>> {
  const result = schema.safeParse(params);

  if (!result.success) {
    return { success: false, response: validationError(result.error) };
  }

  return { success: true, data: result.data };
}
