BEGIN;

-- No historical points or growth are fabricated, and existing policies are not activated/rewritten.
ALTER TABLE "CommunityMembershipHistory"
  ADD COLUMN "influenceEntryPosition" INTEGER,
  ADD COLUMN "influenceGrowthCount" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "CommunityMembershipHistory_influence_growth_check"
    CHECK ("influenceGrowthCount" >= 0 AND ("influenceEntryPosition" IS NULL OR "influenceEntryPosition" > 0));

ALTER TABLE "CommunityInfluenceCredit"
  ADD COLUMN "growthCount" BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "CommunityInfluenceCredit_growth_check" CHECK ("growthCount" >= 0);

COMMIT;
