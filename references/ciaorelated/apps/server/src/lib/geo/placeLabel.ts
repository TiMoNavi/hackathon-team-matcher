export function normalizePlaceLabel(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const firstPart = raw
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);

  return firstPart || raw;
}
