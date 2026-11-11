import { visiblePostWhere, canViewPost } from "../lib/postVisibility";
// apps/server/src/resolvers/storyResolvers.ts
import type { Ctx } from "../context";
import crypto from "node:crypto";
import { getSignedPutUrl, getSignedGetUrl, deleteObjects } from "../s3";
import { ensureTermsAccepted } from "../helpers/termsAccepted";
import { getBlockedSets } from "../lib/blocks";
import { assertNotBanned } from "../lib/guards";
import { canViewProfileContent } from "../lib/privacy";
import { PrismaClient } from "@prisma/client";
import { GraphQLError } from "graphql";
import { notify } from "../lib/notify";
import { requireVerifiedEmail } from "../lib/requireVerifiedEmail";
import { DEFAULTS as NOTIFICATION_DEFAULTS } from "./notificationSettingsResolvers";

const PLACEHOLDER = "https://via.placeholder.com/600?text=No+Image";

type CreateStoryInput = {
  key: string;
  thumbKey?: string | null;
  mime: string;
  duration?: number | null;
  isCloseFriends?: boolean | null;
  editJson?: string | null;
};

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return "bin";
}

function ensureOwnKey(
  profileId: string,
  key?: string | null,
  kind: "media" | "thumb" = "media"
) {
  if (!key) return null;

  // ❌ Niemals URLs akzeptieren
  if (/^https?:\/\//i.test(key)) {
    throw new Error(`Invalid ${kind} key: must be an S3 object key, not a URL.`);
  }

  /**
   * Erlaubte Struktur:
   *
   * media:
   *   profiles/<pid>/stories/<uuid>.(jpg|png|mp4|mov)
   *
   * thumb:
   *   profiles/<pid>/stories/thumbs/<uuid>_thumb_512.jpg
   *   profiles/<pid>/stories/<uuid>.jpg
   *
   * The second form is kept for client-side story canvas/thumb exports that use
   * getSignedStoryUpload. It still stays scoped to the current user's story
   * folder and rejects external URLs or keys outside that prefix.
   */
  const base = `profiles/${profileId}/stories/`;
  const mediaPrefix = base;                  // alles direkt unter stories/
  const thumbPrefix = `${base}thumbs/`;      // nur thumbs/

  let ok = false;

  if (kind === "media") {
    // media darf NICHT im thumbs/-Ordner liegen
    ok = key.startsWith(mediaPrefix) && !key.startsWith(thumbPrefix);
  } else {
    ok = key.startsWith(thumbPrefix) || (key.startsWith(mediaPrefix) && !key.startsWith(thumbPrefix));
  }

  if (!ok) {
    throw new Error(`Invalid ${kind} key prefix.`);
  }

  return key;
}



function extractSharedPostId(editJson?: string | null): string | null {
  if (!editJson) return null;
  try {
    const obj = JSON.parse(editJson);
    const pid = obj?.sharedPost?.postId;
    return typeof pid === "string" && pid.length > 0 ? pid : null;
  } catch {
    return null;
  }
}

function extractMentionUsernames(editJson?: string | null): string[] {
  if (!editJson) return [];
  try {
    const obj = JSON.parse(editJson);
    const overlays = Array.isArray(obj?.overlays) ? obj.overlays : [];
    const usernames = overlays
      .filter((o: any) => o?.kind === "mention")
      .map((o: any) => String(o?.username || o?.text || "").trim().replace(/^@/, "").toLowerCase())
      .filter((v: string) => /^[a-z0-9._]{2,32}$/i.test(v));
    return Array.from(new Set(usernames));
  } catch {
    return [];
  }
}

type StoryLinkOverlay = {
  id: string;
  overlayId: string | null;
  label: string | null;
  url: string;
};

type StoryLocationOverlay = {
  id: string;
  overlayId: string | null;
  label: string;
};

type StoryPollOverlay = {
  id: string;
  overlayId: string | null;
  question: string;
  options: string[];
};

type StoryQuestionOverlay = {
  id: string;
  overlayId: string | null;
  prompt: string;
};

function normalizeStoryLinkUrl(raw?: string | null): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractLinkOverlays(editJson?: string | null): StoryLinkOverlay[] {
  if (!editJson) return [];
  try {
    const obj = JSON.parse(editJson);
    const overlays = Array.isArray(obj?.overlays) ? obj.overlays : [];
    return overlays
      .filter((o: any) => o?.kind === "link")
      .map((o: any, index: number) => {
        const url = normalizeStoryLinkUrl(o?.url);
        if (!url) return null;
        const overlayId = typeof o?.id === "string" && o.id.trim() ? o.id.trim() : null;
        const label = typeof o?.text === "string" && o.text.trim() ? o.text.trim() : null;
        return {
          id: overlayId || `${url}-${index}`,
          overlayId,
          label,
          url,
        };
      })
      .filter(Boolean) as StoryLinkOverlay[];
  } catch {
    return [];
  }
}

function normalizeStoryLocationLabel(raw?: string | null): string | null {
  const value = String(raw || "").replace(/\s+/g, " ").trim();
  if (!value || value.length > 120) return null;
  return value;
}

function extractLocationOverlays(editJson?: string | null): StoryLocationOverlay[] {
  if (!editJson) return [];
  try {
    const obj = JSON.parse(editJson);
    const overlays = Array.isArray(obj?.overlays) ? obj.overlays : [];
    return overlays
      .filter((o: any) => o?.kind === "location")
      .map((o: any, index: number) => {
        const label = normalizeStoryLocationLabel(o?.text);
        if (!label) return null;
        const overlayId = typeof o?.id === "string" && o.id.trim() ? o.id.trim() : null;
        return {
          id: overlayId || `${label}-${index}`,
          overlayId,
          label,
        };
      })
      .filter(Boolean) as StoryLocationOverlay[];
  } catch {
    return [];
  }
}

function normalizePollText(raw?: string | null): string | null {
  const value = String(raw || "").replace(/\s+/g, " ").trim();
  if (!value || value.length > 160) return null;
  return value;
}

function extractPollOverlays(editJson?: string | null): StoryPollOverlay[] {
  if (!editJson) return [];
  try {
    const obj = JSON.parse(editJson);
    const overlays = Array.isArray(obj?.overlays) ? obj.overlays : [];
    return overlays
      .filter((o: any) => o?.kind === "poll")
      .map((o: any, index: number) => {
        const question = normalizePollText(o?.question) || "Poll";
        const options = (Array.isArray(o?.options) ? o.options : [])
          .slice(0, 4)
          .map((opt: any) => normalizePollText(opt))
          .filter(Boolean) as string[];
        if (!options.length) return null;
        const overlayId = typeof o?.id === "string" && o.id.trim() ? o.id.trim() : null;
        return {
          id: overlayId || `${question}-${index}`,
          overlayId,
          question,
          options,
        };
      })
      .filter(Boolean) as StoryPollOverlay[];
  } catch {
    return [];
  }
}

function extractQuestionOverlays(editJson?: string | null): StoryQuestionOverlay[] {
  if (!editJson) return [];
  try {
    const obj = JSON.parse(editJson);
    const overlays = Array.isArray(obj?.overlays) ? obj.overlays : [];
    return overlays
      .filter((o: any) => o?.kind === "question")
      .map((o: any, index: number) => {
        const prompt = normalizePollText(o?.prompt) || "Question";
        const overlayId = typeof o?.id === "string" && o.id.trim() ? o.id.trim() : null;
        return {
          id: overlayId || `${prompt}-${index}`,
          overlayId,
          prompt,
        };
      })
      .filter(Boolean) as StoryQuestionOverlay[];
  } catch {
    return [];
  }
}

async function filterStoriesWithDeletedSharedPosts(ctx: Ctx, stories: any[]) {
  // sammle alle sharedPostIds aus editJson
  const ids = new Set<string>();
  for (const s of stories) {
    const pid = extractSharedPostId(s.editJson);
    if (pid) ids.add(pid);
  }

  if (!ids.size) return stories;

  // existierende posts laden
  const existing = await ctx.prisma.post.findMany({
    where: { AND: [visiblePostWhere(ctx), { id: { in: Array.from(ids) } }] },
    select: { id: true },
  });

  const ok = new Set(existing.map((p) => p.id));

  // rausfiltern: story hat sharedPost, aber post existiert nicht mehr
  return stories.filter((s) => {
    const pid = extractSharedPostId(s.editJson);
    if (!pid) return true;      // normale Story bleibt
    return ok.has(pid);         // shared-post story nur wenn post existiert
  });
}


/**
 * ✅ PRIVACY-GATE für private Profile:
 * - public profile => ok
 * - own profile => ok
 * - private profile => nur wenn viewer "accepted follower" ist
 *
 * WICHTIG: Das setzt voraus:
 * - Profile hat Feld `isPrivate: boolean`
 * - Follow hat `followerId`, `followingId`, `status: "PENDING" | "ACCEPTED" | ...`
 */
export async function canViewAuthorStories(ctx: Ctx, authorId: string): Promise<boolean> {
  const me = ctx.profileId ?? null;
  if (!me) return false;

  // Blocks in beide Richtungen
  const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
  if (blockedByMe.has(authorId) || blockedMe.has(authorId)) return false;

  // eigener Content immer ok
  if (authorId === me) return true;

  // Privacy vom Author laden
  const author = await ctx.prisma.profile.findUnique({
    where: { id: authorId },
    select: { isPrivate: true },
  });
  if (!author) return false;

  // öffentlich => ok
  if (!author.isPrivate) return true;

  // privat => braucht Follow (accepted by definition)
  const rel = await ctx.prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: me, followingId: authorId } },
    select: { followerId: true },
  });

  return !!rel;
}

async function isMentionedInStory(ctx: Ctx, storyId: string, profileId: string): Promise<boolean> {
  const mention = await (ctx.prisma as any).storyMention.findUnique({
    where: {
      storyId_mentionedUserId: {
        storyId,
        mentionedUserId: profileId,
      },
    },
    select: { id: true },
  });
  return !!mention;
}

async function canViewStoryRecord(
  ctx: Ctx,
  story: { id: string; authorId: string; isCloseFriends?: boolean | null; editJson?: string | null }
): Promise<boolean> {
  const me = ctx.profileId ?? null;
  if (!me) return false;

  const source = story.editJson === undefined
    ? await ctx.prisma.story.findUnique({ where: { id: story.id }, select: { editJson: true } })
    : story;
  const sharedPostId = extractSharedPostId(source?.editJson);
  if (sharedPostId && !(await canViewPost(ctx, sharedPostId))) return false;

  const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
  if (blockedByMe.has(story.authorId) || blockedMe.has(story.authorId)) return false;

  if (story.authorId === me) return true;
  if (story.isCloseFriends) return false;

  if (await canViewProfileContent(ctx, story.authorId)) return true;

  return isMentionedInStory(ctx, story.id, me);
}


const storyResolvers = {
  Query: {
    /** Stories der gefolgten Profile + eigene, jüngste zuerst (✅ privat abgesichert) */
    storiesFeed: async (_: unknown, { offset = 0, limit = 20 }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const me = ctx.profileId;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);

      const following = await ctx.prisma.follow.findMany({
        where: { followerId: me },
        select: { followingId: true }, // ✅ kein status
      });

      const authorIdsRaw = [me, ...following.map((f) => f.followingId)];
      const authorIds = authorIdsRaw.filter((id) => !hidden.has(id));

      if (authorIds.length === 0) return [];

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // ✅ Optional: extra hardening für private profiles:
      // filtere sicherheitshalber mit canViewProfileContent.
      const allowedAuthorIds: string[] = [];
      for (const id of authorIds) {
        if (await canViewProfileContent(ctx, id)) allowedAuthorIds.push(id);
      }
      if (!allowedAuthorIds.length) return [];

      const raw = await ctx.prisma.story.findMany({
        where: {
          authorId: { in: allowedAuthorIds },
          createdAt: { gte: since },
          OR: [
            { isCloseFriends: false },
            { AND: [{ isCloseFriends: true }, { authorId: me }] },
          ],
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit * 3, // ✅ overfetch, weil wir danach filtern
        include: { author: true },
      });

      const filtered = await filterStoriesWithDeletedSharedPosts(ctx, raw);
      return filtered.slice(0, limit);

    },

    /** Nur meine Stories */
    myStories: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const raw = await ctx.prisma.story.findMany({
        where: {
          authorId: ctx.profileId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        include: { author: true },
      });

      return filterStoriesWithDeletedSharedPosts(ctx, raw);
    },

    /** Meine Stories (letzte 24h) */
    myStoriesRecent: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const raw = await ctx.prisma.story.findMany({
        where: { authorId: ctx.profileId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        include: { author: true },
      });

      return filterStoriesWithDeletedSharedPosts(ctx, raw);

    },

    story: async (_: unknown, { id }: { id: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const story = await ctx.prisma.story.findUnique({
        where: { id },
        include: { author: true },
      });
      if (!story) return null;

      const ok = await canViewStoryRecord(ctx, story);
      if (!ok) return null;

      const [filtered] = await filterStoriesWithDeletedSharedPosts(ctx, [story]);
      return filtered ?? null;
    },

    /**
   * ✅ Viewer-Liste für eine Story (nur Owner)
   * - Pagination (offset / limit)
   * - performanter (count + page parallel)
   * - abgesichert (auth + ownership)
   */
  storyViewers: async (
    _: unknown,
    { storyId, offset = 0, limit = 50 }: { storyId: string; offset?: number; limit?: number },
    ctx: Ctx
  ) => {
    if (!ctx.profileId) throw new Error("Not authenticated");
    const me = ctx.profileId;

    const story = await ctx.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true },
    });

    if (!story) return { items: [], totalCount: 0, hasMore: false };
    if (story.authorId !== me) throw new Error("Forbidden");

    const safeOffset = Math.max(0, offset | 0);
    const safeLimit = Math.min(200, Math.max(1, limit | 0));

    const [totalCount, items] = await Promise.all([
      ctx.prisma.storyView.count({ where: { storyId } }),
      ctx.prisma.storyView.findMany({
        where: { storyId },
        orderBy: { viewedAt: "desc" },
        skip: safeOffset,
        take: safeLimit,
        select: {
          storyId: true,
          viewerId: true,
          viewedAt: true,
          viewer: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      totalCount,
      hasMore: safeOffset + items.length < totalCount,
    };
  },

  storyMentions: async (_: unknown, { storyId }: { storyId: string }, ctx: Ctx) => {
    if (!ctx.profileId) throw new Error("Not authenticated");

    const story = await ctx.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true },
    });
    if (!story) return [];
    if (story.authorId !== ctx.profileId) throw new Error("Forbidden");

    const rows = await (ctx.prisma as any).storyMention.findMany({
      where: { storyId },
      orderBy: { createdAt: "asc" },
      include: {
        mentionedUser: true,
        _count: { select: { clicks: true } },
      },
    });

    return rows.map((row: any) => ({
      ...row,
      clickCount: row?._count?.clicks ?? 0,
    }));
  },

  storyLinkClicks: async (_: unknown, { storyId }: { storyId: string }, ctx: Ctx) => {
    if (!ctx.profileId) throw new Error("Not authenticated");

    const story = await ctx.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true, editJson: true },
    });
    if (!story) return [];
    if (story.authorId !== ctx.profileId) throw new Error("Forbidden");

    const links = extractLinkOverlays(story.editJson);
    if (!links.length) return [];

    const counts = await (ctx.prisma as any).storyLinkClick.groupBy({
      by: ["overlayId", "url"],
      where: { storyId },
      _count: { _all: true },
    });

    return links.map((link) => {
      const countRow = counts.find((row: any) => {
        if (link.overlayId && row.overlayId) return row.overlayId === link.overlayId;
        return normalizeStoryLinkUrl(row.url) === link.url;
      });
      return {
        ...link,
        clickCount: countRow?._count?._all ?? 0,
      };
    });
  },

  storyLocationClicks: async (_: unknown, { storyId }: { storyId: string }, ctx: Ctx) => {
    if (!ctx.profileId) throw new Error("Not authenticated");

    const story = await ctx.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true, editJson: true },
    });
    if (!story) return [];
    if (story.authorId !== ctx.profileId) throw new Error("Forbidden");

    const locations = extractLocationOverlays(story.editJson);
    if (!locations.length) return [];

    const counts = await (ctx.prisma as any).storyLocationClick.groupBy({
      by: ["overlayId", "label"],
      where: { storyId },
      _count: { _all: true },
    });

    return locations.map((location) => {
      const countRow = counts.find((row: any) => {
        if (location.overlayId && row.overlayId) return row.overlayId === location.overlayId;
        return normalizeStoryLocationLabel(row.label) === location.label;
      });
      return {
        ...location,
        clickCount: countRow?._count?._all ?? 0,
      };
    });
  },

  storyPollClicks: async (_: unknown, { storyId }: { storyId: string }, ctx: Ctx) => {
    if (!ctx.profileId) throw new Error("Not authenticated");

    const story = await ctx.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true, editJson: true },
    });
    if (!story) return [];
    if (story.authorId !== ctx.profileId) throw new Error("Forbidden");

    const polls = extractPollOverlays(story.editJson);
    if (!polls.length) return [];

    const counts = await (ctx.prisma as any).storyPollClick.groupBy({
      by: ["overlayId", "optionIndex", "optionText"],
      where: { storyId },
      _count: { _all: true },
    });

    return polls.map((poll) => {
      const options = poll.options.map((optionText, optionIndex) => {
        const countRow = counts.find((row: any) => {
          const samePoll = poll.overlayId && row.overlayId
            ? row.overlayId === poll.overlayId
            : true;
          return samePoll && row.optionIndex === optionIndex && normalizePollText(row.optionText) === optionText;
        });
        return {
          optionIndex,
          optionText,
          clickCount: countRow?._count?._all ?? 0,
        };
      });

      return {
        id: poll.id,
        overlayId: poll.overlayId,
        question: poll.question,
        totalClickCount: options.reduce((sum, opt) => sum + opt.clickCount, 0),
        options,
      };
    });
  },

  storyQuestionAnswers: async (_: unknown, { storyId }: { storyId: string }, ctx: Ctx) => {
    if (!ctx.profileId) throw new Error("Not authenticated");

    const story = await ctx.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true },
    });
    if (!story) return [];
    if (story.authorId !== ctx.profileId) throw new Error("Forbidden");

    return (ctx.prisma as any).storyQuestionAnswer.findMany({
      where: { storyId },
      orderBy: { createdAt: "desc" },
      include: { respondent: true },
    });
  },


  },

  Mutation: {
    getSignedStoryUpload: async (_: unknown, { mime, size }: { mime: string; size: number }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const MAX = Number(process.env.MAX_STORY_UPLOAD_BYTES ?? 80 * 1024 * 1024);
      if (!Number.isFinite(size)) throw new Error(`Bad size: ${size}`);
      if (size > MAX) throw new Error(`File too large: ${size} > ${MAX}`);

      const ext = extFromMime(mime);
      const key = `profiles/${ctx.profileId}/stories/${crypto.randomUUID()}.${ext}`;

      const putUrl = await getSignedPutUrl(key, mime);
      return { key, putUrl };
    },

    createStory: async (_: unknown, { input }: { input: CreateStoryInput }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const sharedPostId = extractSharedPostId(input.editJson);
      if (sharedPostId && !(await canViewPost(ctx, sharedPostId))) throw new Error("Forbidden");
      await requireVerifiedEmail(ctx);
      await ensureTermsAccepted(ctx);
      await assertNotBanned(ctx);



      const isVideo = typeof input.mime === "string" && input.mime.startsWith("video/");
      const isImage = typeof input.mime === "string" && input.mime.startsWith("image/");
      
      const mediaKey = ensureOwnKey(ctx.profileId, input.key, "media")!;
      const thumbKey = isVideo ? null : ensureOwnKey(ctx.profileId, input.thumbKey ?? null, "thumb");


      const created = await ctx.prisma.story.create({
        data: {
          authorId: ctx.profileId,
          mediaKey,
          thumbKey: thumbKey ?? null,
          mime: input.mime,
          duration: input.duration ?? null,
          isCloseFriends: !!input.isCloseFriends,
          editJson: input.editJson ?? null,
        },
        include: { author: true },
      });

      // Option B (soft): Job für video+image falls kein thumb
      if (isImage && !thumbKey) {
        await ctx.prisma.storyProcessingJob.upsert({
          where: { storyId: created.id },
          update: { status: "PENDING", lastError: null },
          create: { storyId: created.id, status: "PENDING" },
        });
      }



      try {
        const usernames = extractMentionUsernames(input.editJson);
        if (usernames.length) {
          const mentioned = await ctx.prisma.profile.findMany({
            where: {
              OR: usernames.map((username) => ({ username: { equals: username, mode: "insensitive" as const } })),
              id: { not: ctx.profileId },
            },
            select: { id: true, username: true, avatarUrl: true, notificationSettings: true },
          });

          for (const user of mentioned) {
            await (ctx.prisma as any).storyMention.upsert({
              where: { storyId_mentionedUserId: { storyId: created.id, mentionedUserId: user.id } },
              update: { username: user.username },
              create: { storyId: created.id, mentionedUserId: user.id, username: user.username },
            });

            const settings = { ...NOTIFICATION_DEFAULTS, ...((user as any).notificationSettings ?? {}) };
            if (settings.storyMention === false) continue;

            await notify({
              prisma: ctx.prisma,
              recipientId: user.id,
              kind: "STORY_MENTION",
              channel: "ACTIVITY",
              fromUserId: ctx.profileId!,
              actorId: ctx.profileId!,
              payload: {
                type: "STORY_MENTION",
                storyId: created.id,
                author: {
                  id: created.author.id,
                  username: created.author.username,
                  avatarUrl: created.author.avatarUrl ?? null,
                },
                text: "hat dich in einer Story erwähnt.",
              },
            });
          }
        }
      } catch (e) {
        console.error("[createStory] story mention notifications failed", e);
      }

      try {
        const { blockedByMe, blockedMe } = await getBlockedSets(ctx);

        const followers = await ctx.prisma.follow.findMany({
          where: { followingId: ctx.profileId },
          select: { followerId: true },
        });

        const recipientIds = followers
          .map((f) => f.followerId)
          .filter((id) => id !== ctx.profileId)
          .filter((id) => !blockedByMe.has(id) && !blockedMe.has(id));

        if (recipientIds.length) {
          const author = created.author;
          const payload = {
            type: "STORY_POSTED",
            storyId: created.id,
            author: {
              id: author.id,
              username: author.username,
              avatarUrl: author.avatarUrl ?? null,
            },
            // optional: custom text (fallback in notify.ts existiert sowieso)
            text: "hat eine Story gepostet.",
          };

          // Parallel fan-out (klein halten, kein tx nötig)
          await Promise.all(
            recipientIds.map((recipientId) =>
              notify({
                prisma: ctx.prisma,
                recipientId,
                kind: "STORY_POSTED",
                channel: "ACTIVITY",
                fromUserId: ctx.profileId!,
                actorId: ctx.profileId!,
                payload,
              })
            )
          );
        }
      } catch (e) {
        console.error("[createStory] notify followers failed", e);
      }

      return created;
    },

    deleteStory: async (_: unknown, { id }: { id: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      await ctx.prisma.$transaction(async (tx: any) => {
        const st = await tx.story.findUnique({ where: { id } });
        if (!st) throw new Error("Not found");
        if (st.authorId !== ctx.profileId) throw new Error("Forbidden");

        const keys: string[] = [];
        if (st.mediaKey) keys.push(st.mediaKey);
        if (st.thumbKey) keys.push(st.thumbKey);
        if (keys.length) await deleteObjects(keys);

        await tx.story.delete({ where: { id } });
      });

      return true;
    },

    /**
     * ✅ Mark Story Viewed (Upsert)
     * - zählt nicht bei eigener Story
     * - respektiert blocks/privacy via canViewAuthorStories
     * - close friends: (aktuell) nur owner bekommt sie, also keine fremden Views loggen
     */
    markStoryViewed: async (_: unknown, { storyId }: { storyId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const me = ctx.profileId;

      const story = await ctx.prisma.story.findUnique({
        where: { id: storyId },
        select: { id: true, authorId: true, isCloseFriends: true },
      });
      if (!story) return true;

      // eigene Story nicht zählen
      if (story.authorId === me) return true;

      // close friends story: in deinem aktuellen System sieht die nur der Owner => nicht loggen
      if (story.isCloseFriends) return true;

      // privacy + blocks + targeted mention access
      const ok = await canViewStoryRecord(ctx, story);
      if (!ok) return true;

      await ctx.prisma.storyView.upsert({
        where: { storyId_viewerId: { storyId, viewerId: me } },
        update: { viewedAt: new Date() },
        create: { storyId, viewerId: me },
      });

      return true;
    },

    markStoryMentionClicked: async (_: unknown, { storyId, username }: { storyId: string; username: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const clean = String(username || "").trim().replace(/^@/, "").toLowerCase();
      if (!clean) return false;

      const story = await ctx.prisma.story.findUnique({
        where: { id: storyId },
        select: { id: true, authorId: true, isCloseFriends: true },
      });
      if (!story) return false;
      if (story.authorId === ctx.profileId) return true;
      if (story.isCloseFriends) return true;

      const ok = await canViewStoryRecord(ctx, story);
      if (!ok) return true;

      const mention = await (ctx.prisma as any).storyMention.findFirst({
        where: { storyId, username: { equals: clean, mode: "insensitive" } },
        select: { id: true },
      });
      if (!mention) return false;

      await (ctx.prisma as any).storyMentionClick.create({
        data: { mentionId: mention.id, viewerId: ctx.profileId },
      });

      return true;
    },

    markStoryLinkClicked: async (
      _: unknown,
      { storyId, overlayId, url }: { storyId: string; overlayId?: string | null; url: string },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const cleanUrl = normalizeStoryLinkUrl(url);
      if (!cleanUrl) return false;

      const story = await ctx.prisma.story.findUnique({
        where: { id: storyId },
        select: { id: true, authorId: true, isCloseFriends: true, editJson: true },
      });
      if (!story) return false;
      if (story.authorId === ctx.profileId) return true;

      const ok = await canViewStoryRecord(ctx, story);
      if (!ok) return true;

      const links = extractLinkOverlays(story.editJson);
      const cleanOverlayId = typeof overlayId === "string" && overlayId.trim() ? overlayId.trim() : null;
      const link = links.find((item) => {
        if (cleanOverlayId && item.overlayId) return item.overlayId === cleanOverlayId;
        return item.url === cleanUrl;
      });
      if (!link) return false;

      await (ctx.prisma as any).storyLinkClick.create({
        data: {
          storyId,
          overlayId: link.overlayId,
          url: link.url,
          viewerId: ctx.profileId,
        },
      });

      return true;
    },

    markStoryLocationClicked: async (
      _: unknown,
      { storyId, overlayId, label }: { storyId: string; overlayId?: string | null; label: string },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const cleanLabel = normalizeStoryLocationLabel(label);
      if (!cleanLabel) return false;

      const story = await ctx.prisma.story.findUnique({
        where: { id: storyId },
        select: { id: true, authorId: true, isCloseFriends: true, editJson: true },
      });
      if (!story) return false;
      if (story.authorId === ctx.profileId) return true;

      const ok = await canViewStoryRecord(ctx, story);
      if (!ok) return true;

      const locations = extractLocationOverlays(story.editJson);
      const cleanOverlayId = typeof overlayId === "string" && overlayId.trim() ? overlayId.trim() : null;
      const location = locations.find((item) => {
        if (cleanOverlayId && item.overlayId) return item.overlayId === cleanOverlayId;
        return item.label === cleanLabel;
      });
      if (!location) return false;

      await (ctx.prisma as any).storyLocationClick.create({
        data: {
          storyId,
          overlayId: location.overlayId,
          label: location.label,
          viewerId: ctx.profileId,
        },
      });

      return true;
    },

    markStoryPollClicked: async (
      _: unknown,
      { storyId, overlayId, optionIndex, optionText }: { storyId: string; overlayId?: string | null; optionIndex: number; optionText: string },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const safeOptionIndex = Number(optionIndex);
      if (!Number.isInteger(safeOptionIndex) || safeOptionIndex < 0 || safeOptionIndex > 12) return false;
      const cleanOptionText = normalizePollText(optionText);
      if (!cleanOptionText) return false;

      const story = await ctx.prisma.story.findUnique({
        where: { id: storyId },
        select: { id: true, authorId: true, isCloseFriends: true, editJson: true },
      });
      if (!story) return false;
      if (story.authorId === ctx.profileId) return true;

      const ok = await canViewStoryRecord(ctx, story);
      if (!ok) return true;

      const polls = extractPollOverlays(story.editJson);
      const cleanOverlayId = typeof overlayId === "string" && overlayId.trim() ? overlayId.trim() : null;
      const poll = polls.find((item) => {
        if (cleanOverlayId && item.overlayId) return item.overlayId === cleanOverlayId;
        return item.options[safeOptionIndex] === cleanOptionText;
      });
      if (!poll) return false;

      const canonicalOptionText = poll.options[safeOptionIndex];
      if (!canonicalOptionText || canonicalOptionText !== cleanOptionText) return false;

      await (ctx.prisma as any).storyPollClick.create({
        data: {
          storyId,
          overlayId: poll.overlayId,
          question: poll.question,
          optionIndex: safeOptionIndex,
          optionText: canonicalOptionText,
          viewerId: ctx.profileId,
        },
      });

      return true;
    },

    answerStoryQuestion: async (
      _: unknown,
      { storyId, overlayId, prompt, answer }: { storyId: string; overlayId?: string | null; prompt: string; answer: string },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const cleanPrompt = normalizePollText(prompt);
      const cleanAnswer = String(answer || "").replace(/\s+/g, " ").trim();
      if (!cleanPrompt || !cleanAnswer || cleanAnswer.length > 400) return false;

      const story = await ctx.prisma.story.findUnique({
        where: { id: storyId },
        select: { id: true, authorId: true, isCloseFriends: true, editJson: true },
      });
      if (!story) return false;
      if (story.authorId === ctx.profileId) return true;

      const ok = await canViewStoryRecord(ctx, story);
      if (!ok) return true;

      const questions = extractQuestionOverlays(story.editJson);
      const cleanOverlayId = typeof overlayId === "string" && overlayId.trim() ? overlayId.trim() : null;
      const question = questions.find((item) => {
        if (cleanOverlayId && item.overlayId) return item.overlayId === cleanOverlayId;
        return item.prompt === cleanPrompt;
      });
      if (!question) return false;

      await (ctx.prisma as any).storyQuestionAnswer.create({
        data: {
          storyId,
          overlayId: question.overlayId,
          prompt: question.prompt,
          answer: cleanAnswer,
          respondentId: ctx.profileId,
        },
      });

      return true;
    },
  },

  /**
   * ✅ WICHTIG: auch signed GET URLs absichern,
   * sonst kann jemand über irgendeine Query/ID an URLs kommen.
   */
  Story: {
    mediaUrl: async (s: any, _: unknown, ctx: Ctx) => {
      const ok = await canViewStoryRecord(ctx, s);
      if (!ok) return null;
      if (s.mediaUrl) return s.mediaUrl;
      if (!s.mediaKey) return null;

      try {
        return await getSignedGetUrl(s.mediaKey);
      } catch {
        return null;
      }
    },


    thumbUrl: async (s: any, _: unknown, ctx: Ctx) => {
      const ok = await canViewStoryRecord(ctx, s);
      if (!ok) return null;
      if (s.thumbUrl) return s.thumbUrl;
      if (!s.thumbKey) {
        // nur für video fallback (sonst bei images lieber null lassen)
        if (typeof s.mime === "string" && s.mime.startsWith("video/")) return PLACEHOLDER;
        return null;
      }

      try {
        return await getSignedGetUrl(s.thumbKey);
      } catch {
        return null;
      }
    },

    isVideo: (s: any) => typeof s.mime === "string" && s.mime.startsWith("video/"),

    /**
     * ✅ View Count nur für Owner
     * (Wenn du im Schema `viewCount: Int!` hast, passt 0 als Default.)
     */
    viewCount: async (s: any, _: unknown, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || me !== s.authorId) return 0;

      return ctx.prisma.storyView.count({
        where: { storyId: s.id },
      });
    },
    mentionClickCount: async (s: any, _: unknown, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || me !== s.authorId) return 0;

      return (ctx.prisma as any).storyMentionClick.count({
        where: { mention: { storyId: s.id } },
      });
    },
    linkClickCount: async (s: any, _: unknown, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || me !== s.authorId) return 0;

      return (ctx.prisma as any).storyLinkClick.count({
        where: { storyId: s.id },
      });
    },
    locationClickCount: async (s: any, _: unknown, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || me !== s.authorId) return 0;

      return (ctx.prisma as any).storyLocationClick.count({
        where: { storyId: s.id },
      });
    },
    pollClickCount: async (s: any, _: unknown, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || me !== s.authorId) return 0;

      return (ctx.prisma as any).storyPollClick.count({
        where: { storyId: s.id },
      });
    },
    questionAnswerCount: async (s: any, _: unknown, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || me !== s.authorId) return 0;

      return (ctx.prisma as any).storyQuestionAnswer.count({
        where: { storyId: s.id },
      });
    },
    author: (s: any, _a: any, ctx: Ctx) => {
      const authorId = s.authorId ?? s.userId ?? s.profileId ?? null;
      if (!authorId) {
        // author ist non-nullable => wir müssen hier werfen
        // (oder Schema nullable machen)
        throw new GraphQLError("STORY_AUTHOR_MISSING");
      }
      return (ctx.prisma as PrismaClient).profile.findUnique({
        where: { id: authorId },
      });
    },
    seenByMe: async (parent: any, _args: any, ctx: any) => {
      const viewerId = ctx.profileId; // bei dir ist das die "aktive Profile-ID"
      if (!viewerId) return false;

      const hit = await ctx.prisma.storyView.findUnique({
        where: {
          storyId_viewerId: {
            storyId: parent.id,
            viewerId,
          },
        },
        select: { viewedAt: true },
      });

      return !!hit;
    },

    // ✅ optional: viewedAtByMe (falls du es im Client anzeigen willst)
    viewedAtByMe: async (parent: any, _args: any, ctx: any) => {
      const viewerId = ctx.profileId;
      if (!viewerId) return null;

      const hit = await ctx.prisma.storyView.findUnique({
        where: {
          storyId_viewerId: {
            storyId: parent.id,
            viewerId,
          },
        },
        select: { viewedAt: true },
      });

      return hit?.viewedAt ?? null;
    },
  
  },
};

export default storyResolvers;
