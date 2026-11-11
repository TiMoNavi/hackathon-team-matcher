/*
  Warnings:

  - A unique constraint covering the columns `[reporterId,postId,commentId,targetUserId]` on the table `Report` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_postId_commentId_targetUserId_key" ON "public"."Report"("reporterId", "postId", "commentId", "targetUserId");
