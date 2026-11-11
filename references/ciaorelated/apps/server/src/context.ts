import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { JWT_SECRET, type JwtPayload } from "./config";
import { isConfiguredAdminProfile } from "./lib/admin";

export const prisma = new PrismaClient();

export type Ctx = {
  prisma: PrismaClient;
  accountId?: string;
  profileId?: string;
  isAdmin?: boolean;
};

function getBearer(req?: Request): string | undefined {
  const auth = req?.headers?.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
}

export function parseJwtFromReq(req?: Request): JwtPayload | undefined {
  const token = getBearer(req);
  if (!token) return;
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return;
  }
}

export async function createContext({ req }: { req: Request }): Promise<Ctx> {
  const payload = parseJwtFromReq(req);

  // ✅ Fallback (wichtig für WS / Profile-Switch)
  const headerProfileId =
    (req.headers["x-profile-id"] as string | undefined) ||
    (req.headers["X-Profile-Id"] as any);

  const profileId = payload ? (payload.profileId ?? (payload.accountId ? headerProfileId : undefined)) : undefined;

  let isAdmin = false;
  let validProfileId: string | undefined;
  if (profileId) {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, username: true, role: true, accountId: true },
    });
    const belongsToAccount = !payload?.accountId || profile?.accountId === payload.accountId;
    if (profile && belongsToAccount) {
      validProfileId = profileId;
      isAdmin = profile.role === "ADMIN" || isConfiguredAdminProfile(profile);
    }
  }

  return {
    prisma,
    accountId: validProfileId ? payload?.accountId : undefined,
    profileId: validProfileId,
    isAdmin,
  };
}
