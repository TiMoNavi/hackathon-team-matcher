-- CreateTable
CREATE TABLE "public"."Story" (
    "id" TEXT NOT NULL,
    "mediaKey" TEXT,
    "thumbKey" TEXT,
    "mime" TEXT NOT NULL,
    "duration" INTEGER,
    "isCloseFriends" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Story_authorId_createdAt_idx" ON "public"."Story"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Story" ADD CONSTRAINT "Story_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
