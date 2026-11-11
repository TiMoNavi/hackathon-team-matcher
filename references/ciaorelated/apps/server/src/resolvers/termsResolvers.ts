// apps/server/src/resolvers/followResolvers.ts
import type { Ctx } from "../context";
import { notify } from "../lib/notify";

export default {
  Mutation: {
    acceptTerms: async (_: unknown, { version }: { version: number }, ctx: Ctx) => {
        if (!ctx.profileId) throw new Error("Not authenticated");
        const me = await ctx.prisma.profile.update({
            where: { id: ctx.profileId },
            data: {
            termsVersionAccepted: version,
            termsAcceptedAt: new Date(),
            },
        });
        return me;
        },
  },
  Query: {
    currentTermsVersion: async (_: unknown, __: unknown, ctx: Ctx) => {
      const envVal = Number(process.env.CURRENT_TERMS_VERSION);
    if (Number.isFinite(envVal) && envVal > 0) return envVal;

    // B) (optional) aus DB, falls ihr AppConfig nutzt
    try {
      const cfg = await ctx.prisma.appConfig.findUnique({ where: { id: 1 }, select: { currentTermsVersion: true } });
      if (cfg?.currentTermsVersion && cfg.currentTermsVersion > 0) return cfg.currentTermsVersion;
    } catch {
      // ignore
    }

    // C) HARDCODED Fallback – NIE null zurückgeben
    return 1;
    },
  }
};
