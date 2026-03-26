/**
 * StrataFlow — Auth Helper Functions
 *
 * Server-only utilities for reading and asserting the authenticated session.
 * Safe to call from Server Components, API routes, and server actions.
 *
 * Functions:
 *   getCurrentUser()   — returns the enriched session user or null
 *   requireAuth()      — throws a redirect to /login if unauthenticated
 *   getSessionUser()   — raw session read; alias kept for destructuring clarity
 */

import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";

// ─── Shared shape ─────────────────────────────────────────────────────────────

export interface SessionUser {
  id:    string;
  role:  UserRole;
  name:  string | null;
  email: string;
  image: string | null;
}

// ─── getCurrentUser ───────────────────────────────────────────────────────────

/**
 * Returns the session user if authenticated, or `null` if not.
 *
 * @example
 * // Server Component
 * const user = await getCurrentUser();
 * if (!user) return <LoginPrompt />;
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  return {
    id:    session.user.id,
    role:  session.user.role,
    name:  session.user.name  ?? null,
    email: session.user.email,
    image: session.user.image ?? null,
  };
}

// ─── requireAuth ──────────────────────────────────────────────────────────────

/**
 * Asserts the caller is authenticated.  If not, calls Next.js `redirect()`
 * to `/login` — which throws internally, so this function never returns null.
 *
 * Use in Server Components or server actions that must be behind auth.
 *
 * @example
 * // Server Component or server action
 * const user = await requireAuth();
 * // user is always SessionUser here
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// ─── getSessionUser (alias) ───────────────────────────────────────────────────

/**
 * Alias for `getCurrentUser()`.  Useful when destructuring alongside other
 * session utilities without importing two names.
 */
export const getSessionUser = getCurrentUser;
