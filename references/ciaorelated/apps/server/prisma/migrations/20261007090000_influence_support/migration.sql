BEGIN;

CREATE TABLE "CommunityInfluenceSupport" (
  "groupLinkId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "recipientId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityInfluenceSupport_pkey" PRIMARY KEY ("groupLinkId", "profileId"),
  CONSTRAINT "CommunityInfluenceSupport_history_fkey" FOREIGN KEY ("groupLinkId", "profileId")
    REFERENCES "CommunityMembershipHistory" ("groupLinkId", "profileId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityInfluenceSupport_recipientId_fkey" FOREIGN KEY ("recipientId")
    REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommunityInfluenceSupport_not_self" CHECK ("recipientId" IS NULL OR "recipientId" <> "profileId")
);
CREATE INDEX "CommunityInfluenceSupport_recipientId_idx" ON "CommunityInfluenceSupport" ("recipientId");

COMMIT;
