-- CreateTable
CREATE TABLE "AvatarProcessingJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "MediaProcessStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarProcessingJob_profileId_key" ON "AvatarProcessingJob"("profileId");

-- CreateIndex
CREATE INDEX "AvatarProcessingJob_status_createdAt_idx" ON "AvatarProcessingJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AvatarProcessingJob" ADD CONSTRAINT "AvatarProcessingJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
