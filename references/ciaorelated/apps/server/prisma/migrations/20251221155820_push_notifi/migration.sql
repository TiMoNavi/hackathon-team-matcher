-- AlterTable
ALTER TABLE "public"."Profile" ADD COLUMN     "pushToken" TEXT,
ADD COLUMN     "pushTokenUpdatedAt" TIMESTAMP(3);
