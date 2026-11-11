import sgMail from "@sendgrid/mail";
import { SENDGRID_API_KEY, EMAIL_FROM } from "../config";

const canSendEmail = SENDGRID_API_KEY.startsWith("SG.") && !!EMAIL_FROM;

if (canSendEmail) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else if (SENDGRID_API_KEY) {
  console.warn("[email] SENDGRID_API_KEY is set but does not look like a SendGrid API key. Falling back to dev console codes.");
}

export async function sendVerifyCode(email: string, code: string) {
  if (!canSendEmail) {
    console.log("[email][DEV] VERIFY CODE to", email, "code:", code);
    return;
  }

  try {
    await sgMail.send({
      to: email,
      from: EMAIL_FROM,
      subject: "Your verification code",
      text: `Dein Bestätigungscode: ${code}\n\nDer Code ist nur kurz gültig.`,
    });
  } catch (e: any) {
    console.warn("[email] verify code delivery failed:", e?.message || e);
    console.log("[email][DEV] VERIFY CODE to", email, "code:", code);
  }
}
