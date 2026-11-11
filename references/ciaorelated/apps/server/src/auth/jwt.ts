// apps/server/src/auth/jwt.ts
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN, type JwtPayload } from "../config";

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
