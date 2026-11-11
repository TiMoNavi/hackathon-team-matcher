import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
// apps/server/src/lib/notificationStatus.ts
export async function setPostTagNotificationStatus(
  prisma: any,
  recipientId: string,
  postId: string,
  status: "ACCEPTED" | "REJECTED"
) {
  const rows = await prisma.notification.findMany({
    where: {
      recipientId,
      postId,
      // Wenn du dafür ein eigenes kind hast: kind: "POST_TAG_REQUEST"
      // In deinem Setup nutzt du payload.type:
      payload: { path: ["type"], equals: "POST_TAG_REQUEST" },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  await Promise.all(
    rows.map((n: any) =>
      prisma.notification.update({
        where: { id: n.id },
        data: {
          isRead: true,
          payload: {
            ...(n.payload ?? {}),
            status, // ✅ EINHEITLICH
            type: status === "ACCEPTED" ? "POST_TAG_APPROVED" : "POST_TAG_REJECTED",
            text: status === "ACCEPTED" ? "Markierung akzeptiert" : "Markierung abgelehnt",
          },
        },
      })
    )
  );
}
  
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
export type ReqStatus = "ACCEPTED" | "REJECTED";
export async function setVlogTagNotificationStatus(
  prisma: PrismaClientOrTx,
  recipientId: string,
  postId: string,
  vlogId: string | null,
  status: ReqStatus
) {
  const whereBase: any = {
    recipientId,
    kind: "VLOG_TAG_REQUEST",
    postId,
  };

  const where: any = vlogId
    ? { ...whereBase, OR: [{ vlogId }, { vlogId: null }] } // ✅ wichtig für legacy
    : { ...whereBase, vlogId: null };

  const rows = await prisma.notification.findMany({
    where,
    select: { id: true, payload: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  await Promise.all(
    rows.map((n: any) => {
      const prev = (n.payload ?? {}) as Record<string, any>;
      return prisma.notification.update({
        where: { id: n.id },
        data: {
          isRead: true,
          handledAt: new Date(),
          requestStatus: status,
          payload: { ...prev, status }, // ✅ payload sauber “gemerged”
        },
      });
    })
  );

  return true;
}