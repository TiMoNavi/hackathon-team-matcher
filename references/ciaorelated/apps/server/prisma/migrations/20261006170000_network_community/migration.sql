BEGIN;

LOCK TABLE "Profile", "GroupLink", "GroupLinkMember" IN SHARE ROW EXCLUSIVE MODE;

CREATE TYPE "CommunitySystemKey" AS ENUM ('BVRLY');
ALTER TABLE "GroupLink" ADD COLUMN "systemKey" "CommunitySystemKey";
CREATE UNIQUE INDEX "GroupLink_systemKey_key" ON "GroupLink"("systemKey");
ALTER TABLE "GroupLink" ADD CONSTRAINT "GroupLink_system_public_community"
  CHECK ("systemKey" IS NULL OR (visibility = 'PUBLIC' AND type = 'COMMUNITY'));

CREATE FUNCTION protect_community_system_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."systemKey" IS DISTINCT FROM OLD."systemKey" THEN
    RAISE EXCEPTION 'COMMUNITY_SYSTEM_KEY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_system_key BEFORE UPDATE OF "systemKey" ON "GroupLink"
FOR EACH ROW EXECUTE FUNCTION protect_community_system_key();

-- Seniority is separate from actual membership. Never invent historic active periods.
ALTER TABLE "CommunityMembershipHistory" ADD COLUMN "seniorityAt" TIMESTAMP(3);
UPDATE "CommunityMembershipHistory" SET "seniorityAt" = "firstJoinedAt";
ALTER TABLE "CommunityMembershipHistory" ALTER COLUMN "seniorityAt" SET NOT NULL;

CREATE OR REPLACE FUNCTION start_community_membership(group_id TEXT, profile_id TEXT, started TIMESTAMP(3), entry_origin "CommunityMembershipOrigin")
RETURNS void LANGUAGE plpgsql AS $$
DECLARE effective_start TIMESTAMP(3);
BEGIN
  INSERT INTO "CommunityMembershipHistory" ("groupLinkId", "profileId", "firstJoinedAt", "seniorityAt", origin)
  SELECT group_id, profile_id, started,
    CASE WHEN g."systemKey" = 'BVRLY' THEN p."createdAt" ELSE started END, entry_origin
  FROM "GroupLink" g JOIN "Profile" p ON p.id = profile_id WHERE g.id = group_id
  ON CONFLICT ("groupLinkId", "profileId") DO NOTHING;
  SELECT GREATEST(started, MAX("endedAt")) INTO effective_start
  FROM "CommunityMembershipPeriod" WHERE "groupLinkId" = group_id AND "profileId" = profile_id;
  INSERT INTO "CommunityMembershipPeriod" ("groupLinkId", "profileId", "startedAt")
  VALUES (group_id, profile_id, effective_start)
  ON CONFLICT ("groupLinkId", "profileId") WHERE "endedAt" IS NULL DO NOTHING;
END;
$$;

-- Covers every profile creation path, including nested account registration.
-- No login/update trigger: leaving must not cause automatic re-enrollment.
CREATE FUNCTION enroll_network_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "GroupLinkMember" ("groupLinkId", "profileId", "joinedAt")
  SELECT g.id, NEW.id, clock_timestamp() FROM "GroupLink" g
  WHERE g."systemKey" = 'BVRLY' AND g."isActive"
    AND (g."expiresAt" IS NULL OR g."expiresAt" > CURRENT_TIMESTAMP)
    AND NOT EXISTS (SELECT 1 FROM "CommunityMembershipHistory" h WHERE h."groupLinkId" = g.id AND h."profileId" = NEW.id)
  ON CONFLICT ("groupLinkId", "profileId") DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER network_profile_enrollment AFTER INSERT ON "Profile"
FOR EACH ROW EXECUTE FUNCTION enroll_network_profile();

-- Activation/backfill is a separate, explicit administration step.
COMMIT;
