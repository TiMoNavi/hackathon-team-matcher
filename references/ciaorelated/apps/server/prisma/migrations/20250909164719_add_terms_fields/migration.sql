-- AlterTable
ALTER TABLE "public"."Profile" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersionAccepted" INTEGER;

-- CreateTable
CREATE TABLE "public"."AppConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "currentTermsVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);
