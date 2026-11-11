-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "requestStatus" "RequestStatus";
