-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0005_notification_inventory_vote
-- Adds:
--   Enums  → NotificationType · NotificationChannel
--              InventoryCategory · PurchaseRequestStatus · StockTransactionType
--              VoteStatus · VoteEligibility · VoteQuorumType
--   Tables → notifications · inventory_items · purchase_requests
--              stock_transactions · votes · vote_options
--              vote_participants · ballots
-- ─────────────────────────────────────────────────────────────────────────────

-- ── New enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "NotificationType" AS ENUM (
  'maintenance_update', 'payment_due', 'payment_received',
  'meeting_reminder', 'meeting_published', 'document_shared',
  'vote_opened', 'vote_closing_soon', 'vote_closed',
  'invoice_issued', 'member_invited', 'request_assigned',
  'low_stock', 'announcement'
);

CREATE TYPE "NotificationChannel" AS ENUM (
  'in_app', 'email'
);

CREATE TYPE "InventoryCategory" AS ENUM (
  'electrical', 'plumbing', 'hardware', 'cleaning',
  'safety', 'landscaping', 'it_equipment', 'furniture', 'tools', 'other'
);

CREATE TYPE "PurchaseRequestStatus" AS ENUM (
  'requested', 'approved', 'ordered', 'received', 'cancelled'
);

CREATE TYPE "StockTransactionType" AS ENUM (
  'received', 'issued', 'adjustment', 'returned', 'damaged', 'transferred'
);

CREATE TYPE "VoteStatus" AS ENUM (
  'draft', 'open', 'closed', 'cancelled'
);

CREATE TYPE "VoteEligibility" AS ENUM (
  'all_owners', 'all_members', 'council_only'
);

CREATE TYPE "VoteQuorumType" AS ENUM (
  'simple_majority', 'two_thirds', 'unanimous', 'custom'
);

-- ── notifications ─────────────────────────────────────────────────────────────

CREATE TABLE "notifications" (
    "id"          TEXT                    NOT NULL,
    "userId"      TEXT                    NOT NULL,
    "buildingId"  TEXT,
    "type"        "NotificationType"      NOT NULL,
    "channel"     "NotificationChannel"   NOT NULL,
    "title"       TEXT                    NOT NULL,
    "message"     TEXT                    NOT NULL,
    "readAt"      TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "metadata"    JSONB,
    "createdAt"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    -- emailSentAt only meaningful on email channel
    CONSTRAINT "notifications_email_sent_on_email_channel"
        CHECK ("emailSentAt" IS NULL OR "channel" = 'email')
);

CREATE INDEX "notifications_userId_idx"          ON "notifications"("userId");
CREATE INDEX "notifications_userId_readAt_idx"   ON "notifications"("userId", "readAt");
CREATE INDEX "notifications_userId_channel_idx"  ON "notifications"("userId", "channel");
CREATE INDEX "notifications_buildingId_idx"      ON "notifications"("buildingId");
CREATE INDEX "notifications_type_createdAt_idx"  ON "notifications"("type", "createdAt");
CREATE INDEX "notifications_createdAt_idx"       ON "notifications"("createdAt");

-- ── inventory_items ───────────────────────────────────────────────────────────

CREATE TABLE "inventory_items" (
    "id"                 TEXT                NOT NULL,
    "buildingId"         TEXT                NOT NULL,
    "name"               TEXT                NOT NULL,
    "description"        TEXT,
    "category"           "InventoryCategory" NOT NULL,
    "sku"                TEXT,
    "unit"               TEXT                NOT NULL DEFAULT 'each',
    "quantityOnHand"     INTEGER             NOT NULL DEFAULT 0,
    "lowStockThreshold"  INTEGER             NOT NULL DEFAULT 0,
    "reorderQuantity"    INTEGER             NOT NULL DEFAULT 1,
    "unitCostCents"      INTEGER,
    "supplier"           TEXT,
    "location"           TEXT,
    "isActive"           BOOLEAN             NOT NULL DEFAULT true,
    "createdById"        TEXT                NOT NULL,
    "createdAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "inventory_items_pkey"                  PRIMARY KEY ("id"),
    CONSTRAINT "inventory_quantity_non_negative"       CHECK ("quantityOnHand"    >= 0),
    CONSTRAINT "inventory_threshold_non_negative"      CHECK ("lowStockThreshold" >= 0),
    CONSTRAINT "inventory_reorder_quantity_positive"   CHECK ("reorderQuantity"   >= 1),
    CONSTRAINT "inventory_unit_cost_positive"
        CHECK ("unitCostCents" IS NULL OR "unitCostCents" >= 0)
);

CREATE INDEX "inventory_buildingId_idx"          ON "inventory_items"("buildingId");
CREATE INDEX "inventory_buildingId_category_idx" ON "inventory_items"("buildingId", "category");
CREATE INDEX "inventory_buildingId_isActive_idx" ON "inventory_items"("buildingId", "isActive");
CREATE INDEX "inventory_createdById_idx"         ON "inventory_items"("createdById");

-- ── purchase_requests ─────────────────────────────────────────────────────────

CREATE TABLE "purchase_requests" (
    "id"                     TEXT                    NOT NULL,
    "buildingId"             TEXT                    NOT NULL,
    "inventoryItemId"        TEXT,
    "title"                  TEXT                    NOT NULL,
    "description"            TEXT,
    "status"                 "PurchaseRequestStatus" NOT NULL DEFAULT 'requested',
    "quantityRequested"      INTEGER                 NOT NULL,
    "quantityReceived"       INTEGER,
    "estimatedUnitCostCents" INTEGER,
    "actualUnitCostCents"    INTEGER,
    "supplier"               TEXT,
    "requestedById"          TEXT                    NOT NULL,
    "approvedById"           TEXT,
    "approvedAt"             TIMESTAMP(3),
    "orderedAt"              TIMESTAMP(3),
    "receivedAt"             TIMESTAMP(3),
    "notes"                  TEXT,
    "createdAt"              TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3)            NOT NULL,
    CONSTRAINT "purchase_requests_pkey"                  PRIMARY KEY ("id"),
    CONSTRAINT "purchase_quantity_requested_positive"    CHECK ("quantityRequested" > 0),
    CONSTRAINT "purchase_quantity_received_positive"
        CHECK ("quantityReceived" IS NULL OR "quantityReceived" >= 0),
    CONSTRAINT "purchase_approved_before_ordered"
        CHECK ("orderedAt"  IS NULL OR "approvedAt" IS NOT NULL),
    CONSTRAINT "purchase_ordered_before_received"
        CHECK ("receivedAt" IS NULL OR "orderedAt"  IS NOT NULL),
    -- approvedAt requires an approver
    CONSTRAINT "purchase_approved_at_needs_approver"
        CHECK ("approvedAt" IS NULL OR "approvedById" IS NOT NULL),
    -- received status requires quantityReceived
    CONSTRAINT "purchase_received_needs_quantity"
        CHECK ("status" != 'received' OR "quantityReceived" IS NOT NULL)
);

CREATE INDEX "purchase_buildingId_idx"          ON "purchase_requests"("buildingId");
CREATE INDEX "purchase_buildingId_status_idx"   ON "purchase_requests"("buildingId", "status");
CREATE INDEX "purchase_inventoryItemId_idx"     ON "purchase_requests"("inventoryItemId");
CREATE INDEX "purchase_requestedById_idx"       ON "purchase_requests"("requestedById");
CREATE INDEX "purchase_approvedById_idx"        ON "purchase_requests"("approvedById");

-- ── stock_transactions ────────────────────────────────────────────────────────

CREATE TABLE "stock_transactions" (
    "id"                TEXT                    NOT NULL,
    "buildingId"        TEXT                    NOT NULL,
    "inventoryItemId"   TEXT                    NOT NULL,
    "purchaseRequestId" TEXT,
    "transactionType"   "StockTransactionType"  NOT NULL,
    "quantityDelta"     INTEGER                 NOT NULL,
    "quantityBefore"    INTEGER                 NOT NULL,
    "quantityAfter"     INTEGER                 NOT NULL,
    "unitCostCents"     INTEGER,
    "notes"             TEXT,
    "createdById"       TEXT                    NOT NULL,
    "createdAt"         TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_transactions_pkey"              PRIMARY KEY ("id"),
    -- Delta must be non-zero (a transaction of 0 is meaningless)
    CONSTRAINT "stock_delta_nonzero"                  CHECK ("quantityDelta" != 0),
    -- Derived invariant: after = before + delta
    CONSTRAINT "stock_quantity_after_equals_before_plus_delta"
        CHECK ("quantityAfter" = "quantityBefore" + "quantityDelta"),
    -- quantityAfter can never be negative (can't have negative stock)
    CONSTRAINT "stock_quantity_after_non_negative"    CHECK ("quantityAfter" >= 0),
    -- quantityBefore must be non-negative (reflects real state)
    CONSTRAINT "stock_quantity_before_non_negative"   CHECK ("quantityBefore" >= 0),
    -- Positive delta types (stock in)
    CONSTRAINT "stock_positive_delta_for_in_types"
        CHECK (
            "transactionType" NOT IN ('received', 'returned') OR "quantityDelta" > 0
        ),
    -- Negative delta types (stock out)
    CONSTRAINT "stock_negative_delta_for_out_types"
        CHECK (
            "transactionType" NOT IN ('issued', 'damaged') OR "quantityDelta" < 0
        ),
    -- Unit cost only relevant when receiving stock
    CONSTRAINT "stock_unit_cost_positive"
        CHECK ("unitCostCents" IS NULL OR "unitCostCents" >= 0)
    -- Intentionally no updatedAt — stock transactions are immutable
);

-- 1:1 with PurchaseRequest (a PR generates at most one receiving transaction)
ALTER TABLE "stock_transactions"
    ADD CONSTRAINT "stock_transactions_purchaseRequestId_key" UNIQUE ("purchaseRequestId");

CREATE INDEX "stock_buildingId_idx"              ON "stock_transactions"("buildingId");
CREATE INDEX "stock_inventoryItemId_idx"         ON "stock_transactions"("inventoryItemId");
CREATE INDEX "stock_inventoryItemId_createdAt_idx" ON "stock_transactions"("inventoryItemId", "createdAt");
CREATE INDEX "stock_purchaseRequestId_idx"       ON "stock_transactions"("purchaseRequestId");
CREATE INDEX "stock_transactionType_idx"         ON "stock_transactions"("transactionType");
CREATE INDEX "stock_createdById_idx"             ON "stock_transactions"("createdById");
CREATE INDEX "stock_createdAt_idx"               ON "stock_transactions"("createdAt");

-- ── votes ─────────────────────────────────────────────────────────────────────

CREATE TABLE "votes" (
    "id"             TEXT              NOT NULL,
    "buildingId"     TEXT              NOT NULL,
    "title"          TEXT              NOT NULL,
    "description"    TEXT              NOT NULL,
    "status"         "VoteStatus"      NOT NULL DEFAULT 'draft',
    "anonymous"      BOOLEAN           NOT NULL DEFAULT false,
    "eligibility"    "VoteEligibility" NOT NULL DEFAULT 'all_owners',
    "quorumType"     "VoteQuorumType"  NOT NULL DEFAULT 'simple_majority',
    "quorumPercent"  DECIMAL(5,2),
    "opensAt"        TIMESTAMP(3)      NOT NULL,
    "closesAt"       TIMESTAMP(3)      NOT NULL,
    "createdById"    TEXT              NOT NULL,
    "createdAt"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "votes_pkey" PRIMARY KEY ("id"),
    -- Voting window must be forward-ordered
    CONSTRAINT "votes_closes_after_opens"
        CHECK ("closesAt" > "opensAt"),
    -- quorumPercent only meaningful when quorumType = custom
    CONSTRAINT "votes_quorum_percent_requires_custom_type"
        CHECK (
            "quorumType" != 'custom' OR
            ("quorumPercent" IS NOT NULL AND "quorumPercent" > 0 AND "quorumPercent" <= 100)
        ),
    -- quorumPercent must be null for non-custom types
    CONSTRAINT "votes_quorum_percent_null_for_non_custom"
        CHECK ("quorumType" = 'custom' OR "quorumPercent" IS NULL)
);

CREATE INDEX "votes_buildingId_idx"          ON "votes"("buildingId");
CREATE INDEX "votes_buildingId_status_idx"   ON "votes"("buildingId", "status");
CREATE INDEX "votes_buildingId_opensAt_idx"  ON "votes"("buildingId", "opensAt");
CREATE INDEX "votes_buildingId_closesAt_idx" ON "votes"("buildingId", "closesAt");
CREATE INDEX "votes_createdById_idx"         ON "votes"("createdById");

-- ── vote_options ──────────────────────────────────────────────────────────────

CREATE TABLE "vote_options" (
    "id"          TEXT         NOT NULL,
    "voteId"      TEXT         NOT NULL,
    "label"       TEXT         NOT NULL,
    "description" TEXT,
    "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "vote_options_pkey"             PRIMARY KEY ("id"),
    CONSTRAINT "vote_options_sortOrder_check"  CHECK ("sortOrder" >= 0)
);

CREATE INDEX "vote_options_voteId_idx"           ON "vote_options"("voteId");
CREATE INDEX "vote_options_voteId_sortOrder_idx" ON "vote_options"("voteId", "sortOrder");

-- ── vote_participants ─────────────────────────────────────────────────────────

CREATE TABLE "vote_participants" (
    "id"     TEXT         NOT NULL,
    "voteId" TEXT         NOT NULL,
    "userId" TEXT         NOT NULL,
    "castAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vote_participants_pkey" PRIMARY KEY ("id")
);

-- THE double-vote prevention constraint
ALTER TABLE "vote_participants"
    ADD CONSTRAINT "vote_participants_voteId_userId_key" UNIQUE ("voteId", "userId");

CREATE INDEX "vote_participants_voteId_idx" ON "vote_participants"("voteId");
CREATE INDEX "vote_participants_userId_idx" ON "vote_participants"("userId");

-- ── ballots ───────────────────────────────────────────────────────────────────

CREATE TABLE "ballots" (
    "id"       TEXT         NOT NULL,
    "voteId"   TEXT         NOT NULL,
    "optionId" TEXT         NOT NULL,
    "userId"   TEXT,          -- NULL when Vote.anonymous = true
    "castAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ballots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ballots_voteId_idx"          ON "ballots"("voteId");
CREATE INDEX "ballots_voteId_optionId_idx" ON "ballots"("voteId", "optionId");
CREATE INDEX "ballots_userId_idx"          ON "ballots"("userId");

-- ── Foreign keys ──────────────────────────────────────────────────────────────

-- notifications
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId")     REFERENCES "users"("id")     ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- inventory_items
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_buildingId_fkey"
    FOREIGN KEY ("buildingId")  REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;

-- purchase_requests
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_buildingId_fkey"
    FOREIGN KEY ("buildingId")      REFERENCES "buildings"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requestedById_fkey"
    FOREIGN KEY ("requestedById")   REFERENCES "users"("id")          ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_approvedById_fkey"
    FOREIGN KEY ("approvedById")    REFERENCES "users"("id")          ON DELETE SET NULL ON UPDATE CASCADE;

-- stock_transactions
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_buildingId_fkey"
    FOREIGN KEY ("buildingId")       REFERENCES "buildings"("id")        ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId")  REFERENCES "inventory_items"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_purchaseRequestId_fkey"
    FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_createdById_fkey"
    FOREIGN KEY ("createdById")      REFERENCES "users"("id")            ON DELETE RESTRICT ON UPDATE CASCADE;

-- votes
ALTER TABLE "votes" ADD CONSTRAINT "votes_buildingId_fkey"
    FOREIGN KEY ("buildingId")  REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "votes" ADD CONSTRAINT "votes_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;

-- vote_options
ALTER TABLE "vote_options" ADD CONSTRAINT "vote_options_voteId_fkey"
    FOREIGN KEY ("voteId") REFERENCES "votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- vote_participants
ALTER TABLE "vote_participants" ADD CONSTRAINT "vote_participants_voteId_fkey"
    FOREIGN KEY ("voteId") REFERENCES "votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vote_participants" ADD CONSTRAINT "vote_participants_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ballots (Ballot.userId uses SET NULL — deleting a user anonymises their ballot)
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_voteId_fkey"
    FOREIGN KEY ("voteId")   REFERENCES "votes"("id")        ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "vote_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_userId_fkey"
    FOREIGN KEY ("userId")   REFERENCES "users"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
