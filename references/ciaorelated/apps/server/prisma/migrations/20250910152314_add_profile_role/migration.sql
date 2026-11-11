-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "public"."Profile" ADD COLUMN     "role" "public"."Role" NOT NULL DEFAULT 'USER';
