/**
 * NextAuth v5 type augmentation.
 *
 * Extends the default Session and User interfaces so that `session.user.id`
 * and `session.user.role` are typed throughout the application — in server
 * components, API routes, and client components — without casting.
 */

import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * Augment the Session.user shape returned by `auth()` and `useSession()`.
   * The base fields (name, email, image) come from DefaultSession["user"].
   */
  interface Session {
    user: {
      /** Database primary key (cuid). Always present when authenticated. */
      id: string;
      /** System-level role assigned to the user's account. */
      role: UserRole;
    } & DefaultSession["user"];
  }

  /**
   * Augment the User shape returned by the Prisma adapter.
   * This is the object passed as `user` in the session callback.
   */
  interface User {
    role: UserRole;
  }
}
