// helpers/vlogMembership.ts
import { Prisma, PrismaClient } from "@prisma/client";

// Falls du die Helpers sowohl mit `prisma` als auch mit `tx` aufrufen willst:
type PrismaClientOrTx = Prisma.TransactionClient | PrismaClient;

// Wenn du NUR im $transaction-Callback aufrufst, reicht:
// type PrismaClientOrTx = Prisma.TransactionClient;

// apps/server/src/helpers/vlogMembership.ts
export async function ensureMember(
  tx: PrismaClientOrTx,
  vlogId: string,
  userId: string,
  accept: boolean
) {
  const vlog = await tx.vlog.findUnique({ where: { id: vlogId }, select: { ownerId: true } });
  if (!vlog) return;

  // owner zählt nicht per increment, der ist "fix"
  const isOwner = userId === vlog.ownerId;

  const existing = await tx.vlogMember.findUnique({
    where: { vlogId_userId: { vlogId, userId } },
    select: { status: true },
  });

  if (!existing) {
    await tx.vlogMember.create({
      data: {
        vlogId,
        userId,
        role: isOwner ? "OWNER" : "MEMBER",
        status: isOwner || accept ? "ACCEPTED" : "PENDING",
      },
    });

    if (!isOwner && accept) {
      await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { increment: 1 } } });
    }
    return;
  }

  if (!isOwner && accept && existing.status !== "ACCEPTED") {
    await tx.vlogMember.update({
      where: { vlogId_userId: { vlogId, userId } },
      data: { status: "ACCEPTED" },
    });
    await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { increment: 1 } } });
  }
}


export async function removeMemberIfNoAcceptedPosts(
  tx: PrismaClientOrTx,
  vlogId: string,
  userId: string
) {
  const vlog = await tx.vlog.findUnique({
    where: { id: vlogId },
    select: { ownerId: true },
  });
  if (!vlog) return;
  if (userId === vlog.ownerId) return;

  const remainingAccepted = await tx.postVlogTag.count({
    where: { vlogId, status: "ACCEPTED", post: { authorId: userId } },
  });
  if (remainingAccepted > 0) return;

  const member = await tx.vlogMember.findUnique({
    where: { vlogId_userId: { vlogId, userId } },
    select: { status: true },
  });
  if (!member) return;

  await tx.vlogMember.delete({
    where: { vlogId_userId: { vlogId, userId } },
  });

  if (member.status === "ACCEPTED") {
    await tx.vlog.update({
      where: { id: vlogId },
      data: { memberCount: { decrement: 1 } },
    });
  }
}
