-- AlterEnum
ALTER TYPE "public"."ReportStatus" ADD VALUE 'RESOLVED';

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "public"."Report"("status", "createdAt");
