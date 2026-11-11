-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];
