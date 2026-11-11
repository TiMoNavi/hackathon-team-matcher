// apps/server/src/s3_cached.ts
import { getSignedGetUrl } from "./s3";

// kleines In-Memory-Cache (pro Node-Prozess)
const coverUrlCache = new Map<string, { url: string; exp: number }>();

// AWS presign-URLs enthalten X-Amz-Date (UTC) + X-Amz-Expires (Sekunden)
function parseExpiryFromSignedUrl(url: string): number {
  try {
    const u = new URL(url);
    const amzDate = u.searchParams.get("X-Amz-Date");      // e.g. 20250101T120000Z
    const amzExp  = Number(u.searchParams.get("X-Amz-Expires") || "0") * 1000;
    if (!amzDate || !amzExp) return Date.now() + 5 * 60 * 1000;
    // 20250101T120000Z -> 2025-01-01T12:00:00Z
    const iso = amzDate.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z"
    );
    const t0 = Date.parse(iso);
    return (isNaN(t0) ? Date.now() : t0) + amzExp;
  } catch {
    return Date.now() + 5 * 60 * 1000;
  }
}

// Hole stabil dieselbe presigned URL solange sie nicht bald ausläuft
export async function getSignedGetUrlCached(
  key: string,
  ttlSeconds = 7 * 24 * 3600 // 7 Tage
): Promise<string> {
  const now = Date.now();
  const hit = coverUrlCache.get(key);
  if (hit && hit.exp - now > 60_000) return hit.url; // 60s Puffer

  // ⬇️ HIER: Zahl übergeben, nicht { expiresIn: ... }
  const url = await getSignedGetUrl(key, ttlSeconds);
  const exp = inferExpiry(url, ttlSeconds);
  coverUrlCache.set(key, { url, exp });
  return url;
}
function inferExpiry(url: string, fallbackSeconds: number): number {
  try {
    const u = new URL(url);
    const amzDate = u.searchParams.get("X-Amz-Date");      // z.B. 20250101T120000Z
    const amzExp  = Number(u.searchParams.get("X-Amz-Expires") || fallbackSeconds) * 1000;
    const iso = amzDate
      ? amzDate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")
      : null;
    const t0 = iso ? Date.parse(iso) : Date.now();
    return (isNaN(t0) ? Date.now() : t0) + amzExp;
  } catch {
    return Date.now() + fallbackSeconds * 1000;
  }
}