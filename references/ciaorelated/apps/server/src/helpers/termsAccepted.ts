import { ApolloError } from "apollo-server";
import type { Ctx } from "../context";

export async function ensureTermsAccepted(ctx: Ctx) {
  const current = parseInt(process.env.CURRENT_TERMS_VERSION ?? "1", 10);
  const me = await ctx.prisma.profile.findUnique({
    where: { id: ctx.profileId! },
    select: { termsVersionAccepted: true },
  });
  if ((me?.termsVersionAccepted ?? 0) < current) {
    throw new ApolloError("Terms not accepted", "TERMS_NOT_ACCEPTED");
  }
}
