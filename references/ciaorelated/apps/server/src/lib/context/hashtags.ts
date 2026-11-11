// apps/server/src/lib/context/hashtags.ts

// "#Start-Ups" -> "startups"
// "#parametric_design" -> "parametricdesign"
// We intentionally keep it strict to avoid spam/noise.
export function normalizeTag(raw: string) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, ""); // remove leading #

  // allow letters/digits/_/- but then normalize to alnum only
  const cleaned = s.replace(/[^a-z0-9äöüß_-]+/gi, "");
  const alnum = cleaned.replace(/[_-]+/g, ""); // collapse separators out

  // tiny plural normalization (optional)
  const out = alnum.endsWith("s") && alnum.length > 3 ? alnum.slice(0, -1) : alnum;

  // length guard
  if (out.length < 2 || out.length > 40) return null;

  return out;
}

export function extractHashtags(caption?: string | null) {
  const text = String(caption ?? "");
  // strict hashtag tokens: #word chars
  const matches = text.match(/#[\p{L}\p{N}_-]{2,40}/gu) ?? [];
  const set = new Set<string>();

  for (const m of matches) {
    const norm = normalizeTag(m);
    if (norm) set.add(norm);
  }
  return Array.from(set);
}
