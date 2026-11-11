import type { Ctx } from "../context";

export async function getBlockedSets(ctx: Ctx) {
  if (!ctx.profileId) return { blockedByMe: new Set<string>(), blockedMe: new Set<string>() };

  const [byMe, meBy] = await Promise.all([
    ctx.prisma.userBlock.findMany({ where: { blockerId: ctx.profileId }, select: { blockedId: true } }),
    ctx.prisma.userBlock.findMany({ where: { blockedId: ctx.profileId }, select: { blockerId: true } }),
  ]);

  return {
    blockedByMe: new Set(byMe.map(b => b.blockedId)),
    blockedMe: new Set(meBy.map(b => b.blockerId)),
  };
}

/** Post-/Comment-Listen nachträglich clientseitig filtern (fallback) */
export function notBlockedFilter<T extends { authorId?: string }>(
  items: T[],
  blockedByMe: Set<string>,
  blockedMe: Set<string>
) {
  return items.filter(it => {
    const a = it.authorId;
    if (!a) return true;
    return !(blockedByMe.has(a) || blockedMe.has(a));
  });
}

/** DB-Level WHERE für Prisma: authorId NOT IN (blockedByMe ∪ blockedMe) */
export function authorNotBlockedWhere(blockedByMe: Set<string>, blockedMe: Set<string>) {
  const ids = [...new Set([...blockedByMe, ...blockedMe])];
  return ids.length ? { authorId: { notIn: ids } } : {};
}

/** WHERE-Helfer für Nutzerlisten (z. B. Suche, Follower): id NOT IN (…) */
export function userIdNotBlockedWhere(blockedByMe: Set<string>, blockedMe: Set<string>) {
  const ids = [...new Set([...blockedByMe, ...blockedMe])];
  return ids.length ? { id: { notIn: ids } } : {};
}