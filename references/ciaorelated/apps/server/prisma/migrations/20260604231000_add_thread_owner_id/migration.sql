ALTER TABLE "Thread" ADD COLUMN "ownerId" TEXT;

UPDATE "Thread" t
SET "ownerId" = (
  SELECT tm."userId"
  FROM "ThreadMember" tm
  WHERE tm."threadId" = t.id
  ORDER BY tm."lastReadAt" ASC, tm.id ASC
  LIMIT 1
)
WHERE t."kind" = 'GROUP'
  AND t."ownerId" IS NULL;
