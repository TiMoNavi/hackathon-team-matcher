ALTER TYPE "GroupLinkType" ADD VALUE IF NOT EXISTS 'DROP';
CREATE TYPE "GroupLinkVisibility" AS ENUM ('PRIVATE', 'PUBLIC');
ALTER TABLE "GroupLink" ADD COLUMN "visibility" "GroupLinkVisibility" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "Context" ADD COLUMN "groupLinkId" TEXT;
CREATE UNIQUE INDEX "Context_groupLinkId_key" ON "Context"("groupLinkId");
ALTER TABLE "Context" ADD CONSTRAINT "Context_groupLinkId_fkey"
  FOREIGN KEY ("groupLinkId") REFERENCES "GroupLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Context" c SET "groupLinkId" = g.id
FROM "GroupLink" g WHERE c.key = 'group:' || g.id;

-- Creation-only visibility, including writes outside GraphQL.
CREATE FUNCTION prevent_group_visibility_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    RAISE EXCEPTION 'COMMUNITY_VISIBILITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER group_visibility_immutable BEFORE UPDATE OF visibility ON "GroupLink"
FOR EACH ROW EXECUTE FUNCTION prevent_group_visibility_change();
