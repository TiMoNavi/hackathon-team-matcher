-- CreateEnum
CREATE TYPE "GroupLinkType" AS ENUM ('FAMILY', 'UNI', 'BUSINESS', 'EVENT', 'OTHER');

-- CreateTable
CREATE TABLE "GroupLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "GroupLinkType" NOT NULL DEFAULT 'OTHER',
    "ownerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "GroupLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupLinkMember" (
    "groupLinkId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupLinkMember_pkey" PRIMARY KEY ("groupLinkId","profileId")
);

-- CreateTable
CREATE TABLE "Connection" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "groupLinkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("fromId","toId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupLink_code_key" ON "GroupLink"("code");

-- CreateIndex
CREATE INDEX "GroupLink_ownerId_createdAt_idx" ON "GroupLink"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupLinkMember_profileId_joinedAt_idx" ON "GroupLinkMember"("profileId", "joinedAt");

-- CreateIndex
CREATE INDEX "Connection_fromId_createdAt_idx" ON "Connection"("fromId", "createdAt");

-- CreateIndex
CREATE INDEX "Connection_toId_createdAt_idx" ON "Connection"("toId", "createdAt");

-- CreateIndex
CREATE INDEX "Connection_groupLinkId_idx" ON "Connection"("groupLinkId");

-- AddForeignKey
ALTER TABLE "GroupLink" ADD CONSTRAINT "GroupLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupLinkMember" ADD CONSTRAINT "GroupLinkMember_groupLinkId_fkey" FOREIGN KEY ("groupLinkId") REFERENCES "GroupLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupLinkMember" ADD CONSTRAINT "GroupLinkMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_groupLinkId_fkey" FOREIGN KEY ("groupLinkId") REFERENCES "GroupLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
