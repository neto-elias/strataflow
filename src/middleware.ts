/**
 * Next.js middleware — auth enforcement.
 *
 * Uses NextAuth v5's auth() as the middleware function so it runs on every
 * matched request.  The callback receives `req.auth` (the session) and can
 * redirect or rewrite before the route handler runs.
 *
 * Protected paths:   /dashboard/**  (any sub-route)
 * Public paths:      /login, /verify-request, /auth-error, /api/auth/**
 *                    + static assets
 *
 * Redirect behaviour:
 *   - Unauthenticated user hits /dashboard/* → redirect to /login
 *   - Authenticated user hits /login          → redirect to /dashboard
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth((req: NextRequest & { auth: Awaited<ReturnType<typeof auth>> }) => {
  const { nextUrl } = req;
  const isLoggedIn  = !!req.auth?.user?.id;

  const isDashboard = nextUrl.pathname.startsWith("/dashboard");
  const isLoginPage = nextUrl.pathname === "/login";

  // Unauthenticated → protect dashboard routes
  if (isDashboard && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated → skip login page, send to dashboard
  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static  (bundled JS/CSS)
     *   - _next/image   (image optimisation)
     *   - public assets (*.png, *.svg, *.ico)
     *   - /api/auth     (NextAuth internal endpoints — must never be gated)
     *   - /verify-request, /auth-error (NextAuth post-action pages)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp)|api/auth|verify-request|auth-error).*)",
  ],
};
