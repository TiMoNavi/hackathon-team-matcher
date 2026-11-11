import type { PrismaClient } from "@prisma/client";
import { ADMIN_USERNAMES } from "../config";

export function isConfiguredAdminProfile(profile?: { id?: string | null; username?: string | null } | null) {
  if (!profile) return false;
  const username = profile.username?.toLowerCase();
  return !!username && ADMIN_USERNAMES.includes(username);
}

export async function isAdminProfile(prisma: PrismaClient, profileId?: string | null) {
  if (!profileId) return false;
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true, username: true, role: true },
  });
  return profile?.role === "ADMIN" || isConfiguredAdminProfile(profile);
}
