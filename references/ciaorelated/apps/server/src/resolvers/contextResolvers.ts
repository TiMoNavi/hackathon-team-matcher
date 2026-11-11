import { visiblePostWhere, visiblePostSql } from "../lib/postVisibility";
import { Prisma } from "@prisma/client";
// apps/server/src/resolvers/contextResolvers.ts
import type { Ctx } from "../context";
import { UserInputError } from "apollo-server-errors";
import { setProfileSeedContexts } from "../lib/context/engine";
import { getBlockedSets } from "../lib/blocks";
import { geocodeCity } from "../lib/geo/geocodeCity";
import { normalizePlaceLabel } from "../lib/geo/placeLabel";

function validLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const outLat = Number(lat);
  const outLng = Number(lng);
  if (!Number.isFinite(outLat) || !Number.isFinite(outLng)) return null;
  if (outLat < -90 || outLat > 90 || outLng < -180 || outLng > 180) return null;
  return { lat: outLat, lng: outLng };
}

function compactLabelKey(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export default {
  Query: {
    contextBubbles: async (
      _: unknown,
      { city, limit = 20, windowHours = 24 }: { city?: string | null; limit?: number; windowHours?: number },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const hours = Math.max(1, Math.min(24 * 90, windowHours));
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const seedSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenAuthorIds = [...new Set([...blockedByMe, ...blockedMe])];
      const followingIds = (
        await ctx.prisma.follow.findMany({
          where: { followerId: ctx.profileId },
          select: { followingId: true },
        })
      ).map((f) => f.followingId);

      const meProfileForScope = await ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId },
        select: { city: true, cityLat: true, cityLng: true, cityRegion: true, cityCountry: true },
      });

      // Param > Profile label, but keep the current profile's own coordinates when possible.
      let effectiveCity = (city ?? "").trim();
      let effectiveRegion = "";
      let effectiveCountry = "";
      let effectiveLat: number | null = null;
      let effectiveLng: number | null = null;

      if (!effectiveCity) {
        effectiveCity = (meProfileForScope?.city ?? "").trim();
        effectiveLat = Number.isFinite(meProfileForScope?.cityLat) ? (meProfileForScope?.cityLat as number) : null;
        effectiveLng = Number.isFinite(meProfileForScope?.cityLng) ? (meProfileForScope?.cityLng as number) : null;
        effectiveRegion = (meProfileForScope?.cityRegion ?? "").trim();
        effectiveCountry = (meProfileForScope?.cityCountry ?? "").trim();
      } else {
        const ownCity = (meProfileForScope?.city ?? "").trim();
        const sameAsOwnCity =
          ownCity &&
          (
            ownCity.toLowerCase() === effectiveCity.toLowerCase() ||
            ownCity.split(",")[0].trim().toLowerCase() === effectiveCity.split(",")[0].trim().toLowerCase()
          );

        if (sameAsOwnCity) {
          effectiveLat = Number.isFinite(meProfileForScope?.cityLat) ? (meProfileForScope?.cityLat as number) : null;
          effectiveLng = Number.isFinite(meProfileForScope?.cityLng) ? (meProfileForScope?.cityLng as number) : null;
          effectiveRegion = (meProfileForScope?.cityRegion ?? "").trim();
          effectiveCountry = (meProfileForScope?.cityCountry ?? "").trim();
        } else {
          // best-effort region/country for param-city (optional)
          const any = await ctx.prisma.profile.findFirst({
            where: { city: effectiveCity },
            select: { cityLat: true, cityLng: true, cityRegion: true, cityCountry: true },
          });
          effectiveLat = Number.isFinite(any?.cityLat) ? (any?.cityLat as number) : null;
          effectiveLng = Number.isFinite(any?.cityLng) ? (any?.cityLng as number) : null;
          effectiveRegion = (any?.cityRegion ?? "").trim();
          effectiveCountry = (any?.cityCountry ?? "").trim();
        }
      }

      if (!effectiveCity) throw new UserInputError("CITY_NOT_SET");

      const effectiveCityBase = effectiveCity.split(",")[0].trim();

      const MIN_DISTINCT_POSTS = 1;
      const MIN_BUBBLES = Math.min(12, Math.max(4, Math.floor(limit / 2)));

      type Row = {
        contextId: string;
        key: string;
        label: string;
        kind: string;
        score: number;
        likeCount: number;
        postCount: number;
        uniqueLikerCount: number;
      };

      const run = async (scope: "LOCAL" | "REGION" | "GLOBAL"): Promise<Row[]> => {
        const useCity = scope === "LOCAL";
        const useRegion = scope === "REGION";

        return ctx.prisma.$queryRaw<Row[]>`
          WITH visible_context_posts AS (
            SELECT
              pc."contextId" AS "contextId",
              pc.weight AS "contextWeight",
              post.id AS "postId",
              post."createdAt" AS "postCreatedAt",
              post."location" AS "postLocation",
              post."locationLat" AS "postLat",
              post."locationLng" AS "postLng",
              my_like."createdAt" AS "interactionCreatedAt",
              author.id AS "authorId",
              author.city AS "authorCity",
              author."cityLat" AS "authorLat",
              author."cityLng" AS "authorLng",
              author."cityRegion" AS "authorRegion",
              author."cityCountry" AS "authorCountry"
            FROM "PostContext" pc
            JOIN "Post" post ON post.id = pc."postId"
            JOIN "Profile" author ON author.id = post."authorId"
            JOIN "Like" my_like
              ON my_like."postId" = post.id
              AND my_like."userId" = ${ctx.profileId}
              AND my_like."createdAt" >= ${since}
            WHERE
              (author."bannedUntil" IS NULL OR author."bannedUntil" < NOW())
              AND (${hiddenAuthorIds.length} = 0 OR NOT (post."authorId" = ANY(${hiddenAuthorIds}::text[])))
              AND ${visiblePostSql(ctx, Prisma.sql`post.id`)}

            UNION ALL

            SELECT
              seed_ctx."contextId" AS "contextId",
              (LEAST(seed_ctx.weight, 10) * 0.35)::float AS "contextWeight",
              post.id AS "postId",
              post."createdAt" AS "postCreatedAt",
              post."location" AS "postLocation",
              post."locationLat" AS "postLat",
              post."locationLng" AS "postLng",
              NOW() AS "interactionCreatedAt",
              author.id AS "authorId",
              author.city AS "authorCity",
              author."cityLat" AS "authorLat",
              author."cityLng" AS "authorLng",
              author."cityRegion" AS "authorRegion",
              author."cityCountry" AS "authorCountry"
            FROM "ProfileContext" seed_ctx
            JOIN "Context" seed_context ON seed_context.id = seed_ctx."contextId"
            JOIN "Profile" viewer_profile ON viewer_profile.id = seed_ctx."profileId"
            JOIN "Post" post ON post."createdAt" >= ${seedSince}
            JOIN "Profile" author ON author.id = post."authorId"
            WHERE
              seed_ctx."profileId" = ${ctx.profileId}
              AND seed_ctx.source::text = 'SEED'
              AND seed_ctx.weight > 0
              AND seed_context.kind::text = 'CITY'
              AND (
                (
                  viewer_profile."cityLat" IS NOT NULL
                  AND viewer_profile."cityLng" IS NOT NULL
                  AND (
                    (
                      post."locationLat" IS NOT NULL
                      AND post."locationLng" IS NOT NULL
                      AND (
                        6371 * 2 * ASIN(
                          SQRT(
                            POWER(SIN(RADIANS((post."locationLat" - viewer_profile."cityLat") / 2)), 2)
                            + COS(RADIANS(viewer_profile."cityLat"))
                              * COS(RADIANS(post."locationLat"))
                              * POWER(SIN(RADIANS((post."locationLng" - viewer_profile."cityLng") / 2)), 2)
                          )
                        )
                      ) <= 300
                    )
                    OR
                    (
                      author."cityLat" IS NOT NULL
                      AND author."cityLng" IS NOT NULL
                      AND (
                        6371 * 2 * ASIN(
                          SQRT(
                            POWER(SIN(RADIANS((author."cityLat" - viewer_profile."cityLat") / 2)), 2)
                            + COS(RADIANS(viewer_profile."cityLat"))
                              * COS(RADIANS(author."cityLat"))
                              * POWER(SIN(RADIANS((author."cityLng" - viewer_profile."cityLng") / 2)), 2)
                          )
                        )
                      ) <= 300
                    )
                  )
                )
                OR
                post.location = seed_context.label
                OR post.location = SPLIT_PART(seed_context.label, ',', 1)
                OR post.location ILIKE (SPLIT_PART(seed_context.label, ',', 1) || ',%')
                OR post.location ILIKE (SPLIT_PART(seed_context.label, ',', 1) || '%')
                OR
                (
                  viewer_profile."cityLat" IS NOT NULL
                  AND viewer_profile."cityLng" IS NOT NULL
                  AND author."cityLat" IS NOT NULL
                  AND author."cityLng" IS NOT NULL
                  AND (
                    6371 * 2 * ASIN(
                      SQRT(
                        POWER(SIN(RADIANS((author."cityLat" - viewer_profile."cityLat") / 2)), 2)
                        + COS(RADIANS(viewer_profile."cityLat"))
                          * COS(RADIANS(author."cityLat"))
                          * POWER(SIN(RADIANS((author."cityLng" - viewer_profile."cityLng") / 2)), 2)
                      )
                    )
                  ) <= 100
                )
                OR
                author.city = seed_context.label
                OR author.city = SPLIT_PART(seed_context.label, ',', 1)
                OR author.city ILIKE (SPLIT_PART(seed_context.label, ',', 1) || ',%')
                OR author.city ILIKE (SPLIT_PART(seed_context.label, ',', 1) || '%')
              )
              AND (author."bannedUntil" IS NULL OR author."bannedUntil" < NOW())
              AND (${hiddenAuthorIds.length} = 0 OR NOT (post."authorId" = ANY(${hiddenAuthorIds}::text[])))
              AND ${visiblePostSql(ctx, Prisma.sql`post.id`)}

            UNION ALL

            SELECT
              pc."contextId" AS "contextId",
              (pc.weight * LEAST(seed_ctx.weight, 10) * 0.18)::float AS "contextWeight",
              post.id AS "postId",
              post."createdAt" AS "postCreatedAt",
              post."location" AS "postLocation",
              post."locationLat" AS "postLat",
              post."locationLng" AS "postLng",
              seed_ctx."updatedAt" AS "interactionCreatedAt",
              author.id AS "authorId",
              author.city AS "authorCity",
              author."cityLat" AS "authorLat",
              author."cityLng" AS "authorLng",
              author."cityRegion" AS "authorRegion",
              author."cityCountry" AS "authorCountry"
            FROM "ProfileContext" seed_ctx
            JOIN "PostContext" pc ON pc."contextId" = seed_ctx."contextId"
            JOIN "Post" post ON post.id = pc."postId"
            JOIN "Profile" author ON author.id = post."authorId"
            WHERE
              seed_ctx."profileId" = ${ctx.profileId}
              AND seed_ctx.source::text = 'SEED'
              AND seed_ctx.weight > 0
              AND seed_ctx."contextId" NOT IN (
                SELECT id FROM "Context" WHERE kind::text = 'CITY'
              )
              AND post."createdAt" >= ${seedSince}
              AND (author."bannedUntil" IS NULL OR author."bannedUntil" < NOW())
              AND (${hiddenAuthorIds.length} = 0 OR NOT (post."authorId" = ANY(${hiddenAuthorIds}::text[])))
              AND ${visiblePostSql(ctx, Prisma.sql`post.id`)}

          ),
          context_like_stats AS (
            SELECT
              vcp."contextId" AS "contextId",
              COUNT(l.*)::int AS "likeCount",
              COUNT(DISTINCT l."userId")::int AS "uniqueLikerCount",
              COALESCE(
                SUM(
                  EXP(
                    -LN(2) * (EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 3600.0) / 18.0
                  )
                ),
                0
              )::float AS "likeScore"
            FROM visible_context_posts vcp
            LEFT JOIN "Like" l
              ON l."postId" = vcp."postId"
              AND l."createdAt" >= ${since}
              AND (${hiddenAuthorIds.length} = 0 OR NOT (l."userId" = ANY(${hiddenAuthorIds}::text[])))
            GROUP BY vcp."contextId"
          )
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
              COALESCE(
                SUM(
                  vcp."contextWeight"
                  * EXP(
                      -LN(2) * (EXTRACT(EPOCH FROM (NOW() - vcp."interactionCreatedAt")) / 3600.0) / 36.0
                    )
                ),
                0
              )
              + (0.45 * COALESCE(MAX(cls."likeScore"), 0))
            )::float AS "score",

            COALESCE(MAX(cls."likeCount"), 0)::int AS "likeCount",
            COUNT(DISTINCT vcp."postId")::int AS "postCount",
            COALESCE(MAX(cls."uniqueLikerCount"), 0)::int AS "uniqueLikerCount"

          FROM visible_context_posts vcp
          JOIN "Context" c ON c.id = vcp."contextId"
          LEFT JOIN context_like_stats cls ON cls."contextId" = c.id

          WHERE
            c.kind IN ('CITY','TOPIC','INTEREST','HASHTAG','EDU_FIELD','EDU_ORG','EDU_LEVEL','PLACE')
            AND c.key NOT LIKE 'group:%'

            AND (
              ${scope} = 'GLOBAL'
              OR (
                ${useCity ? 1 : 0} = 1
                AND (
                  (
                    ${effectiveLat !== null && effectiveLng !== null ? 1 : 0} = 1
                    AND (
                      (
                        vcp."postLat" IS NOT NULL
                        AND vcp."postLng" IS NOT NULL
                        AND (
                          6371 * 2 * ASIN(
                            SQRT(
                              POWER(SIN(RADIANS((vcp."postLat" - ${effectiveLat}) / 2)), 2)
                              + COS(RADIANS(${effectiveLat}))
                                * COS(RADIANS(vcp."postLat"))
                                * POWER(SIN(RADIANS((vcp."postLng" - ${effectiveLng}) / 2)), 2)
                            )
                          )
                        ) <= 300
                      )
                      OR
                      (
                        vcp."authorLat" IS NOT NULL
                        AND vcp."authorLng" IS NOT NULL
                        AND (
                          6371 * 2 * ASIN(
                            SQRT(
                              POWER(SIN(RADIANS((vcp."authorLat" - ${effectiveLat}) / 2)), 2)
                              + COS(RADIANS(${effectiveLat}))
                                * COS(RADIANS(vcp."authorLat"))
                                * POWER(SIN(RADIANS((vcp."authorLng" - ${effectiveLng}) / 2)), 2)
                            )
                          )
                        )
                        <= 300
                      )
                    )
                  )
                  OR vcp."postLocation" = ${effectiveCity}
                  OR vcp."postLocation" = ${effectiveCityBase}
                  OR vcp."postLocation" ILIKE (${effectiveCityBase} || ',%')
                  OR vcp."postLocation" ILIKE (${effectiveCityBase} || '%')
                  OR vcp."authorCity" = ${effectiveCity}
                  OR vcp."authorCity" = ${effectiveCityBase}
                  OR vcp."authorCity" ILIKE (${effectiveCityBase} || ',%')
                  OR vcp."authorCity" ILIKE (${effectiveCityBase} || '%')
                )
              )
              OR c.id IN (
                SELECT seed_context.id
                FROM "ProfileContext" seed_ctx
                JOIN "Context" seed_context ON seed_context.id = seed_ctx."contextId"
                WHERE seed_ctx."profileId" = ${ctx.profileId}
                  AND seed_ctx.source::text = 'SEED'
                  AND seed_context.kind::text <> 'CITY'
              )
              OR (
                ${useRegion ? 1 : 0} = 1
                AND ${effectiveRegion} <> ''
                AND vcp."authorRegion" = ${effectiveRegion}
                AND (${effectiveCountry} = '' OR vcp."authorCountry" = ${effectiveCountry})
              )
            )

          GROUP BY c.id, c.key, c.label, c.kind

          HAVING COUNT(DISTINCT vcp."postId") >= ${MIN_DISTINCT_POSTS}

          ORDER BY
            CASE WHEN c.kind::text = 'CITY' THEN 0 ELSE 1 END ASC,
            "score" DESC,
            "uniqueLikerCount" DESC,
            "likeCount" DESC,
            "postCount" DESC

          LIMIT ${limit};
        `;
      };

      // 1) LOCAL
      let scopeUsed: "LOCAL" | "REGION" | "GLOBAL" = "LOCAL";
      let rows = await run("LOCAL");

      // 2) REGION fallback
      if (rows.length < MIN_BUBBLES && effectiveRegion) {
        scopeUsed = "REGION";
        rows = await run("REGION");
      }

      // 3) GLOBAL fallback
      if (rows.length < MIN_BUBBLES) {
        scopeUsed = "GLOBAL";
        rows = await run("GLOBAL");
      }

      if (!rows.length) return [];

      // ✅ Optional: gib Meta zurück, damit UI nicht "Design · Abtenau" zeigt wenn Region/Global genutzt wurde
      const scopeLabel =
        scopeUsed === "LOCAL"
          ? effectiveCity
          : scopeUsed === "REGION"
            ? (effectiveRegion || effectiveCity)
            : "Global";

      const cityBaseLabel = normalizePlaceLabel(effectiveCityBase) ?? effectiveCityBase;
      const cityBaseKey = compactLabelKey(cityBaseLabel);

      const bubbleByCanonicalKey = new Map<string, any>();
      for (const r of rows) {
        const normalizedKind = String(r.kind ?? "");
        const isGeoContext = normalizedKind === "CITY" || normalizedKind === "PLACE";
        const normalizedLabel = isGeoContext
          ? (normalizePlaceLabel(r.label) ?? r.label)
          : r.label;
        const normalizedLabelKey = compactLabelKey(normalizedLabel);
        const canonicalLabel =
          isGeoContext && cityBaseKey && normalizedLabelKey.startsWith(cityBaseKey)
            ? cityBaseLabel
            : normalizedLabel;
        const canonicalKey =
          isGeoContext
            ? `geo:${compactLabelKey(canonicalLabel)}`
            : `${normalizedKind}:${r.key}`;

        const candidate = {
          contextId: r.contextId,
          key: r.key,
          label: canonicalLabel,
          kind: normalizedKind,
          score: Number(r.score) || 0,
          likeCount: r.likeCount,
          postCount: r.postCount,
          uniqueLikerCount: r.uniqueLikerCount,

          // ✅ NEU (Frontend kann das anzeigen)
          scopeUsed,
          scopeLabel,
          scopeRegion: effectiveRegion || null,
        };

        const prev = bubbleByCanonicalKey.get(canonicalKey);
        if (!prev) {
          bubbleByCanonicalKey.set(canonicalKey, candidate);
          continue;
        }

        const prevIsCity = prev.kind === "CITY";
        const nextIsCity = candidate.kind === "CITY";
        const shouldReplace =
          (!prevIsCity && nextIsCity) ||
          (prevIsCity === nextIsCity && candidate.score > prev.score);

        const winner = shouldReplace ? candidate : prev;
        const loser = shouldReplace ? prev : candidate;
        bubbleByCanonicalKey.set(canonicalKey, {
          ...winner,
          score: Math.max(winner.score, loser.score),
          likeCount: Math.max(Number(winner.likeCount ?? 0), Number(loser.likeCount ?? 0)),
          postCount: Math.max(Number(winner.postCount ?? 0), Number(loser.postCount ?? 0)),
          uniqueLikerCount: Math.max(Number(winner.uniqueLikerCount ?? 0), Number(loser.uniqueLikerCount ?? 0)),
        });
      }

      return Array.from(bubbleByCanonicalKey.values())
        .sort((a, b) => {
          const ak = a.kind === "CITY" ? 0 : 1;
          const bk = b.kind === "CITY" ? 0 : 1;
          if (ak !== bk) return ak - bk;
          return (Number(b.score) || 0) - (Number(a.score) || 0);
        })
        .slice(0, limit) as any;
    },


    suggestPostsByContext: async (
        _: unknown,
        {
          contextKey,
          kind,
          offset = 0,
          limit = 30,
        }: { contextKey: string; kind?: "POST" | "REEL"; offset?: number; limit?: number },
        ctx: Ctx
        ) => {
        if (!ctx.profileId) throw new Error("Not authenticated");

        const key = String(contextKey || "").trim().toLowerCase();
        if (!key) throw new Error("BAD_CONTEXT_KEY");
        const safeOffset = Math.max(0, Number(offset) || 0);
        const safeLimit = Math.min(60, Math.max(1, Number(limit) || 30));

        // Context holen (damit wir contextId haben)
        const context = await ctx.prisma.context.findUnique({
            where: { key },
            select: { id: true, kind: true, label: true },
        });
        if (!context) return [];

        const contextKind = String(context.kind ?? "");
        const isGeoContext = contextKind === "CITY" || contextKind === "PLACE";

        const me = ctx.profileId;

        const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
        const hiddenAuthorIds = [...new Set([...blockedByMe, ...blockedMe])];

        const followingIds = (
        await ctx.prisma.follow.findMany({
            where: { followerId: me },
            select: { followingId: true },
        })
        ).map((f) => f.followingId);

        const meProfile =
          isGeoContext
            ? await ctx.prisma.profile.findUnique({
                where: { id: me },
                select: { cityLat: true, cityLng: true },
              })
            : null;
        const meGeo = validLatLng(meProfile?.cityLat, meProfile?.cityLng);

        const rows = isGeoContext
          ? await ctx.prisma.$queryRaw<Array<{ postId: string }>>`
        WITH ranked_city_posts AS (
          SELECT
            p.id AS "postId",
            p."likeCount",
            p."commentCount",
            p."createdAt",
            CASE
              WHEN ${meGeo ? 1 : 0} = 1
                AND p."locationLat" IS NOT NULL
                AND p."locationLng" IS NOT NULL
              THEN (
                6371 * 2 * ASIN(
                  SQRT(
                    POWER(SIN(RADIANS((p."locationLat" - ${meGeo?.lat ?? null}) / 2)), 2)
                    + COS(RADIANS(${meGeo?.lat ?? null}))
                      * COS(RADIANS(p."locationLat"))
                      * POWER(SIN(RADIANS((p."locationLng" - ${meGeo?.lng ?? null}) / 2)), 2)
                  )
                )
              )
              ELSE NULL
            END AS "postDistanceKm",
            CASE
              WHEN ${meGeo ? 1 : 0} = 1
                AND a."cityLat" IS NOT NULL
                AND a."cityLng" IS NOT NULL
              THEN (
                6371 * 2 * ASIN(
                  SQRT(
                    POWER(SIN(RADIANS((a."cityLat" - ${meGeo?.lat ?? null}) / 2)), 2)
                    + COS(RADIANS(${meGeo?.lat ?? null}))
                      * COS(RADIANS(a."cityLat"))
                      * POWER(SIN(RADIANS((a."cityLng" - ${meGeo?.lng ?? null}) / 2)), 2)
                  )
                )
              )
              ELSE NULL
            END AS "authorDistanceKm"
          FROM "Post" p
          JOIN "Profile" a ON a.id = p."authorId"
          WHERE
            (${kind ? 1 : 0} = 0 OR p.kind = CAST(${kind} AS "PostKind"))

            AND (
              (
                ${meGeo ? 1 : 0} = 1
                AND (
                  (
                    p."locationLat" IS NOT NULL
                    AND p."locationLng" IS NOT NULL
                    AND (
                      6371 * 2 * ASIN(
                        SQRT(
                          POWER(SIN(RADIANS((p."locationLat" - ${meGeo?.lat ?? null}) / 2)), 2)
                          + COS(RADIANS(${meGeo?.lat ?? null}))
                            * COS(RADIANS(p."locationLat"))
                            * POWER(SIN(RADIANS((p."locationLng" - ${meGeo?.lng ?? null}) / 2)), 2)
                        )
                      )
                    ) <= 300
                  )
                  OR
                  (
                    a."cityLat" IS NOT NULL
                    AND a."cityLng" IS NOT NULL
                    AND (
                      6371 * 2 * ASIN(
                        SQRT(
                          POWER(SIN(RADIANS((a."cityLat" - ${meGeo?.lat ?? null}) / 2)), 2)
                          + COS(RADIANS(${meGeo?.lat ?? null}))
                            * COS(RADIANS(a."cityLat"))
                            * POWER(SIN(RADIANS((a."cityLng" - ${meGeo?.lng ?? null}) / 2)), 2)
                        )
                      )
                    ) <= 300
                  )
                )
              )
              OR p.location = ${context.label}
              OR p.location = SPLIT_PART(${context.label}, ',', 1)
              OR p.location ILIKE (SPLIT_PART(${context.label}, ',', 1) || ',%')
              OR p.location ILIKE (SPLIT_PART(${context.label}, ',', 1) || '%')
              OR a.city = ${context.label}
              OR a.city = SPLIT_PART(${context.label}, ',', 1)
              OR a.city ILIKE (SPLIT_PART(${context.label}, ',', 1) || ',%')
              OR a.city ILIKE (SPLIT_PART(${context.label}, ',', 1) || '%')
            )

            AND (a."bannedUntil" IS NULL OR a."bannedUntil" < NOW())
            AND (${hiddenAuthorIds.length} = 0 OR NOT (p."authorId" = ANY(${hiddenAuthorIds}::text[])))
            AND ${visiblePostSql(ctx, Prisma.sql`p.id`)}
        )
        SELECT "postId"
        FROM ranked_city_posts
        ORDER BY
            CASE
              WHEN "postDistanceKm" IS NOT NULL AND "postDistanceKm" <= 300 THEN 0
              WHEN "authorDistanceKm" IS NOT NULL AND "authorDistanceKm" <= 300 THEN 1
              ELSE 2
            END ASC,
            COALESCE("postDistanceKm", "authorDistanceKm", 999999) ASC,
            (
            0.18 * LN(1 + GREATEST("likeCount", 0))
            + 0.22 * LN(1 + GREATEST("commentCount", 0))
            + 0.75 * EXP(-LN(2) * (EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600.0) / 36.0)
            ) DESC,
            "createdAt" DESC,
            "postId" DESC
        OFFSET ${safeOffset}
        LIMIT ${safeLimit};
        `
          : await ctx.prisma.$queryRaw<Array<{ postId: string }>>`
        SELECT p.id AS "postId"
        FROM "Post" p
        JOIN "Profile" a ON a.id = p."authorId"
        JOIN "PostContext" pc ON pc."postId" = p.id

        WHERE pc."contextId" = ${context.id}

            AND (${kind ? 1 : 0} = 0 OR p.kind = CAST(${kind} AS "PostKind"))

            AND (a."bannedUntil" IS NULL OR a."bannedUntil" < NOW())
            AND (${hiddenAuthorIds.length} = 0 OR NOT (p."authorId" = ANY(${hiddenAuthorIds}::text[])))
            AND ${visiblePostSql(ctx, Prisma.sql`p.id`)}

        ORDER BY
            (
            pc.weight
            + 0.18 * LN(1 + GREATEST(p."likeCount", 0))
            + 0.55 * EXP(-LN(2) * (EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 3600.0) / 24.0)
            ) DESC,
            p."createdAt" DESC,
            p.id DESC
        OFFSET ${safeOffset}
        LIMIT ${safeLimit};
        `;


        if (rows.length === 0) return [];

        const ids = rows.map((r) => r.postId);


        // Prisma: Reihenfolge beibehalten
        const posts = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), { id: { in: ids } }] },
        include: {
            author: true,
            media: true,
        } as any,
        });

        const byId = new Map(posts.map((p: any) => [p.id, p]));
        return ids.map((id) => byId.get(id)).filter(Boolean);

        },

  },

  Mutation: {
    updateOnboarding: async (_: unknown, { input }: { input: any }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const cleanCity = input.city != null ? normalizePlaceLabel(input.city) : null;

      // city optional lassen:
      // wenn du city verpflichtend willst: if (!cleanCity) throw new UserInputError("CITY_NOT_SET");

      let geo = null as Awaited<ReturnType<typeof geocodeCity>>;
      if (cleanCity) {
        try { geo = await geocodeCity(cleanCity); } catch { geo = null; }
      }
      const inputGeo = validLatLng(input.lat, input.lng);

      const profile = await ctx.prisma.profile.update({
        where: { id: ctx.profileId },
        data: {
          ...(cleanCity != null
            ? {
                city: cleanCity,
                cityLat: inputGeo?.lat ?? geo?.lat ?? null,
                cityLng: inputGeo?.lng ?? geo?.lng ?? null,
                cityRegion: geo?.region ?? null,
                cityCountry: geo?.country ?? null,
              }
            : {}),
          educationLevel: input.educationLevel ?? null,
          educationOrg: input.educationOrg ?? null,
          educationField: input.educationField ?? null,
          educationGradYear: input.educationGradYear ?? null,
          interests: input.interests ?? [],
          // ❌ onboardingCompletedAt NICHT anfassen
        },
      });

      // optional: contexts nachziehen
      await setProfileSeedContexts(ctx.prisma as any, ctx.profileId, {
        city: cleanCity ?? profile.city ?? null,
        educationLevel: input.educationLevel,
        educationOrg: input.educationOrg,
        educationField: input.educationField,
        interests: input.interests ?? [],
      });

      return profile;
    },

    // dein existing completeOnboarding bleibt hier (inkl. Guard)
    completeOnboarding: async (_: unknown, { input }: { input: any }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const existing = await ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId },
        select: { onboardingCompletedAt: true },
      });
      if (!existing) throw new Error("Profile not found");
      if (existing.onboardingCompletedAt) throw new UserInputError("ONBOARDING_ALREADY_COMPLETED");

      const cleanCity = normalizePlaceLabel(input.city) ?? "";
      if (!cleanCity) throw new UserInputError("CITY_NOT_SET");

      // ✅ City → Region/Country/LatLng (aus Nominatim)
      // (Falls Nominatim down ist: wir speichern trotzdem city, Geo bleibt null)
      let geo = null as Awaited<ReturnType<typeof geocodeCity>>;
      try {
        geo = await geocodeCity(cleanCity);
      } catch {
        geo = null;
      }
      const inputGeo = validLatLng(input.lat, input.lng);

      const profile = await ctx.prisma.profile.update({
        where: { id: ctx.profileId },
        data: {
          city: cleanCity,

          // ✅ NEU
          cityLat: inputGeo?.lat ?? geo?.lat ?? null,
          cityLng: inputGeo?.lng ?? geo?.lng ?? null,
          cityRegion: geo?.region ?? null,
          cityCountry: geo?.country ?? null,

          educationLevel: input.educationLevel ?? null,
          educationOrg: input.educationOrg ?? null,
          educationField: input.educationField ?? null,
          educationGradYear: input.educationGradYear ?? null,
          interests: input.interests ?? [],
          onboardingCompletedAt: new Date(),
        },
      });

      await setProfileSeedContexts(ctx.prisma as any, ctx.profileId, {
        city: cleanCity,
        educationLevel: input.educationLevel,
        educationOrg: input.educationOrg,
        educationField: input.educationField,
        interests: input.interests ?? [],
      });

      return profile;
    },

  },
};
