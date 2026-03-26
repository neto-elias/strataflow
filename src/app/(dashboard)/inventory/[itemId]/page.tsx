/**
 * /inventory/[itemId] — Inventory item detail page.
 *
 * Server Component: fetches item + recent transaction history, checks
 * permissions, then defers to InventoryDetailClient.
 *
 * URL: /inventory/<itemId>?building=<buildingId>
 *
 * Security: buildingId from searchParams is validated against the user's
 * accessible buildings before any DB fetch. A missing or unauthorised
 * buildingId returns 404 rather than a redirect to avoid leaking item
 * existence across buildings.
 */

import { redirect, notFound } from "next/navigation";
import { requireAuth }        from "@/lib/auth-helpers";
import { serverHasPermission } from "@/lib/permissions";
import { db }                 from "@/lib/db";
import { InventoryDetailClient } from "@/components/inventory/InventoryDetailClient";
import { inventoryListSelect } from "@/app/api/buildings/[buildingId]/inventory/route";
import { transactionSelect }   from "@/app/api/buildings/[buildingId]/inventory/[itemId]/transactions/route";

interface Props {
  params:       { itemId: string };
  searchParams: { building?: string };
}

/** Helper: confirm the user has access to this specific building. */
async function assertBuildingAccess(userId: string, buildingId: string): Promise<boolean> {
  const match = await db.building.findFirst({
    where: {
      id: buildingId,
      OR: [
        { councilMemberships: { some: { userId, isActive: true } } },
        { strataLots: { some: { OR: [{ ownerId: userId }, { tenantId: userId }] } } },
      ],
    },
    select: { id: true },
  });
  return match !== null;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const buildingId = searchParams.building;
  if (!buildingId) return { title: "Inventory — StrataFlow" };

  const item = await db.inventoryItem.findFirst({
    where:  { id: params.itemId, buildingId },
    select: { name: true },
  });

  return { title: item ? `${item.name} — Inventory — StrataFlow` : "Inventory — StrataFlow" };
}

export default async function InventoryItemPage({ params, searchParams }: Props) {
  const user       = await requireAuth();
  const buildingId = searchParams.building;

  if (!buildingId) redirect("/inventory");

  // ── Security: verify this user can access the supplied buildingId ───────────
  // Using notFound() rather than redirect so that an attacker probing a known
  // itemId + unknown buildingId gets the same 404 as an invalid itemId,
  // giving no information about building existence or item cross-building state.
  const hasAccess = await assertBuildingAccess(user.id, buildingId);
  if (!hasAccess) notFound();

  const [item, transactions, canManage] = await Promise.all([
    db.inventoryItem.findFirst({
      where:  { id: params.itemId, buildingId },
      select: inventoryListSelect,
    }),
    db.stockTransaction.findMany({
      where:   { inventoryItemId: params.itemId, buildingId },
      orderBy: { createdAt: "desc" },
      take:    100,
      select:  transactionSelect,
    }),
    serverHasPermission("inventory:manage", buildingId),
  ]);

  if (!item) notFound();

  return (
    <InventoryDetailClient
      item={item!}
      initialTransactions={transactions}
      canManage={canManage}
      buildingId={buildingId}
    />
  );
}
