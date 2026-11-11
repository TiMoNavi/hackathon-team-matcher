// apps/server/src/resolvers/profileMgmt.ts
import type { Ctx } from "../context";
import { containsProfanity, maskProfanity } from "../lib/profanity";
import { assertNoProfanity } from "../graphql/profanity-guard";
import { normalizeUsername, validateUsernameOrThrow } from "../lib/username";
import { sendWelcomeMessageToProfile } from "../lib/welcomeMessage";


function validateUsername(u: string) {
  // 3–30 Zeichen, Buchstaben/Ziffern/._  — passe ggf. an dein Frontend an
  const ok = /^[a-zA-Z0-9._]{3,30}$/.test(u);
  if (!ok) throw new Error("Ungültiger Benutzername (erlaubt: 3–30 Zeichen, Buchstaben/Ziffern/._)");
  if (containsProfanity(u)) throw new Error("Bitte einen angemessenen Benutzernamen wählen.");
}

export default {
  Mutation: {
    createProfile: async (_: unknown, { input }: { input: { username: string; name?: string } }, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");

      // 🔤 Username normalisieren & validieren
      const usernameNorm = normalizeUsername(String(input.username ?? ""));
      validateUsernameOrThrow(usernameNorm);

      // 🔐 Name (frei eingegeben) proaktiv prüfen
      assertNoProfanity({ name: input.name ?? "" }, ["name"]);

      // Uniqueness immer gegen den NORMALISIERTEN Wert
      const exists = await ctx.prisma.profile.findUnique({ where: { username: usernameNorm } });
      if (exists) throw new Error("Benutzername bereits vergeben.");

      // Optional: Name maskieren, wenn du statt Hard-Fail lieber entschärfen willst
      const nameClean = maskProfanity((input.name ?? "").trim() || null);

      const profile = await ctx.prisma.profile.create({
        data: {
          accountId: ctx.accountId,
          username: usernameNorm,   // ⬅️ nur normalisierte Usernames speichern
          name: nameClean,
        },
      });
      await sendWelcomeMessageToProfile(ctx.prisma, profile.id).catch((e) =>
        console.warn("[welcome-message] delivery failed:", e?.message || e)
      );
      return profile;
    },


    setPrimaryProfile: async (_: unknown, { profileId }: { profileId: string }, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      const p = await ctx.prisma.profile.findFirst({ where: { id: profileId, accountId: ctx.accountId } });
      if (!p) throw new Error("Profile not found");
      await ctx.prisma.$transaction([
        ctx.prisma.profile.updateMany({ where: { accountId: ctx.accountId, isPrimary: true }, data: { isPrimary: false } }),
        ctx.prisma.profile.update({ where: { id: profileId }, data: { isPrimary: true } }),
      ]);
      return true;
    },

    switchActiveProfile: async (_: unknown, { profileId }: { profileId: string }, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      const p = await ctx.prisma.profile.findFirst({ where: { id: profileId, accountId: ctx.accountId } });
      if (!p) throw new Error("Profile not found");
      return p;
    },

    linkExistingProfile: async (_: unknown, { input }: { input: { usernameOrEmail: string; password: string } }, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      throw new Error("Not implemented in MVP");
    },

    unlinkProfile: async (_: unknown, { profileId }: { profileId: string }, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      const p = await ctx.prisma.profile.findFirst({ where: { id: profileId, accountId: ctx.accountId } });
      if (!p) throw new Error("Profile not found");
      if (p.isPrimary) throw new Error("Hauptprofil kann nicht getrennt werden");
      await ctx.prisma.profile.update({ where: { id: p.id }, data: { accountId: "DETACHED" } });
      return true;
    },
  },

  
};
