// apps/server/src/lib/context/hashtagPromotion.ts
import type { PrismaClient, Prisma } from "@prisma/client";
import { ensureContext } from "./ensureContext";

type Db = PrismaClient | Prisma.TransactionClient;

const MIN_DISTINCT_POSTS = 1;
const MIN_UNIQUE_LIKERS = 2;

function normalizeTag(raw: string) {
  return String(raw ?? "").trim().replace(/^#/, "").toLowerCase();
}
function hashtagContextKey(tag: string) {
  return `tag:${tag}`;
}

export async function maybePromoteHashtagContexts(db: Db, likedPostId: string) {
  // 1) tags on this liked post
  const rows = await db.postHashtag.findMany({
    where: { postId: likedPostId },
    select: { tag: true },
  });

  const tags = Array.from(new Set(rows.map(r => normalizeTag(r.tag)).filter(Boolean)));
  if (!tags.length) return;

  for (const tag of tags) {
    // 2) Resonanz: Posts zählen unabhängig von Likes, Likes separat zählen
    const agg = await db.$queryRaw<
      Array<{ postCount: number; uniqueLikerCount: number; likeCount: number }>
    >`
      SELECT
        COUNT(DISTINCT ph."postId")::int AS "postCount",
        COUNT(DISTINCT l."userId")::int AS "uniqueLikerCount",
        COUNT(l."userId")::int AS "likeCount"
      FROM "PostHashtag" ph
      LEFT JOIN "Like" l ON l."postId" = ph."postId"
      WHERE ph.tag = ${tag};
    `;

    const row = agg?.[0];
    const postCount = row?.postCount ?? 0;
    const uniqueLikerCount = row?.uniqueLikerCount ?? 0;

    if (postCount < MIN_DISTINCT_POSTS) continue;
    if (uniqueLikerCount < MIN_UNIQUE_LIKERS) continue;

    // 3) ensure Context
    const key = hashtagContextKey(tag);
    const ctx =
      (await db.context.findUnique({ where: { key } })) ??
      (await ensureContext(db as any, {
        kind: "HASHTAG" as any,
        key,
        label: `#${tag}`,
        cityScoped: true,
      }));

    // 4) attach context to ALL posts with this hashtag
    const posts = await db.postHashtag.findMany({
      where: { tag },
      select: { postId: true },
      distinct: ["postId"],
    });
    if (!posts.length) continue;

    await db.postContext.createMany({
      data: posts.map((p) => ({
        postId: p.postId,
        contextId: ctx.id,
        weight: 1.0,
        source: "POST", // ✅ nicht POST (damit reindex(POST) es nicht löscht)
      })),
      skipDuplicates: true,
    });
  }
}
