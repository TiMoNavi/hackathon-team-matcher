export type ExpoPushMessage = {
  to: string;
  title?: string;
  body: string;
  data?: any;
};

export async function sendExpoPush(msg: ExpoPushMessage) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });

  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}
