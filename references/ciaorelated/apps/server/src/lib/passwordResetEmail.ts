import sgMail from "@sendgrid/mail";
import { SENDGRID_API_KEY, EMAIL_FROM } from "../config";

const canSendEmail = SENDGRID_API_KEY.startsWith("SG.") && !!EMAIL_FROM;

if (canSendEmail) sgMail.setApiKey(SENDGRID_API_KEY);

export async function sendPasswordResetCode(email: string, code: string) {
  if (!canSendEmail) {
    console.log("[email][DEV] RESET CODE to", email, "code:", code);
    return;
  }

  try {
    await sgMail.send({
      to: email,
      from: EMAIL_FROM,
      subject: "Dein Passwort-Reset Code",
      text: `Dein Code zum Zurücksetzen: ${code}\n\nDer Code ist nur kurz gültig.`,
    });
  } catch (e: any) {
    console.warn("[email] password reset delivery failed:", e?.message || e);
    console.log("[email][DEV] RESET CODE to", email, "code:", code);
  }
}
