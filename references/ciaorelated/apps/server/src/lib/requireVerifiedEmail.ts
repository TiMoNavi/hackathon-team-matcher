import type { Ctx } from "../context";

export async function requireVerifiedEmail(ctx: Ctx) {
  if (!ctx.accountId) throw new Error("Not authenticated");
  const a = await ctx.prisma.account.findUnique({
    where: { id: ctx.accountId },
    select: { emailVerifiedAt: true, phoneVerifiedAt: true },
  });
  if (!a?.emailVerifiedAt && !a?.phoneVerifiedAt) throw new Error("EMAIL_NOT_VERIFIED");
}
