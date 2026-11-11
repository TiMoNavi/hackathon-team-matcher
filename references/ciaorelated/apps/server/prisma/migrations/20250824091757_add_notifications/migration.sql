-- CreateEnum
CREATE TYPE "public"."NotificationKind" AS ENUM ('VLOG_TAG_REQUEST', 'VLOG_TAG_APPROVED', 'VLOG_TAG_REJECTED', 'FOLLOW', 'LIKE', 'COMMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('INBOX', 'ACTIVITY', 'BOTH');

-- AlterTable
ALTER TABLE "public"."PostMedia" ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "thumbUrl" TEXT,
ADD COLUMN     "videoKey" TEXT,
ADD COLUMN     "videoUrl" TEXT;

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "actorId" TEXT,
    "kind" "public"."NotificationKind" NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL DEFAULT 'ACTIVITY',
    "postId" TEXT,
    "vlogId" TEXT,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "public"."Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_kind_channel_idx" ON "public"."Notification"("kind", "channel");

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_vlogId_fkey" FOREIGN KEY ("vlogId") REFERENCES "public"."Vlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
