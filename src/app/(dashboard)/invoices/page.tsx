/**
 * /invoices — Invoice list page.
 *
 * Server Component: authenticates, resolves building context, fetches initial
 * invoice list, checks permissions, then defers to InvoicesClient.
 *
 * URL: /invoices?building=<buildingId>
 *
 * Security: list fetch only performed when a valid buildingId is present.
 * Row-level visibility scoping applied via getInvoiceVisibilityScope().
 */

import { redirect }             from "next/navigation";
import { requireAuth }          from "@/lib/auth-helpers";
import { serverHasPermission }  from "@/lib/permissions";
import { db }                   from "@/lib/db";
import { getInvoiceVisibilityScope } from "@/lib/invoice-access";
import { InvoicesClient }       from "@/components/invoices/InvoicesClient";

interface Props {
  searchParams: { building?: string };
}

export const metadata = { title: "Invoices — StrataFlow" };

export default async function InvoicesPage({ searchParams }: Props) {
  const user       = await requireAuth();
  const buildingId = searchParams.building;

  // Resolve buildings the user has access to
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

  // Auto-redirect single-building users
  if (!buildingId && buildings.length === 1) {
    redirect(`/invoices?building=${buildings[0].id}`);
  }

  const visibilityScope = buildingId
    ? await getInvoiceVisibilityScope(user.id, user.role, buildingId)
    : {};

  const initialInvoices = buildingId
    ? await db.invoice.findMany({
        where:   { buildingId, ...visibilityScope },
        orderBy: { createdAt: "desc" },
        select: {
          id:          true,
          buildingId:  true,
          lotId:       true,
          type:        true,
          status:      true,
          description: true,
          amountCents: true,
          paidCents:   true,
          dueDate:     true,
          issuedAt:    true,
          createdAt:   true,
          updatedAt:   true,
          issuedTo: { select: { id: true, name: true, email: true, image: true } },
          createdBy: { select: { id: true, name: true, image: true } },
          lot:       { select: { id: true, unitNumber: true } },
        },
      })
    : [];

  const canCreate = buildingId
    ? await serverHasPermission("payment:create", buildingId)
    : false;

  // Build list of users eligible to be recipients (visible to those who can create)
  const eligibleRecipients = canCreate && buildingId
    ? await db.user.findMany({
        where: {
          OR: [
            { ownedLots:  { some: { buildingId } } },
            { tenantLots: { some: { buildingId } } },
          ],
        },
        select:  { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  const lots = canCreate && buildingId
    ? await db.strataLot.findMany({
        where:   { buildingId, isActive: true },
        select:  { id: true, unitNumber: true },
        orderBy: { unitNumber: "asc" },
      })
    : [];

  return (
    <InvoicesClient
      buildings={buildings}
      initialInvoices={initialInvoices}
      selectedBuildingId={buildingId}
      canCreate={canCreate}
      eligibleRecipients={eligibleRecipients}
      lots={lots}
    />
  );
}
