ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "uniqueViewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PostView" ADD COLUMN IF NOT EXISTS "count" INTEGER NOT NULL DEFAULT 1;

UPDATE "Post"
SET "uniqueViewCount" = "viewCount"
WHERE "uniqueViewCount" = 0 AND "viewCount" > 0;
