import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID,
} from "../config";

export function isTwilioVerifyConfigured() {
  return !!TWILIO_ACCOUNT_SID && !!TWILIO_AUTH_TOKEN && !!TWILIO_VERIFY_SERVICE_SID;
}

function twilioAuthHeader() {
  return `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`;
}

function verifyServiceUrl(path: string) {
  return `https://verify.twilio.com/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}${path}`;
}

export async function sendPhoneVerifyCode(phoneNumber: string, code?: string) {
  if (isTwilioVerifyConfigured()) {
    const body = new URLSearchParams({ To: phoneNumber, Channel: "sms" });
    const res = await fetch(verifyServiceUrl("/Verifications"), {
      method: "POST",
      headers: {
        authorization: twilioAuthHeader(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[sms][twilio] send failed", { status: res.status, text });
      throw new Error("SMS_SEND_FAILED");
    }
    return;
  }

  if (process.env.SMS_PROVIDER === "console" || process.env.NODE_ENV !== "production") {
    console.log("[sms] verification code", { phoneNumber, code });
    return;
  }

  throw new Error("SMS_PROVIDER_NOT_CONFIGURED");
}

export async function checkPhoneVerifyCode(phoneNumber: string, code: string) {
  if (!isTwilioVerifyConfigured()) return null;

  const body = new URLSearchParams({ To: phoneNumber, Code: code });
  const res = await fetch(verifyServiceUrl("/VerificationCheck"), {
    method: "POST",
    headers: {
      authorization: twilioAuthHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[sms][twilio] check failed", { status: res.status, text });
    return false;
  }

  const json = (await res.json()) as { status?: string; valid?: boolean };
  return json.status === "approved" || json.valid === true;
}
