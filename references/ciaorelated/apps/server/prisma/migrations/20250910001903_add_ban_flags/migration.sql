-- AlterTable
ALTER TABLE "public"."Profile" ADD COLUMN     "bannedReason" TEXT,
ADD COLUMN     "bannedUntil" TIMESTAMPTZ(6);
