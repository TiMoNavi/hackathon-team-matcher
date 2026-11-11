import type { PrismaClient } from "@prisma/client";
import { ADMIN_USERNAMES } from "../config";
import { createThread, sendMessage } from "../chat/service";

export const WELCOME_MESSAGE_I18N_TOKEN = "system:welcome";

async function resolveWelcomeAdminProfileId(prisma: PrismaClient) {
  if (ADMIN_USERNAMES.length) {
    const profile = await prisma.profile.findFirst({
      where: { username: { in: ADMIN_USERNAMES } },
      select: { id: true },
    });
    if (profile) return profile.id;
  }

  const roleAdmin = await prisma.profile.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return roleAdmin?.id ?? null;
}

export async function sendWelcomeMessageToProfile(prisma: PrismaClient, profileId: string) {
  const adminProfileId = await resolveWelcomeAdminProfileId(prisma);
  if (!adminProfileId || adminProfileId === profileId) return;

  const thread = await createThread(prisma, adminProfileId, [adminProfileId, profileId]);
  await sendMessage(prisma, adminProfileId, {
    threadId: thread.id,
    kind: "text",
    text: WELCOME_MESSAGE_I18N_TOKEN,
  });
}
