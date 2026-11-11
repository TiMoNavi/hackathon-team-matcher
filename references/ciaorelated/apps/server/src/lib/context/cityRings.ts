// apps/server/src/lib/context/cityRings.ts
//
// Cold-start helper for geo resonance without GPS.
//
// We keep Profile.city as the identity anchor, but when a city has too little activity
// we can *softly* expand to a nearby ring (region/metro) and finally to global.
//
// This mapping is intentionally small and editable. Start minimal, refine later.

export type CityRing = {
  label: string;
  cities: string[];
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Minimal starter map (Austria). Add as you test.
 * Keys are normalized city names.
 */
const CITY_TO_RING: Record<string, CityRing> = {
  // Salzburg region
  [norm("salzburg")]: {
    label: "Salzburg Umgebung",
    cities: ["Salzburg", "Hallein", "Abtenau", "Bischofshofen", "Sankt Johann im Pongau", "Zell am See"],
  },
  [norm("hallein")]: {
    label: "Salzburg Umgebung",
    cities: ["Salzburg", "Hallein", "Abtenau", "Bischofshofen", "Sankt Johann im Pongau", "Zell am See"],
  },
  [norm("abtenau")]: {
    label: "Salzburg Umgebung",
    cities: ["Salzburg", "Hallein", "Abtenau", "Bischofshofen", "Sankt Johann im Pongau", "Zell am See"],
  },

  // Vienna region
  [norm("wien")]: {
    label: "Wien Umgebung",
    cities: ["Wien", "Korneuburg", "Mödling", "Baden", "Schwechat", "Klosterneuburg"],
  },
  [norm("vienna")]: {
    label: "Wien Umgebung",
    cities: ["Wien", "Korneuburg", "Mödling", "Baden", "Schwechat", "Klosterneuburg"],
  },

  // Linz region
  [norm("linz")]: { label: "Linz Umgebung", cities: ["Linz", "Wels", "Steyr"] },
};

export function getCityRings(city: string) {
  const c = (city ?? "").trim();
  const key = norm(c);
  const ring = CITY_TO_RING[key] ?? null;

  const local = { label: c, cities: c ? [c] : [] } satisfies CityRing;
  const nearby = ring
    ? {
        label: ring.label,
        cities: Array.from(new Set([...ring.cities, c].filter(Boolean))),
      }
    : null;

  return { local, nearby };
}
