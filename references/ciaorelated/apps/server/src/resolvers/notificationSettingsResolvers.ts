import type { Ctx } from "../context";

export const DEFAULTS = {
  pushEnabled: true,
  digestEnabled: true,

  follow: true,
  followRequest: true,
  followRequestAccepted: true,

  like: true,
  comment: true,

  storyPosted: true,
  storyMention: true,

  postShareRequest: true,
  postShareApproved: true,
  postShareRejected: true,

  postTagRequest: true,

  vlogTagRequest: true,
  vlogTagApproved: true,
  vlogTagRejected: true,

  vlogNewPost: true,
  vlogDeleted: true,
};

function mergeDefaults(raw: any) {
  return { ...DEFAULTS, ...(raw ?? {}) };
}

export default {
  Query: {
    notificationSettings: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const me = await ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId },
        select: { notificationSettings: true },
      } as any);

      const out = mergeDefaults(me?.notificationSettings);
      if (out.pushEnabled === false) out.digestEnabled = false;
      return mergeDefaults(out);

    },
  },

  Mutation: {
    updateNotificationSettings: async (_: unknown, { input }: any, ctx: Ctx) => {
    if (!ctx.profileId) throw new Error("Not authenticated");

    const me = await ctx.prisma.profile.findUnique({
      where: { id: ctx.profileId },
      select: { notificationSettings: true },
    } as any);

    const prev = mergeDefaults(me?.notificationSettings);

    const patch = Object.fromEntries(
      Object.entries(input ?? {}).filter(([, v]) => typeof v === "boolean")
    ) as Record<string, boolean>;

    // 1) normal merge
    const merged: any = { ...prev, ...patch };

    // 2) Guard: push off => digest off (server authoritative)
    if (merged.pushEnabled === false) {
      merged.digestEnabled = false;
    }

    // 3) Guard: digest darf nicht true werden, wenn push false ist
    // (falls ein Client nur digestEnabled:true schickt, aber push ist aus)
    if (merged.pushEnabled === false && patch.digestEnabled === true) {
      merged.digestEnabled = false;
    }

    await ctx.prisma.profile.update({
      where: { id: ctx.profileId },
      data: { notificationSettings: merged as any },
    });

    return mergeDefaults(merged);
  },
  },
};
