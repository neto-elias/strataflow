/**
 * Maintenance request visibility scoping.
 *
 * SINGLE SOURCE OF TRUTH for which maintenance requests a user may read.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VISIBILITY RULE                                                         │
 * ├──────────────────────────────┬──────────────────────────────────────────┤
 * │ CAN SEE ALL building requests│ admin (platform)                        │
 * │                              │ manager (platform)                      │
 * │                              │ any user with an active CouncilMembership│
 * │                              │ for this building (any CouncilRole)     │
 * ├──────────────────────────────┬──────────────────────────────────────────┤
 * │ CAN SEE ONLY OWN requests    │ owner (no council seat in building)     │
 * │                              │ tenant (no council seat in building)    │
 * │                              │ council_member (system role) without an │
 * │                              │ active membership in THIS building       │
 * └──────────────────────────────┴──────────────────────────────────────────┘
 *
 * Usage: spread the returned object into a Prisma `where` clause alongside
 * the `buildingId` filter. The empty object case {} adds no restriction.
 *
 * @example
 * const scope = await getMaintenanceVisibilityScope(user.id, user.role, buildingId);
 * const requests = await db.maintenanceRequest.findMany({
 *   where: { buildingId, ...scope },
 * });
 */

import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";

/** Spread into any `where` clause alongside `buildingId`. */
export type MaintenanceVisibilityScope =
  | Record<string, never>    // {} — no restriction, all building requests visible
  | { createdById: string }; // own requests only

export async function getMaintenanceVisibilityScope(
  userId:     string,
  userRole:   UserRole,
  buildingId: string,
): Promise<MaintenanceVisibilityScope> {
  // Admins and managers have full platform visibility — no restriction needed.
  if (userRole === UserRole.admin || userRole === UserRole.manager) {
    return {};
  }

  // Any active council member for this specific building has full visibility,
  // regardless of which CouncilRole they hold.
  const membership = await db.councilMembership.findFirst({
    where: { userId, buildingId, isActive: true },
    select: { id: true },
  });

  if (membership) {
    return {};
  }

  // Everyone else — owner, tenant, or a council_member system-role user who
  // does not hold a seat in this particular building — may only see the
  // requests they submitted themselves.
  return { createdById: userId };
}

// ─── Assignee eligibility ─────────────────────────────────────────────────────

/**
 * Returns whether a given user is eligible to be assigned to maintenance
 * requests in a building.
 *
 * Eligible:
 *   • UserRole.admin or UserRole.manager (platform-wide staff)
 *   • Any user with an active CouncilMembership in the building
 *
 * Does NOT require the assignee to have maintenance:assign themselves —
 * contractors or building staff are modelled as council members or managers.
 */
export async function isEligibleAssignee(
  assigneeId:  string,
  buildingId:  string,
): Promise<boolean> {
  const match = await db.user.findFirst({
    where: {
      id: assigneeId,
      OR: [
        { role: UserRole.admin   },
        { role: UserRole.manager },
        {
          councilMemberships: {
            some: { buildingId, isActive: true },
          },
        },
      ],
    },
    select: { id: true },
  });

  return match !== null;
}
