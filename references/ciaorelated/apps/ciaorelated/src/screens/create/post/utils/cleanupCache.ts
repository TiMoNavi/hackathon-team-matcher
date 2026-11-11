import * as FileSystem from "expo-file-system/legacy";

/**
 * Löscht alte Media-Dateien aus dem Cache
 *
 * @param opts.maxAgeMs  nur Dateien älter als X ms löschen (default: 30 Minuten)
 * @param opts.prefixes  nur Dateien mit diesen Prefixen anfassen
 */
export async function cleanupMediaCache(opts?: {
  maxAgeMs?: number;
  prefixes?: string[];
}) {
  const maxAgeMs = opts?.maxAgeMs ?? 30 * 60 * 1000; // 30 Minuten
  const prefixes = opts?.prefixes ?? ["ml_", "pw_", "ImageManipulator", "VideoThumbnails"];

  const baseDir = FileSystem.cacheDirectory;
  if (!baseDir) return;

  let entries: string[] = [];
  try {
    entries = await FileSystem.readDirectoryAsync(baseDir);
  } catch {
    return;
  }

  const now = Date.now();

  await Promise.all(
    entries.map(async (name) => {
      // nur unsere Dateien anfassen
      if (!prefixes.some((p) => name.startsWith(p))) return;

      const uri = baseDir + name;

      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.isDirectory) return;

        // @ts-ignore (legacy FS)
        const modified = (info as any).modificationTime
          ? (info as any).modificationTime * 1000
          : null;

        if (modified && now - modified < maxAgeMs) return;

        await FileSystem.deleteAsync(uri, { idempotent: true });
        console.log("CACHE_CLEANUP_OK", name);
      } catch (e) {
        console.log("CACHE_CLEANUP_SKIP", name);
      }
    })
  );
}
