-- AlterTable
ALTER TABLE "public"."Post" ADD COLUMN     "hideFromGrid" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."PostTag" ADD COLUMN     "showOnProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "public"."TagStatus" NOT NULL DEFAULT 'PENDING';
