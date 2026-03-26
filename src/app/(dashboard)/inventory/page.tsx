/**
 * /inventory — Inventory list page.
 *
 * Server Component: authenticates, resolves building context, fetches inventory
 * items, checks permissions, then defers to InventoryClient.
 *
 * URL: /inventory?building=<buildingId>
 *
 * Security: buildingId from searchParams is validated against the user's
 * accessible buildings before any DB fetch. An unaccessible buildingId
 * triggers a redirect, not a 403, to avoid leaking whether a building exists.
 *
 * Visibility: all items (active + inactive) are loaded SSR so the client-side
 * "Show inactive" toggle works without a second fetch. Non-managers never see
 * the toggle, so inactive items stay hidden for them in the UI.
 */

import { redirect }           from "next/navigation";
import { requireAuth }        from "@/lib/auth-helpers";
import { serverHasPermission } from "@/lib/permissions";
import { db }                 from "@/lib/db";
import { InventoryClient }    from "@/components/inventory/InventoryClient";
import { inventoryListSelect } from "@/app/api/buildings/[buildingId]/inventory/route";

interface Props {
  searchParams: { building?: string };
}

export const metadata = { title: "Inventory — StrataFlow" };

export default async function InventoryPage({ searchParams }: Props) {
  const user       = await requireAuth();
  const buildingId = searchParams.building;

  // Resolve buildings this user can access.
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

  // Auto-redirect to the sole building.
  if (!buildingId && buildings.length === 1) {
    redirect(`/inventory?building=${buildings[0].id}`);
  }

  // ── Security: validate buildingId against user's accessible buildings ───────
  // A user who manually crafts ?building=<foreign-id> must not receive data for
  // a building they don't belong to. If the supplied id is not in the accessible
  // set, strip it and show the building-selector UI instead.
  const validatedBuildingId =
    buildingId && buildings.some((b) => b.id === buildingId) ? buildingId : null;

  if (buildingId && !validatedBuildingId) {
    // Redirect to the selector rather than 403 to avoid leaking building existence.
    redirect("/inventory");
  }

  // Load ALL items (active + inactive) so the client "Show inactive" toggle works.
  // The toggle is only rendered for canManage users; non-managers never see it,
  // so inactive items remain hidden for them by the default client-side filter.
  const [items, canManage] = await Promise.all([
    validatedBuildingId
      ? db.inventoryItem.findMany({
          where:   { buildingId: validatedBuildingId },
          orderBy: { name: "asc" },
          select:  inventoryListSelect,
        })
      : Promise.resolve([]),
    validatedBuildingId
      ? serverHasPermission("inventory:manage", validatedBuildingId)
      : Promise.resolve(false),
  ]);

  return (
    <InventoryClient
      buildings={buildings}
      buildingId={validatedBuildingId}
      initialItems={items}
      canManage={canManage}
    />
  );
}
