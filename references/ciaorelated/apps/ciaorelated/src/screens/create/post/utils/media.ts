// apps/ciaorelated/src/screens/create/post/utils/media.ts

import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";


/** Sekunden aus (ms|s|undef) normalisieren. */
export function toSeconds(d?: number | null): number | null {
  if (d == null || Number.isNaN(d)) return null;
  // Manche APIs liefern ms, andere s – wir normalisieren.
  return d > 1000 ? Math.round(d / 1000) : Math.round(d);
}

/** mm:ss Formatierung (z. B. für Video-Dauer-Badges). */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Liefert einen abspielbaren Pfad:
 * - iOS: bevorzugt localUri von MediaLibrary, sonst ursprüngliche uri
 * - Android: konvertiert file:// zu content://, wenn möglich (stabiler für Video)
 */
export async function resolvePlayableUri(assetId: string, fallbackUri: string): Promise<string> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    
    if (info?.localUri) return info.localUri as string;
  } catch {
    // Ignorieren, wir versuchen den Fallback/Android-Workaround
  }

  if (Platform.OS === "android" && fallbackUri.startsWith("file://")) {
    try {
      const contentUri = await FileSystem.getContentUriAsync(fallbackUri);
      if (contentUri) return contentUri;
    } catch {
      // Fallback auf file://
    }
  }

  return fallbackUri;
}

/**
 * Ermittelt sicher die Dateigröße einer URI.
 * 1) expo-file-system getInfoAsync (wenn exists:true & !isDirectory)
 * 2) Fallback: fetch -> blob.size (für content:// u. ä.)
 */
export async function getSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      // size ist nur im exists:true-Zweig vorhanden
      const s = (info as any).size as number | undefined;
      if (typeof s === "number" && s > 0) return s;
    }
  } catch {
    // weiter zum Fallback
  }

  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    if (typeof blob.size === "number" && blob.size > 0) return blob.size;
  } catch {
    // ignorieren
  }

  return null;
}

/** Kleiner Helper: formatiert eine evtl. unbekannte Dauer sicher für Anzeige. */
export function safeDurationLabel(d?: number | null): string {
  const s = toSeconds(d);
  return s == null ? "–:–" : formatDuration(s);
}

export const isPHUri = (u?: string | null) => !!u && u.startsWith("ph://");
export const looksLikeHeic = (u: string) =>
  /\.hei[cf]$/i.test(u) || /[?&]ext=hei[cf]\b/i.test(u); // iOS URIs haben oft ?ext=HEIC
const JPEG_FORMAT: any = (ImageManipulator as any)?.SaveFormat?.JPEG ?? "jpeg";

async function readHeaderBase64(uri: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 24,
    } as any);
  } catch {
    return null;
  }
}

function mimeFromHeader(headerBase64: string | null): string | null {
  if (!headerBase64) return null;
  const bytes = atob(headerBase64);
  const b = Array.from(bytes).map((char) => char.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (bytes.slice(0, 4) === "RIFF" && bytes.slice(8, 12) === "WEBP") return "image/webp";
  if (bytes.slice(4, 8) === "ftyp") {
    const brand = bytes.slice(8, 16).toLowerCase();
    if (brand.includes("heic") || brand.includes("heif") || brand.includes("heix") || brand.includes("hevc")) {
      return "image/heic";
    }
  }
  return null;
}

function mimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}


/**
 * Falls die Quelle HEIC/HEIF ist → in JPEG konvertieren.
 * Gibt immer eine URI zurück, die mit .jpg endet.
 */
export async function ensureJpegUri(uri: string): Promise<string> {
  try {
    if (uri.toLowerCase().endsWith(".heic") || uri.toLowerCase().endsWith(".heif")) {
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: 0.95, format: JPEG_FORMAT }
      );
      return out.uri;
    }
  } catch (e) {
    console.warn("[ensureJpegUri] fallback", e);
  }
  return uri;
}



export async function ensureUploadableImage(uri: string): Promise<{ uri: string; mime: string }> {
  const lower = uri.toLowerCase();
  const detectedMime = mimeFromHeader(await readHeaderBase64(uri));
  const uriMime = mimeFromUri(uri);
  const mime = detectedMime ?? uriMime;

  if (mime !== "image/jpeg" || lower.endsWith(".heic") || lower.endsWith(".heif") || lower.endsWith(".webp") || lower.endsWith(".png")) {
    try {
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: 0.95, format: JPEG_FORMAT }
      );
      return { uri: out.uri, mime: "image/jpeg" };
    } catch (e) {
      console.warn("[ensureUploadableImage] convert failed", e);
      return { uri, mime };
    }
  }
  return { uri, mime: "image/jpeg" };
}
