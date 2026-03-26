/**
 * StrataFlow — Prisma Seed Script
 *
 * Creates:
 *   • 3 users  (admin, owner/council-member, tenant)
 *   • 1 building
 *   • 2 strata lots
 *   • 1 council membership
 *   • All permissions + role grants (idempotent via upsert)
 *   • 1 meeting with 3 agenda items
 *   • 1 document (building bylaw)
 *   • 1 maintenance request (open, high priority)
 *   • 1 invoice (strata fee, issued)
 *   • 1 notification (meeting reminder for bob)
 *   • 1 inventory item (common area bulbs)
 *   • 1 vote (roof repair motion, draft)
 *
 * Run: pnpm db:seed   (or: npx tsx prisma/seed.ts)
 * Idempotent: uses upsert throughout — safe to re-run.
 */

import {
  PrismaClient,
  UserRole, CouncilRole,
  MeetingType, MeetingStatus, AgendaItemStatus,
  DocumentCategory,
  MaintenanceStatus, MaintenancePriority, MaintenanceCategory,
  InvoiceType, InvoiceStatus,
  NotificationType, NotificationChannel,
  InventoryCategory,
  VoteStatus, VoteEligibility, VoteQuorumType,
} from "@prisma/client";
import { nanoid } from "nanoid";
import { PERMISSIONS, ROLE_GRANTS } from "./permission-definitions";

const db = new PrismaClient();

function log(msg: string) {
  console.log(`  ✓ ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱  Seeding StrataFlow database…\n");

  // ── 1. Users ────────────────────────────────────────────────────────────────

  const alice = await db.user.upsert({
    where:  { email: "alice@strataflow.dev" },
    update: {},
    create: {
      name:          "Alice Nakamura",
      email:         "alice@strataflow.dev",
      emailVerified: new Date(),
      role:          UserRole.admin,
      phone:         "+1-604-555-0101",
      bio:           "Platform administrator and property manager.",
      isActive:      true,
    },
  });
  log(`User: ${alice.name} (${alice.role})`);

  const bob = await db.user.upsert({
    where:  { email: "bob@strataflow.dev" },
    update: {},
    create: {
      name:          "Bob Okafor",
      email:         "bob@strataflow.dev",
      emailVerified: new Date(),
      role:          UserRole.council_member,
      phone:         "+1-604-555-0202",
      isActive:      true,
    },
  });
  log(`User: ${bob.name} (${bob.role})`);

  const carol = await db.user.upsert({
    where:  { email: "carol@strataflow.dev" },
    update: {},
    create: {
      name:          "Carol Bergström",
      email:         "carol@strataflow.dev",
      emailVerified: new Date(),
      role:          UserRole.tenant,
      phone:         "+1-604-555-0303",
      isActive:      true,
    },
  });
  log(`User: ${carol.name} (${carol.role})`);

  // ── 2. Building ─────────────────────────────────────────────────────────────

  const building = await db.building.upsert({
    where:  { strataNumber: "BCS-4201" },
    update: {},
    create: {
      name:         "Parkview Place — BCS-4201",
      strataNumber: "BCS-4201",
      address:      "1200 Burrard Street",
      city:         "Vancouver",
      province:     "BC",
      postalCode:   "V6Z 1Z5",
      country:      "CA",
      timezone:     "America/Vancouver",
      currency:     "CAD",
      totalUnits:   24,
      yearBuilt:    2008,
      website:      "https://parkviewplace.example.com",
      isActive:     true,
    },
  });
  log(`Building: ${building.name} (${building.totalUnits} units)`);

  // ── 3. Strata Lots ──────────────────────────────────────────────────────────

  const lot101 = await db.strataLot.upsert({
    where:  { buildingId_unitNumber: { buildingId: building.id, unitNumber: "101" } },
    update: {},
    create: {
      buildingId:      building.id,
      unitNumber:      "101",
      floor:           1,
      bedrooms:        2,
      bathrooms:       1.0,
      squareFeet:      820,
      unitEntitlement: 68,
      parkingSpots:    1,
      storageLockers:  1,
      ownerId:         bob.id,
      tenantId:        null,
      isActive:        true,
    },
  });
  log(`Lot: Unit ${lot101.unitNumber} — owner: ${bob.name}, tenant: none`);

  const lot202 = await db.strataLot.upsert({
    where:  { buildingId_unitNumber: { buildingId: building.id, unitNumber: "202" } },
    update: {},
    create: {
      buildingId:      building.id,
      unitNumber:      "202",
      floor:           2,
      bedrooms:        1,
      bathrooms:       1.0,
      squareFeet:      610,
      unitEntitlement: 51,
      parkingSpots:    1,
      storageLockers:  0,
      ownerId:         alice.id,
      tenantId:        carol.id,
      isActive:        true,
    },
  });
  log(`Lot: Unit ${lot202.unitNumber} — owner: ${alice.name}, tenant: ${carol.name}`);

  // ── 4. Council Membership ───────────────────────────────────────────────────

  const existingMembership = await db.councilMembership.findFirst({
    where: { userId: bob.id, buildingId: building.id, isActive: true },
  });

  if (!existingMembership) {
    const membership = await db.councilMembership.create({
      data: {
        userId:     bob.id,
        buildingId: building.id,
        role:       CouncilRole.president,
        termStart:  new Date("2024-01-15"),
        termEnd:    null,
        isActive:   true,
        notes:      "Elected at 2024 AGM.",
      },
    });
    log(
      `Council: ${bob.name} → ${membership.role} of ${building.name}` +
      ` (since ${membership.termStart.toISOString().slice(0, 10)})`,
    );
  } else {
    log(`Council: ${bob.name} already has an active seat — skipped`);
  }

  // ── 5. Permissions ──────────────────────────────────────────────────────────
  // Upsert on `key` — safe to re-run if description or scope changes.

  console.log("\n  Seeding permissions…");
  let permCount = 0;

  for (const def of PERMISSIONS) {
    await db.permission.upsert({
      where:  { key: def.key },
      update: {
        resource:    def.resource,
        action:      def.action,
        scope:       def.scope,
        description: def.description,
      },
      create: {
        key:         def.key,
        resource:    def.resource,
        action:      def.action,
        scope:       def.scope,
        description: def.description,
      },
    });
    permCount++;
  }
  log(`Permissions upserted: ${permCount}`);

  // ── 6. Role Grants ──────────────────────────────────────────────────────────
  // Each grant links a permission key to either a UserRole or CouncilRole.
  // We look up the permission id by key, then upsert the RolePermission row.
  // Unique constraints on (permissionId, systemRole) and (permissionId, councilRole)
  // mean duplicate grants are silently ignored on re-run.

  console.log("\n  Seeding role grants…");

  // Build key→id map in one query
  const permissionMap = new Map(
    (await db.permission.findMany({ select: { id: true, key: true } }))
      .map((p) => [p.key, p.id]),
  );

  let grantCount = 0;
  let skipped    = 0;

  for (const grant of ROLE_GRANTS) {
    const permissionId = permissionMap.get(grant.permissionKey);
    if (!permissionId) {
      console.warn(`  ⚠ Unknown permission key in grants: "${grant.permissionKey}" — skipped`);
      skipped++;
      continue;
    }

    // Build the where clause for the relevant unique index
    const where = grant.systemRole
      ? { permissionId_systemRole: { permissionId, systemRole: grant.systemRole } }
      : { permissionId_councilRole: { permissionId, councilRole: grant.councilRole! } };

    await db.rolePermission.upsert({
      where,
      update: {},
      create: {
        permissionId,
        systemRole:  grant.systemRole  ?? null,
        councilRole: grant.councilRole ?? null,
      },
    });
    grantCount++;
  }

  if (skipped > 0) log(`Role grants with unknown keys skipped: ${skipped}`);
  log(`Role grants upserted: ${grantCount}`);

  // ── 7. Meeting + Agenda Items ────────────────────────────────────────────────
  // One upcoming council meeting with 3 agenda items.
  // Idempotent: find-or-create keyed on title + buildingId + scheduledAt.

  console.log("\n  Seeding meeting…");

  const meetingDate = new Date("2025-05-20T18:00:00-07:00");

  let meeting = await db.meeting.findFirst({
    where: { buildingId: building.id, title: "May 2025 Council Meeting" },
  });

  if (!meeting) {
    meeting = await db.meeting.create({
      data: {
        buildingId:  building.id,
        title:       "May 2025 Council Meeting",
        type:        MeetingType.council,
        status:      MeetingStatus.scheduled,
        scheduledAt: meetingDate,
        location:    "Parkview Place — Amenity Room, Level 1",
        quorum:      3,
        createdById: bob.id,
        agendaItems: {
          create: [
            {
              sortOrder:   0,
              title:       "Call to order & quorum confirmation",
              status:      AgendaItemStatus.pending,
              durationMins: 5,
            },
            {
              sortOrder:   1,
              title:       "Approval of April 2025 meeting minutes",
              status:      AgendaItemStatus.pending,
              durationMins: 10,
            },
            {
              sortOrder:   2,
              title:       "Roof repair contractor selection",
              description: "Review three quotes for flat roof remediation on Levels 4–6.",
              status:      AgendaItemStatus.pending,
              durationMins: 30,
              presenter:   "Bob Okafor",
            },
          ],
        },
      },
    });
    log(`Meeting: "${meeting.title}" on ${meetingDate.toDateString()} (${meeting.status})`);
  } else {
    log(`Meeting: "${meeting.title}" already exists — skipped`);
  }

  // ── 8. Document ──────────────────────────────────────────────────────────────
  // One current bylaw document for the building.
  // groupId is generated fresh; re-running will create a second group if the
  // record was deleted. For idempotency we key on buildingId + title + version.

  console.log("\n  Seeding document…");

  const existingDoc = await db.document.findFirst({
    where: { buildingId: building.id, title: "Strata Bylaws — Parkview Place", version: 1 },
  });

  if (!existingDoc) {
    const doc = await db.document.create({
      data: {
        buildingId:       building.id,
        title:            "Strata Bylaws — Parkview Place",
        description:      "Consolidated bylaws as amended at the 2024 AGM.",
        category:         DocumentCategory.bylaw,
        groupId:          nanoid(),       // unique chain identifier
        version:          1,
        isCurrentVersion: true,
        s3Key:            "buildings/bcs-4201/bylaws/strata-bylaws-v1.pdf",
        sizeBytes:        245_760,        // ~240 KB placeholder
        mimeType:         "application/pdf",
        isPublic:         true,           // visible to all members including tenants
        uploadedById:     alice.id,
      },
    });
    log(`Document: "${doc.title}" v${doc.version} (${doc.category}, public=${doc.isPublic})`);
  } else {
    log(`Document: "${existingDoc.title}" already exists — skipped`);
  }

  // ── 9. Maintenance Request ───────────────────────────────────────────────────
  // One open high-priority request for Unit 101 (lobby intercom fault).

  console.log("\n  Seeding maintenance request…");

  const existingRequest = await db.maintenanceRequest.findFirst({
    where: { buildingId: building.id, title: "Lobby intercom not working — Unit 101" },
  });

  if (!existingRequest) {
    const request = await db.maintenanceRequest.create({
      data: {
        buildingId:   building.id,
        lotId:        lot101.id,
        title:        "Lobby intercom not working — Unit 101",
        description:  "The intercom panel in the lobby is unresponsive for Unit 101. Tenants cannot buzz in visitors. Issue started 2025-03-20.",
        category:     MaintenanceCategory.security,
        priority:     MaintenancePriority.high,
        status:       MaintenanceStatus.open,
        createdById:  bob.id,
        assignedToId: null,
        attachmentKeys: [],
      },
    });
    log(`Maintenance: "${request.title}" (${request.priority} / ${request.status})`);
  } else {
    log(`Maintenance: "${existingRequest.title}" already exists — skipped`);
  }

  // ── 10. Invoice ──────────────────────────────────────────────────────────────
  // April 2025 strata fee invoice for Bob (Unit 101 owner).
  // Idempotent: keyed on issuedToId + type + periodStart.

  console.log("\n  Seeding invoice…");

  const periodStart = new Date("2025-04-01T00:00:00Z");
  const periodEnd   = new Date("2025-04-30T23:59:59Z");
  const dueDate     = new Date("2025-04-15T00:00:00Z");

  const existingInvoice = await db.invoice.findFirst({
    where: {
      issuedToId:  bob.id,
      buildingId:  building.id,
      type:        InvoiceType.strata_fee,
      periodStart,
    },
  });

  if (!existingInvoice) {
    const invoice = await db.invoice.create({
      data: {
        buildingId:   building.id,
        lotId:        lot101.id,
        issuedToId:   bob.id,
        createdById:  alice.id,
        type:         InvoiceType.strata_fee,
        status:       InvoiceStatus.issued,
        description:  "April 2025 monthly strata fee — Unit 101",
        amountCents:  45000,   // $450.00 CAD
        paidCents:    0,
        dueDate,
        issuedAt:     new Date("2025-03-25T00:00:00Z"),
        periodStart,
        periodEnd,
      },
    });
    log(
      `Invoice: "${invoice.description}" ` +
      `$${(invoice.amountCents / 100).toFixed(2)} due ${dueDate.toDateString()} (${invoice.status})`,
    );
  } else {
    log(`Invoice: April strata fee for ${bob.name} already exists — skipped`);
  }

  // ── 11. Notification ────────────────────────────────────────────────────────
  // One in-app meeting reminder for Bob — linked to the seeded meeting.

  console.log("\n  Seeding notification…");

  const existingNotif = await db.notification.findFirst({
    where: { userId: bob.id, type: NotificationType.meeting_reminder },
  });

  if (!existingNotif) {
    const notif = await db.notification.create({
      data: {
        userId:     bob.id,
        buildingId: building.id,
        type:       NotificationType.meeting_reminder,
        channel:    NotificationChannel.in_app,
        title:      "Upcoming: May 2025 Council Meeting",
        message:    "You have a council meeting scheduled for May 20, 2025 at 6:00 PM in the Amenity Room.",
        metadata:   {
          resourceType: "meeting",
          resourceId:   meeting.id,
          href:         `/buildings/${building.id}/meetings/${meeting.id}`,
          buildingId:   building.id,
        },
      },
    });
    log(`Notification: "${notif.title}" → ${bob.name} (${notif.channel})`);
  } else {
    log(`Notification: meeting reminder for ${bob.name} already exists — skipped`);
  }

  // ── 12. Inventory Item ───────────────────────────────────────────────────────
  // Common area LED bulbs — below reorder threshold to demonstrate low-stock.

  console.log("\n  Seeding inventory item…");

  const existingItem = await db.inventoryItem.findFirst({
    where: { buildingId: building.id, name: "LED Bulbs — E26 10W (Common Area)" },
  });

  if (!existingItem) {
    const item = await db.inventoryItem.create({
      data: {
        buildingId:        building.id,
        name:              "LED Bulbs — E26 10W (Common Area)",
        description:       "Standard E26 base, 10W, 800 lumen warm white, for hallway and lobby fixtures.",
        category:          InventoryCategory.electrical,
        sku:               "LED-E26-10W-WW",
        unit:              "each",
        quantityOnHand:    4,
        lowStockThreshold: 6,    // triggers low_stock notification at ≤5
        reorderQuantity:   24,
        unitCostCents:     349,  // $3.49 CAD per bulb
        supplier:          "Grainger Canada",
        location:          "B1 Storage Room — Shelf 1",
        isActive:          true,
        createdById:       alice.id,
      },
    });
    log(
      `Inventory: "${item.name}" — qty: ${item.quantityOnHand} ` +
      `(threshold: ${item.lowStockThreshold}) [LOW STOCK]`,
    );
  } else {
    log(`Inventory: "${existingItem.name}" already exists — skipped`);
  }

  // ── 13. Vote ─────────────────────────────────────────────────────────────────
  // Draft motion to select the roof repair contractor.

  console.log("\n  Seeding vote…");

  const existingVote = await db.vote.findFirst({
    where: { buildingId: building.id, title: "Roof Repair Contractor Selection" },
  });

  if (!existingVote) {
    const vote = await db.vote.create({
      data: {
        buildingId:   building.id,
        title:        "Roof Repair Contractor Selection",
        description:  "Council motion to approve ABC Roofing Ltd. for the Level 4–6 flat roof remediation project at a cost not to exceed $45,000.",
        status:       VoteStatus.draft,
        anonymous:    false,
        eligibility:  VoteEligibility.council_only,
        quorumType:   VoteQuorumType.simple_majority,
        opensAt:      new Date("2025-05-20T18:30:00-07:00"),  // during the council meeting
        closesAt:     new Date("2025-05-20T19:00:00-07:00"),
        createdById:  bob.id,
        options: {
          create: [
            { sortOrder: 0, label: "In favour",  description: "Approve ABC Roofing Ltd. as selected contractor" },
            { sortOrder: 1, label: "Against",    description: "Reject the motion; request additional quotes"    },
            { sortOrder: 2, label: "Abstain",    description: "No vote recorded"                                },
          ],
        },
      },
      include: { options: true },
    });
    log(
      `Vote: "${vote.title}" — ${vote.options.length} options, ` +
      `opens ${vote.opensAt.toISOString().slice(0, 10)} (${vote.status})`,
    );
  } else {
    log(`Vote: "${existingVote.title}" already exists — skipped`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  const counts = await Promise.all([
    db.user.count(),
    db.building.count(),
    db.strataLot.count(),
    db.councilMembership.count(),
    db.permission.count(),
    db.rolePermission.count(),
    db.meeting.count(),
    db.agendaItem.count(),
    db.document.count(),
    db.maintenanceRequest.count(),
    db.invoice.count(),
    db.notification.count(),
    db.inventoryItem.count(),
    db.vote.count(),
    db.voteOption.count(),
  ]);

  console.log(`
┌─────────────────────────────────────────┐
│  Seed complete — Phase 2 full           │
│  Users              : ${String(counts[0]).padEnd(17)}│
│  Buildings          : ${String(counts[1]).padEnd(17)}│
│  Strata Lots        : ${String(counts[2]).padEnd(17)}│
│  Council Memberships: ${String(counts[3]).padEnd(17)}│
│  Permissions        : ${String(counts[4]).padEnd(17)}│
│  Role Grants        : ${String(counts[5]).padEnd(17)}│
│  Meetings           : ${String(counts[6]).padEnd(17)}│
│  Agenda Items       : ${String(counts[7]).padEnd(17)}│
│  Documents          : ${String(counts[8]).padEnd(17)}│
│  Maintenance Reqs   : ${String(counts[9]).padEnd(17)}│
│  Invoices           : ${String(counts[10]).padEnd(17)}│
│  Notifications      : ${String(counts[11]).padEnd(17)}│
│  Inventory Items    : ${String(counts[12]).padEnd(17)}│
│  Votes              : ${String(counts[13]).padEnd(17)}│
│  Vote Options       : ${String(counts[14]).padEnd(17)}│
└─────────────────────────────────────────┘
`);
}

main()
  .catch((err) => {
    console.error("\n❌  Seed failed:\n", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
