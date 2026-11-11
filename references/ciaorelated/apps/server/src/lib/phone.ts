export function normalizePhoneNumber(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const compact = raw.replace(/[^\d+]/g, "");
  if (compact.startsWith("+")) return `+${compact.slice(1).replace(/\D/g, "")}`;
  if (compact.startsWith("00")) return `+${compact.slice(2).replace(/\D/g, "")}`;
  return compact.replace(/\D/g, "");
}

export function isValidPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
