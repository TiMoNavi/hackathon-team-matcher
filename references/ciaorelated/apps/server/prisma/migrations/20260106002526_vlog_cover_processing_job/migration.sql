-- CreateTable
CREATE TABLE "VlogCoverProcessingJob" (
    "id" TEXT NOT NULL,
    "vlogId" TEXT NOT NULL,
    "status" "MediaProcessStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VlogCoverProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VlogCoverProcessingJob_vlogId_key" ON "VlogCoverProcessingJob"("vlogId");

-- CreateIndex
CREATE INDEX "VlogCoverProcessingJob_status_createdAt_idx" ON "VlogCoverProcessingJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "VlogCoverProcessingJob" ADD CONSTRAINT "VlogCoverProcessingJob_vlogId_fkey" FOREIGN KEY ("vlogId") REFERENCES "Vlog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
