/**
 * /maintenance — Maintenance requests list page.
 *
 * Server Component: authenticates, resolves building context, fetches initial
 * requests list, checks permissions, then defers to MaintenanceClient.
 *
 * URL: /maintenance?building=<buildingId>
 *
 * Security: list fetch is only performed when a valid buildingId is present.
 * The user must have maintenance:read, which requireAuth() + the API layer
 * enforces. Server permission check gates canCreate.
 */

import { redirect }             from "next/navigation";
import { requireAuth }          from "@/lib/auth-helpers";
import { serverHasPermission }  from "@/lib/permissions";
import { db }                   from "@/lib/db";
import { getMaintenanceVisibilityScope } from "@/lib/maintenance-access";
import { MaintenanceClient }    from "@/components/maintenance/MaintenanceClient";

interface Props {
  searchParams: { building?: string };
}

export const metadata = { title: "Maintenance — StrataFlow" };

export default async function MaintenancePage({ searchParams }: Props) {
  const user       = await requireAuth();
  const buildingId = searchParams.building;

  // Resolve buildings the user has access to (via council membership or lot)
  const buildings = await db.building.findMany({
    where: {
      OR: [
        { councilMemberships: { some: { userId: user.id, isActive: true } } },
        { strataLots: { some: { OR: [{ ownerId: user.id }, { tenantId: user.id }] } } },
      ],
    },
    select:  { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Auto-redirect if the user is in exactly one building
  if (!buildingId && buildings.length === 1) {
    redirect(`/maintenance?building=${buildings[0].id}`);
  }

  // Apply the same row-level visibility rule used in the API routes.
  // Owners/tenants without a council seat see only their own requests.
  const visibilityScope = buildingId
    ? await getMaintenanceVisibilityScope(user.id, user.role, buildingId)
    : {};

  // Fetch initial request list only when a building is selected
  const initialRequests = buildingId
    ? await db.maintenanceRequest.findMany({
        where:   { buildingId, ...visibilityScope },
        orderBy: { createdAt: "desc" },
        select: {
          id:                 true,
          title:              true,
          category:           true,
          priority:           true,
          status:             true,
          lotId:              true,
          createdAt:          true,
          updatedAt:          true,
          resolvedAt:         true,
          closedAt:           true,
          estimatedCostCents: true,
          createdBy:  { select: { id: true, name: true, image: true } },
          assignedTo: { select: { id: true, name: true, image: true } },
          lot:        { select: { id: true, unitNumber: true } },
        },
      })
    : [];

  const canCreate = buildingId
    ? await serverHasPermission("maintenance:create", buildingId)
    : false;

  return (
    <MaintenanceClient
      buildings={buildings}
      initialRequests={initialRequests}
      selectedBuildingId={buildingId}
      canCreate={canCreate}
    />
  );
}
