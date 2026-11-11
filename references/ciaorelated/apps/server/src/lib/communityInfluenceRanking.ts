import type { Prisma } from "@prisma/client";

export const INFLUENCE_RANK_WINDOW = 60;
const HOUR = 3_600_000;
const UNIT = 1_000_000n;
export type InfluenceRankingPolicy = {
  startsAt: Date;
  maxAgeHours: number;
  halfLifeHours: number;
  maxPromotion: number;
  halfStrengthPoints: number;
};

// Separate, explicit activation. Missing/invalid configuration fails closed.
export function influenceRankingPolicy(now = new Date(), env = process.env): InfluenceRankingPolicy | null {
  if (env.ENABLE_COMMUNITY_INFLUENCE_RANKING !== "true") return null;
  const start = env.COMMUNITY_INFLUENCE_RANKING_STARTS_AT ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(start)) return null;
  const startsAt = new Date(start);
  if (!Number.isFinite(startsAt.getTime()) || startsAt > now || startsAt.toISOString().slice(0, 19) !== start.slice(0, 19)) return null;
  const maxAgeHours = Number(env.COMMUNITY_INFLUENCE_RANKING_MAX_AGE_HOURS ?? 72);
  const halfLifeHours = Number(env.COMMUNITY_INFLUENCE_RANKING_HALF_LIFE_HOURS ?? 24);
  const maxPromotion = Number(env.COMMUNITY_INFLUENCE_RANKING_MAX_PROMOTION ?? 12);
  const halfStrengthPoints = Number(env.COMMUNITY_INFLUENCE_RANKING_HALF_STRENGTH_POINTS ?? 5000);
  if (![maxAgeHours, halfLifeHours, maxPromotion, halfStrengthPoints].every(Number.isFinite) ||
    maxAgeHours <= 0 || maxAgeHours > 168 || halfLifeHours <= 0 || halfLifeHours > maxAgeHours ||
    maxPromotion <= 0 || maxPromotion > 20 || halfStrengthPoints <= 0) return null;
  return { startsAt, maxAgeHours, halfLifeHours, maxPromotion, halfStrengthPoints };
}

export const influenceCandidateCount = (need: number) => Math.ceil(need / INFLUENCE_RANK_WINDOW) * INFLUENCE_RANK_WINDOW;
type Candidate = { id: string; createdAt: Date; authorId?: string; author?: { id: string } };
const authorId = (p: Candidate) => p.authorId ?? p.author?.id ?? "";
export const newestFirst = (a: Candidate, b: Candidate) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function influencePostEligible(p: Pick<Candidate, "createdAt">, policy: InfluenceRankingPolicy, now: Date) {
  const time = p.createdAt.getTime();
  return time >= policy.startsAt.getTime() && time <= now.getTime() && now.getTime() - time < policy.maxAgeHours * HOUR;
}

// Sum source-owned credits once, after support routing. Never forward received support.
// This mirrors the overview's availability rules, independently of current membership.
export async function effectiveInfluenceUnits(db: Pick<Prisma.TransactionClient, "$queryRaw">, profileIds: string[], now = new Date()) {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return new Map<string, bigint>();
  const rows = await db.$queryRaw<Array<{ profileId: string; units: string }>>`
    WITH positions AS (
      SELECT h."groupLinkId", h."profileId" AS source, h."profileId" AS recipient
      FROM "CommunityMembershipHistory" h
      LEFT JOIN "CommunityInfluenceSupport" s USING ("groupLinkId", "profileId")
      WHERE h."profileId" = ANY(${ids}::text[]) AND s."recipientId" IS NULL
      UNION ALL
      SELECT s."groupLinkId", s."profileId" AS source, s."recipientId" AS recipient
      FROM "CommunityInfluenceSupport" s WHERE s."recipientId" = ANY(${ids}::text[])
    )
    SELECT p.recipient AS "profileId", SUM(c.units)::text AS units
    FROM positions p
    JOIN "CommunityInfluenceCredit" c ON c."groupLinkId" = p."groupLinkId" AND c."profileId" = p.source
    JOIN "GroupLink" g ON g.id = p."groupLinkId"
    JOIN "Profile" owner ON owner.id = g."ownerId"
    JOIN "Profile" source ON source.id = p.source
    JOIN "Profile" recipient ON recipient.id = p.recipient
    WHERE g.visibility = 'PUBLIC' AND g."isActive" AND (g."expiresAt" IS NULL OR g."expiresAt" > ${now})
      AND (owner."bannedUntil" IS NULL OR owner."bannedUntil" < ${now})
      AND (source."bannedUntil" IS NULL OR source."bannedUntil" < ${now})
      AND (recipient."bannedUntil" IS NULL OR recipient."bannedUntil" < ${now})
      AND NOT EXISTS (
        SELECT 1 FROM "UserBlock" b WHERE
          (b."blockerId" = p.source AND b."blockedId" IN (p.recipient, g."ownerId")) OR
          (b."blockedId" = p.source AND b."blockerId" IN (p.recipient, g."ownerId"))
      )
    GROUP BY p.recipient
  `;
  return new Map(rows.map(r => [r.profileId, BigInt(r.units)]));
}

export async function candidateInfluenceUnits(db: Pick<Prisma.TransactionClient, "$queryRaw">, posts: Candidate[], policy: InfluenceRankingPolicy | null, now: Date) {
  if (!policy) return new Map<string, bigint>();
  return effectiveInfluenceUnits(db, posts.filter(p => influencePostEligible(p, policy, now)).map(authorId), now);
}

export function influencePromotion(p: Candidate, units: bigint, policy: InfluenceRankingPolicy, now: Date) {
  if (units <= 0n || !influencePostEligible(p, policy, now)) return 0;
  // Floating point is only used for ranking, never for the ledger or displayed balances.
  const points = Number(units / UNIT) + Number(units % UNIT) / Number(UNIT);
  const root = Math.sqrt(points / policy.halfStrengthPoints);
  const strength = Number.isFinite(root) ? root / (1 + root) : 1;
  const freshness = 2 ** (-(now.getTime() - p.createdAt.getTime()) / (policy.halfLifeHours * HOUR));
  return policy.maxPromotion * strength * freshness;
}

// Fixed chronological windows precede relevance ranking. Fetch complete windows before
// pagination so changing page size does not introduce more candidates into earlier pages.
export function rankInfluencedPosts<T extends Candidate>(posts: T[], balances: Map<string, bigint>, policy: InfluenceRankingPolicy, now: Date,
  relevance: (a: T, b: T) => number = newestFirst): T[] {
  const chronological = [...new Map(posts.map(p => [p.id, p])).values()].sort(newestFirst);
  const result: T[] = [];
  for (let start = 0; start < chronological.length; start += INFLUENCE_RANK_WINDOW) {
    const window = chronological.slice(start, start + INFLUENCE_RANK_WINDOW).sort((a, b) => relevance(a, b) || newestFirst(a, b));
    result.push(...window.map((post, index) => ({ post, index,
      score: index - influencePromotion(post, balances.get(authorId(post)) ?? 0n, policy, now),
    })).sort((a, b) => a.score - b.score || a.index - b.index).map(row => row.post));
  }
  return result;
}

// Preserve non-post slots. Only exchange posts within three positions and the same
// complete window; avoid three consecutive posts by one author when an alternative exists.
export function diversifyInfluencedFeed<T>(items: T[], getAuthor: (item: T) => string | undefined): T[] {
  const output: T[] = [];
  let previous = "", run = 0;
  for (let start = 0; start < items.length; start += INFLUENCE_RANK_WINDOW) {
    const window = items.slice(start, start + INFLUENCE_RANK_WINDOW);
    for (let i = 0; i < window.length; i++) {
      let author = getAuthor(window[i]);
      if (author && author === previous && run >= 2) {
        for (let j = i + 1; j < Math.min(window.length, i + 4); j++) {
          const other = getAuthor(window[j]);
          if (other && other !== previous) {
            [window[i], window[j]] = [window[j], window[i]];
            author = other;
            break;
          }
        }
      }
      output.push(window[i]);
      if (author) { run = author === previous ? run + 1 : 1; previous = author; }
    }
  }
  return output;
}
