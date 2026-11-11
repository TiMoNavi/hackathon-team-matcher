// apps/server/src/resolvers/contextSearchResolvers.ts
import type { Ctx } from "../context";
import { Prisma } from "@prisma/client";
import { visiblePostSql } from "../lib/postVisibility";
import { normalizeTag } from "../lib/context/hashtags";
import { normalizePlaceLabel } from "../lib/geo/placeLabel";

type Hit = {
  kind: "CONTEXT" | "HASHTAG";
  score: number;

  contextId?: string;
  contextKey?: string;
  label?: string;
  contextKind?: string;

  hashtag?: string;
  hashtagKey?: string;

  postCount: number;
  uniqueLikerCount: number;
  likeCount: number;
  isPromoted: boolean;
};

function normalizeQueryForSearch(q: string) {
  const raw = String(q ?? "").trim().toLowerCase();
  if (!raw) return null;

  // if user types "#foo" treat it as tag candidate
  const tag = raw.startsWith("#") ? normalizeTag(raw) : null;

  // also normalize for label search (remove punctuation/spaces)
  const alnum = raw
    .replace(/^[@#]+/, "")
    .replace(/[^a-z0-9äöüß]+/gi, "");

  const labelNorm = alnum.endsWith("s") && alnum.length > 3 ? alnum.slice(0, -1) : alnum;

  return { raw, labelNorm, tagNorm: tag };
}

function compactLabelKey(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export const contextSearchResolvers = {
  Query: {
    searchContexts: async (
      _: unknown,
      { q, limit = 20, windowHours = 168 }: { q: string; limit?: number; windowHours?: number },
      ctx: Ctx
    ): Promise<Hit[]> => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const norm = normalizeQueryForSearch(q);
      if (!norm?.labelNorm) return [];

      const lim = Math.max(1, Math.min(50, limit));
      const hours = Math.max(1, Math.min(24 * 30, windowHours));
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      // A) CONTEXT hits
      const contextRows = await ctx.prisma.$queryRaw<
        Array<{ contextId: string; key: string; label: string; kind: string; score: number }>
      >`
        SELECT
          c.id AS "contextId",
          c.key AS "key",
          c.label AS "label",
          (
            CASE
              WHEN c.kind::text = 'HASHTAG' OR c.key LIKE 'tag:%' THEN 'HASHTAG'
              ELSE c.kind::text
            END
          ) AS "kind",
          (
            CASE
              WHEN regexp_replace(lower(c.label), '[^a-z0-9äöüß]+', '', 'g') = ${norm.labelNorm} THEN 300
              WHEN regexp_replace(lower(c.label), '[^a-z0-9äöüß]+', '', 'g') LIKE ${norm.labelNorm} || '%' THEN 200
              WHEN regexp_replace(lower(c.label), '[^a-z0-9äöüß]+', '', 'g') LIKE '%' || ${norm.labelNorm} || '%' THEN 120
              WHEN regexp_replace(lower(c.key),   '[^a-z0-9äöüß]+', '', 'g') LIKE ${norm.labelNorm} || '%' THEN 100
              ELSE 0
            END
          )::float AS "score"
        FROM "Context" c
        WHERE
          c.kind IN ('CITY','TOPIC','INTEREST','HASHTAG','EDU_FIELD','EDU_ORG','EDU_LEVEL','PLACE')
          AND c.key NOT LIKE 'group:%' AND c."groupLinkId" IS NULL
          AND (EXISTS (SELECT 1 FROM "ProfileContext" seed WHERE seed."contextId" = c.id AND seed.source = 'SEED')
            OR EXISTS (SELECT 1 FROM "PostContext" pc WHERE pc."contextId" = c.id
              AND ${visiblePostSql(ctx, Prisma.sql`pc."postId"`)}))
          AND (
            regexp_replace(lower(c.label), '[^a-z0-9äöüß]+', '', 'g') LIKE '%' || ${norm.labelNorm} || '%'
            OR regexp_replace(lower(c.key),   '[^a-z0-9äöüß]+', '', 'g') LIKE '%' || ${norm.labelNorm} || '%'
          )
        ORDER BY "score" DESC, c.label ASC
        LIMIT ${lim};
      `;

      // B) HASHTAG hits (latent + promoted signal)
      // We match by tag prefix/substring
      const tagRows = await ctx.prisma.$queryRaw<
        Array<{
          tag: string;
          postCount: number;
          uniqueLikerCount: number;
          likeCount: number;
          isPromoted: boolean;
          score: number;
        }>
      >`
        SELECT
          ph.tag AS "tag",
          COUNT(DISTINCT ph."postId")::int AS "postCount",
          COUNT(DISTINCT l."userId")::int AS "uniqueLikerCount",
          COUNT(*)::int AS "likeCount",
          (c.id IS NOT NULL) AS "isPromoted",
          (
            CASE
              WHEN ph.tag = ${norm.tagNorm ?? norm.labelNorm} THEN 260
              WHEN ph.tag LIKE (${norm.tagNorm ?? norm.labelNorm} || '%') THEN 180
              WHEN ph.tag LIKE ('%' || ${norm.tagNorm ?? norm.labelNorm} || '%') THEN 120
              ELSE 0
            END
          )::float AS "score"
        FROM "PostHashtag" ph
        LEFT JOIN "Like" l ON l."postId" = ph."postId" AND l."createdAt" >= ${since}
        LEFT JOIN "Context" c ON c.key = ('tag:' || ph.tag)
        WHERE
          ph.tag LIKE ('%' || ${norm.tagNorm ?? norm.labelNorm} || '%')
          AND ${visiblePostSql(ctx, Prisma.sql`ph."postId"`)}
        GROUP BY ph.tag, c.id
        ORDER BY "score" DESC, "uniqueLikerCount" DESC, "likeCount" DESC, "postCount" DESC
        LIMIT ${Math.max(10, Math.min(30, lim))};
      `;

      const hits: Hit[] = [];

      for (const r of contextRows) {
        hits.push({
          kind: "CONTEXT",
          score: Number(r.score) || 0,
          contextId: r.contextId,
          contextKey: r.key,
          label: r.label,
          contextKind: r.kind,
          postCount: 0,
          uniqueLikerCount: 0,
          likeCount: 0,
          isPromoted: true,
        });
      }

      for (const r of tagRows) {
        hits.push({
          kind: "HASHTAG",
          score: Number(r.score) || 0,
          hashtag: `#${r.tag}`,
          hashtagKey: r.tag,
          postCount: r.postCount ?? 0,
          uniqueLikerCount: r.uniqueLikerCount ?? 0,
          likeCount: r.likeCount ?? 0,
          isPromoted: !!r.isPromoted,
        });
      }

      // ✅ Merge + de-dup (if hashtag already promoted and exists as context, keep context first)
      const seen = new Set<string>();
      const out: Hit[] = [];
      for (const h of hits.sort((a, b) => (b.score - a.score))) {
        const k =
          h.kind === "CONTEXT"
            ? String(h.contextKey ?? "").startsWith("tag:")
              ? `t:${String(h.contextKey).slice("tag:".length)}`
              : h.contextKind === "CITY" || h.contextKind === "PLACE"
                ? (() => {
                    const geoKey = compactLabelKey(normalizePlaceLabel(h.label) ?? h.label);
                    return `geo:${geoKey.startsWith(norm.labelNorm) ? norm.labelNorm : geoKey}`;
                  })()
              : `c:${h.contextKey}`
            : `t:${h.hashtagKey}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(h);
        if (out.length >= lim) break;
      }

      return out;
    },
  },
};
