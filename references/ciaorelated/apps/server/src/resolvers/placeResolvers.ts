// apps/server/src/resolvers/placeResolvers.ts
type NominatimItem = {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  class?: string;
  address?: any;
};

function buildTitleSubtitle(item: NominatimItem) {
  const displayName = item.display_name;
  const s = (displayName ?? "").trim();
  if (!s) return { title: "", subtitle: undefined as string | undefined };

  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  const title = String(parts[0] ?? "").trim();
  const subtitleParts = parts.filter((part) => part.toLowerCase() !== title.toLowerCase());
  const subtitle = subtitleParts.length ? subtitleParts.join(", ") : undefined;
  return { title, subtitle };
}

const placeResolvers = {
  Query: {
    searchPlaces: async (_: any, args: { q: string; limit?: number }) => {
      const q = String(args.q ?? "").trim();
      const limit = Math.max(1, Math.min(Number(args.limit ?? 8), 12));

      if (!q) return [];

      // Nominatim Policy: User-Agent setzen (und optional Email)
      const email = process.env.NOMINATIM_EMAIL;
      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?format=jsonv2` +
        `&q=${encodeURIComponent(q)}` +
        `&addressdetails=1` +
        `&limit=${limit}` +
        `&accept-language=de`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": email
            ? `ciaorelated/1.0 (${email})`
            : "ciaorelated/1.0 (contact: set NOMINATIM_EMAIL)",
        },
      });

      if (!res.ok) return [];

      const json = (await res.json()) as NominatimItem[];
      if (!Array.isArray(json)) return [];

      return json
        .map((it) => {
          const lat = Number(it.lat);
          const lng = Number(it.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          const { title, subtitle } = buildTitleSubtitle(it);
          if (!title) return null;

          return {
            id: String(it.place_id ?? `${lat},${lng}`),
            title,
            subtitle,
            lat,
            lng,
          };
        })
        .filter(Boolean);
    },
  },
};

export default placeResolvers;
