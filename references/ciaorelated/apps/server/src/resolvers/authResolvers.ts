
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { signToken } from "../auth/jwt";
import type { Ctx } from "../context";

import { normalizeUsername, validateUsernameOrThrow } from "../lib/username";
import { removeMemberIfNoAcceptedPosts } from "../helpers/vlogMembership";

import crypto from "crypto";
import { sendVerifyCode } from "../lib/email";
import { sendPasswordResetCode } from "../lib/passwordResetEmail";
import { normalizePhoneNumber, isValidPhoneNumber } from "../lib/phone";
import { checkPhoneVerifyCode, isTwilioVerifyConfigured, sendPhoneVerifyCode } from "../lib/sms";
import { UserInputError, ForbiddenError } from "apollo-server-errors";
import { sendWelcomeMessageToProfile } from "../lib/welcomeMessage";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


function normalizeEmail(e: string) {
  return String(e || "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  // absichtlich simpel + streng genug (Spaces -> invalid)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function gen6DigitCode() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function normalizeId(s: string) {
  return s.trim().toLowerCase();
}

function make6DigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 100000..999999
}


const resolvers = {
  Mutation: {
    checkPhoneAvailability: async (_: unknown, args: { phoneNumber: string }, ctx: Ctx) => {
      const phoneNumber = normalizePhoneNumber(args.phoneNumber);
      if (!isValidPhoneNumber(phoneNumber)) throw new UserInputError("INVALID_PHONE_NUMBER");

      const existing = await ctx.prisma.account.findUnique({
        where: { phoneNumber },
        select: { id: true },
      });

      return !existing;
    },

    requestPhoneLoginCode: async (_: unknown, args: { phoneNumber: string }, ctx: Ctx) => {
      const phoneNumber = normalizePhoneNumber(args.phoneNumber);
      if (!isValidPhoneNumber(phoneNumber)) throw new UserInputError("INVALID_PHONE_NUMBER");

      const existing = await ctx.prisma.phoneVerificationCode.findUnique({
        where: { phoneNumber },
        select: { sentAt: true },
      });
      const now = new Date();
      if (existing?.sentAt && now.getTime() - existing.sentAt.getTime() < 45_000) {
        return {
          phoneNumber,
          expiresAt: new Date(existing.sentAt.getTime() + 10 * 60 * 1000),
        };
      }

      const usesTwilio = isTwilioVerifyConfigured();
      const code = usesTwilio ? "" : gen6DigitCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await ctx.prisma.phoneVerificationCode.upsert({
        where: { phoneNumber },
        create: {
          phoneNumber,
          codeHash: usesTwilio ? "twilio-verify" : sha256(code),
          expiresAt,
          sentAt: now,
          attempts: 0,
        },
        update: {
          codeHash: usesTwilio ? "twilio-verify" : sha256(code),
          expiresAt,
          sentAt: now,
          attempts: 0,
        },
      });

      await sendPhoneVerifyCode(phoneNumber, code);

      return { phoneNumber, expiresAt };
    },

    verifyPhoneLoginCode: async (
      _: unknown,
      args: { phoneNumber: string; code: string; username?: string | null; name?: string | null },
      ctx: Ctx
    ) => {
      const phoneNumber = normalizePhoneNumber(args.phoneNumber);
      const code = String(args.code || "").trim();
      if (!isValidPhoneNumber(phoneNumber)) throw new UserInputError("INVALID_PHONE_NUMBER");
      if (!/^\d{6}$/.test(code)) throw new UserInputError("INVALID_CODE");

      const verification = await ctx.prisma.phoneVerificationCode.findUnique({ where: { phoneNumber } });
      if (!verification || verification.expiresAt.getTime() < Date.now()) {
        throw new UserInputError("INVALID_CODE_OR_EXPIRED");
      }
      if (verification.attempts >= 5) throw new UserInputError("TOO_MANY_ATTEMPTS");

      const twilioResult = await checkPhoneVerifyCode(phoneNumber, code);
      const validCode = twilioResult ?? verification.codeHash === sha256(code);

      if (!validCode) {
        await ctx.prisma.phoneVerificationCode.update({
          where: { phoneNumber },
          data: { attempts: { increment: 1 } },
        });
        throw new UserInputError("INVALID_CODE_OR_EXPIRED");
      }

      let account = await ctx.prisma.account.findUnique({
        where: { phoneNumber },
        include: { profiles: true },
      });
      let createdAccount = false;

      if (!account) {
        if (!args.username?.trim()) {
          throw new UserInputError("PHONE_ACCOUNT_NOT_FOUND");
        }

        const username = normalizeUsername(args.username || "");
        validateUsernameOrThrow(username);

        account = await ctx.prisma.account.create({
          data: {
            phoneNumber,
            phoneVerifiedAt: new Date(),
            profiles: {
              create: [{ username, name: args.name?.trim() || null, isPrimary: true }],
            },
          },
          include: { profiles: true },
        });
        createdAccount = true;
      } else if (!account.phoneVerifiedAt) {
        account = await ctx.prisma.account.update({
          where: { id: account.id },
          data: { phoneVerifiedAt: new Date() },
          include: { profiles: true },
        });
      }

      await ctx.prisma.phoneVerificationCode.delete({ where: { phoneNumber } }).catch(() => undefined);

      const primary = account.profiles.find((p: any) => p.isPrimary) ?? account.profiles[0];
      if (!primary) throw new Error("Kein Profil für diesen Account gefunden.");
      if (createdAccount) {
        await sendWelcomeMessageToProfile(ctx.prisma, primary.id).catch((e) =>
          console.warn("[welcome-message] delivery failed:", e?.message || e)
        );
      }

      const token = signToken({ accountId: account.id, profileId: primary.id });

      return {
        token,
        user: {
          id: primary.id,
          username: primary.username,
          name: primary.name,
          avatarUrl: primary.avatarUrl,
          bio: primary.bio,
          onboardingCompletedAt: primary.onboardingCompletedAt,
          postCount: primary.postCount,
          reelCount: primary.reelCount,
          followerCount: primary.followerCount,
          followingCount: primary.followingCount,
          accountId: account.id,
          account: { id: account.id, phoneNumber: account.phoneNumber, phoneVerifiedAt: account.phoneVerifiedAt },
        },
      };
    },

    changePassword: async (_: any, { currentPassword, newPassword }: any, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      if (!newPassword || newPassword.length < 6) throw new UserInputError("PASSWORD_TOO_SHORT");

      const acc = await ctx.prisma.account.findUnique({
        where: { id: ctx.accountId },
        select: { id: true, password: true },
      });
      if (!acc) throw new Error("Account not found");
      if (!acc.password) throw new ForbiddenError("PASSWORD_LOGIN_NOT_ENABLED");

      const ok = await bcrypt.compare(currentPassword, acc.password);
      if (!ok) throw new ForbiddenError("WRONG_PASSWORD");

      const hash = await bcrypt.hash(newPassword, 10);
      await ctx.prisma.account.update({
        where: { id: acc.id },
        data: { password: hash },
      });

      return true;
    },

    resetPasswordWithCode: async (
      _: unknown,
      args: { emailOrUsername: string; code: string; newPassword: string },
      ctx: Ctx
    ) => {
      const raw = (args.emailOrUsername || "").trim();
      const code = String(args.code || "").trim();
      const newPassword = String(args.newPassword || "");

      if (!raw || !code) throw new UserInputError("MISSING_FIELDS");
      if (newPassword.length < 8) throw new UserInputError("PASSWORD_TOO_SHORT"); // empfehlung: 8

      // 1) Account finden (identisch)
      let account = emailRegex.test(raw)
        ? await ctx.prisma.account.findUnique({
            where: { email: normalizeEmail(raw) },
          })
        : null;

      if (!account) {
        const normalized = normalizeUsername(raw);
        const profile = await ctx.prisma.profile.findUnique({
          where: { username: normalized },
          include: { account: true },
        });
        if (profile?.account) account = profile.account;
      }

      if (!account) throw new UserInputError("INVALID_CODE_OR_EXPIRED");

      // 2) Prüfen: Code vorhanden + nicht abgelaufen
      if (!account.passwordResetCodeHash || !account.passwordResetExpiresAt) {
        throw new UserInputError("INVALID_CODE_OR_EXPIRED");
      }
      if (account.passwordResetExpiresAt.getTime() < Date.now()) {
        throw new UserInputError("INVALID_CODE_OR_EXPIRED");
      }

      // 3) Code vergleichen (hash)
      const codeHash = sha256(code);
      if (codeHash !== account.passwordResetCodeHash) {
        throw new UserInputError("INVALID_CODE_OR_EXPIRED");
      }

      // 4) Passwort setzen + Reset-Felder löschen
      const pwHash = await bcrypt.hash(newPassword, 10);

      await ctx.prisma.account.update({
        where: { id: account.id },
        data: {
          password: pwHash,
          passwordResetCodeHash: null,
          passwordResetExpiresAt: null,
          // optional: passwordResetSentAt: null,
        },
      });

      return true;
    },

    requestPasswordResetCode: async (_: unknown, args: { emailOrUsername: string }, ctx: Ctx) => {
      const raw = (args.emailOrUsername || "").trim();
      const id = normalizeId(raw);

      // 1) Account finden (wie bei login: Email oder Username)
      let account = emailRegex.test(raw)
        ? await ctx.prisma.account.findUnique({
            where: { email: normalizeEmail(raw) },
            select: { id: true, email: true, passwordResetSentAt: true },
          })
        : null;

      if (!account) {
        const normalized = normalizeUsername(raw);
        const profile = await ctx.prisma.profile.findUnique({
          where: { username: normalized },
          select: { account: { select: { id: true, email: true, passwordResetSentAt: true } } },
        });
        if (profile?.account) account = profile.account as any;
      }

      // ✅ Immer true zurückgeben (keine Account-Enumeration)
      if (!account) return true;
      if (!account.email) return true;

      // 2) Throttle (optional, aber sehr empfohlen)
      const now = new Date();
      if ((account as any).passwordResetSentAt) {
        const diff = now.getTime() - new Date((account as any).passwordResetSentAt).getTime();
        if (diff < 60_000) return true; // 1 Minute cooldown
      }

      // 3) Code erzeugen + hash + expiry
      const code = gen6DigitCode();
      const codeHash = sha256(code);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

      await ctx.prisma.account.update({
        where: { id: account.id },
        data: {
          passwordResetCodeHash: codeHash,
          passwordResetExpiresAt: expiresAt,
          passwordResetSentAt: now, // optional
        },
      });

      // 4) Mail versenden (SendGrid)
      if (account.email) await sendPasswordResetCode(account.email, code);

      return true;
    },

    changeAccountEmail: async (_: any, { email }: { email: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const nextEmail = normalizeEmail(email);
      if (!isValidEmail(nextEmail)) throw new UserInputError("INVALID_EMAIL");

      // profile -> account
      const me = await ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId },
        select: { accountId: true },
      });
      if (!me?.accountId) throw new Error("Not authenticated");

      const acc = await ctx.prisma.account.findUnique({
        where: { id: me.accountId },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      if (!acc) throw new Error("Not authenticated");

      // ✅ nur solange noch NICHT verified
      if (acc.emailVerifiedAt) throw new ForbiddenError("EMAIL_ALREADY_VERIFIED");

      // --- RESEND if same email ---
      const code = gen6DigitCode();
      const codeHash = sha256(code);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      if (acc.email && nextEmail === normalizeEmail(acc.email)) {
        await ctx.prisma.account.update({
          where: { id: acc.id },
          data: {
            // email bleibt gleich
            emailVerifyCodeHash: codeHash,
            emailVerifyExpiresAt: expiresAt,
          },
        });

        await sendVerifyCode(nextEmail, code);

        return { isVerified: false, expiresAt };
      }

      // --- else: check if email used by someone else ---
      const existing = await ctx.prisma.account.findUnique({
        where: { email: nextEmail },
        select: { id: true },
      });

      if (existing && existing.id !== acc.id) {
        throw new UserInputError("EMAIL_ALREADY_IN_USE"); // oder EMAIL_TAKEN
      }

      // --- update email + reset verify + set new code ---
      await ctx.prisma.account.update({
        where: { id: acc.id },
        data: {
          email: nextEmail,
          emailVerifiedAt: null,
          emailVerifyCodeHash: codeHash,
          emailVerifyExpiresAt: expiresAt,
        },
      });

      await sendVerifyCode(nextEmail, code);

      return { isVerified: false, expiresAt };
    },

    register: async (_: unknown, args: { email: string; password: string; username: string; name?: string }, ctx: Ctx) => {
      // E-Mail / PW Checks wie bisher
      const email = normalizeEmail(args.email);
      if (!isValidEmail(email)) throw new Error("Bitte eine gültige E-Mail angeben.");
      if (!args.password || args.password.length < 6) throw new Error("Passwort zu kurz (mind. 6 Zeichen).");

      // 🔐 Username normalisieren & validieren
      const username = normalizeUsername(args.username);
      validateUsernameOrThrow(username);

      try {
        const hash = await bcrypt.hash(args.password, 10);

        const account = await ctx.prisma.account.create({
          data: {
            email,
            password: hash,
            profiles: {
              create: [
                { username, name: args.name, isPrimary: true }, // ⬅️ gespeicherter Username ist bereits normalized
              ],
            },
          },
          include: { profiles: true },
        });
        const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
        const codeHash = crypto.createHash("sha256").update(code).digest("hex");
        const expires = new Date(Date.now() + 15 * 60 * 1000);

        await ctx.prisma.account.update({
          where: { id: account.id },
          data: {
            emailVerifyCodeHash: codeHash,
            emailVerifyExpiresAt: expires,
            emailVerifiedAt: null,
          },
        });

        await sendVerifyCode(email, code);



        const primary = account.profiles.find((p:any) => p.isPrimary) ?? account.profiles[0];
        if (!primary) throw new Error("Profil konnte nicht angelegt werden.");
        await sendWelcomeMessageToProfile(ctx.prisma, primary.id).catch((e) =>
          console.warn("[welcome-message] delivery failed:", e?.message || e)
        );

        const token = signToken({ accountId: account.id, profileId: primary.id });

        return {
          token,
          user: {
            id: primary.id,
            username: primary.username,
            name: primary.name,
            avatarUrl: primary.avatarUrl,
            bio: primary.bio,
            postCount: primary.postCount,
            reelCount: primary.reelCount,
            followerCount: primary.followerCount,
            followingCount: primary.followingCount,
            account: { id: account.id },
          },
        };
      } catch (e: any) {
        if (e?.code === "P2002") {
          const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(", ") : String(e?.meta?.target || "");
          if (target.includes("username")) throw new Error("Der Benutzername ist bereits vergeben.");
          if (target.includes("email")) throw new Error("Es existiert bereits ein Konto mit dieser E-Mail.");
          throw new Error("Eingaben sind bereits vergeben.");
        }
        throw new Error(e?.message || "Registrierung fehlgeschlagen.");
      }
    },

    requestEmailVerification: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");

      const account = await ctx.prisma.account.findUnique({ where: { id: ctx.accountId } });
      if (!account) throw new Error("Account not found");
      if (!account.email) throw new UserInputError("EMAIL_LOGIN_NOT_ENABLED");

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const crypto = await import("crypto");
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const expires = new Date(Date.now() + 15 * 60 * 1000);

      await ctx.prisma.account.update({
        where: { id: account.id },
        data: { emailVerifyCodeHash: codeHash, emailVerifyExpiresAt: expires },
      });

      await sendVerifyCode(account.email, code);

      return { isVerified: !!account.emailVerifiedAt, expiresAt: expires };
    },

    verifyEmail: async (_: unknown, { code }: { code: string }, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      const account = await ctx.prisma.account.findUnique({ where: { id: ctx.accountId } });
      if (!account) throw new Error("Account not found");

      if (account.emailVerifiedAt) return true;

      if (!account.emailVerifyCodeHash || !account.emailVerifyExpiresAt) throw new Error("No code requested");
      if (account.emailVerifyExpiresAt.getTime() < Date.now()) throw new Error("Code expired");

      const crypto = await import("crypto");
      const codeHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");

      if (codeHash !== account.emailVerifyCodeHash) throw new Error("Invalid code");

      await ctx.prisma.account.update({
        where: { id: account.id },
        data: { emailVerifiedAt: new Date(), emailVerifyCodeHash: null, emailVerifyExpiresAt: null },
      });

      return true;
    },



    // apps/server/src/resolvers/authResolvers.ts

    login: async (_: unknown, args: { emailOrUsername: string; password: string }, ctx: Ctx) => {
      const idRaw = (args.emailOrUsername || "").trim();

      // 1) Email?
      let account = emailRegex.test(idRaw)
        ? await ctx.prisma.account.findUnique({ where: { email: normalizeEmail(idRaw) } })
        : null;

      // 2) Sonst Username-Login
      if (!account) {
        const normalized = normalizeUsername(idRaw);
        // Falls jemand "ÄÖÜ" tippt, landet Suche trotzdem auf deinem gespeicherten lower+no-umlaut Username
        const profile = await ctx.prisma.profile.findUnique({
          where: { username: normalized },
          include: { account: true },
        });
        if (profile) account = profile.account;
      }

      if (!account) throw new Error("Ungültige Login Daten");
      if (!account.password) throw new Error("Bitte mit Telefonnummer anmelden.");

      const ok = await bcrypt.compare(args.password, account.password);
      if (!ok) throw new Error("Ungültige Login Daten");

      const primary =
        (await ctx.prisma.profile.findFirst({ where: { accountId: account.id, isPrimary: true } })) ||
        (await ctx.prisma.profile.findFirst({ where: { accountId: account.id } }));

      if (!primary) throw new Error("Kein Profil für diesen Account gefunden.");

      const token = signToken({ accountId: account.id, profileId: primary.id });

      return {
        token,
        user: {
          id: primary.id,
          username: primary.username,
          name: primary.name,
          avatarUrl: primary.avatarUrl,
          bio: primary.bio,
          postCount: primary.postCount,
          reelCount: primary.reelCount,
          followerCount: primary.followerCount,
          followingCount: primary.followingCount,
          accountId: account.id,
          account: { id: account.id },
        },
      };
    },
 deleteAccount: async (_: unknown, __: unknown, ctx: Ctx) => {
  if (!ctx.accountId || !ctx.profileId) throw new Error("Not authenticated");

  const profiles = await ctx.prisma.profile.findMany({
    where: { accountId: ctx.accountId },
    select: { id: true },
  });
  const profileIds = profiles.map(p => p.id);

  await ctx.prisma.$transaction(async (tx: any) => {
    // -----------------------------
    // 0) CHAT CLEANUP (RESTRICT-FKs & "nicht mehr ersichtlich")
    // -----------------------------
    // Ziel: Profile darf gelöscht werden (FKs weg) + Chat darf nicht mehr das Profil anzeigen.
    // Strategie:
    //  - ThreadMember rows entfernen (FK blockiert sonst)
    //  - Messages des Users löschen ODER anonymisieren
    //  - Threads, die danach keine Mitglieder mehr haben, löschen
    //
    // Annahmen (typisch):
    //  - ThreadMember: { threadId, userId }
    //  - Message: { threadId, senderId }
    //  - Thread: { id }
    //
    // Falls bei dir Feldnamen anders heißen, die where/select Keys anpassen.

    if (profileIds.length) {
      // 0.1 Threads herausfinden, in denen die User-Profile Mitglied sind
      const memberships = await tx.threadMember.findMany({
        where: { userId: { in: profileIds } },
        select: { threadId: true },
      });

      const touchedThreadIds = Array.from(
        new Set<string>(memberships.map((m: any) => m.threadId))
      );

      // 0.2 Messages des Users entfernen (damit im Chat nichts mehr vom Profil erscheint)
      // Alternative wäre "anonymisieren" (senderId null + senderName "Deleted user"), aber das erfordert Schemaänderung.
      // Hier: löschen.
      await tx.message.deleteMany({
        where: { senderId: { in: profileIds } },
      });

      // 0.3 ThreadMember entfernen (FK Problem lösen)
      await tx.threadMember.deleteMany({
        where: { userId: { in: profileIds } },
      });

      // 0.4 Threads aufräumen: Threads löschen, die jetzt 0 Mitglieder haben
      // (Wenn du Threads behalten willst, überspringen – aber dann siehst du "leere Threads" evtl. in Listen.)
      for (const threadId of touchedThreadIds) {
        const remaining = await tx.threadMember.count({ where: { threadId } });
        if (remaining === 0) {
          // Safety: Messages im Thread (falls noch welche von anderen existieren) ebenfalls löschen
          await tx.message.deleteMany({ where: { threadId } });
          await tx.thread.delete({ where: { id: threadId } });
        }
      }
    }

    // -----------------------------
    // A) Likes entfernen + Post.likeCount fixen
    // -----------------------------
    if (profileIds.length) {
      const likesGrouped = await tx.like.groupBy({
        by: ["postId"],
        where: { userId: { in: profileIds } },
        _count: { postId: true },
      });

      for (const g of likesGrouped) {
        try {
          await tx.post.update({
            where: { id: g.postId },
            data: { likeCount: { decrement: g._count.postId } },
          });
        } catch {}
      }

      await tx.like.deleteMany({ where: { userId: { in: profileIds } } });

      // -----------------------------
      // B) Kommentare entfernen + Post.commentCount fixen
      // -----------------------------
      const commentsGrouped = await tx.comment.groupBy({
        by: ["postId"],
        where: { authorId: { in: profileIds } },
        _count: { postId: true },
      });

      for (const g of commentsGrouped) {
        try {
          await tx.post.update({
            where: { id: g.postId },
            data: { commentCount: { decrement: g._count.postId } },
          });
        } catch {}
      }

      await tx.comment.deleteMany({ where: { authorId: { in: profileIds } } });

      // -----------------------------
      // C) Posts/Reels löschen + Vlog postCount & Membership fix
      // -----------------------------
      const posts = await tx.post.findMany({
        where: { authorId: { in: profileIds } },
        select: { id: true, kind: true, authorId: true },
      });

      for (const post of posts) {
        const tags = await tx.postVlogTag.findMany({
          where: { postId: post.id },
          select: { vlogId: true, status: true },
        });

        const acceptedVlogIds = Array.from(
          new Set<string>(
            tags
              .filter((t: any) => t.status === "ACCEPTED")
              .map((t: any) => t.vlogId)
          )
        );

        if (acceptedVlogIds.length) {
          await Promise.all(
            acceptedVlogIds.map((vlogId: string) =>
              tx.vlog.update({
                where: { id: vlogId },
                data: { postCount: { decrement: 1 } },
              })
            )
          );
        }

        // Tags weg
        await tx.postVlogTag.deleteMany({ where: { postId: post.id } });

        // Post weg (Likes/Comments darauf cascaden i.d.R.)
        await tx.post.delete({ where: { id: post.id } });

        // Profile counter nachziehen
        await tx.profile.update({
          where: { id: post.authorId },
          data:
            post.kind === "POST"
              ? { postCount: { decrement: 1 } }
              : { reelCount: { decrement: 1 } },
        });

        // Membership cleanup
        const touchedVlogIds = Array.from(
          new Set<string>(tags.map((t: any) => t.vlogId))
        );
        for (const vlogId of touchedVlogIds) {
          await removeMemberIfNoAcceptedPosts(tx, vlogId, post.authorId);
        }
      }

      // -----------------------------
      // D) VlogMember entfernen + memberCount fix
      // -----------------------------
      const memberRows = await tx.vlogMember.findMany({
        where: { userId: { in: profileIds } },
        select: {
          vlogId: true,
          userId: true,
          role: true,
          status: true,
          vlog: { select: { ownerId: true } },
        },
      });

      for (const m of memberRows) {
        const isOwner = m.userId === m.vlog.ownerId || m.role === "OWNER";
        if (!isOwner && m.status === "ACCEPTED") {
          await tx.vlog.update({
            where: { id: m.vlogId },
            data: { memberCount: { decrement: 1 } },
          });
        }
      }

      await tx.vlogMember.deleteMany({ where: { userId: { in: profileIds } } });

      // -----------------------------
      // E) Blocks/Reports etc.
      // -----------------------------
      await tx.userBlock.deleteMany({
        where: {
          OR: [
            { blockerId: { in: profileIds } },
            { blockedId: { in: profileIds } },
          ],
        },
      });

      await tx.report.deleteMany({
        where: {
          OR: [
            { reporterId: { in: profileIds } },
            { targetUserId: { in: profileIds } },
          ],
        },
      });
    }

    // -----------------------------
    // G) GroupLink Memberships & Connections cleanup
    // -----------------------------
    if (profileIds.length) {
      // 1) Alle GroupLinks finden, in denen die Profile Mitglied sind
      const memberships = await tx.groupLinkMember.findMany({
        where: { profileId: { in: profileIds } },
        select: { groupLinkId: true },
      });

      const groupLinkIds = Array.from(
        new Set(memberships.map((m:any) => m.groupLinkId))
      );

      if (groupLinkIds.length) {
        // 2) Connections löschen, die über diese GroupLinks laufen
        await tx.connection.deleteMany({
          where: {
            groupLinkId: { in: groupLinkIds },
            OR: [
              { fromId: { in: profileIds } },
              { toId: { in: profileIds } },
            ],
          },
        });
      }

      // 3) GroupLinkMember entfernen
      await tx.groupLinkMember.deleteMany({
        where: { profileId: { in: profileIds } },
      });
    }

    // -----------------------------
    // F) Profile + Account löschen
    // -----------------------------
    await tx.profile.deleteMany({ where: { accountId: ctx.accountId } });
    await tx.account.delete({ where: { id: ctx.accountId } });
  });

  return true;
},


  },
  Query: {
    account: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      return ctx.prisma.account.findUniqueOrThrow({
        where: { id: ctx.accountId },
        include: { profiles: true },
      });
    },
    myProfiles: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.accountId) throw new Error("Not authenticated");
      return ctx.prisma.profile.findMany({ where: { accountId: ctx.accountId }, orderBy: { createdAt: "asc" } });
    }
    ,me: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.accountId || !ctx.profileId) return null;

      
      // Aktives Profil + zugehöriger Account mit allen Profilen
      return ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId },
        include: {
          account: {
            select: {
              id: true,
              email: true,
              emailVerifiedAt: true,
              phoneVerifiedAt: true,
              profiles: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  avatarUrl: true,
                  isPrimary: true,
                },
              },
            },
          },
        },
      });
    },
  },
};

export default resolvers;
