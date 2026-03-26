/**
 * NextAuth v5 configuration.
 *
 * Session strategy: database (PrismaAdapter).
 * The session callback enriches the session with `user.id` and `user.role`
 * so that every server component and API route can read role without an
 * extra DB query.
 *
 * The `user` parameter in the session callback is the full Prisma User record
 * returned by the adapter's getUser(); all fields including `role` are
 * available at runtime.  The type augmentation in `src/types/next-auth.d.ts`
 * surfaces them to TypeScript.
 */
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  pages: {
    signIn:        "/login",
    verifyRequest: "/verify-request",
    error:         "/auth-error",
  },
  session: {
    strategy: "database",
    maxAge:   30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    /**
     * Enrich the session token with stable, lightweight fields.
     *
     * `user` here is the AdapterUser returned by the Prisma adapter —
     * it includes every column on the `users` table, so `user.role` is
     * always present.  We defensively fall back to `owner` in the unlikely
     * event the adapter returns a partial object (e.g. during testing).
     */
    async session({ session, user }) {
      session.user.id   = user.id;
      session.user.role = user.role ?? UserRole.owner;
      return session;
    },
  },
});
