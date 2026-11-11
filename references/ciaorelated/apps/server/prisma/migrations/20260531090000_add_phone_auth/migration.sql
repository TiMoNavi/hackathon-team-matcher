-- Make auth methods optional so one account can be reached by email and/or phone.
ALTER TABLE "Account" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Account" ALTER COLUMN "password" DROP NOT NULL;

ALTER TABLE "Account" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "Account" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Account_phoneNumber_key" ON "Account"("phoneNumber");

CREATE TABLE "PhoneVerificationCode" (
  "phoneNumber" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PhoneVerificationCode_pkey" PRIMARY KEY ("phoneNumber")
);
