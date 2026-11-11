// apps/server/src/lib/context/postHashtags.ts
import { extractHashtags } from "./hashtags";
import type { PrismaClient } from "@prisma/client";

export async function indexPostHashtags(prisma: PrismaClient, postId: string, caption?: string | null) {
  const tags = extractHashtags(caption);
  if (!tags.length) return [];

  await prisma.postHashtag.createMany({
    data: tags.map((t) => ({ postId, tag: t })),
    skipDuplicates: true,
  });

  return tags;
}
