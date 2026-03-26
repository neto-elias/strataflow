/**
 * /maintenance/[requestId] — Maintenance request detail page.
 *
 * Security:
 *   - buildingId is mandatory in ?building= query param.
 *   - DB query always scopes by BOTH requestId AND buildingId.
 *   - serverHasPermission("maintenance:read") checked before any data fetch.
 *   - Authenticated users without building access receive notFound().
 */

import { notFound, redirect }      from "next/navigation";
import { requireAuth }             from "@/lib/auth-helpers";
import { serverHasPermission }     from "@/lib/permissions";
import { db }                      from "@/lib/db";
import { getMaintenanceVisibilityScope } from "@/lib/maintenance-access";
import { RequestDetailClient }     from "@/components/maintenance/RequestDetailClient";

interface Props {
  params:       { requestId: string };
  searchParams: { building?: string };
}

export default async function MaintenanceDetailPage({ params, searchParams }: Props) {
  // Single auth call — captures user for both permission checks and scoping.
  const user = await requireAuth();

  const buildingId = searchParams.building;

  if (!buildingId) {
    redirect("/maintenance");
  }

  // Permission check BEFORE any data fetch
  const canRead = await serverHasPermission("maintenance:read", buildingId);
  if (!canRead) notFound();

  // Apply visibility scope: owners/tenants without a council seat in this
  // building receive notFound() when attempting to view another user's request
  // by guessing the ID. Behaviour is identical to a missing record.
  const visibilityScope = await getMaintenanceVisibilityScope(user.id, user.role, buildingId);

  // Always scoped by requestId AND buildingId AND visibility
  const request = await db.maintenanceRequest.findFirst({
    where: { id: params.requestId, buildingId, ...visibilityScope },
    select: {
      id:                 true,
      buildingId:         true,
      lotId:              true,
      title:              true,
      description:        true,
      category:           true,
      priority:           true,
      status:             true,
      internalNotes:      true,
      estimatedCostCents: true,
      actualCostCents:    true,
      attachmentKeys:     true,
      createdAt:          true,
      updatedAt:          true,
      resolvedAt:         true,
      closedAt:           true,
      createdBy:  { select: { id: true, name: true, image: true, email: true } },
      assignedTo: { select: { id: true, name: true, image: true, email: true } },
      lot:        { select: { id: true, unitNumber: true, floor: true } },
    },
  });

  if (!request) notFound();

  // Fetch council members and managers for the assignee selector
  const assignableUsers = await db.user.findMany({
    where: {
      OR: [
        { role: "manager" },
        { role: "admin" },
        {
          councilMemberships: {
            some: { buildingId, isActive: true },
          },
        },
      ],
    },
    select: { id: true, name: true, email: true, image: true },
    orderBy: { name: "asc" },
  });

  // Parallel permission checks
  const [canUpdate, canAssign, canClose] = await Promise.all([
    serverHasPermission("maintenance:update", buildingId),
    serverHasPermission("maintenance:assign", buildingId),
    serverHasPermission("maintenance:close",  buildingId),
  ]);

  return (
    <RequestDetailClient
      request={request}
      assignableUsers={assignableUsers}
      canUpdate={canUpdate}
      canAssign={canAssign}
      canClose={canClose}
    />
  );
}
