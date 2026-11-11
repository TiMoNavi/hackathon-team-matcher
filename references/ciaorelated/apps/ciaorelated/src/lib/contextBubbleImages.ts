const CONTEXT_KIND_IMAGES: Record<string, any> = {
  MIX: require("../../assets/context-bubbles/community-friends.jpg"),
  HASHTAG: null,
  CITY: require("../../assets/context-bubbles/city-place.jpg"),
  PLACE: require("../../assets/context-bubbles/place.jpg"),
  INTEREST: require("../../assets/context-bubbles/interest-default.jpg"),
  TOPIC: require("../../assets/context-bubbles/topic.jpg"),
  EDU_FIELD: require("../../assets/context-bubbles/education.jpg"),
  EDU_ORG: require("../../assets/context-bubbles/campus.jpg"),
  EDU_LEVEL: require("../../assets/context-bubbles/education-level.jpg"),
  VLOG: require("../../assets/context-bubbles/interest-film.png"),
};

const INTEREST_CONTEXT_IMAGES: Record<string, any> = {
  photography: require("../../assets/context-bubbles/interest-photography.jpg"),
  music: require("../../assets/context-bubbles/interest-music.jpg"),
  film: require("../../assets/context-bubbles/interest-film.png"),
  design: require("../../assets/context-bubbles/interest-design.jpg"),
  architecture: require("../../assets/context-bubbles/architecture.jpg"),
  fashion: require("../../assets/context-bubbles/interest-fashion.jpg"),
  art: require("../../assets/context-bubbles/interest-art.jpg"),
  sports: require("../../assets/context-bubbles/sports.jpg"),
  sport: require("../../assets/context-bubbles/sports.jpg"),
  fitness: require("../../assets/context-bubbles/interest-fitness.jpg"),
  cooking: require("../../assets/context-bubbles/interest-cooking.jpg"),
  travel: require("../../assets/context-bubbles/interest-travel.jpg"),
  gaming: require("../../assets/context-bubbles/gaming.jpg"),
  tech: require("../../assets/context-bubbles/tech.jpg"),
  startups: require("../../assets/context-bubbles/startup.jpg"),
  nature: require("../../assets/context-bubbles/interest-default.jpg"),
  books: require("../../assets/context-bubbles/books.jpg"),
};

const INTEREST_LABEL_ALIASES: Record<string, string> = {
  fotografie: "photography",
  photography: "photography",
  musik: "music",
  music: "music",
  film: "film",
  design: "design",
  architektur: "architecture",
  architecture: "architecture",
  mode: "fashion",
  fashion: "fashion",
  kunst: "art",
  art: "art",
  sport: "sports",
  sports: "sports",
  fitness: "fitness",
  kochen: "cooking",
  cooking: "cooking",
  reisen: "travel",
  travel: "travel",
  gaming: "gaming",
  tech: "tech",
  technik: "tech",
  startups: "startups",
  natur: "nature",
  nature: "nature",
  buecher: "books",
  bucher: "books",
  bücher: "books",
  books: "books",
};

const COMMUNITY_TYPE_IMAGES: Record<string, any> = {
  COMMUNITY: require("../../assets/context-bubbles/community-friends.jpg"),
  EVENT: require("../../assets/context-bubbles/community-event.jpg"),
  UNI: require("../../assets/context-bubbles/campus.jpg"),
  BUSINESS: require("../../assets/context-bubbles/community-business.jpg"),
  FAMILY: require("../../assets/context-bubbles/community-family.jpg"),
  OTHER: require("../../assets/context-bubbles/community-friends.jpg"),
};

export function normalizeContextKind(kind?: string | null, key?: string | null) {
  if (String(kind ?? "").toUpperCase() === "HASHTAG") return "HASHTAG";
  if (String(key ?? "").startsWith("tag:")) return "HASHTAG";
  return String(kind ?? "");
}

export function normalizeContextImageKey(value?: string | null) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^interest:/, "")
    .replace(/^interests[.:/]/, "")
    .replace(/^#/, "")
    .replace(/^tag:/, "")
    .replace(/\s+/g, "_");
  return INTEREST_LABEL_ALIASES[raw] ?? raw;
}

export function contextImageFor(kind?: string | null, key?: string | null, title?: string | null) {
  const normalizedKind = normalizeContextKind(kind, key);
  if (normalizedKind === "INTEREST") {
    const byKey = INTEREST_CONTEXT_IMAGES[normalizeContextImageKey(key)];
    if (byKey) return byKey;
    const byTitle = INTEREST_CONTEXT_IMAGES[normalizeContextImageKey(title)];
    if (byTitle) return byTitle;
  }
  if (normalizedKind === "HASHTAG") return CONTEXT_KIND_IMAGES.HASHTAG;
  return CONTEXT_KIND_IMAGES[normalizedKind] ?? CONTEXT_KIND_IMAGES.TOPIC;
}

export function contextIconFor(kind?: string | null, key?: string | null, variant: "small" | "large" = "small") {
  const normalizedKind = normalizeContextKind(kind, key);
  if (normalizedKind === "HASHTAG") return variant === "large" ? "hash" : "pricetag";
  if (normalizedKind === "CITY" || normalizedKind === "PLACE") return "location";
  if (normalizedKind === "INTEREST") return "sparkles";
  if (normalizedKind === "EDU_FIELD" || normalizedKind === "EDU_ORG" || normalizedKind === "EDU_LEVEL") return "school";
  if (normalizedKind === "VLOG") return "albums";
  return "pricetag";
}

export function communityImageForType(type?: string | null) {
  return COMMUNITY_TYPE_IMAGES[String(type ?? "OTHER").toUpperCase()] ?? COMMUNITY_TYPE_IMAGES.OTHER;
}

export { CONTEXT_KIND_IMAGES, INTEREST_CONTEXT_IMAGES, COMMUNITY_TYPE_IMAGES };
