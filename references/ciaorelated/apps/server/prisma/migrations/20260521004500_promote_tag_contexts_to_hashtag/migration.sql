UPDATE "Context"
SET "kind" = 'HASHTAG'
WHERE "key" LIKE 'tag:%'
  AND "kind" <> 'HASHTAG';
