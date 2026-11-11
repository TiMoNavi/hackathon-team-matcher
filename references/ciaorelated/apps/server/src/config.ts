// apps/server/src/config.ts
import "dotenv/config";

const cleanEnv = (value: string | undefined, fallback = "") =>
  (value || fallback)
    .trim()
    .replace(/^['"]/, "")
    .replace(/['"];?$/, "")
    .replace(/;$/, "")
    .trim();

export const JWT_SECRET = (process.env.JWT_SECRET || "replace-with-a-long-random-secret").trim();
export const JWT_EXPIRES_IN = "365d";

export type JwtPayload = {
  accountId?: string;
  profileId?: string;
};
export const SENDGRID_API_KEY = cleanEnv(process.env.SENDGRID_API_KEY);
export const EMAIL_FROM = cleanEnv(process.env.EMAIL_FROM, "ciaorelated <noreply@example.com>");
export const TWILIO_ACCOUNT_SID = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
export const TWILIO_AUTH_TOKEN = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
export const TWILIO_VERIFY_SERVICE_SID = cleanEnv(process.env.TWILIO_VERIFY_SERVICE_SID);

const cleanCsvEnv = (value: string | undefined) =>
  cleanEnv(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const ADMIN_USERNAMES = cleanCsvEnv(process.env.ADMIN_USERNAMES).map((username) =>
  username.toLowerCase()
);

//export const SMTP_HOST = process.env.SMTP_HOST || "";
//export const SMTP_PORT = process.env.SMTP_PORT || "587";
//export const SMTP_USER = process.env.SMTP_USER || "";
//export const SMTP_PASS = process.env.SMTP_PASS || "";
//export const SMTP_FROM = process.env.SMTP_FROM || "";
