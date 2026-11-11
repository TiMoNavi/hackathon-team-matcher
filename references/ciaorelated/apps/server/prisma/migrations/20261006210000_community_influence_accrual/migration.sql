BEGIN;

CREATE TABLE "CommunityInfluenceSettings" (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  "startsAt" TIMESTAMP(3) NOT NULL,
  "policyVersion" TEXT NOT NULL,
  policy JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "CommunityInfluenceCredit"
  ADD COLUMN "communityUnits" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "participationUnits" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "resonanceUnits" BIGINT NOT NULL DEFAULT 0;
UPDATE "CommunityInfluenceCredit" SET "communityUnits" = units;
ALTER TABLE "CommunityInfluenceCredit" ADD CONSTRAINT "CommunityInfluenceCredit_breakdown_check"
  CHECK ("communityUnits" >= 0 AND "participationUnits" >= 0 AND "resonanceUnits" >= 0
    AND "communityUnits"::NUMERIC + "participationUnits" + "resonanceUnits" = units);

CREATE TYPE "CommunityInfluenceEventKind" AS ENUM ('JOIN', 'INTERACTION');
CREATE TABLE "CommunityInfluenceEvent" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "groupLinkId" TEXT NOT NULL REFERENCES "GroupLink"(id) ON DELETE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE,
  "authorId" TEXT REFERENCES "Profile"(id) ON DELETE CASCADE,
  "postId" TEXT REFERENCES "Post"(id) ON DELETE CASCADE,
  kind "CommunityInfluenceEventKind" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityInfluenceEvent_shape_check" CHECK (
    (kind = 'JOIN' AND "authorId" IS NULL AND "postId" IS NULL) OR
    (kind = 'INTERACTION' AND "authorId" IS NOT NULL AND "postId" IS NOT NULL AND "actorId" <> "authorId")
  )
);
CREATE UNIQUE INDEX "CommunityInfluenceEvent_groupLinkId_eventKey_key" ON "CommunityInfluenceEvent"("groupLinkId", "eventKey");
CREATE INDEX "CommunityInfluenceEvent_groupLinkId_occurredAt_idx" ON "CommunityInfluenceEvent"("groupLinkId", "occurredAt");

CREATE FUNCTION record_community_influence_join() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE activation TIMESTAMP(3); event_time TIMESTAMP(3); g "GroupLink"%ROWTYPE; h "CommunityMembershipHistory"%ROWTYPE;
BEGIN
  IF current_setting('bvrly.community_backfill', true) = 'true' THEN RETURN NEW; END IF;
  SELECT "startsAt" INTO activation FROM "CommunityInfluenceSettings" WHERE id = 'default';
  IF activation IS NULL OR activation > (clock_timestamp() AT TIME ZONE 'UTC') THEN RETURN NEW; END IF;
  SELECT * INTO g FROM "GroupLink" WHERE id = NEW."groupLinkId" FOR SHARE;
  event_time := clock_timestamp() AT TIME ZONE 'UTC';
  IF g.visibility <> 'PUBLIC' OR NOT g."isActive" OR g."expiresAt" <= event_time THEN RETURN NEW; END IF;
  SELECT * INTO h FROM "CommunityMembershipHistory"
    WHERE "groupLinkId" = NEW."groupLinkId" AND "profileId" = NEW."profileId";
  IF h.origin <> 'JOIN' OR h."firstJoinedAt" <> NEW."joinedAt" OR NEW."joinedAt" < activation THEN RETURN NEW; END IF;
  -- Administrative Dach backfills are not new platform growth.
  IF g."systemKey" = 'BVRLY' AND EXISTS (
    SELECT 1 FROM "Profile" WHERE id = NEW."profileId" AND "createdAt" < activation
  ) THEN RETURN NEW; END IF;
  INSERT INTO "CommunityInfluenceEvent" ("groupLinkId", "actorId", kind, "eventKey", "occurredAt")
    VALUES (g.id, NEW."profileId", 'JOIN', 'join:' || NEW."profileId", event_time)
    ON CONFLICT ("groupLinkId", "eventKey") DO NOTHING;
  RETURN NEW;
END;
$$;
-- Alphabetical trigger order runs this after the existing membership-history trigger.
CREATE TRIGGER influence_join_event AFTER INSERT ON "GroupLinkMember"
  FOR EACH ROW EXECUTE FUNCTION record_community_influence_join();

COMMIT;
