/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `GroupLink` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "GroupLink" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GroupLink_slug_key" ON "GroupLink"("slug");
