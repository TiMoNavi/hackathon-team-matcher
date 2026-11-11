import { Prisma } from "@prisma/client";

// Called inside the reaction transaction. Removing a reaction never removes its
// first-interaction key, so toggling likes or comments cannot reset eligibility.
export async function captureCommunityInteraction(tx: Prisma.TransactionClient, actorId: string, postId: string) {
  const settings = await tx.communityInfluenceSettings.findUnique({ where: { id: "default" } });
  if (!settings || settings.startsAt > new Date()) return;
  const post = await tx.post.findUnique({ where: { id: postId }, select: {
    authorId: true, author: { select: { bannedUntil: true } },
    postContexts: { where: { source: "IMPORT", context: { OR: [{ groupLinkId: { not: null } }, { key: { startsWith: "group:" } }] } },
      select: { context: { select: { groupLink: true } } } },
  } });
  if (!post || post.authorId === actorId || !post.postContexts.length) return;
  const groups = post.postContexts.map(c => c.context.groupLink);
  // A second private/orphaned association must not leak private activity into a public score.
  if (groups.some(g => !g || g.visibility !== "PUBLIC" || !g.isActive || (g.expiresAt && g.expiresAt <= new Date()))) return;
  const actor = await tx.profile.findUnique({ where: { id: actorId }, select: { bannedUntil: true } });
  if (!actor || (actor.bannedUntil && actor.bannedUntil >= new Date()) || (post.author.bannedUntil && post.author.bannedUntil >= new Date())) return;
  if (await tx.userBlock.findFirst({ where: { OR: [
    { blockerId: actorId, blockedId: post.authorId }, { blockerId: post.authorId, blockedId: actorId },
  ] }, select: { id: true } })) return;
  const ids = groups.map(g => g!.id).sort();
  // Settlement holds FOR UPDATE. Stamp only after this lock, never backdate a
  // reaction which was waiting while yesterday's ledger was being closed.
  const locked = await tx.$queryRaw<{ id: string; visibility: string; isActive: boolean; expiresAt: Date | null }[]>`
    SELECT id, visibility, "isActive", "expiresAt" FROM "GroupLink" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE
  `;
  const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`;
  if (locked.length !== ids.length || locked.some(g => !g.isActive || g.visibility !== "PUBLIC" || (g.expiresAt && g.expiresAt <= now))) return;
  for (const groupLinkId of ids) {
    const member = await tx.communityMembershipPeriod.findFirst({ where: {
      groupLinkId, profileId: actorId, startedAt: { lte: now }, OR: [{ endedAt: null }, { endedAt: { gt: now } }],
    }, select: { id: true } });
    if (!member) continue;
    await tx.communityInfluenceEvent.createMany({ data: [{
      groupLinkId, actorId, authorId: post.authorId, postId, kind: "INTERACTION",
      eventKey: JSON.stringify([actorId, postId]), occurredAt: now,
    }], skipDuplicates: true });
  }
}
