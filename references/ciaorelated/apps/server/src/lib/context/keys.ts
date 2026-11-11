// apps/server/src/lib/context/keys.ts
export function slugify(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function keyOf(kind: string, raw: string) {
  const v = slugify(raw);
  if (!v) return null;
  return `${kind}:${v}`;
}
