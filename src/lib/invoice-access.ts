/**
 * Invoice visibility scoping.
 *
 * SINGLE SOURCE OF TRUTH for which invoices a user may read.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VISIBILITY RULE                                                         │
 * ├──────────────────────────────┬──────────────────────────────────────────┤
 * │ CAN SEE ALL building invoices│ admin (platform)                        │
 * │                              │ manager (platform)                      │
 * │                              │ any user with an active CouncilMembership│
 * │                              │ for this building (any CouncilRole)     │
 * ├──────────────────────────────┬──────────────────────────────────────────┤
 * │ CAN SEE ONLY OWN invoices    │ owner (no council seat in building)     │
 * │                              │ tenant (no council seat in building)    │
 * │                              │ council_member system-role without an   │
 * │                              │ active membership in THIS building       │
 * └──────────────────────────────┴──────────────────────────────────────────┘
 *
 * "Own" invoices = invoices where issuedToId matches the user's id.
 *
 * Usage: spread the returned object into a Prisma `where` clause alongside
 * the `buildingId` filter. The empty object case {} adds no restriction.
 *
 * @example
 * const scope = await getInvoiceVisibilityScope(user.id, user.role, buildingId);
 * const invoices = await db.invoice.findMany({
 *   where: { buildingId, ...scope },
 * });
 */

import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";

/** Spread into any `where` clause alongside `buildingId`. */
export type InvoiceVisibilityScope =
  | Record<string, never>    // {} — no restriction, all building invoices visible
  | { issuedToId: string };  // own invoices only

export async function getInvoiceVisibilityScope(
  userId:     string,
  userRole:   UserRole,
  buildingId: string,
): Promise<InvoiceVisibilityScope> {
  // Admins and managers have full platform visibility.
  if (userRole === UserRole.admin || userRole === UserRole.manager) {
    return {};
  }

  // Any active council member for this building sees all invoices — they need
  // visibility to manage strata finances on behalf of the corporation.
  const membership = await db.councilMembership.findFirst({
    where: { userId, buildingId, isActive: true },
    select: { id: true },
  });

  if (membership) {
    return {};
  }

  // Everyone else may only view invoices issued directly to them.
  return { issuedToId: userId };
}
