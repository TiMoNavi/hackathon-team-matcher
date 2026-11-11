import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type Database = PrismaClient | Prisma.TransactionClient;

async function inspectNetworkCommunity(db: Database, ownerId: string) {
  const owner = await db.profile.findUnique({ where: { id: ownerId }, select: { id: true, username: true, bannedUntil: true } });
  if (!owner || (owner.bannedUntil && owner.bannedUntil >= new Date())) throw new Error("NETWORK_COMMUNITY_OWNER_UNAVAILABLE");
  const group = await db.groupLink.findUnique({ where: { systemKey: "BVRLY" } });
  if (group && group.ownerId !== ownerId) throw new Error("NETWORK_COMMUNITY_OWNER_MISMATCH");
  if (group && (!group.isActive || (group.expiresAt && group.expiresAt <= new Date()))) {
    throw new Error("NETWORK_COMMUNITY_INACTIVE");
  }
  const profilesToEnroll = await db.profile.count({ where: group ? {
    groupMemberships: { none: { groupLinkId: group.id } },
    OR: [{ id: ownerId }, { communityMembershipHistory: { none: { groupLinkId: group.id } } }],
  } : {} });
  return { owner, group, profilesToEnroll };
}

export async function setupNetworkCommunity(prisma: PrismaClient, options: { ownerId: string; apply?: boolean }) {
  if (!options.ownerId.trim()) throw new Error("NETWORK_COMMUNITY_OWNER_REQUIRED");
  if (!options.apply) {
    const { owner, group, profilesToEnroll } = await inspectNetworkCommunity(prisma, options.ownerId);
    return { applied: false, groupId: group?.id ?? null, ownerId: owner.id, ownerUsername: owner.username, profilesToEnroll, enrolled: 0 };
  }
  return prisma.$transaction(async tx => {
    // Only the administrative bootstrap locks tables. This closes the activation
    // race with new profiles and prevents a concurrent exit from being undone.
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`LOCK TABLE "Profile", "GroupLink", "GroupLinkMember" IN SHARE ROW EXCLUSIVE MODE`;
    const { owner, group: existing, profilesToEnroll } = await inspectNetworkCommunity(tx, options.ownerId);
    const group = existing ?? await tx.groupLink.create({ data: {
      title: "Bvrly", type: "COMMUNITY", visibility: "PUBLIC", systemKey: "BVRLY", ownerId: owner.id,
      code: randomBytes(6).toString("base64url"), slug: randomBytes(8).toString("base64url").slice(0, 10),
    } });
    await tx.context.upsert({
      where: { key: `group:${group.id}` },
      create: { key: `group:${group.id}`, label: group.title, kind: "TOPIC", groupLinkId: group.id },
      update: { groupLinkId: group.id },
    });
    await tx.$executeRaw`SET LOCAL bvrly.community_backfill = 'true'`;
    const enrolled = await tx.$executeRaw`
      INSERT INTO "GroupLinkMember" ("groupLinkId", "profileId", "joinedAt")
      SELECT ${group.id}, p.id, clock_timestamp() FROM "Profile" p
      WHERE (p.id = ${owner.id} OR NOT EXISTS (
        SELECT 1 FROM "CommunityMembershipHistory" h WHERE h."groupLinkId" = ${group.id} AND h."profileId" = p.id
      ))
      ON CONFLICT ("groupLinkId", "profileId") DO NOTHING
    `;
    return { applied: true, groupId: group.id, ownerId: owner.id, ownerUsername: owner.username, profilesToEnroll, enrolled };
  }, { maxWait: 10_000, timeout: 60_000 });
}
