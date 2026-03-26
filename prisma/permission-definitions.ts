/**
 * Canonical permission definitions for StrataFlow.
 *
 * This file is the single source of truth for every permission key.
 * It is imported by:
 *   • prisma/seed.ts          — to populate the DB
 *   • src/lib/permissions.ts  — for compile-time key validation
 *   • tests                   — for assertion helpers
 *
 * Format:  "<resource>:<action>"
 * Scope:
 *   "system"   → granted to UserRole values    (platform-wide)
 *   "building" → granted to CouncilRole values (per-building)
 */

import { UserRole, CouncilRole } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

interface PermissionDef {
  key:         string;
  resource:    string;
  action:      string;
  scope:       "system" | "building";
  description: string;
}

interface RoleGrantDef {
  permissionKey: string;
  systemRole?:   UserRole;
  councilRole?:  CouncilRole;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PERMISSION CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════

export const PERMISSIONS: PermissionDef[] = [

  // ── Building ──────────────────────────────────────────────────────────────
  { key: "building:create",       resource: "building", action: "create",       scope: "system",   description: "Create new buildings on the platform" },
  { key: "building:read",         resource: "building", action: "read",         scope: "system",   description: "View building details and summary" },
  { key: "building:update",       resource: "building", action: "update",       scope: "building", description: "Edit building settings and profile" },
  { key: "building:delete",       resource: "building", action: "delete",       scope: "system",   description: "Archive or delete a building (irreversible)" },

  // ── Units / Strata Lots ───────────────────────────────────────────────────
  { key: "unit:create",           resource: "unit", action: "create",           scope: "building", description: "Add a new strata lot to a building" },
  { key: "unit:read",             resource: "unit", action: "read",             scope: "system",   description: "View unit details" },
  { key: "unit:update",           resource: "unit", action: "update",           scope: "building", description: "Edit unit attributes (floor, entitlement, etc.)" },
  { key: "unit:assign_owner",     resource: "unit", action: "assign_owner",     scope: "building", description: "Set or transfer lot ownership" },
  { key: "unit:assign_tenant",    resource: "unit", action: "assign_tenant",    scope: "building", description: "Set or remove a tenant from a lot" },

  // ── Members ───────────────────────────────────────────────────────────────
  { key: "member:invite",         resource: "member", action: "invite",         scope: "building", description: "Send invitations to new members" },
  { key: "member:read",           resource: "member", action: "read",           scope: "system",   description: "View the member directory" },
  { key: "member:update",         resource: "member", action: "update",         scope: "building", description: "Edit member profiles and contact details" },
  { key: "member:remove",         resource: "member", action: "remove",         scope: "building", description: "Remove a member from a building" },
  { key: "member:manage_roles",   resource: "member", action: "manage_roles",   scope: "system",   description: "Change a user's system role (admin only)" },

  // ── Council ───────────────────────────────────────────────────────────────
  { key: "council:read",          resource: "council", action: "read",          scope: "system",   description: "View council composition" },
  { key: "council:manage",        resource: "council", action: "manage",        scope: "building", description: "Assign and remove council seats" },

  // ── Meetings ──────────────────────────────────────────────────────────────
  { key: "meeting:create",        resource: "meeting", action: "create",        scope: "building", description: "Schedule a new meeting" },
  { key: "meeting:read",          resource: "meeting", action: "read",          scope: "system",   description: "View meetings and agenda" },
  { key: "meeting:update",        resource: "meeting", action: "update",        scope: "building", description: "Edit meeting details and agenda items" },
  { key: "meeting:cancel",        resource: "meeting", action: "cancel",        scope: "building", description: "Cancel a scheduled meeting" },
  { key: "meeting:publish_minutes", resource: "meeting", action: "publish_minutes", scope: "building", description: "Publish approved meeting minutes" },

  // ── Documents ─────────────────────────────────────────────────────────────
  { key: "document:upload",       resource: "document", action: "upload",       scope: "building", description: "Upload a new document" },
  { key: "document:read",         resource: "document", action: "read",         scope: "system",   description: "View and download documents" },
  { key: "document:delete",       resource: "document", action: "delete",       scope: "building", description: "Delete a document version" },
  { key: "document:manage_access",resource: "document", action: "manage_access",scope: "building", description: "Set per-document visibility (e.g. council-only)" },

  // ── Maintenance ───────────────────────────────────────────────────────────
  { key: "maintenance:create",    resource: "maintenance", action: "create",    scope: "system",   description: "Submit a new maintenance request" },
  { key: "maintenance:read",      resource: "maintenance", action: "read",      scope: "system",   description: "View maintenance requests" },
  { key: "maintenance:assign",    resource: "maintenance", action: "assign",    scope: "building", description: "Assign a request to a contractor or staff" },
  { key: "maintenance:update",    resource: "maintenance", action: "update",    scope: "building", description: "Update status or notes on a request" },
  { key: "maintenance:close",     resource: "maintenance", action: "close",     scope: "building", description: "Mark a request as resolved or closed" },

  // ── Payments ──────────────────────────────────────────────────────────────
  { key: "payment:create",        resource: "payment", action: "create",        scope: "building", description: "Record a new payment or invoice" },
  { key: "payment:read",          resource: "payment", action: "read",          scope: "system",   description: "View payment records for accessible buildings" },
  { key: "payment:approve",       resource: "payment", action: "approve",       scope: "building", description: "Approve a payment run or purchase request" },
  { key: "payment:export",        resource: "payment", action: "export",        scope: "building", description: "Export financial reports and statements" },

  // ── Inventory ─────────────────────────────────────────────────────────────
  { key: "inventory:read",        resource: "inventory", action: "read",        scope: "system",   description: "View inventory items and stock levels" },
  { key: "inventory:manage",      resource: "inventory", action: "manage",      scope: "building", description: "Add, update, and remove inventory items" },
  { key: "inventory:purchase",    resource: "inventory", action: "purchase",    scope: "building", description: "Submit and approve purchase requests" },

  // ── Votes ─────────────────────────────────────────────────────────────────
  { key: "vote:create",           resource: "vote", action: "create",           scope: "building", description: "Create a new vote or ballot" },
  { key: "vote:read",             resource: "vote", action: "read",             scope: "system",   description: "View open and closed votes" },
  { key: "vote:cast",             resource: "vote", action: "cast",             scope: "system",   description: "Cast a ballot on an open vote" },
  { key: "vote:close",            resource: "vote", action: "close",            scope: "building", description: "Manually close a vote before its end date" },

  // ── Notifications ─────────────────────────────────────────────────────────
  { key: "notification:send",     resource: "notification", action: "send",     scope: "building", description: "Broadcast a notification to building members" },
  { key: "notification:read",     resource: "notification", action: "read",     scope: "system",   description: "View own notifications" },

  // ── Audit Log ─────────────────────────────────────────────────────────────
  { key: "audit:read",            resource: "audit", action: "read",            scope: "system",   description: "View audit log (sensitive — admin/manager only)" },
];

// ═══════════════════════════════════════════════════════════════════════════
// 2. ROLE → PERMISSION GRANTS
// ═══════════════════════════════════════════════════════════════════════════
//
// Rules encoded here:
//   • admin receives ALL permissions (short-circuited in the service layer —
//     no DB lookup needed for admin, but grants are seeded for completeness
//     and for future audit-trail tooling)
//   • System roles are cumulative downward: admin > manager > council_member
//     > owner > tenant in terms of what they can access by default
//   • Building roles (CouncilRole) layer ON TOP of the user's system role —
//     e.g. an owner who is also president gets owner permissions PLUS all
//     president permissions for that building
//   • council_member (UserRole) gets a base set; the actual CouncilRole
//     determines the elevated building-level grants

const systemGrants: Array<{ role: UserRole; keys: string[] }> = [
  {
    role: UserRole.admin,
    keys: PERMISSIONS.map((p) => p.key), // all permissions
  },
  {
    role: UserRole.manager,
    keys: [
      "building:create", "building:read", "building:update",
      "unit:create", "unit:read", "unit:update", "unit:assign_owner", "unit:assign_tenant",
      "member:invite", "member:read", "member:update", "member:remove",
      "council:read", "council:manage",
      "meeting:create", "meeting:read", "meeting:update", "meeting:cancel", "meeting:publish_minutes",
      "document:upload", "document:read", "document:delete", "document:manage_access",
      "maintenance:create", "maintenance:read", "maintenance:assign", "maintenance:update", "maintenance:close",
      "payment:create", "payment:read", "payment:approve", "payment:export",
      "inventory:read", "inventory:manage", "inventory:purchase",
      "vote:create", "vote:read", "vote:cast", "vote:close",
      "notification:send", "notification:read",
      "audit:read",
    ],
  },
  {
    role: UserRole.council_member,
    // Base system grant for any council member (regardless of specific seat).
    // Elevated building-level grants come from CouncilRole below.
    keys: [
      "building:read",
      "unit:read",
      "member:read",
      "council:read",
      "meeting:read",
      "document:read",
      "maintenance:read",
      "payment:read",
      "inventory:read",
      "vote:read", "vote:cast",
      "notification:read",
    ],
  },
  {
    role: UserRole.owner,
    keys: [
      "building:read",
      "unit:read",
      "member:read",
      "council:read",
      "meeting:read",
      "document:read",
      "maintenance:create", "maintenance:read",
      "payment:read",
      "inventory:read",
      "vote:read", "vote:cast",
      "notification:read",
    ],
  },
  {
    role: UserRole.tenant,
    keys: [
      "building:read",
      "unit:read",
      "member:read",
      "meeting:read",
      "document:read",          // shared/public docs only — enforced at service layer
      "maintenance:create", "maintenance:read",
      "vote:read",              // can view but not cast by default — eligibility at service layer
      "notification:read",
    ],
  },
];

const buildingGrants: Array<{ role: CouncilRole; keys: string[] }> = [
  {
    role: CouncilRole.president,
    keys: [
      "building:update",
      "unit:create", "unit:update", "unit:assign_owner", "unit:assign_tenant",
      "member:invite", "member:update", "member:remove",
      "council:manage",
      "meeting:create", "meeting:update", "meeting:cancel", "meeting:publish_minutes",
      "document:upload", "document:delete", "document:manage_access",
      "maintenance:assign", "maintenance:update", "maintenance:close",
      "payment:create", "payment:approve", "payment:export",
      "inventory:manage", "inventory:purchase",
      "vote:create", "vote:close",
      "notification:send",
    ],
  },
  {
    role: CouncilRole.vice_president,
    keys: [
      "building:update",
      "unit:read",
      "member:invite", "member:update",
      "council:read",
      "meeting:create", "meeting:update", "meeting:cancel", "meeting:publish_minutes",
      "document:upload", "document:delete",
      "maintenance:assign", "maintenance:update", "maintenance:close",
      "payment:read",
      "inventory:read",
      "vote:create",
      "notification:send",
    ],
  },
  {
    role: CouncilRole.treasurer,
    keys: [
      "payment:create", "payment:approve", "payment:export",
      "inventory:manage", "inventory:purchase",
      "document:upload",
      "meeting:read",
      "notification:send",
    ],
  },
  {
    role: CouncilRole.secretary,
    keys: [
      "meeting:create", "meeting:update", "meeting:cancel", "meeting:publish_minutes",
      "document:upload", "document:delete", "document:manage_access",
      "member:invite", "member:update",
      "notification:send",
    ],
  },
  {
    role: CouncilRole.member_at_large,
    keys: [
      "meeting:read",
      "document:read",
      "maintenance:read",
      "payment:read",
      "vote:create",
      "notification:send",
    ],
  },
];

// ─── Flatten to RoleGrantDef[] ────────────────────────────────────────────────

export const ROLE_GRANTS: RoleGrantDef[] = [
  ...systemGrants.flatMap(({ role, keys }) =>
    keys.map((permissionKey) => ({ permissionKey, systemRole: role })),
  ),
  ...buildingGrants.flatMap(({ role, keys }) =>
    keys.map((permissionKey) => ({ permissionKey, councilRole: role })),
  ),
];
