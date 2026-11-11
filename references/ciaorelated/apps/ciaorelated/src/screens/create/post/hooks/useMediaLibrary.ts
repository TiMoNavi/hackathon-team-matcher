// apps/ciaorelated/src/screens/create/post/hooks/useMediaLibrary.ts
import * as MediaLibrary from "expo-media-library";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

/* ---------- Helpers ---------- */
const stripHash = (uri: string) => uri.split("#")[0].replace(/\?.*$/, "");
const safeKey = (k: string) => k.replace(/[^\w-]+/g, "_");

const isFile = (u: string) => u.startsWith("file://");
const isPh = (u: string) => u.startsWith("ph://") || u.startsWith("assets-library://");

const toSeconds = (d?: number | null) =>
  d == null || Number.isNaN(d) ? null : d > 1000 ? Math.round(d / 1000) : Math.round(d);

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const fileNameFrom = (uri: string, fallback = "media") => {
  try {
    const clean = stripHash(uri);
    const seg = clean.split("/").filter(Boolean);
    return seg[seg.length - 1] || fallback;
  } catch {
    return fallback;
  }
};

const guessExt = (uri: string, fallback: string) => {
  const clean = stripHash(uri);
  const m = clean.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (m?.[1] ?? fallback).toLowerCase();
  if (ext === "jpeg") return "jpg";
  return ext;
};

/** Stabiler Cache-Pfad (gleicher Name -> reuse ok) */
async function copyToCacheStable(src: string, extFallback: string) {
  const clean = stripHash(src);
  const name = fileNameFrom(clean);
  const hasExt = /\.[a-zA-Z0-9]{2,}$/.test(name);
  const cacheDir =
  ("cacheDirectory" in FileSystem ? (FileSystem as any).cacheDirectory : undefined) ??
  ("documentDirectory" in FileSystem ? (FileSystem as any).documentDirectory : "");

  const target = `${cacheDir}${hasExt ? name : `${name}.${extFallback}`}`;

  try {
    const info = await FileSystem.getInfoAsync(target);
    const size = (info as any)?.size ?? 0;
    if (info.exists && !info.isDirectory && size > 0) return target;
  } catch {}

  await FileSystem.copyAsync({ from: clean, to: target });
  return target;
}

/**
 * ✅ Picker-Fix: immer UNIQUE Datei erzeugen,
 * damit ExpoImage / Recycling nicht falsches Bild reused.
 */
async function copyToCacheUnique(src: string, key: string, extFallback: string) {
  const clean = stripHash(src);
  const ext = guessExt(clean, extFallback);
  const baseDir =
  ("cacheDirectory" in FileSystem ? (FileSystem as any).cacheDirectory : undefined) ??
  ("documentDirectory" in FileSystem ? (FileSystem as any).documentDirectory : undefined);

  if (!baseDir) return clean;

  const dest = `${baseDir}pw_pick_${safeKey(key)}_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: clean, to: dest });
    return dest;
  } catch {
    // iOS: manchmal "busy" -> retry
    try {
      await new Promise((r) => setTimeout(r, 120));
      await FileSystem.copyAsync({ from: clean, to: dest });
      return dest;
    } catch {
      return clean;
    }
  }
}

async function exportPhotoToJpegUnique(src: string, key: string) {
  const clean = stripHash(src);
  const out = await ImageManipulator.manipulateAsync(clean, [], {
    compress: 0.95,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return copyToCacheUnique(out.uri, key, "jpg");
}

/* Concurrency limit (Favorites) */
async function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(arr.length) as any;
  let idx = 0;

  const workers = new Array(Math.min(limit, arr.length)).fill(0).map(async () => {
    while (idx < arr.length) {
      const cur = idx++;
      out[cur] = await fn(arr[cur]);
    }
  });

  await Promise.all(workers);
  return out;
}

/* ---------- Types ---------- */
export type GridAsset = {
  id: string;
  uri: string; // original (kann ph:// sein)
  playableUri?: string;
  mediaType: "photo" | "video";
  duration?: number | null;
  durationLabel?: string;
  thumbUri?: string;
};

export type MediaFilterMode = "recent" | "videos" | "favorites" | "albums";

export type MediaAlbum = {
  id: string;
  title: string;
  assetCount?: number;
};

export type PickedMedia = {
  uri: string; // ✅ unique/stabil
  mediaType: "photo" | "video";
  width?: number;
  height?: number;
  fileName?: string | null;
  mimeType?: string | null;
  duration?: number | null;
};
let _cachedAssets: GridAsset[] | null = null;
let _cachedPerm: boolean | null = null;
let _loadingPromise: Promise<void> | null = null;


export function useMediaLibrary() {

  const [permissionGranted, setPerm] = useState<boolean | null>(null);


  const [assets, setAssets] = useState<GridAsset[]>([]);
  const [albums, setAlbums] = useState<MediaAlbum[]>([]);

  const [mode, setMode] = useState<MediaFilterMode>("recent");
  const [selectedAlbum, setSelectedAlbum] = useState<MediaAlbum | null>(null);

  const PAGE_SIZE = 60;

  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
  // 1) Sofort aus Cache anzeigen (falls vorhanden)
  if (_cachedPerm != null) setPerm(_cachedPerm);
  if (_cachedAssets) setAssets(_cachedAssets);

  // 2) Wenn bereits ein Ladevorgang läuft: nicht nochmal starten
  if (_loadingPromise) return;

  _loadingPromise = (async () => {
    const p = await MediaLibrary.requestPermissionsAsync();
    const ok = p.status === "granted";
    _cachedPerm = ok;
    setPerm(ok);
    if (!ok) return;

    const res = await MediaLibrary.getAssetsAsync({
      first: 90,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    });

    const withMeta: GridAsset[] = await Promise.all(
      res.assets.map(async (a) => {
        const isVideo = a.mediaType === MediaLibrary.MediaType.video;

        // Dauer robuster bestimmen
        let durationSec = toSeconds(a.duration ?? null);
        if (isVideo && (durationSec == null || durationSec === 0)) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(a.id);
            const sec = toSeconds((info as any)?.duration ?? null);
            if (sec != null) durationSec = sec;
          } catch {}
        }

        // Thumbnail (für Video generieren)
        let thumbUri = a.uri;
        if (isVideo) {
          try {
            const { uri } = await VideoThumbnails.getThumbnailAsync(stripHash(a.uri), { time: 1000 });
            thumbUri = uri;
          } catch {}
        }

        return {
          id: a.id,
          uri: a.uri,
          mediaType: isVideo ? "video" : "photo",
          duration: durationSec,
          durationLabel: isVideo && durationSec != null ? formatDuration(durationSec) : undefined,
          thumbUri,
        };
      })
    );

    _cachedAssets = withMeta;
    setAssets(withMeta);
  })().finally(() => {
    _loadingPromise = null;
  });

  // kein Cleanup nötig
}, []);



  const buildAssetFast = useCallback((a: MediaLibrary.Asset): GridAsset => {
    const isVideoAsset = a.mediaType === MediaLibrary.MediaType.video;
    const durationSec = toSeconds((a as any).duration ?? null);

    return {
      id: a.id,
      uri: a.uri,
      mediaType: isVideoAsset ? "video" : "photo",
      duration: durationSec,
      durationLabel: isVideoAsset && durationSec != null ? formatDuration(durationSec) : undefined,
      thumbUri: isVideoAsset ? undefined : a.uri
    };
  }, []);

  const hydrateVideoThumbs = useCallback(async (items: GridAsset[], max = 24) => {
  const vids = items.filter(x => x.mediaType === "video").slice(0, max);

  await mapLimit(vids, 4, async (v) => {
    try {
      // ✅ zuerst: direkt mit asset.uri (war bei dir früher am schnellsten)
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(v.uri, { time: 0 });
        setAssets(prev => prev.map(a => (a.id === v.id ? { ...a, thumbUri: uri } : a)));
        return;
      } catch {
        // ignore -> fallback unten
      }

      // ✅ fallback: localUri holen (teurer, nur wenn nötig)
      const info = await MediaLibrary.getAssetInfoAsync(v.id);
      const src = info?.localUri ?? info?.uri ?? v.uri;

      const { uri } = await VideoThumbnails.getThumbnailAsync(src, { time: 0 });
      setAssets(prev => prev.map(a => (a.id === v.id ? { ...a, thumbUri: uri } : a)));
    } catch {
      // ignore
    }
  });
}, []);





  // --- initial perms + albums
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      setPerm(null); // ✅ loading -> verhindert Flash

      // 1) erst Status lesen
      const st = await MediaLibrary.getPermissionsAsync();
      let granted = st.granted;

      // 2) wenn nicht granted -> request (nur dann)
      if (!granted) {
        const req = await MediaLibrary.requestPermissionsAsync();
        granted = req.granted;
      }

      if (!alive) return;

      setPerm(granted);

      if (!granted) return;

      try {
        const res = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
        setAlbums(
          res.map((a) => ({
            id: a.id,
            title: a.title,
            assetCount: (a as any).assetCount,
          }))
        );
      } catch {
        setAlbums([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);


  const buildAsset = useCallback(async (a: MediaLibrary.Asset): Promise<GridAsset> => {
    const isVideoAsset = a.mediaType === MediaLibrary.MediaType.video;

    // duration robust
    let durationSec = toSeconds((a as any).duration ?? null);
    if (isVideoAsset && (durationSec == null || durationSec === 0)) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(a.id);
        const sec = toSeconds((info as any)?.duration ?? null);
        if (sec != null) durationSec = sec;
      } catch {}
    }

    // thumb
    let thumbUri = a.uri;
    if (isVideoAsset) {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(stripHash(a.uri), { time: 1000 });
        thumbUri = uri;
      } catch {}
    }

    return {
      id: a.id,
      uri: a.uri,
      mediaType: isVideoAsset ? "video" : "photo",
      duration: durationSec,
      durationLabel: isVideoAsset && durationSec != null ? formatDuration(durationSec) : undefined,
      thumbUri,
    };
  }, []);

 const mergeById = <T extends { id: string }>(prev: T[], next: T[]) => {
  const map = new Map<string, T>();
  for (const a of prev) map.set(a.id, a);
  for (const a of next) map.set(a.id, a);
  return Array.from(map.values());
};


const findFavoritesAlbum = async (): Promise<MediaLibrary.Album | undefined> => {
  try {
    const list = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });

    // iOS/Android Locale: Favorites / Favoriten / Lieblinge etc.
    return (
      list.find((x) => /^favorites$/i.test(x.title)) ||
      list.find((x) => /favorit/i.test(x.title)) ||
      list.find((x) => /liebling/i.test(x.title)) ||
      undefined
    );
  } catch {
    return undefined;
  }
};
const loadAssets = useCallback(async () => {
  let albumObj: MediaLibrary.Album | undefined;

  if (permissionGranted !== true) return;

  // -----------------------
  // ✅ FAVORITES: komplett laden (Paging)
  // -----------------------
  if (mode === "favorites") {
    // 1) versuche Smart-Album "Favorites/Favoriten/Lieblinge" zu finden
    try {
      const list = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      albumObj =
        list.find((x) => /^favorites$/i.test(x.title)) ||
        list.find((x) => /favorit/i.test(x.title)) ||
        list.find((x) => /liebling/i.test(x.title)) ||
        undefined;
    } catch {}

    // Parameter (Performance-Schutz)
    const FAVORITES_PAGE = 200;
    const MAX_FAVORITES = 5000;

    // A) Best Case: Favorites-Album existiert -> schnell & vollständig paginierbar
    if (albumObj) {
      let after: string | undefined = undefined;
      let hasNextPage = true;
      let collected: MediaLibrary.Asset[] = [];

      while (hasNextPage && collected.length < MAX_FAVORITES) {
        const res = await MediaLibrary.getAssetsAsync({
          first: FAVORITES_PAGE,
          after,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          album: albumObj,
        });

        collected = collected.concat(res.assets);

        // progressiv in UI (optional aber angenehm)
        const fast = collected.map(buildAssetFast);
        setAssets(fast);

        after = res.endCursor ?? undefined;
        hasNextPage = !!res.hasNextPage;
      }

      setEndCursor(null);
      setHasNext(false);
      return;
    }

    // B) Fallback: Kein Favorites-Album -> Library scannen & isFavorite prüfen (langsamer aber korrekt)
    const SCAN_PAGE = 200;
    const MAX_SCAN_ASSETS = 20000;

    let after: string | undefined = undefined;
    let hasNextPage = true;
    let scanned = 0;

    let favCollected: MediaLibrary.Asset[] = [];

    while (hasNextPage && scanned < MAX_SCAN_ASSETS && favCollected.length < MAX_FAVORITES) {
      const res = await MediaLibrary.getAssetsAsync({
        first: SCAN_PAGE,
        after,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      });

      scanned += res.assets.length;

      const favs = await mapLimit(res.assets, 8, async (a) => {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a.id);
          return (info as any)?.isFavorite ? a : null;
        } catch {
          return null;
        }
      });

      favCollected = favCollected.concat(favs.filter(Boolean) as MediaLibrary.Asset[]);

      // progressiv in UI
      const fast = favCollected.map(buildAssetFast);
      setAssets(fast);

      after = res.endCursor ?? undefined;
      hasNextPage = !!res.hasNextPage;
    }

    setEndCursor(null);
    setHasNext(false);
    return;
  }

  // -----------------------
  // ✅ ALBUMS: selected album laden
  // -----------------------
  if (mode === "albums" && selectedAlbum?.id) {
    try {
      const list = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      albumObj = list.find((x) => x.id === selectedAlbum.id);
    } catch {}
  }

  // -----------------------
  // ✅ RECENT / VIDEOS normal
  // -----------------------
  const base = await MediaLibrary.getAssetsAsync({
    first: PAGE_SIZE,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    mediaType:
      mode === "videos"
        ? [MediaLibrary.MediaType.video]
        : [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    album: albumObj,
  });

  const fast = base.assets.map(buildAssetFast);
  setAssets(fast);

  setEndCursor(base.endCursor ?? null);
  setHasNext(!!base.hasNextPage);

  // ✅ thumbs nachträglich (blockiert nicht initial)
  hydrateVideoThumbs(fast, 18);
}, [permissionGranted, mode, selectedAlbum?.id, buildAssetFast, hydrateVideoThumbs]);

  const loadMore = useCallback(async () => {
    if (mode === "favorites") return;
    if (permissionGranted !== true) return;
    if (!hasNext || loadingMore) return;

    setLoadingMore(true);
    try {
      let albumObj: MediaLibrary.Album | undefined;
      if (mode === "albums" && selectedAlbum?.id) {
        const list = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
        albumObj = list.find((x) => x.id === selectedAlbum.id);
      }

      const res = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after: endCursor ?? undefined,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        mediaType:
          mode === "videos"
            ? [MediaLibrary.MediaType.video]
            : [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        album: albumObj,
      });

      const fastMore = res.assets.map(buildAssetFast);

      setAssets(prev => {
        // ✅ dedupe nach id (expo-media-library kann beim paging duplizieren)
        const seen = new Set(prev.map(a => a.id));
        const merged = [...prev];
        for (const a of fastMore) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            merged.push(a);
          }
        }
        return merged;
      });

      setEndCursor(res.endCursor ?? null);
      setHasNext(!!res.hasNextPage);

      hydrateVideoThumbs(fastMore, 12); // thumbs nur für “neue” erste Videos
    } finally {
      setLoadingMore(false);
    }
  }, [permissionGranted, hasNext, loadingMore, endCursor, mode, selectedAlbum?.id, buildAssetFast, hydrateVideoThumbs]);


  useEffect(() => {
    if (permissionGranted !== true) return;
    loadAssets();
  }, [permissionGranted, mode, selectedAlbum?.id, loadAssets]);

  /**
   * resolvePlayable (wie deine funktionierende Version)
   */
  const resolvePlayable = useCallback(
    async (asset: { id: string; uri: string; mediaType?: "video" | "photo" }) => {
      let uri = asset.uri;

      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id);
        if (info?.localUri) uri = info.localUri;
        else if (info?.uri) uri = info.uri;
      } catch {}

      if (Platform.OS === "ios") {
        if (asset.mediaType === "photo") {
          const key = asset.id || fileNameFrom(uri, "photo");

          try {
            return await copyToCacheStable(uri, "jpg");
          } catch {
            try {
              return await exportPhotoToJpegUnique(uri, key);
            } catch {
              return stripHash(uri);
            }
          }
        }

        if (isPh(uri)) {
          try {
            return await copyToCacheStable(uri, "mov");
          } catch {
            return stripHash(uri);
          }
        }

        if (uri.startsWith("file://")) {
          try {
            return await copyToCacheStable(uri, asset.mediaType === "video" ? "mov" : "jpg");
          } catch {
            return stripHash(uri);
          }
        }

        return stripHash(uri);
      }

      if (Platform.OS === "android") {
        if (asset.mediaType === "video" && uri.startsWith("file://")) {
          try {
            const contentUri = await FileSystem.getContentUriAsync(uri);
            if (contentUri) return contentUri;
          } catch {}
        }
        return stripHash(uri);
      }

      return stripHash(uri);
    },
    []
  );

  /**
   * ✅ Picker: normalize + UNIQUE (Fix gegen "falsches Foto")
   */
  const normalizePickedUri = useCallback(
    async (uriIn: string, mediaType: "photo" | "video", key: string) => {
      const uri = stripHash(uriIn);

      if (Platform.OS === "ios") {
        if (isPh(uri)) {
          if (mediaType === "photo") {
            try {
              const stable = await copyToCacheStable(uri, "jpg");
              return await copyToCacheUnique(stable, key, "jpg");
            } catch {
              try {
                return await exportPhotoToJpegUnique(uri, key);
              } catch {
                return uri;
              }
            }
          } else {
            try {
              const stable = await copyToCacheStable(uri, "mov");
              return await copyToCacheUnique(stable, key, "mov");
            } catch {
              return uri;
            }
          }
        }

        if (isFile(uri)) {
          if (mediaType === "photo") {
            try {
              return await exportPhotoToJpegUnique(uri, key);
            } catch {
              return await copyToCacheUnique(uri, key, "jpg");
            }
          }
          return await copyToCacheUnique(uri, key, mediaType === "video" ? "mov" : "jpg");
        }

        return uri;
      }

      // Android
      if (Platform.OS === "android") {
        if (isFile(uri)) {
          return await copyToCacheUnique(uri, key, mediaType === "video" ? "mp4" : "jpg");
        }
        return uri;
      }

      return uri;
    },
    []
  );

  /**
   * System Picker (expo-image-picker) -> liefert Auswahl zurück (mit Fix)
   */
  const pickFromLibrary = useCallback(
    async (opts?: {
      multiple?: boolean;
      selectionLimit?: number;
      allowEditingSingle?: boolean;
    }): Promise<PickedMedia[] | null> => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") return null;

      const multiple = !!opts?.multiple;
      const selectionLimit = opts?.selectionLimit ?? 10;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 1,
        allowsMultipleSelection: multiple,
        selectionLimit: multiple ? selectionLimit : 1,
        allowsEditing: !multiple && (opts?.allowEditingSingle ?? false),
      });

      if (result.canceled) return null;

      const base = Date.now();

      const picked: PickedMedia[] = await Promise.all(
        (result.assets ?? []).map(async (a, i) => {
          const mediaType: "photo" | "video" = a.type === "video" ? "video" : "photo";
          const fixedUri = await normalizePickedUri(a.uri, mediaType, `picker_${base}_${i}`);

          return {
            uri: fixedUri,
            mediaType,
            width: a.width,
            height: a.height,
            fileName: (a as any).fileName ?? null,
            mimeType: (a as any).mimeType ?? null,
            duration: (a as any).duration ?? null,
          };
        })
      );

      return picked.length ? picked : null;
    },
    [normalizePickedUri]
  );

  return {
    permissionGranted,
    assets,
    albums,

    // ✅ wichtig für deine Buttons / MediaFilterMenu
    mode,
    setMode,
    selectedAlbum,
    setSelectedAlbum,

    loadAssets,
    loadMore, 
    hasNext,          
    loadingMore,

    pickFromLibrary,
    resolvePlayable,
  };
}
