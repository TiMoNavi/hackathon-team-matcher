-- CreateEnum
CREATE TYPE "ContextKind" AS ENUM ('CITY', 'EDU_LEVEL', 'EDU_ORG', 'EDU_FIELD', 'INTEREST', 'PLACE', 'VLOG', 'TOPIC');

-- CreateEnum
CREATE TYPE "ContextSource" AS ENUM ('SEED', 'POST', 'LIKE', 'FOLLOW', 'IMPORT');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifyCodeHash" TEXT,
ADD COLUMN     "emailVerifyExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "city" TEXT,
ADD COLUMN     "educationField" TEXT,
ADD COLUMN     "educationGradYear" INTEGER,
ADD COLUMN     "educationLevel" TEXT,
ADD COLUMN     "educationOrg" TEXT,
ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Context" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "ContextKind" NOT NULL,
    "label" TEXT NOT NULL,
    "cityScoped" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileContext" (
    "profileId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "ContextSource" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileContext_pkey" PRIMARY KEY ("profileId","contextId","source")
);

-- CreateTable
CREATE TABLE "PostContext" (
    "postId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "source" "ContextSource" NOT NULL,

    CONSTRAINT "PostContext_pkey" PRIMARY KEY ("postId","contextId","source")
);

-- CreateIndex
CREATE UNIQUE INDEX "Context_key_key" ON "Context"("key");

-- CreateIndex
CREATE INDEX "Context_kind_idx" ON "Context"("kind");

-- CreateIndex
CREATE INDEX "Context_key_idx" ON "Context"("key");

-- CreateIndex
CREATE INDEX "ProfileContext_profileId_idx" ON "ProfileContext"("profileId");

-- CreateIndex
CREATE INDEX "ProfileContext_contextId_idx" ON "ProfileContext"("contextId");

-- CreateIndex
CREATE INDEX "PostContext_postId_idx" ON "PostContext"("postId");

-- CreateIndex
CREATE INDEX "PostContext_contextId_idx" ON "PostContext"("contextId");

-- AddForeignKey
ALTER TABLE "ProfileContext" ADD CONSTRAINT "ProfileContext_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileContext" ADD CONSTRAINT "ProfileContext_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContext" ADD CONSTRAINT "PostContext_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostContext" ADD CONSTRAINT "PostContext_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;
