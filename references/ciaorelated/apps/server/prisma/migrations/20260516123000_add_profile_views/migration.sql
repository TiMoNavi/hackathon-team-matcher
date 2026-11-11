CREATE TABLE IF NOT EXISTS "ProfileView" (
  "targetId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("targetId", "viewerId")
);

DO $$ BEGIN
  ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ProfileView_targetId_viewedAt_idx" ON "ProfileView"("targetId", "viewedAt");
CREATE INDEX IF NOT EXISTS "ProfileView_viewerId_viewedAt_idx" ON "ProfileView"("viewerId", "viewedAt");
