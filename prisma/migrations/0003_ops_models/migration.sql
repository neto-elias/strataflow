-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0003_ops_models
-- Adds:
--   Enums   → MeetingType · MeetingStatus · AgendaItemStatus · MinutesStatus
--              DocumentCategory · AuditAction
--   Tables  → meetings · agenda_items · minutes · documents · audit_logs
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "MeetingType" AS ENUM (
  'agm', 'special', 'council', 'committee'
);

CREATE TYPE "MeetingStatus" AS ENUM (
  'scheduled', 'in_progress', 'completed', 'cancelled'
);

CREATE TYPE "AgendaItemStatus" AS ENUM (
  'pending', 'discussed', 'resolved', 'tabled', 'withdrawn'
);

CREATE TYPE "MinutesStatus" AS ENUM (
  'draft', 'under_review', 'approved', 'published'
);

CREATE TYPE "DocumentCategory" AS ENUM (
  'minutes', 'bylaw', 'financial', 'insurance',
  'maintenance_report', 'legal', 'correspondence',
  'notice', 'form', 'other'
);

CREATE TYPE "AuditAction" AS ENUM (
  'create', 'update', 'delete', 'restore',
  'publish', 'approve', 'reject', 'assign',
  'upload', 'download', 'login', 'logout',
  'invite', 'revoke'
);

-- ── meetings ─────────────────────────────────────────────────────────────────

CREATE TABLE "meetings" (
    "id"            TEXT            NOT NULL,
    "buildingId"    TEXT            NOT NULL,
    "title"         TEXT            NOT NULL,
    "type"          "MeetingType"   NOT NULL,
    "status"        "MeetingStatus" NOT NULL DEFAULT 'scheduled',
    "scheduledAt"   TIMESTAMP(3)    NOT NULL,
    "endedAt"       TIMESTAMP(3),
    "location"      TEXT,
    "videoUrl"      TEXT,
    "quorum"        INTEGER,
    "attendeeCount" INTEGER,
    "notes"         TEXT,
    "createdById"   TEXT            NOT NULL,
    "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id"),
    -- A meeting that is in_progress or completed must have started in the past
    CONSTRAINT "meetings_ended_after_scheduled"
        CHECK ("endedAt" IS NULL OR "endedAt" >= "scheduledAt"),
    -- attendeeCount can only be set once a meeting has started or completed
    CONSTRAINT "meetings_attendee_count_positive"
        CHECK ("attendeeCount" IS NULL OR "attendeeCount" >= 0)
);

CREATE INDEX "meetings_buildingId_idx"          ON "meetings"("buildingId");
CREATE INDEX "meetings_buildingId_status_idx"   ON "meetings"("buildingId", "status");
CREATE INDEX "meetings_buildingId_scheduled_idx" ON "meetings"("buildingId", "scheduledAt");
CREATE INDEX "meetings_createdById_idx"         ON "meetings"("createdById");

-- ── agenda_items ─────────────────────────────────────────────────────────────

CREATE TABLE "agenda_items" (
    "id"           TEXT                NOT NULL,
    "meetingId"    TEXT                NOT NULL,
    "title"        TEXT                NOT NULL,
    "description"  TEXT,
    "sortOrder"    INTEGER             NOT NULL DEFAULT 0,
    "presenter"    TEXT,
    "durationMins" INTEGER,
    "status"       "AgendaItemStatus"  NOT NULL DEFAULT 'pending',
    "resolution"   TEXT,
    "createdAt"    TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "agenda_items_pkey"               PRIMARY KEY ("id"),
    CONSTRAINT "agenda_items_durationMins_check" CHECK ("durationMins" IS NULL OR "durationMins" > 0),
    CONSTRAINT "agenda_items_sortOrder_check"    CHECK ("sortOrder" >= 0),
    -- resolution should only be set when status = 'resolved'
    -- (advisory constraint — application layer enforces strictly)
    CONSTRAINT "agenda_items_resolution_only_when_resolved"
        CHECK ("resolution" IS NULL OR "status" = 'resolved')
);

CREATE INDEX "agenda_items_meetingId_idx"           ON "agenda_items"("meetingId");
CREATE INDEX "agenda_items_meetingId_sortOrder_idx" ON "agenda_items"("meetingId", "sortOrder");

-- ── minutes ───────────────────────────────────────────────────────────────────

CREATE TABLE "minutes" (
    "id"            TEXT            NOT NULL,
    "meetingId"     TEXT            NOT NULL,
    "content"       TEXT            NOT NULL,
    "status"        "MinutesStatus" NOT NULL DEFAULT 'draft',
    "approvedAt"    TIMESTAMP(3),
    "publishedAt"   TIMESTAMP(3),
    "createdById"   TEXT            NOT NULL,
    "publishedById" TEXT,
    "documentId"    TEXT,
    "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "minutes_pkey" PRIMARY KEY ("id"),
    -- approvedAt must precede or equal publishedAt when both are set
    CONSTRAINT "minutes_approved_before_published"
        CHECK (
            "approvedAt"  IS NULL OR
            "publishedAt" IS NULL OR
            "approvedAt" <= "publishedAt"
        ),
    -- publishedAt can only be set when status = published
    CONSTRAINT "minutes_publishedAt_requires_published"
        CHECK ("publishedAt" IS NULL OR "status" = 'published')
);

-- 1:1 Meeting ↔ Minutes
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_meetingId_key"  UNIQUE ("meetingId");
-- One Minutes record per Document at most
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_documentId_key" UNIQUE ("documentId");

CREATE INDEX "minutes_status_idx" ON "minutes"("status");

-- ── documents ────────────────────────────────────────────────────────────────

CREATE TABLE "documents" (
    "id"               TEXT                 NOT NULL,
    "buildingId"       TEXT                 NOT NULL,
    "lotId"            TEXT,
    "meetingId"        TEXT,
    "title"            TEXT                 NOT NULL,
    "description"      TEXT,
    "category"         "DocumentCategory"   NOT NULL,
    "groupId"          TEXT                 NOT NULL,
    "version"          INTEGER              NOT NULL DEFAULT 1,
    "isCurrentVersion" BOOLEAN              NOT NULL DEFAULT true,
    "s3Key"            TEXT                 NOT NULL,
    "sizeBytes"        INTEGER              NOT NULL,
    "mimeType"         TEXT                 NOT NULL,
    "isPublic"         BOOLEAN              NOT NULL DEFAULT false,
    "uploadedById"     TEXT                 NOT NULL,
    "createdAt"        TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)         NOT NULL,
    CONSTRAINT "documents_pkey"          PRIMARY KEY ("id"),
    CONSTRAINT "documents_version_check" CHECK ("version" >= 1),
    CONSTRAINT "documents_size_check"    CHECK ("sizeBytes" > 0)
);

-- Each S3 key is globally unique (even across buildings/versions)
ALTER TABLE "documents" ADD CONSTRAINT "documents_s3Key_key" UNIQUE ("s3Key");

-- Core version-chain constraint: no duplicate version numbers within a group
ALTER TABLE "documents" ADD CONSTRAINT "documents_groupId_version_key" UNIQUE ("groupId", "version");

-- Partial unique index: only one row per group can be the current version.
-- Uses a partial index so superseded versions (isCurrentVersion=false) are unconstrained.
CREATE UNIQUE INDEX "documents_one_current_version_per_group"
    ON "documents"("groupId")
    WHERE ("isCurrentVersion" = true);

CREATE INDEX "documents_buildingId_idx"                ON "documents"("buildingId");
CREATE INDEX "documents_buildingId_category_idx"       ON "documents"("buildingId", "category");
CREATE INDEX "documents_buildingId_isCurrentVersion_idx" ON "documents"("buildingId", "isCurrentVersion");
CREATE INDEX "documents_groupId_idx"                   ON "documents"("groupId");
CREATE INDEX "documents_meetingId_idx"                 ON "documents"("meetingId");
CREATE INDEX "documents_lotId_idx"                     ON "documents"("lotId");
CREATE INDEX "documents_uploadedById_idx"              ON "documents"("uploadedById");

-- ── audit_logs ───────────────────────────────────────────────────────────────

CREATE TABLE "audit_logs" (
    "id"         TEXT          NOT NULL,
    "userId"     TEXT,
    "resource"   TEXT          NOT NULL,
    "resourceId" TEXT          NOT NULL,
    "action"     "AuditAction" NOT NULL,
    "buildingId" TEXT,
    "before"     JSONB,
    "after"      JSONB,
    "summary"    TEXT,
    "ipAddress"  TEXT,
    "userAgent"  TEXT,
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
    -- Deliberately no updatedAt — audit logs are immutable.
    -- No FK on resource/resourceId — they must survive record deletion.
);

-- See design note: userId FK uses SET NULL so logs survive account deletion
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");
CREATE INDEX "audit_logs_userId_idx"              ON "audit_logs"("userId");
CREATE INDEX "audit_logs_buildingId_createdAt_idx" ON "audit_logs"("buildingId", "createdAt");
CREATE INDEX "audit_logs_action_createdAt_idx"    ON "audit_logs"("action", "createdAt");
CREATE INDEX "audit_logs_createdAt_idx"           ON "audit_logs"("createdAt");

-- ── Foreign keys ─────────────────────────────────────────────────────────────

-- meetings
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- agenda_items
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- minutes
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_publishedById_fkey"
    FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- documents
ALTER TABLE "documents" ADD CONSTRAINT "documents_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "strata_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- audit_logs (SET NULL on user deletion — logs must be preserved)
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
