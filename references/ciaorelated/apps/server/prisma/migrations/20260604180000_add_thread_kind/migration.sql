CREATE TYPE "ThreadKind" AS ENUM ('DM', 'GROUP', 'COMMUNITY', 'BROADCAST');

ALTER TABLE "Thread" ADD COLUMN "kind" "ThreadKind" NOT NULL DEFAULT 'DM';

UPDATE "Thread"
SET "kind" = 'COMMUNITY'
WHERE "groupKey" LIKE 'community:%';

UPDATE "Thread"
SET "kind" = 'GROUP'
WHERE "groupKey" IS NOT NULL
  AND "groupKey" NOT LIKE 'community:%';

UPDATE "Thread"
SET "kind" = 'DM'
WHERE "dmKey" IS NOT NULL;
