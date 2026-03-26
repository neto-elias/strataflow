/**
 * /api/buildings/[buildingId]/members
 *
 * GET — List all strata lots in the building with their owner, current tenant,
 *       and active council roles.
 *       Requires: member:read
 *
 * Read-only endpoint: no mutation, no audit log entry needed.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { db }                from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { parseQuery }        from "@/lib/validate";
import { ok, serverError }   from "@/lib/api-response";

// ─── Schema ───────────────────────────────────────────────────────────────────

const ListMembersQuerySchema = z.object({
  /**
   * "all"     → lots with any occupancy state (default)
   * "council" → council roster only (skips lot listing)
   */
  view: z.enum(["all", "council"]).default("all"),
});

// ─── GET /api/buildings/[buildingId]/members ──────────────────────────────────

export const GET = requirePermission("member:read", {
  buildingIdSource: "param",
})(async (req: NextRequest, { params }) => {
  const { buildingId } = params;

  const qParse = parseQuery(req.nextUrl.searchParams, ListMembersQuerySchema);
  if (!qParse.success) return qParse.response;
  const { view } = qParse.data;

  try {
    // Active council members (always included)
    const council = await db.councilMembership.findMany({
      where:   { buildingId, isActive: true },
      orderBy: { role: "asc" },
      select: {
        id:        true,
        role:      true,
        startDate: true,
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    if (view === "council") {
      return ok({ council });
    }

    // All lots with owner and tenant
    const lots = await db.strataLot.findMany({
      where:   { buildingId },
      orderBy: { unitNumber: "asc" },
      select: {
        id:         true,
        unitNumber: true,
        floor:      true,
        owner: {
          select: { id: true, name: true, email: true, image: true },
        },
        tenant: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return ok({ lots, council });
  } catch (err) {
    console.error("[members/GET]", err);
    return serverError();
  }
});
