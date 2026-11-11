/*
  Warnings:

  - A unique constraint covering the columns `[dmKey]` on the table `Thread` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[groupKey]` on the table `Thread` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Thread" ADD COLUMN     "dmKey" TEXT,
ADD COLUMN     "groupKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Thread_dmKey_key" ON "public"."Thread"("dmKey");

-- CreateIndex
CREATE UNIQUE INDEX "Thread_groupKey_key" ON "public"."Thread"("groupKey");
