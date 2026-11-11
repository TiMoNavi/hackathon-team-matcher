BEGIN;

-- Keep the baseline and trigger installation atomic with concurrent joins/exits.
LOCK TABLE "GroupLink", "GroupLinkMember" IN SHARE ROW EXCLUSIVE MODE;

CREATE TYPE "CommunityMembershipOrigin" AS ENUM ('JOIN', 'OWNER', 'BACKFILL');
CREATE TABLE "CommunityMembershipHistory" (
  "groupLinkId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "firstJoinedAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origin "CommunityMembershipOrigin" NOT NULL,
  CONSTRAINT "CommunityMembershipHistory_pkey" PRIMARY KEY ("groupLinkId", "profileId"),
  CONSTRAINT "CommunityMembershipHistory_groupLinkId_fkey" FOREIGN KEY ("groupLinkId") REFERENCES "GroupLink"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityMembershipHistory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommunityMembershipHistory_profileId_firstJoinedAt_idx" ON "CommunityMembershipHistory"("profileId", "firstJoinedAt");

CREATE TABLE "CommunityMembershipPeriod" (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "groupLinkId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "CommunityMembershipPeriod_pkey" PRIMARY KEY (id),
  CONSTRAINT "CommunityMembershipPeriod_history_fkey" FOREIGN KEY ("groupLinkId", "profileId")
    REFERENCES "CommunityMembershipHistory"("groupLinkId", "profileId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityMembershipPeriod_time_order" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE INDEX "CommunityMembershipPeriod_groupLinkId_profileId_startedAt_idx" ON "CommunityMembershipPeriod"("groupLinkId", "profileId", "startedAt");
CREATE UNIQUE INDEX "CommunityMembershipPeriod_one_open" ON "CommunityMembershipPeriod"("groupLinkId", "profileId") WHERE "endedAt" IS NULL;

-- Existing joinedAt is the earliest surviving evidence, not a claim about erased exits.
-- Owners without a membership row are only known to be owners at migration time.
INSERT INTO "CommunityMembershipHistory" ("groupLinkId", "profileId", "firstJoinedAt", origin)
SELECT "groupLinkId", "profileId", MIN("joinedAt"), 'BACKFILL'
FROM (
  SELECT "groupLinkId", "profileId", "joinedAt" FROM "GroupLinkMember"
  UNION ALL
  SELECT id, "ownerId", CURRENT_TIMESTAMP FROM "GroupLink"
) baseline GROUP BY "groupLinkId", "profileId";
INSERT INTO "CommunityMembershipPeriod" ("groupLinkId", "profileId", "startedAt")
SELECT "groupLinkId", "profileId", "firstJoinedAt" FROM "CommunityMembershipHistory";

CREATE FUNCTION start_community_membership(group_id TEXT, profile_id TEXT, started TIMESTAMP(3), entry_origin "CommunityMembershipOrigin")
RETURNS void LANGUAGE plpgsql AS $$
DECLARE effective_start TIMESTAMP(3);
BEGIN
  INSERT INTO "CommunityMembershipHistory" ("groupLinkId", "profileId", "firstJoinedAt", origin)
  VALUES (group_id, profile_id, started, entry_origin)
  ON CONFLICT ("groupLinkId", "profileId") DO NOTHING;
  -- now() is transaction-scoped; a delete/rejoin in one transaction must not overlap.
  SELECT GREATEST(started, MAX("endedAt")) INTO effective_start
  FROM "CommunityMembershipPeriod" WHERE "groupLinkId" = group_id AND "profileId" = profile_id;
  INSERT INTO "CommunityMembershipPeriod" ("groupLinkId", "profileId", "startedAt")
  VALUES (group_id, profile_id, effective_start)
  ON CONFLICT ("groupLinkId", "profileId") WHERE "endedAt" IS NULL DO NOTHING;
END;
$$;

CREATE FUNCTION track_community_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM start_community_membership(NEW."groupLinkId", NEW."profileId", NEW."joinedAt", 'JOIN');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW."groupLinkId" IS DISTINCT FROM OLD."groupLinkId" OR NEW."profileId" IS DISTINCT FROM OLD."profileId"
       OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt" THEN
      RAISE EXCEPTION 'COMMUNITY_MEMBERSHIP_IDENTITY_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  -- Owners remain members implicitly, even without a GroupLinkMember row.
  IF NOT EXISTS (SELECT 1 FROM "GroupLink" WHERE id = OLD."groupLinkId" AND "ownerId" = OLD."profileId") THEN
    UPDATE "CommunityMembershipPeriod" SET "endedAt" = GREATEST("startedAt", clock_timestamp())
    WHERE "groupLinkId" = OLD."groupLinkId" AND "profileId" = OLD."profileId" AND "endedAt" IS NULL;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER community_membership_history AFTER INSERT OR DELETE ON "GroupLinkMember"
FOR EACH ROW EXECUTE FUNCTION track_community_membership();
CREATE TRIGGER community_membership_identity BEFORE UPDATE ON "GroupLinkMember"
FOR EACH ROW EXECUTE FUNCTION track_community_membership();

CREATE FUNCTION track_community_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM start_community_membership(NEW.id, NEW."ownerId", NEW."createdAt", 'OWNER');
  ELSIF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    IF NOT EXISTS (SELECT 1 FROM "GroupLinkMember" WHERE "groupLinkId" = NEW.id AND "profileId" = OLD."ownerId") THEN
      UPDATE "CommunityMembershipPeriod" SET "endedAt" = GREATEST("startedAt", clock_timestamp())
      WHERE "groupLinkId" = NEW.id AND "profileId" = OLD."ownerId" AND "endedAt" IS NULL;
    END IF;
    PERFORM start_community_membership(NEW.id, NEW."ownerId", clock_timestamp()::timestamp(3), 'OWNER');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_owner_history AFTER INSERT OR UPDATE OF "ownerId" ON "GroupLink"
FOR EACH ROW EXECUTE FUNCTION track_community_owner();

COMMIT;
