// apps/server/src/lib/username.ts
import { containsProfanity } from "./profanity";

const RESERVED = new Set([
  "admin","administrator","support","help","contact","kontakt",
  "root","system","owner","moderator","mod",
  "api","status","docs","doc","dev","developer",
  "login","logout","signin","signup","register","me","about","privacy","terms",
  "null","undefined"
]);

export function normalizeUsername(raw?: string | null): string {
  if (!raw) return "";
  let s = String(raw).trim();

  // 1) Umlaute/ß zuerst expandieren, damit NFKD die "e" nicht verschluckt
  s = s
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue")
    .replace(/ß/g, "ss");

  // 2) Kleinbuchstaben
  s = s.toLowerCase();

  // 3) Unicode-Normalisierung + Diakritika entfernen
  s = s.normalize("NFKD").replace(/\p{M}+/gu, "");

  // 4) Leerzeichen → Unterstrich
  s = s.replace(/\s+/g, "_");

  // 5) Nur [a-z0-9._] erlauben
  s = s.replace(/[^a-z0-9._]/g, "");

  // 6) Mehrere Separatoren zusammenfassen
  s = s.replace(/[._]{2,}/g, ".");

  // 7) Separatoren am Rand entfernen
  s = s.replace(/^[._]+/, "").replace(/[._]+$/, "");

  // 8) Länge begrenzen
  if (s.length > 20) s = s.slice(0, 20);

  return s;
}

export function validateUsernameOrThrow(u: string) {
  if (!u) throw new Error("Benutzername ist erforderlich.");
  if (u.length < 3) throw new Error("Benutzername zu kurz (mind. 3 Zeichen).");
  if (!/^[a-z0-9._]{3,20}$/.test(u)) {
    throw new Error("Benutzername darf nur a–z, 0–9, Punkt und Unterstrich enthalten (3–20 Zeichen).");
  }
  if (RESERVED.has(u)) throw new Error("Dieser Benutzername ist reserviert.");
  if (containsProfanity(u)) throw new Error("Dieser Benutzername ist nicht erlaubt.");
}
