// apps/server/src/lib/context/topicExtraction.ts
//
// Generate TOPIC candidates from a caption.
//
// Design goals:
// - No "hashtag feature" in UI. We only parse caption text.
// - Hashtags act as an optional explicit hint (stronger signal).
// - Plain keywords act as a weak hint (cold start), controlled by a small dictionary.
// - Everything is canonicalized to stable topic keys.

import { slugify } from "./keys";

export type TopicCandidate = {
  label: string;   // what you might show later in bubbles
  rawKey: string;  // normalized (without prefix). keyOf("topic", rawKey) will add prefix
  weight: number;  // relative strength
};

/**
 * Controlled alias dictionary (small at start; expand with real usage).
 * key = canonical label
 * values = aliases that may appear in hashtag or text
 */
const TOPIC_ALIASES: Record<string, string[]> = {
  "Fotografie": [
    "fotografie",
    "photography",
    "photo",
    "photos",
    "kamera",
    "camera",
    "dslr",
    "streetphotography",
    "street-photo",
    "street_photo",
  ],
  "Musik": ["musik", "music", "song", "songs", "band", "konzert", "gig"],
  "Studium": ["studium", "uni", "university", "vorlesung", "tuwien", "tu", "fh"],
  "Architektur": ["architektur", "architecture", "baukunst", "urbanism", "stadtplanung"],
  "Design": ["design", "graphic", "grafik", "ui", "ux", "typografie", "typography"],
  "Sport": ["sport", "gym", "fitness", "laufen", "run", "running", "yoga", "bouldern", "klettern"],
  "Natur": ["natur", "nature", "berge", "mountains", "wandern", "hike", "hiking"],
  "Kaffee": ["kaffee", "coffee", "cafe", "espresso", "latte"],
  "Kunst": ["kunst", "art", "museum", "gallery", "galerie"],
  "Kochen": ["kochen", "cooking", "food", "essen", "rezept", "recipe"],
  "Nachtleben": ["night", "party", "club", "rave", "nachtleben"],
};

/**
 * Blocklist for growth-hack / empty-vibe tags.
 */
const BLOCKLIST = new Set([
  "fyp",
  "foryou",
  "viral",
  "trend",
  "trending",
  "explore",
  "reels",
  "insta",
  "instagram",
  "tiktok",
  "follow",
  "followme",
  "like",
  "likes",
  "love",
  "happy",
  "cool",
  "nice",
]);

/**
 * alias -> canonical label lookup
 */
const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(TOPIC_ALIASES)) {
    m[slugify(canonical)] = canonical;
    for (const a of aliases) m[slugify(a)] = canonical;
  }
  return m;
})();

function uniqBest(cands: TopicCandidate[]): TopicCandidate[] {
  const best = new Map<string, TopicCandidate>();
  for (const c of cands) {
    const prev = best.get(c.rawKey);
    if (!prev || c.weight > prev.weight) best.set(c.rawKey, c);
  }
  return Array.from(best.values());
}

function canonicalize(input: string): { label: string; rawKey: string } | null {
  const s = slugify(input);
  if (!s) return null;

  if (BLOCKLIST.has(s)) return null;

  const canonicalLabel = ALIAS_TO_CANONICAL[s];
    if (!canonicalLabel) return null;

    const label = canonicalLabel;
    const rawKey = slugify(canonicalLabel);

  if (!rawKey) return null;

  return { label, rawKey };
}

export function extractHashtagTopics(caption: string): TopicCandidate[] {
  if (!caption) return [];

  const out: TopicCandidate[] = [];
  const re = /#([\p{L}\p{N}_-]{2,50})/gu;

  for (const m of caption.matchAll(re)) {
    const raw = (m[1] ?? "").replace(/[_-]+/g, " ");
    const canon = canonicalize(raw);
    if (!canon) continue;

    out.push({ label: canon.label, rawKey: canon.rawKey, weight: 0.4 });
  }

  return uniqBest(out);
}

export function extractKeywordTopics(caption: string): TopicCandidate[] {
  if (!caption) return [];

  // conservative tokenization
  const normalized = caption
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  if (!normalized) return [];

  const tokens = new Set(normalized.split(/\s+/g).filter(Boolean));

  const out: TopicCandidate[] = [];
  for (const t of tokens) {
    const slug = slugify(t);
    if (!slug) continue;
    if (BLOCKLIST.has(slug)) continue;

    const canonicalLabel = ALIAS_TO_CANONICAL[slug];
    if (canonicalLabel) {
      out.push({ label: canonicalLabel, rawKey: slugify(canonicalLabel), weight: 0.15 });
    }
  }

  return uniqBest(out);
}

export function extractTopicsFromCaption(caption?: string | null): TopicCandidate[] {
  if (!caption) return [];
  return uniqBest([...extractHashtagTopics(caption), ...extractKeywordTopics(caption)]);
}
