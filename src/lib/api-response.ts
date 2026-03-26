/**
 * StrataFlow — Standard API Response Helpers
 *
 * Every API route must return through one of these helpers so the shape of
 * success and error payloads is guaranteed consistent.
 *
 * Success envelope:  { data: T,  message?: string }
 * Error envelope:    { error: string, code: ErrorCode, details?: unknown }
 *
 * HTTP status mapping:
 *   200 ok()
 *   201 created()
 *   204 noContent()
 *   400 badRequest()
 *   401 unauthorized()
 *   403 forbidden()
 *   404 notFound()
 *   409 conflict()
 *   422 validationError()
 *   500 serverError()
 */

import { NextResponse } from "next/server";
import type { ZodError } from "zod";

// ─── Envelope types ───────────────────────────────────────────────────────────

export interface SuccessEnvelope<T> {
  data:     T;
  message?: string;
}

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "SERVER_ERROR";

export interface ErrorEnvelope {
  error:     string;
  code:      ErrorCode;
  details?:  unknown;
}

// ─── Internal helper ──────────────────────────────────────────────────────────

function json<T>(body: T, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

// ─── Success responses ────────────────────────────────────────────────────────

/** 200 — successful read or non-destructive action */
export function ok<T>(data: T, message?: string): NextResponse {
  const body: SuccessEnvelope<T> = { data };
  if (message) body.message = message;
  return json(body, 200);
}

/** 201 — resource created */
export function created<T>(data: T): NextResponse {
  return json<SuccessEnvelope<T>>({ data }, 201);
}

/** 204 — successful delete or action with no body */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ─── Error responses ──────────────────────────────────────────────────────────

/** 400 — malformed request (bad JSON, missing required param, etc.) */
export function badRequest(message: string, details?: unknown): NextResponse {
  return json<ErrorEnvelope>({ error: message, code: "BAD_REQUEST", details }, 400);
}

/** 401 — no valid session */
export function unauthorized(message = "Unauthenticated"): NextResponse {
  return json<ErrorEnvelope>({ error: message, code: "UNAUTHORIZED" }, 401);
}

/**
 * 403 — authenticated but not permitted.
 * Pass the missing permission key so clients can render a useful message.
 */
export function forbidden(permissionKey?: string): NextResponse {
  const details = permissionKey ? { required: permissionKey } : undefined;
  return json<ErrorEnvelope>({ error: "Forbidden", code: "FORBIDDEN", details }, 403);
}

/** 404 — record does not exist (or is invisible to this caller) */
export function notFound(resource = "Resource"): NextResponse {
  return json<ErrorEnvelope>({ error: `${resource} not found`, code: "NOT_FOUND" }, 404);
}

/** 409 — business rule conflict (duplicate, stale optimistic update, etc.) */
export function conflict(message: string): NextResponse {
  return json<ErrorEnvelope>({ error: message, code: "CONFLICT" }, 409);
}

/** 422 — request parsed but failed Zod validation */
export function validationError(error: ZodError): NextResponse {
  return json<ErrorEnvelope>(
    { error: "Validation failed", code: "VALIDATION_ERROR", details: error.flatten() },
    422,
  );
}

/** 500 — unexpected server error */
export function serverError(message = "An unexpected error occurred"): NextResponse {
  return json<ErrorEnvelope>({ error: message, code: "SERVER_ERROR" }, 500);
}
