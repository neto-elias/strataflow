-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0004_financial_maintenance
-- Adds:
--   Enums  → MaintenanceStatus · MaintenancePriority · MaintenanceCategory
--              InvoiceType · InvoiceStatus
--              PaymentStatus · PaymentMethod · PaymentProvider
--   Tables → maintenance_requests · invoices · payments
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "MaintenanceStatus" AS ENUM (
  'open', 'in_progress', 'resolved', 'closed'
);

CREATE TYPE "MaintenancePriority" AS ENUM (
  'low', 'medium', 'high', 'urgent'
);

CREATE TYPE "MaintenanceCategory" AS ENUM (
  'plumbing', 'electrical', 'structural', 'hvac',
  'elevator', 'fire_safety', 'landscaping', 'cleaning',
  'security', 'it_telecom', 'appliance', 'other'
);

CREATE TYPE "InvoiceType" AS ENUM (
  'strata_fee', 'special_levy', 'fine',
  'repair_charge', 'utility', 'other'
);

CREATE TYPE "InvoiceStatus" AS ENUM (
  'draft', 'issued', 'partially_paid', 'paid',
  'overdue', 'void', 'written_off'
);

CREATE TYPE "PaymentStatus" AS ENUM (
  'pending', 'completed', 'failed', 'refunded', 'cancelled'
);

CREATE TYPE "PaymentMethod" AS ENUM (
  'bank_transfer', 'cheque', 'credit_card', 'debit_card',
  'cash', 'direct_debit', 'online_portal', 'other'
);

CREATE TYPE "PaymentProvider" AS ENUM (
  'stripe', 'paypal', 'square', 'moneris', 'manual', 'other'
);

-- ── maintenance_requests ──────────────────────────────────────────────────────

CREATE TABLE "maintenance_requests" (
    "id"                  TEXT                    NOT NULL,
    "buildingId"          TEXT                    NOT NULL,
    "lotId"               TEXT,
    "title"               TEXT                    NOT NULL,
    "description"         TEXT                    NOT NULL,
    "category"            "MaintenanceCategory"   NOT NULL,
    "priority"            "MaintenancePriority"   NOT NULL DEFAULT 'medium',
    "status"              "MaintenanceStatus"     NOT NULL DEFAULT 'open',
    "createdById"         TEXT                    NOT NULL,
    "assignedToId"        TEXT,
    "resolvedAt"          TIMESTAMP(3),
    "closedAt"            TIMESTAMP(3),
    "estimatedCostCents"  INTEGER,
    "actualCostCents"     INTEGER,
    "attachmentKeys"      TEXT[]                  NOT NULL DEFAULT '{}',
    "internalNotes"       TEXT,
    "createdAt"           TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)            NOT NULL,
    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id"),

    -- Timestamps must be chronologically ordered when set
    CONSTRAINT "maintenance_resolved_after_created"
        CHECK ("resolvedAt" IS NULL OR "resolvedAt" >= "createdAt"),
    CONSTRAINT "maintenance_closed_after_resolved"
        CHECK ("closedAt" IS NULL OR "resolvedAt" IS NOT NULL),
    CONSTRAINT "maintenance_closed_gte_resolved"
        CHECK ("closedAt" IS NULL OR "resolvedAt" IS NULL OR "closedAt" >= "resolvedAt"),

    -- Cost must be non-negative when recorded
    CONSTRAINT "maintenance_estimated_cost_positive"
        CHECK ("estimatedCostCents" IS NULL OR "estimatedCostCents" >= 0),
    CONSTRAINT "maintenance_actual_cost_positive"
        CHECK ("actualCostCents"    IS NULL OR "actualCostCents"    >= 0),

    -- resolvedAt must be set before closedAt
    CONSTRAINT "maintenance_status_dates_consistent"
        CHECK (
            "status" NOT IN ('resolved', 'closed') OR "resolvedAt" IS NOT NULL
        )
);

CREATE INDEX "maintenance_buildingId_idx"                ON "maintenance_requests"("buildingId");
CREATE INDEX "maintenance_buildingId_status_idx"         ON "maintenance_requests"("buildingId", "status");
CREATE INDEX "maintenance_buildingId_priority_idx"       ON "maintenance_requests"("buildingId", "priority");
CREATE INDEX "maintenance_buildingId_status_priority_idx" ON "maintenance_requests"("buildingId", "status", "priority");
CREATE INDEX "maintenance_lotId_idx"                     ON "maintenance_requests"("lotId");
CREATE INDEX "maintenance_createdById_idx"               ON "maintenance_requests"("createdById");
CREATE INDEX "maintenance_assignedToId_idx"              ON "maintenance_requests"("assignedToId");
CREATE INDEX "maintenance_createdAt_idx"                 ON "maintenance_requests"("createdAt");

-- ── invoices ─────────────────────────────────────────────────────────────────

CREATE TABLE "invoices" (
    "id"                   TEXT            NOT NULL,
    "buildingId"           TEXT            NOT NULL,
    "lotId"                TEXT,
    "maintenanceRequestId" TEXT,
    "issuedToId"           TEXT            NOT NULL,
    "createdById"          TEXT            NOT NULL,
    "type"                 "InvoiceType"   NOT NULL,
    "status"               "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "description"          TEXT            NOT NULL,
    "amountCents"          INTEGER         NOT NULL,
    "paidCents"            INTEGER         NOT NULL DEFAULT 0,
    "dueDate"              TIMESTAMP(3)    NOT NULL,
    "issuedAt"             TIMESTAMP(3),
    "periodStart"          TIMESTAMP(3),
    "periodEnd"            TIMESTAMP(3),
    "externalRef"          TEXT,
    "notes"                TEXT,
    "createdAt"            TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),

    -- Amount must be positive
    CONSTRAINT "invoices_amount_positive"
        CHECK ("amountCents" > 0),

    -- paidCents cannot exceed amountCents (overpayment prevented at DB level)
    CONSTRAINT "invoices_paid_lte_amount"
        CHECK ("paidCents" >= 0 AND "paidCents" <= "amountCents"),

    -- issuedAt must be on or before dueDate
    CONSTRAINT "invoices_issued_before_due"
        CHECK ("issuedAt" IS NULL OR "issuedAt" <= "dueDate"),

    -- periodEnd must follow periodStart when both are set
    CONSTRAINT "invoices_period_end_after_start"
        CHECK (
            "periodStart" IS NULL OR
            "periodEnd"   IS NULL OR
            "periodEnd" >= "periodStart"
        ),

    -- A draft invoice cannot have issuedAt set
    CONSTRAINT "invoices_draft_not_issued"
        CHECK ("status" != 'draft' OR "issuedAt" IS NULL),

    -- void and written_off invoices should not accept further payments
    -- (enforced at service layer; this is an advisory reminder only)
    CONSTRAINT "invoices_void_paid_cents_zero"
        CHECK ("status" NOT IN ('void', 'written_off') OR "paidCents" = 0)
);

CREATE INDEX "invoices_buildingId_idx"           ON "invoices"("buildingId");
CREATE INDEX "invoices_buildingId_status_idx"    ON "invoices"("buildingId", "status");
CREATE INDEX "invoices_buildingId_dueDate_idx"   ON "invoices"("buildingId", "dueDate");
CREATE INDEX "invoices_buildingId_type_idx"      ON "invoices"("buildingId", "type");
CREATE INDEX "invoices_issuedToId_idx"           ON "invoices"("issuedToId");
CREATE INDEX "invoices_lotId_idx"                ON "invoices"("lotId");
CREATE INDEX "invoices_maintenanceRequestId_idx" ON "invoices"("maintenanceRequestId");
CREATE INDEX "invoices_dueDate_idx"              ON "invoices"("dueDate");
-- Overdue scheduler: unpaid invoices past their due date
CREATE INDEX "invoices_status_dueDate_idx"       ON "invoices"("status", "dueDate");

-- ── payments ─────────────────────────────────────────────────────────────────

CREATE TABLE "payments" (
    "id"              TEXT              NOT NULL,
    "buildingId"      TEXT              NOT NULL,
    "invoiceId"       TEXT              NOT NULL,
    "paidById"        TEXT              NOT NULL,
    "status"          "PaymentStatus"   NOT NULL DEFAULT 'pending',
    "method"          "PaymentMethod"   NOT NULL,
    "provider"        "PaymentProvider" NOT NULL,
    "amountCents"     INTEGER           NOT NULL,
    "paidAt"          TIMESTAMP(3),
    "providerRef"     TEXT,
    "webhookEventId"  TEXT,
    "providerPayload" JSONB,
    "failureCode"     TEXT,
    "failureReason"   TEXT,
    "notes"           TEXT,
    "createdAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),

    -- amountCents != 0 (positive = payment, negative = refund, never zero)
    CONSTRAINT "payments_amount_nonzero"
        CHECK ("amountCents" != 0),

    -- paidAt must be set when status is completed or refunded
    CONSTRAINT "payments_paidAt_when_completed"
        CHECK (
            "status" NOT IN ('completed', 'refunded') OR "paidAt" IS NOT NULL
        ),

    -- failureCode/failureReason only meaningful on failed payments
    CONSTRAINT "payments_failure_fields_on_failed"
        CHECK (
            "status" = 'failed' OR
            ("failureCode" IS NULL AND "failureReason" IS NULL)
        ),

    -- A refund must have a negative amountCents
    CONSTRAINT "payments_refund_negative_amount"
        CHECK ("status" != 'refunded' OR "amountCents" < 0),

    -- A non-refund payment must have a positive amountCents
    CONSTRAINT "payments_payment_positive_amount"
        CHECK ("status" = 'refunded' OR "amountCents" > 0)
);

-- Idempotency constraints
-- provider+providerRef: one DB row per provider transaction
-- NULL providerRef (manual payments) is excluded from this unique check in PG
CREATE UNIQUE INDEX "payments_provider_ref_key"
    ON "payments"("provider", "providerRef")
    WHERE "providerRef" IS NOT NULL;

-- webhookEventId: one row per inbound webhook event envelope
CREATE UNIQUE INDEX "payments_webhookEventId_key"
    ON "payments"("webhookEventId")
    WHERE "webhookEventId" IS NOT NULL;

CREATE INDEX "payments_buildingId_idx"         ON "payments"("buildingId");
CREATE INDEX "payments_invoiceId_idx"          ON "payments"("invoiceId");
CREATE INDEX "payments_paidById_idx"           ON "payments"("paidById");
CREATE INDEX "payments_status_idx"             ON "payments"("status");
CREATE INDEX "payments_buildingId_status_idx"  ON "payments"("buildingId", "status");
CREATE INDEX "payments_provider_providerRef_idx" ON "payments"("provider", "providerRef");
CREATE INDEX "payments_createdAt_idx"          ON "payments"("createdAt");

-- ── Foreign keys ──────────────────────────────────────────────────────────────

-- maintenance_requests
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_buildingId_fkey"
    FOREIGN KEY ("buildingId")   REFERENCES "buildings"("id")    ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_lotId_fkey"
    FOREIGN KEY ("lotId")        REFERENCES "strata_lots"("id")  ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_createdById_fkey"
    FOREIGN KEY ("createdById")  REFERENCES "users"("id")        ON DELETE RESTRICT  ON UPDATE CASCADE;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id")        ON DELETE SET NULL  ON UPDATE CASCADE;

-- invoices
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buildingId_fkey"
    FOREIGN KEY ("buildingId")           REFERENCES "buildings"("id")              ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lotId_fkey"
    FOREIGN KEY ("lotId")                REFERENCES "strata_lots"("id")            ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_maintenanceRequestId_fkey"
    FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuedToId_fkey"
    FOREIGN KEY ("issuedToId")           REFERENCES "users"("id")                  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey"
    FOREIGN KEY ("createdById")          REFERENCES "users"("id")                  ON DELETE RESTRICT ON UPDATE CASCADE;

-- payments
ALTER TABLE "payments" ADD CONSTRAINT "payments_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey"
    FOREIGN KEY ("invoiceId")  REFERENCES "invoices"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_paidById_fkey"
    FOREIGN KEY ("paidById")   REFERENCES "users"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
