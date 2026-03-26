-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_core_models
-- Creates: users, buildings, strata_lots, council_memberships
--          plus NextAuth tables (accounts, sessions, verification_tokens)
--
-- NOTE: Run via `prisma migrate dev` — do NOT apply manually in production.
--       This file is provided for review/audit purposes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "UserRole" AS ENUM (
  'admin',
  'manager',
  'council_member',
  'owner',
  'tenant'
);

CREATE TYPE "CouncilRole" AS ENUM (
  'president',
  'vice_president',
  'treasurer',
  'secretary',
  'member_at_large'
);

-- ── NextAuth ─────────────────────────────────────────────────────────────────

CREATE TABLE "accounts" (
    "id"                  TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "type"                TEXT NOT NULL,
    "provider"            TEXT NOT NULL,
    "providerAccountId"   TEXT NOT NULL,
    "refresh_token"       TEXT,
    "access_token"        TEXT,
    "expires_at"          INTEGER,
    "token_type"          TEXT,
    "scope"               TEXT,
    "id_token"            TEXT,
    "session_state"       TEXT,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id"           TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "expires"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token"      TEXT NOT NULL,
    "expires"    TIMESTAMP(3) NOT NULL
);

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id"            TEXT NOT NULL,
    "name"          TEXT,
    "email"         TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image"         TEXT,
    "phone"         TEXT,
    "bio"           TEXT,
    "role"          "UserRole" NOT NULL DEFAULT 'owner',
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- ── Buildings ─────────────────────────────────────────────────────────────────

CREATE TABLE "buildings" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "strataNumber" TEXT,
    "address"      TEXT NOT NULL,
    "city"         TEXT NOT NULL,
    "province"     TEXT NOT NULL DEFAULT 'BC',
    "postalCode"   TEXT NOT NULL,
    "country"      TEXT NOT NULL DEFAULT 'CA',
    "timezone"     TEXT NOT NULL DEFAULT 'America/Vancouver',
    "currency"     TEXT NOT NULL DEFAULT 'CAD',
    "totalUnits"   INTEGER NOT NULL,
    "yearBuilt"    INTEGER,
    "website"      TEXT,
    "logoUrl"      TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- ── Strata Lots ───────────────────────────────────────────────────────────────

CREATE TABLE "strata_lots" (
    "id"              TEXT NOT NULL,
    "buildingId"      TEXT NOT NULL,
    "unitNumber"      TEXT NOT NULL,
    "floor"           INTEGER,
    "bedrooms"        INTEGER,
    "bathrooms"       DECIMAL(3,1),
    "squareFeet"      INTEGER,
    "unitEntitlement" INTEGER NOT NULL DEFAULT 1,
    "parkingSpots"    INTEGER NOT NULL DEFAULT 0,
    "storageLockers"  INTEGER NOT NULL DEFAULT 0,
    "ownerId"         TEXT,
    "tenantId"        TEXT,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "strata_lots_pkey" PRIMARY KEY ("id")
);

-- ── Council Memberships ───────────────────────────────────────────────────────

CREATE TABLE "council_memberships" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "role"       "CouncilRole" NOT NULL,
    "termStart"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termEnd"    TIMESTAMP(3),
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "council_memberships_pkey" PRIMARY KEY ("id")
);

-- ── Unique Constraints ────────────────────────────────────────────────────────

ALTER TABLE "accounts"             ADD CONSTRAINT "accounts_provider_providerAccountId_key"   UNIQUE ("provider", "providerAccountId");
ALTER TABLE "sessions"             ADD CONSTRAINT "sessions_sessionToken_key"                  UNIQUE ("sessionToken");
ALTER TABLE "verification_tokens"  ADD CONSTRAINT "verification_tokens_token_key"              UNIQUE ("token");
ALTER TABLE "verification_tokens"  ADD CONSTRAINT "verification_tokens_identifier_token_key"   UNIQUE ("identifier", "token");
ALTER TABLE "users"                ADD CONSTRAINT "users_email_key"                            UNIQUE ("email");
ALTER TABLE "buildings"            ADD CONSTRAINT "buildings_strataNumber_key"                 UNIQUE ("strataNumber");
ALTER TABLE "strata_lots"          ADD CONSTRAINT "strata_lots_buildingId_unitNumber_key"       UNIQUE ("buildingId", "unitNumber");

-- ── Regular Indexes ───────────────────────────────────────────────────────────

CREATE INDEX "accounts_userId_idx"                         ON "accounts"("userId");
CREATE INDEX "sessions_userId_idx"                         ON "sessions"("userId");
CREATE INDEX "users_email_idx"                             ON "users"("email");
CREATE INDEX "users_role_idx"                              ON "users"("role");
CREATE INDEX "users_isActive_idx"                          ON "users"("isActive");
CREATE INDEX "buildings_strataNumber_idx"                  ON "buildings"("strataNumber");
CREATE INDEX "buildings_city_province_idx"                 ON "buildings"("city", "province");
CREATE INDEX "buildings_isActive_idx"                      ON "buildings"("isActive");
CREATE INDEX "strata_lots_buildingId_idx"                  ON "strata_lots"("buildingId");
CREATE INDEX "strata_lots_ownerId_idx"                     ON "strata_lots"("ownerId");
CREATE INDEX "strata_lots_tenantId_idx"                    ON "strata_lots"("tenantId");
CREATE INDEX "strata_lots_buildingId_isActive_idx"         ON "strata_lots"("buildingId", "isActive");
CREATE INDEX "council_memberships_buildingId_isActive_idx" ON "council_memberships"("buildingId", "isActive");
CREATE INDEX "council_memberships_userId_idx"              ON "council_memberships"("userId");
CREATE INDEX "council_memberships_userId_buildingId_idx"   ON "council_memberships"("userId", "buildingId", "isActive");

-- ── Partial Unique Index (not expressible in Prisma schema DSL) ───────────────
-- Enforces: a user may hold at most ONE active council seat per building.
-- Uses a partial index so historical (inactive) rows are not constrained.
CREATE UNIQUE INDEX "council_memberships_one_active_per_user_building"
    ON "council_memberships"("userId", "buildingId")
    WHERE ("isActive" = true);

-- ── Foreign Keys ──────────────────────────────────────────────────────────────

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strata_lots" ADD CONSTRAINT "strata_lots_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SetNull: removing a user account detaches them from lots but preserves the lot record
ALTER TABLE "strata_lots" ADD CONSTRAINT "strata_lots_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "strata_lots" ADD CONSTRAINT "strata_lots_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "council_memberships" ADD CONSTRAINT "council_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "council_memberships" ADD CONSTRAINT "council_memberships_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
