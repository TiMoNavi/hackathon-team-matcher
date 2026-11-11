-- CreateEnum
CREATE TYPE "public"."FollowRequestStatus" AS ENUM ('PENDING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."NotificationKind" ADD VALUE 'FOLLOW_REQUEST';
ALTER TYPE "public"."NotificationKind" ADD VALUE 'FOLLOW_REQUEST_ACCEPTED';

-- CreateTable
CREATE TABLE "public"."FollowRequest" (
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "public"."FollowRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("requesterId","targetId")
);

-- CreateIndex
CREATE INDEX "FollowRequest_targetId_createdAt_idx" ON "public"."FollowRequest"("targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."FollowRequest" ADD CONSTRAINT "FollowRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FollowRequest" ADD CONSTRAINT "FollowRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
