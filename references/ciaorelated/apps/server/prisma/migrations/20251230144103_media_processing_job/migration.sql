-- CreateEnum
CREATE TYPE "MediaProcessStatus" AS ENUM ('NONE', 'PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "PostMedia" ADD COLUMN     "edit" JSONB,
ADD COLUMN     "processError" TEXT,
ADD COLUMN     "processStatus" "MediaProcessStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "renderedKey" TEXT,
ADD COLUMN     "renderedThumb" TEXT;
