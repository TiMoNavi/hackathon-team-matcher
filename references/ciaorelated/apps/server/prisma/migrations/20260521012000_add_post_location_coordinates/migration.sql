ALTER TABLE "Post"
ADD COLUMN "locationLat" DOUBLE PRECISION,
ADD COLUMN "locationLng" DOUBLE PRECISION;

CREATE INDEX "Post_locationLat_locationLng_idx" ON "Post"("locationLat", "locationLng");
