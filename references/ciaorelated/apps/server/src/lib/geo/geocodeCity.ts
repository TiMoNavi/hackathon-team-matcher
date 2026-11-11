// apps/server/src/lib/geo/geocodeCity.ts
type NominatimItem = {
  lat?: string;
  lon?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;   // ✅ Bundesland/Region (z.B. Salzburg)
    country?: string; // ✅ Österreich
  };
};

export type CityGeo = {
  city: string;              // original input
  lat: number;
  lng: number;
  region: string | null;
  country: string | null;
};

export async function geocodeCity(city: string): Promise<CityGeo | null> {
  const q = String(city ?? "").trim();
  if (!q) return null;

  const email = process.env.NOMINATIM_EMAIL;
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=jsonv2` +
    `&q=${encodeURIComponent(q)}` +
    `&addressdetails=1` +
    `&limit=1` +
    `&accept-language=de`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": email
        ? `ciaorelated/1.0 (${email})`
        : "ciaorelated/1.0 (contact: set NOMINATIM_EMAIL)",
    },
  });

  if (!res.ok) return null;

  const json = (await res.json()) as NominatimItem[];
  const it = Array.isArray(json) ? json[0] : null;
  if (!it) return null;

  const lat = Number(it.lat);
  const lng = Number(it.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const region = it.address?.state ?? null;
  const country = it.address?.country ?? null;

  return { city: q, lat, lng, region, country };
}
