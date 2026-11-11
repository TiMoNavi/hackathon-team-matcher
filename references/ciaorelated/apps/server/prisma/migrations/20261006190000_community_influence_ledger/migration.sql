BEGIN;

CREATE TABLE "CommunityInfluenceSettlement" (
  id TEXT NOT NULL,
  "groupLinkId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "budgetUnits" BIGINT NOT NULL,
  "creditedUnits" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityInfluenceSettlement_pkey" PRIMARY KEY (id),
  CONSTRAINT "CommunityInfluenceSettlement_groupLinkId_fkey" FOREIGN KEY ("groupLinkId") REFERENCES "GroupLink"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityInfluenceSettlement_period_order" CHECK ("periodStart" < "periodEnd"),
  CONSTRAINT "CommunityInfluenceSettlement_budget" CHECK ("budgetUnits" >= 0 AND "creditedUnits" >= 0 AND "creditedUnits" <= "budgetUnits")
);
CREATE UNIQUE INDEX "CommunityInfluenceSettlement_period_key" ON "CommunityInfluenceSettlement"("groupLinkId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "CommunityInfluenceSettlement_id_group_key" ON "CommunityInfluenceSettlement"(id, "groupLinkId");

CREATE TABLE "CommunityInfluenceCredit" (
  "settlementId" TEXT NOT NULL,
  "groupLinkId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  units BIGINT NOT NULL,
  CONSTRAINT "CommunityInfluenceCredit_pkey" PRIMARY KEY ("settlementId", "profileId"),
  CONSTRAINT "CommunityInfluenceCredit_positive" CHECK (units > 0),
  CONSTRAINT "CommunityInfluenceCredit_settlement_fkey" FOREIGN KEY ("settlementId", "groupLinkId")
    REFERENCES "CommunityInfluenceSettlement"(id, "groupLinkId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityInfluenceCredit_history_fkey" FOREIGN KEY ("groupLinkId", "profileId")
    REFERENCES "CommunityMembershipHistory"("groupLinkId", "profileId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommunityInfluenceCredit_groupLinkId_profileId_idx" ON "CommunityInfluenceCredit"("groupLinkId", "profileId");

-- No baseline credits, public mutations, scheduled calculations or ranking changes.
COMMIT;
