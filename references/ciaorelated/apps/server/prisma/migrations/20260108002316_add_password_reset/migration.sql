-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "passwordResetCodeHash" TEXT,
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetSentAt" TIMESTAMP(3);
