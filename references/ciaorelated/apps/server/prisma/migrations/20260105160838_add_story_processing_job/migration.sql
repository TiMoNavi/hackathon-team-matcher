-- CreateTable
CREATE TABLE "StoryProcessingJob" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "status" "MediaProcessStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryProcessingJob_storyId_key" ON "StoryProcessingJob"("storyId");

-- CreateIndex
CREATE INDEX "StoryProcessingJob_status_createdAt_idx" ON "StoryProcessingJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "StoryProcessingJob" ADD CONSTRAINT "StoryProcessingJob_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
