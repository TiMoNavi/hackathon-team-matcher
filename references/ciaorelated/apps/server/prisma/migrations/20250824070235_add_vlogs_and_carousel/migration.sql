-- CreateEnum
CREATE TYPE "public"."VlogPrivacy" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."VlogRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'INVITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "public"."TagStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "public"."Vlog" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverKey" TEXT,
    "privacy" "public"."VlogPrivacy" NOT NULL DEFAULT 'PUBLIC',
    "ownerId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VlogMember" (
    "vlogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."VlogRole" NOT NULL DEFAULT 'MEMBER',
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VlogMember_pkey" PRIMARY KEY ("vlogId","userId")
);

-- CreateTable
CREATE TABLE "public"."PostVlogTag" (
    "postId" TEXT NOT NULL,
    "vlogId" TEXT NOT NULL,
    "status" "public"."TagStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostVlogTag_pkey" PRIMARY KEY ("postId","vlogId")
);

-- CreateTable
CREATE TABLE "public"."PostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "kind" "public"."MediaKind" NOT NULL,
    "key" TEXT NOT NULL,
    "thumbKey" TEXT,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationS" INTEGER,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vlog_slug_key" ON "public"."Vlog"("slug");

-- CreateIndex
CREATE INDEX "Vlog_ownerId_privacy_idx" ON "public"."Vlog"("ownerId", "privacy");

-- CreateIndex
CREATE INDEX "VlogMember_userId_status_idx" ON "public"."VlogMember"("userId", "status");

-- CreateIndex
CREATE INDEX "PostVlogTag_vlogId_status_idx" ON "public"."PostVlogTag"("vlogId", "status");

-- CreateIndex
CREATE INDEX "PostMedia_postId_idx" ON "public"."PostMedia"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostMedia_postId_idx_key" ON "public"."PostMedia"("postId", "idx");

-- AddForeignKey
ALTER TABLE "public"."Vlog" ADD CONSTRAINT "Vlog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VlogMember" ADD CONSTRAINT "VlogMember_vlogId_fkey" FOREIGN KEY ("vlogId") REFERENCES "public"."Vlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VlogMember" ADD CONSTRAINT "VlogMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PostVlogTag" ADD CONSTRAINT "PostVlogTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PostVlogTag" ADD CONSTRAINT "PostVlogTag_vlogId_fkey" FOREIGN KEY ("vlogId") REFERENCES "public"."Vlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
