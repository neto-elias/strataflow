-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0002_permissions
-- Adds: PermissionScope enum · permissions · role_permissions
--
-- Key addition over Prisma DSL:
--   • CHECK constraint on role_permissions ensures exactly one of
--     {system_role, council_role} is set per row — not expressible in Prisma.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New enum ─────────────────────────────────────────────────────────────────

CREATE TYPE "PermissionScope" AS ENUM ('system', 'building');

-- ── permissions ──────────────────────────────────────────────────────────────

CREATE TABLE "permissions" (
    "id"          TEXT              NOT NULL,
    "key"         TEXT              NOT NULL,
    "resource"    TEXT              NOT NULL,
    "action"      TEXT              NOT NULL,
    "scope"       "PermissionScope" NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "permissions" ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");

-- Enforce key format: lowercase letters/underscores, colon separator
ALTER TABLE "permissions"
    ADD CONSTRAINT "permissions_key_format"
    CHECK ("key" ~ '^[a-z_]+:[a-z_]+$');

CREATE INDEX "permissions_resource_idx"        ON "permissions"("resource");
CREATE INDEX "permissions_scope_idx"           ON "permissions"("scope");
CREATE INDEX "permissions_resource_action_idx" ON "permissions"("resource", "action");

-- ── role_permissions ─────────────────────────────────────────────────────────

CREATE TABLE "role_permissions" (
    "id"           TEXT         NOT NULL,
    "permissionId" TEXT         NOT NULL,
    "systemRole"   "UserRole",
    "councilRole"  "CouncilRole",
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),

    -- ── Core integrity constraint ────────────────────────────────────────────
    -- Exactly ONE of {systemRole, councilRole} must be set.
    -- Prevents:
    --   • orphan rows (both NULL)  → would make the grant unresolvable
    --   • ambiguous rows (both SET) → would match both role axes simultaneously
    CONSTRAINT "role_permissions_exactly_one_role"
        CHECK (
            ("systemRole" IS NOT NULL AND "councilRole" IS NULL)
            OR
            ("systemRole" IS NULL AND "councilRole" IS NOT NULL)
        )
);

-- Prevent duplicate grants ────────────────────────────────────────────────────
-- PostgreSQL excludes NULLs from unique indexes, so these two indexes
-- independently protect system grants and council grants without interfering.
CREATE UNIQUE INDEX "role_permissions_permission_system_role_key"
    ON "role_permissions"("permissionId", "systemRole");

CREATE UNIQUE INDEX "role_permissions_permission_council_role_key"
    ON "role_permissions"("permissionId", "councilRole");

-- Lookup indexes ──────────────────────────────────────────────────────────────
-- "Give me all permissions granted to role X" — hit by permission check service
CREATE INDEX "role_permissions_systemRole_idx"  ON "role_permissions"("systemRole");
CREATE INDEX "role_permissions_councilRole_idx" ON "role_permissions"("councilRole");
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- Foreign key ─────────────────────────────────────────────────────────────────
ALTER TABLE "role_permissions"
    ADD CONSTRAINT "role_permissions_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "permissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
