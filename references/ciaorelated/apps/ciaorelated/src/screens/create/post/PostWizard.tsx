// =============================================
// File: apps/ciaorelated/src/screens/create/post/PostWizard.tsx
// NOTE: Vollständige Komponente mit useTheme() + styles(C,isDark) Pattern wie ProfileUnifiedScreen
//       + Step-1: Swipe-Preview bei Mehrfach, Multi-Button (Icon + Text), PostPagerDots im Bild
//       + MediaGrid: selectedIds als `${id}:${mediaType}` + onOpenCamera
// =============================================
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Text as RNText,
  StyleSheet,
  FlatList,
  Dimensions,
  Animated, 
  ActivityIndicator,
  InteractionManager
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import ViewShot from "react-native-view-shot";
import * as ImageManipulator from "expo-image-manipulator";
import { useNavigation } from "@react-navigation/native";
import { Video, ResizeMode } from "expo-av";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { cleanupMediaCache } from "./utils/cleanupCache";

import { MediaFilterMenu } from "./components/MediaFilterMenu";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlignableSquare, type AlignState } from "./components/AlignableSquare";


import { useTheme } from "../../../theme/ThemeProvider"; // ⚠️ ggf. Pfad anpassen
import { LargePreview } from "./components/LargePreview";
import { MediaGrid, type GridAsset } from "./components/MediaGrid";
import { PublishForm } from "./components/PublishForm";
import { StepHeader } from "./components/StepHeader";
import { FiltersBarSheet } from "./components/FiltersBar";
import { AdjustBar } from "./components/AdjustBar";
import { PostPagerDots } from "../../components/post/PostPagerDots"; // ⚠️ ggf. Pfad anpassen

import { useMediaLibrary } from "./hooks/useMediaLibrary";
import { useUploadPost, type CarouselItem  } from "./hooks/useUploadPost";

import * as LegacyFS from "expo-file-system/legacy";

import { AuthVault } from "../../../lib/auth-vault"; // Pfad ggf. anpassen



import * as VideoThumbnails from "expo-video-thumbnails";
import {
  DEFAULT_ADJUST,
  buildAdjustMatrix,
  filterToMatrix,
  type Matrix20,
  type FilterKey,
} from "./utils/matrix";
import { ensureUploadableImage } from "./utils/media";


import { apollo } from "../../../apollo";

/* ---------- Utils ---------- */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
const safeId = (id: string) => id.replace(/[^\w-]+/g, "_");
const alignKey = (a: GridAsset) => `${safeId(a.id)}:${a.mediaType}`; // 1:1 wie selectedIds

const videoSandboxKey = (a: GridAsset) => `${a.id}:video`; // bewusst immer gleich

const pendingId = `pending:${Date.now()}-${Math.random().toString(36).slice(2)}`;

const INTEREST_KEYS = [
  "photography",
  "music",
  "film",
  "design",
  "architecture",
  "fashion",
  "art",
  "sports",
  "fitness",
  "cooking",
  "travel",
  "gaming",
  "tech",
  "startups",
  "nature",
  "books",
];


const isFileUri = (u?: string | null) => !!u && u.startsWith("file://");
const safeKey = (k: string) => k.replace(/[^\w-]+/g, "_");
function extFromUri(u: string) {
  const clean = u.split("?")[0].toLowerCase();
  if (clean.endsWith(".mp4")) return "mp4";
  if (clean.endsWith(".mov")) return "mov";
  if (clean.endsWith(".webm")) return "webm";
  return "mp4";
}

async function sandboxVideoUri(uri: string, key: string) {
  if (!uri.startsWith("file://")) return uri;

  const baseDir = LegacyFS.cacheDirectory ?? LegacyFS.documentDirectory;
  if (!baseDir) return uri;

  const ext = extFromUri(uri);
  const dest = `${baseDir}pw_vid_${safeKey(key)}.${ext}`;

  const existing = await LegacyFS.getInfoAsync(dest);
  if (existing.exists) return dest;

  try {
    await LegacyFS.copyAsync({ from: uri, to: dest });
    const info = await LegacyFS.getInfoAsync(dest);
    return info.exists ? dest : uri;
  } catch (e) {
    console.log("SANDBOX_VIDEO_COPY_FAIL", { uri, dest, e: String((e as any)?.message ?? e) });
    return uri;
  }
}


const DEFAULT_ALIGN: AlignState = { scale: 1, tx: 0, ty: 0 };
const isDefaultAlign = (a?: AlignState) =>
  !a || (a.scale === 1 && a.tx === 0 && a.ty === 0);

  type AdjustState = typeof DEFAULT_ADJUST;

const isDefaultAdjust = (v?: AdjustState) => {
  const a = v ?? DEFAULT_ADJUST;

  // alle Keys vergleichen, ohne "contrast/brightness" hardcoden
  return (Object.keys(DEFAULT_ADJUST) as Array<keyof AdjustState>).every((k) => {
    return a[k] === DEFAULT_ADJUST[k];
  });
};

// iOS ph://
const isPhUri = (u?: string | null) => !!u && u.startsWith("ph://");
const sanitizeUri = (u?: string | null) => (u && !isPhUri(u) ? u : undefined);
const pickSafeImageUri = (thumb?: string | null, fallback?: string | null) =>
  sanitizeUri(thumb) ?? sanitizeUri(fallback);

async function ensurePlayableOne(a: GridAsset, resolvePlayable: (args: any) => Promise<string>): Promise<GridAsset> {
  let playable =
    sanitizeUri(a.playableUri) ??
    (await resolvePlayable({
      id: a.id,
      uri: a.uri,
      mediaType: a.mediaType === "video" ? "video" : "photo",
    }));

  // ✅ WICHTIG: Videos immer sandboxen
  if (a.mediaType === "video") {
    playable = await sandboxVideoUri(playable, videoSandboxKey(a));
  }

  let thumbUri = a.thumbUri;
  let width = a.width;
  let height = a.height;

  if (a.mediaType === "video" && (!thumbUri || isPhUri(thumbUri))) {
    try {
      const t = await VideoThumbnails.getThumbnailAsync(playable, { time: 1000 });
      thumbUri = t.uri;
      width = width ?? (t as any).width;
      height = height ?? (t as any).height;
    } catch {
      thumbUri = undefined;
    }
  }

  return { ...a, playableUri: playable, thumbUri, width, height };
}



// Center-crop zu 1:1 und auf 1080px skalieren
async function makeSquareThumbFromVideo(playableUri: string, timeMs = 1000) {
  const snap = await VideoThumbnails.getThumbnailAsync(playableUri, { time: Math.max(0, Math.floor(timeMs)) });
  const w = (snap as any).width ?? 0;
  const h = (snap as any).height ?? 0;

  if (!w || !h) return snap.uri;

  const side = Math.min(w, h);
  const originX = Math.floor((w - side) / 2);
  const originY = Math.floor((h - side) / 2);

  const out = await ImageManipulator.manipulateAsync(
    snap.uri,
    [
      { crop: { originX, originY, width: side, height: side } },
      { resize: { width: 1080, height: 1080 } },
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );

  return out.uri;
}


const guessVideoMime = (uri: string) => {
  const u = uri.toLowerCase().split("?")[0];
  if (u.endsWith(".mov")) return "video/quicktime";
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".webm")) return "video/webm";
  return "video/mp4";
};
const mimeFromUri = (uri: string) => {
  const u = uri.split("?")[0].toLowerCase();
  if (u.endsWith(".mov")) return "video/quicktime";
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".webm")) return "video/webm";
  return "video/mp4";
};


function guessExt(uri: string) {
  const clean = uri.split("?")[0];
  const m = clean.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (m?.[1] ?? "jpg").toLowerCase();
  if (ext === "jpeg") return "jpg";
  return ext;
}

async function duplicateToCache(uri: string, key: string) {
  if (!isFileUri(uri)) return uri;

  const baseDir = LegacyFS.cacheDirectory ?? LegacyFS.documentDirectory;
  if (!baseDir) return uri;

  const ext = guessExt(uri);
  const dest =
    `${baseDir}pw_${safeKey(key)}_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

  try {
    await LegacyFS.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e1) {
    // iOS: manchmal ist die Datei kurz "busy" -> einmal kurz warten + retry
    try {
      await new Promise((r) => setTimeout(r, 120));
      await LegacyFS.copyAsync({ from: uri, to: dest });
      return dest;
    } catch (e2) {
      console.log("DUP_COPY_FAIL", { from: uri, to: dest, e: String((e2 as any)?.message ?? e2) });
      return uri;
    }
  }
}


import { pushUploadQueue, removeUploadQueue } from "../../../lib/uploadQueue"; // Pfad anpassen
import MinimalVideoEditor from "./components/MinimalVideoEditor";
import { useTranslation } from "react-i18next";

function refreshFeedAfterUpload() {
  apollo.cache.evict({ fieldName: "homeFeed" });
  apollo.cache.evict({ fieldName: "feed" });
  apollo.cache.gc();

  return apollo.refetchQueries({
    include: "active",
    onQueryUpdated(query) {
      const name = (query as any).queryName;
      if (name === "HomeFeed" || name === "Feed" || name === "ExploreFeed" || name === "ReelsFeed") {
        return true;
      }
      return false;
    },
  });
}




/* ---------- Types ---------- */
export type Step = 1 | 2 | 3;

// A render task describes one photo to bake with filter/adjust
type RenderTask = {
  id: string;
  uri: string;
  fm?: Matrix20;
  am?: Matrix20;
  width: number;
  height: number;
  align?: AlignState; // ✅ NEU
  resolve: (outUri: string) => void;
  reject: (e: any) => void;
};


type VideoState = {
  coverMs: number;
  confirmedCoverMs?: number;
  muted: boolean;
  loop: boolean;
  rate: number;
  playing: boolean;
  thumbUri?: string;
};
const DEFAULT_VS: VideoState = {
  coverMs: 1000,
  confirmedCoverMs: undefined,
  muted: true,
  loop: true,
  rate: 1,
  playing: false,
};

/* ---------- PostWizard ---------- */
export function PostWizard({
  onDone,
  onToggleBottomBar,
  onCloseAll,
}: {
  onDone: () => void;
  onToggleBottomBar: (v: boolean) => void;
  onCloseAll: () => void;
}) {
  const { t } = useTranslation();

  const nav = useNavigation();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const C = theme.colors as any;

  const [headerH, setHeaderH] = useState(0);
  

  const INTEREST_SUGGESTIONS = INTEREST_KEYS;
  
  

  const s = useMemo(() => styles(C, isDark), [C, isDark]);

  const viewShotRef = useRef<ViewShot | null>(null);
  const hiddenShotRef = useRef<ViewShot | null>(null);
  const videoRefs = useRef<Record<string, Video | null>>({});
  const setVideoRef = (key: string) => (ref: Video | null) => {
    videoRefs.current[key] = ref;
  };
  const getVideoRef = (key: string) => videoRefs.current[key] ?? null;
  

  const step1PreviewRef = useRef<FlatList<GridAsset>>(null);
  const gridRef = useRef<any>(null);
    // Multi
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<GridAsset[]>([]);
  
  const selectedRef = useRef<GridAsset[]>([]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const tapReqByKeyRef = useRef<Record<string, number>>({});
  const pickReqRef = useRef(0);
  const camReqRef = useRef(0);
  const selectedIds = useMemo(() => selected.map(a => `${a.id}:${a.mediaType}`), [selected]);


  


  const [step, setStep] = useState<Step>(1);

  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null);

  

  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);

  const [interestLabels, setInterestLabels] = useState<string[]>([]);
  const MAX_INTERESTS = 12;

  const toggleInterest = useCallback((label: string) => {
    setInterestLabels((prev) => {
      const has = prev.includes(label);
      if (has) return prev.filter((x) => x !== label);
      if (prev.length >= MAX_INTERESTS) return prev; // ✅ blockiert bei 12
      return [...prev, label];
    });
  }, []);


  // Video options
  const [muted, setMuted] = useState(true);
  const [coverMs, setCoverMs] = useState<number>(1000);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  // Foto adjust
    // Foto adjust
  const [showAdjust, setShowAdjust] = useState(false);

  // ✅ IG-like tool toggles (Step 2)
  const [showFilters, setShowFilters] = useState(false);

  const openFilters = useCallback(() => {
    setShowAdjust(false);
    setShowFilters(true);
  }, []);

  const openAdjust = useCallback(() => {
    setShowFilters(false);
    setShowAdjust(true);
  }, []);

  const closePanels = useCallback(() => {
    setShowFilters(false);
    setShowAdjust(false);
  }, []);


  const {
    assets,
    loadMore,
    albums,
    permissionGranted,
    pickFromLibrary,
    resolvePlayable,
    mode,
    setMode,
    selectedAlbum,
    setSelectedAlbum,
  } = useMediaLibrary();

  

    const { uploadPost, creating, uploadCarousel } = useUploadPost();

    const [processedUri, setProcessedUri] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const uploadingRef = useRef(false);

    useEffect(() => {
    let cancelled = false;

    (async () => {
      const vids = selectedRef.current.filter(a => a.mediaType === "video");
      for (const a of vids) {
        const raw = a.playableUri ?? a.uri;
        if (!raw || !isPhUri(raw)) continue; // schon ok

        try {
          const patched = await ensurePlayableOne(a, resolvePlayable);
          if (cancelled) return;

          setSelected(prev =>
            prev.map(x => (alignKey(x) === alignKey(a) ? patched : x))
          );
        } catch {}
      }
    })();

    return () => { cancelled = true; };
  }, [selected.length, resolvePlayable]);

  



  // Step 2 pager index (auch Step 1 Preview-Index)
  const [idx, setIdx] = useState(0);

  const curItem = selected[idx] ?? null;
  const curKey = curItem ? alignKey(curItem) : null;


  // Per-item edits
  const [perFilter, setPerFilter] = useState<Record<string, FilterKey>>({});
  const [perAdj, setPerAdj] = useState<Record<string, typeof DEFAULT_ADJUST>>({});

  const setFilterFor = (id: string, f: FilterKey) => setPerFilter((p) => ({ ...p, [id]: f }));
  const setAdjFor = (id: string, a: typeof DEFAULT_ADJUST) => setPerAdj((p) => ({ ...p, [id]: a }));

  // ✅ IMPORTANT: keys MUST match MediaGrid selection check
  const selectedKeys = useMemo(() => selected.map((a) => `${a.id}:${a.mediaType}`), [selected]);

  // Per-video state
  const [videoState, setVideoState] = useState<Record<string, VideoState>>({});
  function getVS(id: string): VideoState {
    return videoState[id] ?? DEFAULT_VS;
  }

  function patchVS(id: string, patch: Partial<VideoState>) {
    setVideoState((p) => {
      const prev = p[id] ?? DEFAULT_VS;           // ✅ aus p lesen, nicht aus closure
      return { ...p, [id]: { ...prev, ...patch } };
    });
  }




// ✅ Smooth native scroll + JS value für height-crop (ohne translateY!)

const scrollYJS = useRef(new Animated.Value(0)).current;    // JS (height)

// Per-item alignment (square crop positioning + zoom)
const [perAlign, setPerAlign] = useState<Record<string, AlignState>>({});




const getAlign = useCallback(
  (key: string): AlignState => perAlign[key] ?? { scale: 1, tx: 0, ty: 0 },
  [perAlign]
);

const setAlignFor = useCallback((key: string, next: AlignState) => {
  setPerAlign((p) => ({ ...p, [key]: next }));
}, []);


const W = Dimensions.get("window").width;
const PREVIEW_H = W;
const TOOLBAR_H = 56;

const scrollY = useRef(new Animated.Value(0)).current;
const clampedY = useMemo(
  () => Animated.diffClamp(scrollY, 0, PREVIEW_H),
  [scrollY, PREVIEW_H]
);

// Preview “sichtbare Höhe” als Zahl (aber wir animieren NICHT height!)
const previewHeight = useMemo(
  () => Animated.subtract(PREVIEW_H, clampedY),
  [PREVIEW_H, clampedY]
);

// ✅ Native mask: schiebt eine BG-View von unten nach oben über die Preview
const previewMaskStyle = useMemo(
  () =>
    ({
      transform: [{ translateY: previewHeight }], // 0..PREVIEW_H
    } as const),
  [previewHeight]
);

// ✅ Toolbar wandert nach oben wenn Preview kollabiert
const toolbarTranslateStyle = useMemo(
  () =>
    ({
      transform: [{ translateY: Animated.multiply(clampedY, -1) }],
    } as const),
  [clampedY]
);


const expandPreview = useCallback(() => {
  // ✅ NICHT scrollen – sonst springt die Auswahl nach oben
  // gridRef.current?.scrollToOffset?.({ offset: 0, animated: false });

  // Optional: nur den Animated-Wert resetten (ändert NICHT die echte Scroll-Position)
  scrollY.setValue(0);
}, [scrollY]);




// 0 = normal (collapse folgt scroll), 1 = preview/grid bleiben expanded (ohne scroll jump)
const overrideExpand = useRef(new Animated.Value(0)).current;

// effective collapse value: when override=1 => collapse=0
const collapseY = useMemo(() => {
  return Animated.multiply(clampedY, Animated.subtract(1, overrideExpand));
}, [clampedY, overrideExpand]);

const previewTranslateStyle = useMemo(() => {
  const t = Animated.multiply(collapseY, -1);
  return { transform: [{ translateY: t }] } as const;
}, [collapseY]);



const forceExpandPreview = useCallback(() => {
  gridRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  scrollY.setValue(0);
}, []);


const releaseExpandPreview = useCallback(() => {
  // ✅ nichts “klemmen”, einfach normal weiter croppen lassen
  overrideExpand.setValue(0);
}, [overrideExpand]);




  


  const resolvingSetRef = useRef<Set<string>>(new Set());
  const GUTTER: number = 0;
  const CARD: number = W;

  const applyPreviewForIndex = useCallback(
    (nextSel: GridAsset[], nextIdx: number, scrollAnimated: boolean) => {
      const safeIdx = Math.max(0, Math.min(nextIdx, nextSel.length - 1));
      const cur = nextSel[safeIdx];

      setIdx(safeIdx);

      if (step === 1 && nextSel.length > 1) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            step1PreviewRef.current?.scrollToOffset({
              offset: safeIdx * W,
              animated: scrollAnimated,
            });
          });
          
        });
      }

      if (!cur) {
        setSourceUri(null);
        setIsVideo(false);
        setDurationSec(null);
        return;
      }

      const isVid = cur.mediaType === "video";
      setIsVideo(isVid);

      // ✅ iOS: Video-Player darf kein ph:// bekommen
      const nextSource = isVid
        ? (sanitizeUri(cur.playableUri) ?? sanitizeUri(cur.uri) ?? (cur.playableUri ?? cur.uri))
        : (cur.playableUri ?? cur.uri);

      setSourceUri(nextSource);
      setDurationSec(cur.duration ?? null);
    },
    [step, W]
  );


  // Bottom bar
  useEffect(() => onToggleBottomBar(step === 1), [step, onToggleBottomBar]);

  // Step-1 Preview immer synced (Instagram-like)
  useEffect(() => {
    if (step !== 1) return;

    if (selected.length === 0) {
      setIdx(0);
      setSourceUri(null);
      setIsVideo(false);
      setDurationSec(null);
      return;
    }

    // nur clampen wenn nötig
    if (idx > selected.length - 1) {
      applyPreviewForIndex(selected, selected.length - 1, false);
    } else if (!sourceUri) {
      applyPreviewForIndex(selected, idx, false);
    }
  }, [step, W, sourceUri]);


  // Playback status
  const onPlaybackStatus = (st: any) => {
    if (!st?.isLoaded) return;
    if ((durationSec == null || durationSec === 0) && st.durationMillis != null) {
      setDurationSec(Math.max(1, Math.round(st.durationMillis / 1000)));
    }
    if (!scrubbing && playing) setCoverMs(st.positionMillis ?? 0);
  };
  
  useEffect(() => {
  if (uploading || step !== 1 || selectedRef.current.length !== 0) return;

  const task = InteractionManager.runAfterInteractions(() => {
    // bewusst async “fire and forget”
    cleanupMediaCache({ maxAgeMs: 20 * 60 * 1000 });
  });

  return () => task.cancel();
}, [step, uploading]);


  useEffect(() => {
  if (step !== 2) return;
  const cur = selected[idx];
  if (!cur || cur.mediaType !== "video") return;
  if (scrubbing) return;

  const ref = getVideoRef(alignKey(cur));
  ref?.setStatusAsync({ rate, shouldCorrectPitch: true, shouldPlay: false }).catch(() => {});
}, [rate, step, idx, selected.length, scrubbing]);



  // Clean maps when selection shrinks
  useEffect(() => {
    const ids = new Set(selected.map((a) => a.id));
    setPerFilter((p) => Object.fromEntries(Object.entries(p).filter(([id]) => ids.has(id))));
    setPerAdj((p) => Object.fromEntries(Object.entries(p).filter(([id]) => ids.has(id))));
  }, [selected.length]);

  // Ensure playable on enter step 2
  useEffect(() => {
    if (step !== 2 || selected.length === 0) return;

    let canceled = false;
    (async () => {
      const patched = await Promise.all(selected.map((a) => ensurePlayableOne(a, resolvePlayable)));
      if (!canceled) {
        setSelected(patched);

        const cur = patched[idx] ?? patched[0];
        if (cur) {
          setIsVideo(cur.mediaType === "video");
          setDurationSec(cur.duration ?? null);
          setSourceUri(cur.playableUri ?? cur.uri);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [step]);

  // Header
  const headerTitle =
  step === 1
    ? t("postwizard.header.newPost")
    : step === 2
      ? selected.length > 1
        ? t("postwizard.header.editCarousel")
        : isVideo
          ? t("postwizard.header.editVideo")
          : t("postwizard.header.editPhoto")
      : t("postwizard.header.share");


  const resetToStep1 = () => {
    setStep(1);
    setSourceUri(null);
    setIsVideo(false);
    setDurationSec(null);
    setCaption("");
    setLocation("");
    setMuted(true);
    setCoverMs(1000);
    setRate(1);
    setLoop(true);
    setPlaying(false);
    setScrubbing(false);
    setShowAdjust(false);
    setPerFilter({});
    setPerAdj({});
    setSelected([]);
    setSelectedGroupLinkId(null);
    setIdx(0);
    onToggleBottomBar(true);
  };

  const headerProps = {
    title: headerTitle,
    canContinue: step === 1 ? (multi ? selected.length >= 2 : !!sourceUri) : step === 2 ? selected.length > 0 : false,
    onContinue:
      
      step === 1
        ? () => {
            const ok = multi ? selected.length >= 2 : !!sourceUri;
            if (ok) setStep(2);
          }
        : step === 2
          ? async () => {
            const stopAllStep2Videos = async () => {
              const refs = Object.values(videoRefs.current).filter(Boolean) as Video[];
              await Promise.all(
                refs.map(async (r) => {
                  try { await r.pauseAsync(); } catch {}
                  try { await r.setStatusAsync({ shouldPlay: false }); } catch {}
                })
              );
              setPlaying(false);
              setScrubbing(false);
            };

              await stopAllStep2Videos();
              const cur = selected[idx] ?? selected[0];
              if (!cur) return;

              if (cur.mediaType === "video") {
                const playable = cur.playableUri ?? cur.uri;
                if ((!cur.thumbUri || isPhUri(cur.thumbUri)) && playable) {
                  await handleCoverCommitFor(cur.id, playable, coverMsRef.current ?? coverMs ?? 1000);
                }
                setStep(3);
                return;
              }


              let snap = cur.playableUri ?? "";
              if (viewShotRef.current) {
                try {
                  const uri = await viewShotRef.current.capture?.();
                  if (uri) snap = uri;
                } catch {}
              }
              setProcessedUri(snap);
              
              setStep(3);
            }
          : undefined,
    onLeft: step === 1 ? onCloseAll : step === 2 ? resetToStep1 : () => setStep(2),
    leftKind: (step === 3 ? "chevron" : "x") as "x" | "chevron",
    showContinue: step !== 3,
  };

  // Tap asset (SNAPPY)
const tapAsset = useCallback(
  (asset: GridAsset) => {
    forceExpandPreview();

    console.log("TAP_ASSET", { id: asset.id, mediaType: asset.mediaType, uri: asset.uri });

    // 🔒 request token für diesen Tap
    const k = alignKey(asset);
    const req = (tapReqByKeyRef.current[k] ?? 0) + 1;
    tapReqByKeyRef.current[k] = req;


    // 1) ✅ SOFORT Auswahl updaten (optimistisch, ohne await)
    const prev = selectedRef.current;

    let nextSelFast: GridAsset[];
    if (multi) {
      const exists = prev.some((x) => x.id === asset.id && x.mediaType === asset.mediaType);
      nextSelFast = exists
        ? prev.filter((x) => !(x.id === asset.id && x.mediaType === asset.mediaType))
        : [...prev, asset];
    } else {
      nextSelFast = [asset];
    }

    setSelected(nextSelFast);

    //const nextIdxFast = multi ? 0 : 0;
    //applyPreviewForIndex(nextSelFast, nextIdxFast, false);

    const nextIdxFast = multi ? Math.max(0, nextSelFast.length - 1) : 0;
    applyPreviewForIndex(nextSelFast, nextIdxFast, true);

    // 2) ✅ Danach: async "hydrate" (playableUri/duplicate/thumb/dimensions)
    (async () => {
     
      let playableUriRaw: string;
      try {
        playableUriRaw = await resolvePlayable({
          id: asset.id,
          uri: asset.uri,
           mediaType: asset.mediaType === "video" ? "video" : "photo",
        });
        
      } catch (e) {
        console.log("RESOLVE_FAIL", { id: asset.id, e: String((e as any)?.message ?? e) });
        return;
      }

      if (tapReqByKeyRef.current[k] !== req) return;


   


      // ✅ Photos IMMER duplizieren (dein Fix bleibt), aber jetzt async nachgezogen
      //if (asset.mediaType !== "video") {
        const key = `${asset.id}_${asset.mediaType}`;
       let playableUri = playableUriRaw;

      if (asset.mediaType !== "video") {
        const dup = await duplicateToCache(playableUriRaw, `${asset.id}_${asset.mediaType}`);
        if (req !== tapReqByKeyRef.current[k]) return;
        playableUri = dup;
      }
      if (asset.mediaType === "video") {
        playableUri = await sandboxVideoUri(playableUriRaw, videoSandboxKey(asset));
        if (req !== tapReqByKeyRef.current[k]) return;
      }



      // thumb fallback (nur wenn video + noch kein thumb)
      let thumbUri = asset.thumbUri;
      let vW = asset.width;
      let vH = asset.height;

      if (asset.mediaType === "video" && (!thumbUri || isPhUri(thumbUri))) {
        try {
          const t = await VideoThumbnails.getThumbnailAsync(playableUri, { time: 1000 });
          thumbUri = t.uri;
          vW = (t as any).width ?? vW;
          vH = (t as any).height ?? vH;
        } catch {
          
          thumbUri = undefined;
        }
      }

      if (req !== tapReqByKeyRef.current[k]) return;

      // dimensions nur für photos (dein Fix bleibt)
      const imgInfo =
        asset.mediaType !== "video"
          ? await ImageManipulator.manipulateAsync(playableUri, [], { base64: false })
          : null;

      if (req !== tapReqByKeyRef.current[k]) return;

      // ✅ gepatchtes Item (playableUri + unique uri für photos)
      const patched: GridAsset = {
      ...asset,
      uri: playableUri, // ✅ wichtig: auch videos auf sandboxed file:// setzen
      playableUri,
      thumbUri: asset.mediaType !== "video" ? playableUri : thumbUri,
      width: asset.mediaType === "video" ? vW : (imgInfo?.width ?? asset.width),
      height: asset.mediaType === "video" ? vH : (imgInfo?.height ?? asset.height),
    };


      // 3) ✅ selected Liste patchen (nur wenn das Item noch selected ist)
      setSelected(prevSel => {
        const idx = prevSel.findIndex(x => alignKey(x) === k);
        if (idx === -1) return prevSel;
        const next = prevSel.slice();
        next[idx] = patched;
        return next;
      });


      console.log("VIDEO_PICK", {
        uri: asset.uri,
        playableUriRaw,
        thumb: thumbUri,
      });


   
      
    })();
  },
  [multi, resolvePlayable, applyPreviewForIndex]
);


  const toDurSec = (d?: number | null) => {
    if (d == null || Number.isNaN(d)) return null;
    return d > 1000 ? Math.round(d / 1000) : Math.round(d);
  };

  const onPickFromSystem = useCallback(async () => {
    forceExpandPreview()

    const req = ++pickReqRef.current;

    const picked = await pickFromLibrary({
      multiple: multi,
      selectionLimit: 10,
      allowEditingSingle: false,
    });

    if (req !== pickReqRef.current) return; // stale
    if (!picked?.length) return;

    const base = Date.now();

    const newItems: GridAsset[] = await Promise.all(
      picked.map(async (p, i) => {
        const mediaType: "photo" | "video" = p.mediaType === "video" ? "video" : "photo";

        let thumbUri: string | undefined = mediaType === "photo" ? p.uri : undefined;
        let vW: number | undefined;
        let vH: number | undefined;
        if (mediaType === "video") {
          try {
            

            const t = await VideoThumbnails.getThumbnailAsync(p.uri, { time: 1000 });
            thumbUri = t.uri;
            vW = (t as any).width;
            vH = (t as any).height;
          } catch {
            thumbUri = undefined;
          }
        }
        const info =
          mediaType === "photo"
            ? await ImageManipulator.manipulateAsync(p.uri, [], {})
            : null;

        return {
          id: `picker_${base}_${i}`,
          uri: p.uri,
          playableUri: p.uri,
          thumbUri,
          mediaType,
          duration: toDurSec(p.duration),

          // ✅ ENTSCHEIDEND
          width: mediaType === "video" ? vW : info?.width,
          height: mediaType === "video" ? vH : info?.height,
        };

      })
    );

    if (req !== pickReqRef.current) return; // stale

    const prev = selectedRef.current;

    const prevUris = new Set(prev.map((x) => x.playableUri ?? x.uri));
    const filtered = newItems.filter((x) => !prevUris.has(x.playableUri ?? x.uri));

    const nextSel = multi ? [...prev, ...filtered] : [filtered[filtered.length - 1] ?? newItems[newItems.length - 1]];

    setSelected(nextSel);

    const nextIdx = multi ? Math.max(0, nextSel.length - 1) : 0;
    applyPreviewForIndex(nextSel, nextIdx, true);
  }, [pickFromLibrary, multi, toDurSec, applyPreviewForIndex]);



  // Open camera (uses expo-image-picker)
  const openCamera = useCallback(async () => {
   forceExpandPreview()

    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(t("postwizard.camera.title"), t("postwizard.camera.permissionBody"));
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 1,
        videoMaxDuration: 90,
      });

      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;

      const mediaType: any = a.type === "video" ? "video" : "photo";

      const newItem: GridAsset = {
        id: `camera_${Date.now()}`,
        uri: a.uri,
        playableUri: a.uri,
        thumbUri: mediaType === "photo" ? a.uri : undefined,
        mediaType,
        duration: (a as any).duration ?? null,
      } as any;

     
      const prev = selectedRef.current;
      const nextSel = multi ? [...prev, newItem] : [newItem];

      setSelected(nextSel);

      const nextIdx = multi ? Math.max(0, nextSel.length - 1) : 0;
      applyPreviewForIndex(nextSel, nextIdx, true)
    } catch (e) {
      console.warn("openCamera error", e);
    }
  }, [multi, applyPreviewForIndex]);

  const getMaxMsFor = (cur: any) => {
    const dur = cur?.duration ?? durationSec ?? 0; // cur.duration ist bei euch zuverlässiger
    return Math.max(1, Math.round(dur * 1000));
  };

const seekBusyRef = useRef(false);
const seekWantedRef = useRef<number | null>(null);
const [selectedGroupLinkId, setSelectedGroupLinkId] = useState<string | null>(null);

const seekTo = useCallback(async (ref: any, ms: number) => {
  seekWantedRef.current = ms;
  if (seekBusyRef.current) return;

  seekBusyRef.current = true;
  try {
    while (seekWantedRef.current != null) {
      const next = seekWantedRef.current;
      seekWantedRef.current = null;
      await ref?.setStatusAsync({ shouldPlay: false, positionMillis: next });
    }
  } catch {
    // ignore
  } finally {
    seekBusyRef.current = false;
  }
}, []);

const coverMsRef = useRef(1000);
useEffect(() => { coverMsRef.current = coverMs; }, [coverMs]);

const handleCoverChange = useCallback(async (ms: number) => {
  const cur = selected[idx];
  if (!cur) return;

  const aKey = alignKey(cur);
  const ref = getVideoRef(aKey);

  const max = getMaxMsFor(cur);
  const clamped = clamp(Math.round(ms), 0, max);

  coverMsRef.current = clamped;

  setPlaying(false);
  patchVS(aKey, { coverMs: clamped, playing: false });
  setCoverMs(clamped);

  try { await seekTo(ref, clamped); } catch {}

  setSelected(prev =>
    prev.map(x => (alignKey(x) === aKey ? { ...x, coverMs: clamped } : x))
  );
}, [selected, idx, seekTo]);


const handleCoverCommit = useCallback(async (ms: number) => {
  const cur = selected[idx];
  if (!cur) return;

  const aKey = alignKey(cur);
  const clamped = Math.max(0, Math.min(ms, (cur.duration ?? durationSec ?? 0) * 1000));

  setPlaying(false);
  patchVS(aKey, { playing: false });

  const playable = cur.playableUri ?? cur.uri;

  patchVS(cur.id, { confirmedCoverMs: clamped, coverMs: clamped, playing: false });

  setSelected(prev =>
    prev.map(a =>
      a.id === cur.id ? ({ ...a, confirmedCoverMs: clamped, coverMs: clamped } as any) : a
    )
  );
  try {
    const square = await makeSquareThumbFromVideo(playable, clamped);
    patchVS(cur.id, { thumbUri: square });
    setSelected(prev =>
      prev.map(a => (a.id === cur.id ? ({ ...a, thumbUri: square } as any) : a))
    );
  } catch (e) {
    console.log("THUMB_FAIL", e);
  }

}, [selected, idx, durationSec]);


const handleCoverCommitFor = useCallback(async (assetId: string, playableUri: string, ms: number) => {
  const clamped = Math.max(0, Math.min(ms, ((selectedRef.current.find(x => x.id === assetId)?.duration ?? durationSec ?? 0) * 1000)));

  setPlaying(false);
  patchVS(assetId, { playing: false });

  const square = await makeSquareThumbFromVideo(playableUri, clamped);

  patchVS(assetId, { thumbUri: square, coverMs: clamped, confirmedCoverMs: clamped });

  setSelected(prev =>
    prev.map(a =>
      a.id === assetId
        ? ({ ...a, thumbUri: square, coverMs: clamped, confirmedCoverMs: clamped } as any)
        : a
    )
  );

}, [durationSec]);



const togglePlayPause = useCallback(async () => {
  const cur = selected[idx];
  if (!cur) return;
  if (scrubbing) return;

  const key = alignKey(cur);
  const ref = getVideoRef(key);
  if (!ref) return;

  await runPlayerOp(async () => {
    const vs = getVS(cur.id);
    const max = getMaxMsFor(cur);

    // aktuellen Status holen
    const st: any = await ref.getStatusAsync().catch(() => null);
    const isPlaying = !!st?.isPlaying;
    let pos =
      st?.isLoaded
        ? st.positionMillis ?? coverMsRef.current ?? 0
        : coverMsRef.current ?? 0;

    // ✅ Ende-Guard
    if (!isPlaying && pos >= max - 150) {
      pos = 0;
    }

    if (isPlaying) {
      // PAUSE
      await ref.setStatusAsync({ shouldPlay: false });
      coverMsRef.current = pos;
      setCoverMs(pos);
      patchVS(cur.id, { playing: false, coverMs: pos });
      setPlaying(false);
    } else {
      // PLAY
      await ref.setStatusAsync({
        positionMillis: pos,
        shouldPlay: true,
        rate: vs.rate ?? rate ?? 1,
        shouldCorrectPitch: true,
      });
      patchVS(cur.id, { playing: true });
      setPlaying(true);
    }
  });
}, [selected, idx, scrubbing, rate,]);


const playerBusyRef = useRef(false);
const playerWantedRef = useRef<null | (() => Promise<void>)>(null);

const runPlayerOp = useCallback(async (op: () => Promise<void>) => {
  playerWantedRef.current = op;
  if (playerBusyRef.current) return;

  playerBusyRef.current = true;
  try {
    while (playerWantedRef.current) {
      const next = playerWantedRef.current;
      playerWantedRef.current = null;
      await next();
    }
  } finally {
    playerBusyRef.current = false;
  }
}, []);




  // Render bake queue
  const [renderTask, setRenderTask] = useState<RenderTask | null>(null);

  const bakeImageSequential = (
  id: string,
  uri: string,
  fm: any,
  am: any,
  width?: number,
  height?: number,
  align?: AlignState
) =>
  new Promise<string>((resolve, reject) => {
    setRenderTask({
      id,
      uri,
      fm,
      am,
      width: width ?? W,
      height: height ?? W,
      align,
      resolve,
      reject,
    });
  });

  useEffect(() => {
    let cancelled = false;

    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      if (!renderTask || !hiddenShotRef.current) return;
      try {
        await nextFrame();
        await nextFrame();
        await delay(120);

        const snap = await hiddenShotRef.current.capture?.();
        if (!snap) throw new Error("capture failed");

        const out = await ImageManipulator.manipulateAsync(
          snap,
          [{ resize: { width: 1080 } }],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );

        if (!cancelled) {
          renderTask.resolve(out.uri);
          setRenderTask(null);
        }
      } catch (e) {
        if (!cancelled) {
          renderTask.reject(e);
          setRenderTask(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [renderTask]);

  useEffect(() => {
    const uris = selected
      .map((a) => a.thumbUri ?? a.playableUri ?? a.uri)
      .filter((u): u is string => !!u && !isPhUri(u));
    if (uris.length) ExpoImage.prefetch(uris).catch(() => {});
  }, [selected]);

  useEffect(() => {
    if (step !== 2) return;
    const cur = selected[idx];
    if (!cur) return;
    const k = alignKey(cur);

    setPerAlign((p) => {
      if (p[k]) return p;
      return { ...p, [k]: { scale: 1, tx: 0, ty: 0 } }; // ✅ start: contain-like
    });
  }, [step, idx, selected.length]);

  const [myProfileId, setMyProfileId] = useState<string>("me");
  const step2PagerRef = useRef<FlatList<GridAsset>>(null);

  useEffect(() => {
    (async () => {
      const pid = await AuthVault.getProfileId();
      if (pid) setMyProfileId(pid);
    })();
  }, []);

  useEffect(() => {
  if (step !== 2) return;
  if (!selected.length) return;

  const safeIdx = Math.max(0, Math.min(idx, selected.length - 1));

  // 1) idx clampen
  if (safeIdx !== idx) setIdx(safeIdx);

  // 2) UI wirklich dorthin scrollen
  requestAnimationFrame(() => {
    step2PagerRef.current?.scrollToOffset({
      offset: safeIdx * (CARD + GUTTER),
      animated: false,
    });
  });

  // 3) State für Timeline/Cover/Source initial aus genau diesem Item setzen
  const cur = selected[safeIdx];
  if (!cur) return;

  const vs = getVS(cur.id);
  const nextCover = vs.coverMs ?? 1000;

  coverMsRef.current = nextCover;
  setCoverMs(nextCover);
  setPlaying(vs.playing ?? false);

  setIsVideo(cur.mediaType === "video");
  setDurationSec(cur.duration ?? null);
  setSourceUri(cur.playableUri ?? cur.uri);
}, [step, selected.length]);





  // Share
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);


  const onToggleUser = useCallback((id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);


  useEffect(() => {
    const keep = new Set(selected.map(alignKey));
    Object.keys(videoRefs.current).forEach(k => {
      if (!keep.has(k)) delete videoRefs.current[k];
    });
  }, [selected.length]);

const onShare = useCallback(async () => {
  if (uploadingRef.current || uploading) return;
  uploadingRef.current = true;
  setUploading(true);

  const pendingId = `pending:${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let pendingInserted = false;

  const insertPending = () => {
    if (pendingInserted) return;

    const first = selected[0];

    pushUploadQueue({
      id: pendingId,
      text: t("postwizard.upload.pending"),
      previewUri:
        first?.mediaType !== "video"
          ? (processedUri ?? (first?.playableUri && !isPhUri(first.playableUri) ? first.playableUri : null) ?? sourceUri ?? null)
          : ((first?.thumbUri && !isPhUri(first.thumbUri)) ? first.thumbUri : (sourceUri ?? null)),

      createdAt: new Date().toISOString(),
    });

    pendingInserted = true;

    resetToStep1();
    onDone();
  };

  try {
    if (!selected?.length) {
      Alert.alert(t("common.error"), t("postwizard.error.noSelection"));
      return;
    }

    // =========================
    // CAROUSEL
    // =========================
    const items: CarouselItem[] = [];

    for (const a of selected) {
  let playable = a.playableUri ?? a.uri;

  if (!playable || isPhUri(playable)) {
    playable = await resolvePlayable({
      id: a.id,
      uri: a.uri,
      mediaType: a.mediaType === "video" ? "video" : "photo",
    });
  }

  if (!playable) {
    Alert.alert(t("common.error"), t("postwizard.error.sourceUnavailable"));
    return;
  }

  const k = alignKey(a);
  const alignState = perAlign[k] ?? DEFAULT_ALIGN;

  // =========================
  // VIDEO
  // =========================
  if (a.mediaType === "video") {
    if (!playable.startsWith("file://") || isPhUri(playable)) {
      playable = await sandboxVideoUri(playable, videoSandboxKey(a));
    }

    let tu: string | null = a.thumbUri && !isPhUri(a.thumbUri) ? a.thumbUri : null;

    if (!tu) {
      try {
        const vs = getVS(a.id);
        const t = (vs.confirmedCoverMs ?? a.coverMs ?? vs.coverMs ?? 1000);
        tu = await makeSquareThumbFromVideo(playable, t);
      } catch {}
    }
    const lower = playable.toLowerCase();
    const videoMime = guessVideoMime(playable);

    const vidMime = mimeFromUri(playable);

    const k = alignKey(a);
    const vs = getVS(k);
    const coverTimeMs = (vs.confirmedCoverMs ?? (a as any).coverMs ?? vs.coverMs ?? 1000);



    items.push({
      mime: vidMime,
      srcUri: playable,
      isVideo: true,
      thumbUri: tu ?? undefined,
      editMeta: {
        align: alignState,
        fit: "cover",
        baseSize: W,
        srcW: a.width ?? W,
        srcH: a.height ?? W,
        outSize: 1080,
        coverTimeMs
      },
    });

    continue;
  }

  // =========================
  // IMAGE (✅ hier baken)
  // =========================
  const fm = filterToMatrix(perFilter[a.id] ?? "none");
  const am = buildAdjustMatrix(perAdj[a.id] ?? DEFAULT_ADJUST);





  let uploadUri = playable;

  const needsBake =
  !isDefaultAlign(alignState) ||
  (perFilter[a.id] ?? "none") !== "none" ||
  !isDefaultAdjust(perAdj[a.id]);


  if (needsBake) {
    uploadUri = await bakeImageSequential(
      a.id,
      playable,
      fm,
      am,
      a.width ?? W,
      a.height ?? W,
      alignState
    );
  }

  const safe = await ensureUploadableImage(uploadUri);

  items.push({
    mime: "image/jpeg",
    srcUri: safe.uri,
    isVideo: false,
    editMeta: {
      align: alignState,
      fit: "cover",
      baseSize: W,
      srcW: a.width ?? W,
      srcH: a.height ?? W,
      outSize: 1080,
    },
  });
}


    if (!items.length) {
      Alert.alert(t("common.error"), t("postwizard.error.noUploadItems"));
      return;
    }

    insertPending();

    console.log("UPLOAD_ITEMS", items.map((it, i) => ({
      i,
      isVideo: it.isVideo,
      srcUri: it.srcUri,
      thumbUri: it.thumbUri,
    })));

    const interestsForSave = Array.from(
      new Set(interestLabels.map((x) => x.trim()).filter(Boolean))
    ).slice(0, 12);

    const ok = await uploadCarousel({
      items,
      caption: caption || null,
      location: location || null,
      locationLat,
      locationLng,
      groupLinkId: selectedGroupLinkId,
      interestLabels: interestsForSave,
      taggedVlogIds: [],
      taggedUserIds: selectedUserIds ?? [],
    });

    if (!ok) {
      Alert.alert(t("postwizard.shareFailed.title"), t("postwizard.shareFailed.body"));
    }
  } catch (e) {
    console.warn("[onShare] Error:", e);
    Alert.alert(t("postwizard.shareFailed.title"), t("postwizard.shareFailed.body"));
  } finally {
    // ✅ pending IMMER entfernen, falls es inserted wurde
    if (pendingInserted) {
      removeUploadQueue(pendingId);
      refreshFeedAfterUpload().catch(() => {});

    }
    setUploading(false);
    uploadingRef.current = false;

  }
}, [
  uploading,
  selected,
  processedUri,
  sourceUri,
  perAlign,
  caption,
  location,
  locationLat,
  locationLng,
  selectedGroupLinkId,
  interestLabels,
  selectedUserIds,
  coverMs,
  W,
  uploadPost,
  uploadCarousel,
  resetToStep1,
  onDone,
  myProfileId,
]);


  // ===== Inline MinimalVideoEditor (theme-driven) =====
  function ControlBtn({
    label,
    onPress,
    active,
  }: {
    label: string;
    onPress: () => void;
    active?: boolean;
  }) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[s.ctrlBtn, active && s.ctrlBtnActive]}>
        <RNText style={s.ctrlTxt}>{label}</RNText>
      </TouchableOpacity>
    );
  }
  const Divider = () => <View style={s.ctrlDiv} />;

  function SmallBtn({ title, onPress }: { title: string; onPress: () => void }) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.nudgeBtn}>
        <RNText style={s.nudgeTxt}>{title}</RNText>
      </TouchableOpacity>
    );
  }

  
  const curStep2 = selected[idx] ?? selected[0];
  const isStep2Video = curStep2?.mediaType === "video";
  

  const getItemLayout = useCallback((_: any, index: number) => {
    return { length: CARD + GUTTER, offset: (CARD + GUTTER) * index, index };
  }, [CARD, GUTTER]);
const [step3Idx, setStep3Idx] = useState(0);
const step3Asset = useMemo(() => selected[step3Idx] ?? null, [selected, step3Idx]);

const step3VideoUri = step3Asset?.playableUri ?? step3Asset?.uri ?? null;
const step3ThumbUri = (step3Asset as any)?.thumbUri ?? null;



const onSelectGroupLink = useCallback((id: string | null) => {
  setSelectedGroupLinkId((prev) => (prev && prev === id ? null : id));
}, []);

useEffect(() => {
  if (step === 3) {
    setStep3Idx(Math.max(0, Math.min(idx, Math.max(0, selected.length - 1))));
  }
}, [step, idx, selected.length]); // darfst du ruhig so nehmen





  

  return (
    <View style={s.container}>

    

    <View
      style={[s.headerHost, { paddingTop: insets.top }]}
      onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
    >
      <StepHeader
        {...headerProps}
        variant={step === 2 ? "ig" : "default"}
      />
    </View>


     

      {/* ===================== STEP 1 ===================== */}
      {step === 1 && (
        <View style={s.stage}>
          <MediaGrid
            ref={gridRef}
            assets={assets as any}
            permissionGranted={permissionGranted}
            onTapAsset={tapAsset}
            onOpenCamera={openCamera}
            selectedIds={selectedIds}
            onEndReached={loadMore}

            // ✅ Preview scrollt weg (nicht sticky)
            headerComponent={(() => {
              const w0 = selected[0]?.width;
              const h0 = selected[0]?.height;

              return (

              <View style={{ width: W, height: PREVIEW_H, backgroundColor: C.bg, overflow: "hidden" }}>
                <View style={{ width: "100%", height: "100%" }}>
                  {selected.length > 1 ? (
                    <FlatList
                      ref={step1PreviewRef}
                      data={selected}
                      keyExtractor={(a) => alignKey(a)}
                      horizontal
                      pagingEnabled
                      style={{ backgroundColor: C.bg }}
                      removeClippedSubviews={false}
                      initialNumToRender={3}
                      maxToRenderPerBatch={3}
                      windowSize={5}

                      // ✅ damit RN sofort weiß, wo die Seite liegt (kein Layout-Delay)
                      getItemLayout={(_, index) => ({
                        length: W,
                        offset: W * index,
                        index,
                      })}
                      contentContainerStyle={{ backgroundColor: C.bg }}
                      showsHorizontalScrollIndicator={false}
                      decelerationRate="fast"
                      onMomentumScrollEnd={(e) => {
                        const i = Math.round(e.nativeEvent.contentOffset.x / W);
                        applyPreviewForIndex(selectedRef.current, i, false);
                      }}
                      renderItem={({ item, index }) => {
                         const playable = item.playableUri ?? item.uri;
                         const isVid = item.mediaType === "video";

                        // resolve wenn:
                        // - playable ist ph://
                        // - ODER playableUri fehlt (weil Video oft nur ph:// uri hat und playableUri später kommt)
                        const rawPlayable = item.playableUri ?? item.uri;
                        const playableOk = rawPlayable && !isPhUri(rawPlayable) ? rawPlayable : null;
                        const needsResolve = isVid && !playableOk;
                        if (needsResolve) {
                          const k = alignKey(item);
                          if (!resolvingSetRef.current.has(k)) {
                            resolvingSetRef.current.add(k);

                            setTimeout(() => {
                              ensurePlayableOne(item, resolvePlayable)
                                .then(async (patched) => {
                                  if (patched.mediaType !== "video" && patched.playableUri) {
                                    const dup = await duplicateToCache(patched.playableUri, `${patched.id}_${patched.mediaType}`);
                                    patched = { ...patched, uri: dup, playableUri: dup, thumbUri: dup };
                                  }
                                  setSelected((prev) => prev.map((x) => (alignKey(x) === k ? patched : x)));
                                })
                                .finally(() => {
                                  resolvingSetRef.current.delete(k);
                                });
                            }, 0);
                          }
                        }



                        
                        const isCurrent = index === idx;
                        const aKey = alignKey(item);



                        const src = item.thumbUri ?? item.playableUri ?? item.uri;
                        const safeSrc = isPhUri(src) ? undefined : src;
                        
                        
                        const align = getAlign(aKey);

                        


                        const thumb = item.thumbUri && !isPhUri(item.thumbUri) ? item.thumbUri : undefined;


                        return (
                          <View style={{ width: W, height: "100%", backgroundColor: C.bg }}>
                            {isVid ? (
                              <AlignableSquare
                                size={W}
                                mediaW={item.width ?? W}
                                mediaH={item.height ?? W}
                                fit="cover"
                                showGrid={false}
                                value={align}
                                onChange={(next) => setAlignFor(aKey, next)}
                                panMinPointers={2}
                                panRequiresZoom={false}
                              >
                                <View style={{ width: "100%", height: "100%", backgroundColor: C.bg, overflow: "hidden" }}>
                                  {/* playable kann auch item.uri sein, solange nicht ph:// */}
                             
                                  {(() => {
                                    const rawPlayable = item.playableUri ?? item.uri;
                                    const playableOk = rawPlayable && !isPhUri(rawPlayable) ? rawPlayable : null;

                                    const posterUri =
                                      item.thumbUri && !isPhUri(item.thumbUri) ? item.thumbUri : null;

                                    // ✅ Poster immer als Unterlage
                                    const Poster = posterUri ? (
                                      <ExpoImage
                                        source={{ uri: posterUri }}
                                        style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                        transition={0}
                                      />
                                    ) : (
                                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                        <ActivityIndicator />
                                      </View>
                                    );

                                    // ✅ Nicht-current: nur Poster (kein Video mount)
                                    if (!isCurrent) return Poster;

                                    // ✅ Current aber noch kein playable: nur Poster
                                    if (!playableOk) return Poster;

                                    return (
                                      <View style={{ flex: 1 }}>
                                        {Poster}
                                        <Video
                                          source={{ uri: playableOk }}
                                          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
                                          resizeMode={ResizeMode.COVER}
                                          shouldPlay
                                          isLooping
                                          isMuted
                                          onLoad={() => console.log("VIDEO_LOAD_OK", { id: item.id, uri: playableOk })}
                                          onError={(e) => console.log("VIDEO_LOAD_ERR", { id: item.id, uri: playableOk, e })}
                                        />
                                      </View>
                                    );
                                  })()}

                                  <View
                                    pointerEvents="none"
                                    style={{
                                      position: "absolute",
                                      right: 12,
                                      bottom: 12,
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      borderRadius: 999,
                                      backgroundColor: "rgba(0,0,0,0.45)",
                                    }}
                                  >
                                    <Ionicons name="play" size={16} color="white" />
                                  </View>
                                </View>
                              </AlignableSquare>
                            ) : (
                              /* image block bleibt wie bei dir */
                              <View style={{ width: W, height: PREVIEW_H, backgroundColor: C.bg }}>
                                {!safeSrc ? (
                                  <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
                                    <ActivityIndicator />
                                  </View>
                                ) : (
                                  <AlignableSquare
                                    size={W}
                                    mediaW={item.width}
                                    mediaH={item.height}
                                    showGrid={false}
                                    value={getAlign(aKey)}
                                    onChange={(next) => setAlignFor(aKey, next)}
                                    panMinPointers={2}
                                    panRequiresZoom={false}
                                  >
                                    <ExpoImage
                                      source={safeSrc ? { uri: safeSrc } : undefined}
                                      style={{ width: "100%", height: "100%", backgroundColor: C.bg }}
                                      contentFit="cover"
                                      cachePolicy="memory-disk"
                                      transition={0}
                                      recyclingKey={alignKey(item)}
                                    />
                                  </AlignableSquare>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      }}

                    />
                  ) : (
                    isVideo ? (
                      (() => {
                        const cur = selected[0];
                        const playable = sanitizeUri(cur?.playableUri) ?? sanitizeUri(cur?.uri);
                        const thumb = cur?.thumbUri && !isPhUri(cur.thumbUri) ? cur.thumbUri : undefined;

                        // ✅ solange playable noch nicht wirklich nutzbar ist → Thumb/Loader
                        if (!playable) {
                          return (
                            <View style={{ width: W, height: PREVIEW_H, backgroundColor: C.bg }}>
                              {thumb ? (
                                <ExpoImage
                                  source={{ uri: thumb }}
                                  style={{ width: "100%", height: "100%", backgroundColor: C.bg }}
                                  contentFit="cover"
                                  cachePolicy="disk"
                                  transition={0}
                                />
                              ) : (
                                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                  <ActivityIndicator />
                                </View>
                              )}
                            </View>
                          );
                        }

                        
                        const aKey = cur ? alignKey(cur) : "single_video";
                        const align = getAlign(aKey);

                        const rawPlayable = (cur?.playableUri ?? cur?.uri) ?? null;
                        const playableOk = rawPlayable && !isPhUri(rawPlayable) ? rawPlayable : null;

                        return (
                          <AlignableSquare
                            size={W}
                            mediaW={cur?.width ?? W}
                            mediaH={cur?.height ?? W}
                            fit="cover"
                            showGrid={false}
                            value={align}
                            onChange={(next) => setAlignFor(aKey, next)}
                            panMinPointers={2}
                            panRequiresZoom={false}
                          >
                            <View style={{ width: "100%", height: "100%", backgroundColor: "#000", overflow: "hidden" }}>
                              {!playableOk ? (
                                thumb ? (
                                  <ExpoImage
                                    source={{ uri: thumb }}
                                    style={{ width: "100%", height: "100%" }}
                                    contentFit="cover"
                                    cachePolicy="disk"
                                    transition={0}
                                  />
                                ) : (
                                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                    <ActivityIndicator />
                                  </View>
                                )
                              ) : (
                                <Video
                                  pointerEvents="none"
                                  source={{ uri: playableOk }}
                                  style={{ width: "100%", height: "100%" }}
                                  resizeMode={ResizeMode.COVER}
                                  shouldPlay
                                  isLooping={loop}
                                  isMuted={muted}
                                />
                              )}

                              <View
                                pointerEvents="none"
                                style={{
                                  position: "absolute",
                                  right: 12,
                                  bottom: 12,
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                  borderRadius: 999,
                                  backgroundColor: "rgba(0,0,0,0.45)",
                                }}
                              >
                                <Ionicons name="play" size={16} color="white" />
                              </View>
                            </View>
                          </AlignableSquare>
                        );

                      })()
                    ) : (
                      <View style={{ width: W, height: PREVIEW_H, backgroundColor: C.bg }}>
                        {!sourceUri ? (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <RNText style={{ color: C.subtext, fontWeight: "700" }}>{t("postwizard.chooseAPhoto")}</RNText>
                          </View>
                        ) : (
                          <AlignableSquare
                            size={W}
                            mediaW={selected[0]?.width ?? W}     // ✅ fallback
                            mediaH={selected[0]?.height ?? W}   // ✅ fallback
                            showGrid={false}
                            value={getAlign(selected[0] ? alignKey(selected[0]) : "single")}
                            onChange={(next) => {
                              if (!selected[0]) return;
                              setAlignFor(alignKey(selected[0]), next);
                            }}
                            panMinPointers={2}
                            panRequiresZoom={false}
                          >
                            <LargePreview
                              key={sourceUri || "empty"}
                              sourceUri={sourceUri}
                              isVideo={false}
                              contentFit="cover"
                            />
                          </AlignableSquare>
                        )}
                      </View>
                    )

                  
                  )}

                  <View style={s.dotsOverlay}>
                    <PostPagerDots count={selected.length} index={idx} C={C} />
                  </View>
                </View>
              </View>);
            })()}

            // ✅ NUR die Toolbar sticky (unter StepHeader)
            stickyHeader={
              <View style={[s.topBar, { height: TOOLBAR_H, backgroundColor: C.bg }]}>
                <MediaFilterMenu
                  C={C}
                  isDark={isDark}
                  mode={mode as any}
                  selectedAlbum={selectedAlbum as any}
                  albums={albums as any}
                  onSelectMode={(m) => {
                    if (m !== "albums") setSelectedAlbum(null);
                    setMode(m as any);
                  }}
                  onSelectAlbum={(a) => {
                    setSelectedAlbum(a as any);
                    setMode("albums" as any);
                  }}
                />

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setMulti((m) => {
                      const next = !m;
                      if (next) {
                        // ✅ Multi wird eingeschaltet
                        setIdx((prevIdx) => {
                          // wenn schon selections da sind: ans Ende (oder 0, je nachdem was du willst)
                          const last = Math.max(0, selectedRef.current.length - 1);
                          return last;
                        });

                        // optional: Preview sofort auf den Index setzen (falls du “letztes Bild” zeigen willst)
                        if (selectedRef.current.length) {
                          const last = Math.max(0, selectedRef.current.length - 1);
                          applyPreviewForIndex(selectedRef.current, last, false);
                        }

                      } else {
                        // ✅ Multi wird ausgeschaltet -> nur letztes behalten
                        setSelected((prev) => (prev.length ? [prev[prev.length - 1]] : []));

                        const only = selectedRef.current.length
                          ? [selectedRef.current[selectedRef.current.length - 1]]
                          : [];

                        setIdx(0);
                        applyPreviewForIndex(only, 0, false);
                      }
                      return next;
                    });
                  }}
                  style={s.multiBtn}
                >
                  <Ionicons name={multi ? "albums" : "image-outline"} size={16} color={C.text} />
                  <RNText style={s.multiTxt}>
                    {multi ? t("postwizard.multi.multiple") : t("postwizard.multi.single")}
                  </RNText>

                </TouchableOpacity>
              </View>
            }

           

            // ✅ kein topInset mehr, weil Preview im ListHeader sitzt
            topInset={0}

            // ✅ optional: wenn du noch extra scroll-space willst
            bottomSpacer={0}

            // ✅ kein Animated.event hier nötig
            onScroll={undefined}
          />
        </View>
      )}




      {/* ===================== STEP 2 ===================== */}
      {step === 2 && selected.length > 0 && (
        <>
          <FlatList
            ref={step2PagerRef}
            data={selected}
            keyExtractor={(a) => alignKey(a)}
            horizontal
            pagingEnabled
            initialScrollIndex={idx}
            getItemLayout={getItemLayout}
            style={{ backgroundColor: C.bg }}
            contentContainerStyle={{ backgroundColor: C.bg }}
            decelerationRate="fast"
            snapToInterval={CARD}
            snapToAlignment="start"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={async (e) => {
              
              const i = Math.round(e.nativeEvent.contentOffset.x / (CARD + GUTTER));
              setIdx(i);

              const curRaw = selectedRef.current[i]; // ✅ nimm ref, nicht stale closure
              if (!curRaw) return;

              const cur =
                isPhUri(curRaw.playableUri)
                  ? await ensurePlayableOne(curRaw, resolvePlayable)
                  : curRaw.playableUri
                    ? curRaw
                    : await ensurePlayableOne(curRaw, resolvePlayable);

              if (cur !== curRaw) {
                setSelected(prev => prev.map((x, j) => (j === i ? cur : x)));
              }
              
              


              const vs = getVS(cur.id);             // ✅ jetzt erst
              const nextCover = vs.coverMs ?? 1000;
              coverMsRef.current = nextCover;
              setCoverMs(nextCover);
              setPlaying(vs.playing ?? false);

              setIsVideo(cur.mediaType === "video");
              if (cur.mediaType === "video") {
                setShowFilters(false);
                setShowAdjust(false);
              }
              setDurationSec(cur.duration ?? null);
              setSourceUri(cur.playableUri ?? cur.uri);
            }}

            renderItem={({ item, index }) => {
              const isCurrent = index === idx;
              const isVid = item.mediaType === "video";
              const playable = sanitizeUri(item.playableUri);

              const aKey = alignKey(item);
              const align = getAlign(aKey);

              const vs = getVS(aKey);


              if (!playable) {
                ensurePlayableOne(item, resolvePlayable).then((patched) => {
                  setSelected((prev) => prev.map((x, i2) => (i2 === index ? patched : x)));
                });
                return (
                  <View style={[s.card, { alignItems: "center", justifyContent: "center" }]}>
                    <RNText style={{ color: C.subtext }}>{t("common.loading")}</RNText>
                  </View>
                );
              }
              


              return (
                <View style={s.card}>
                  {isVid ? (<AlignableSquare
                      size={CARD}
                      mediaW={item.width ?? CARD}
                      mediaH={item.height ?? CARD}
                      showGrid={false}
                      fit="cover"
                      value={align}
                      onChange={(next) => setAlignFor(aKey, next)}
                      panMinPointers={2}
                      panRequiresZoom={false}
                    >
                      <TouchableOpacity activeOpacity={0.9} onPress={() => index === idx &&  togglePlayPause()} style={{ flex: 1 }}>
                        <Video
                          ref={setVideoRef(aKey)}
                          source={{ uri: playable }}
                          style={{ width: "100%", height: "100%", backgroundColor: "#000" }}
                          resizeMode={ResizeMode.COVER}
                          usePoster={!!item.thumbUri && !isPhUri(item.thumbUri)}
                          posterSource={item.thumbUri && !isPhUri(item.thumbUri) ? { uri: item.thumbUri } : undefined}
                          shouldPlay={isCurrent && vs.playing && !scrubbing}
                          isLooping={loop}
                          isMuted={muted}
                          onPlaybackStatusUpdate={(st) => {
                            if (!st?.isLoaded) return;

                            // ✅ Duration pro Item merken
                            if (st.durationMillis != null) {
                              const d = Math.max(1, Math.round(st.durationMillis / 1000));

                              // 1) ins Asset schreiben (damit Timeline immer korrekt ist)
                              if ((item as any).duration !== d) {
                                setSelected(prev =>
                                  prev.map((x, j) => (j === index ? ({ ...x, duration: d } as any) : x))
                                );
                              }

                              // 2) wenn dieses Item aktuell sichtbar ist -> Timeline aktualisieren
                              if (isCurrent && durationSec !== d) {
                                setDurationSec(d);
                              }
                            }

                            // ✅ Ende handling
                            if (st.didJustFinish) {
                              patchVS(aKey, { playing: false });
                              setPlaying(false);
                              coverMsRef.current = 0;
                              setCoverMs(0);
                              return;
                            }

                    
                            // ✅ Cover position tracken (nur current) – NICHT vs.playing verwenden (stale)
                            if (isCurrent && !scrubbing && st.isPlaying) {
                              const pos = st.positionMillis ?? 0;

                              // per-item speichern (optional)
                              patchVS(item.id, { coverMs: pos });

                              // global für Slider/Editor
                              coverMsRef.current = pos;
                              setCoverMs(pos);
                            }

                          }}


                        />
                      </TouchableOpacity>
                    </AlignableSquare>
                  ) : isCurrent ? (
                  <ViewShot
                    ref={viewShotRef}
                    style={{ flex: 1 }}
                    options={{ result: "tmpfile", format: "jpg", quality: 0.95 }}
                  >
                    <AlignableSquare
                      size={CARD}
                      mediaW={item.width}
                      mediaH={item.height}
                      showGrid={false}
                      value={align}
                      onChange={(next) => setAlignFor(aKey, next)}   // ✅ speichern
                      panMinPointers={2}                             // ✅ 2-Finger only
                      panRequiresZoom={false}
                    >
                      <LargePreview
                        sourceUri={playable}
                        isVideo={false}
                        filterMatrix={filterToMatrix(perFilter[item.id] ?? "none")}
                        adjustMatrix={buildAdjustMatrix(perAdj[item.id] ?? DEFAULT_ADJUST)}
                        vignette={false}
                        instant
                         contentFit="cover" 
                      />
                    </AlignableSquare>
                  </ViewShot>

                ) : (
                  <AlignableSquare
                    size={CARD}
                    mediaW={item.width}
                    mediaH={item.height}
                    showGrid={false}
                    value={align}
                    onChange={(next) => setAlignFor(aKey, next)}
                    panMinPointers={2}
                    panRequiresZoom={false}
                  >
                    <LargePreview
                      sourceUri={playable}
                      isVideo={false}
                      filterMatrix={filterToMatrix(perFilter[item.id] ?? "none")}
                      adjustMatrix={buildAdjustMatrix(perAdj[item.id] ?? DEFAULT_ADJUST)}
                      vignette={false}
                      contentFit="cover"
                    />
                  </AlignableSquare>

                )}
                <View style={s.dotsOverlay}>
                  <PostPagerDots
                    count={selected.length}
                    index={idx}
                    C={C}
                  />
                </View>

                </View>
              );
            }}
          />
          


          {/* Step 2 Controls */}
          {(() => {
            const current = selected[idx] ?? selected[0];
            if (!current) return null;

            const isVid = current.mediaType === "video";
            const uri = current.playableUri ?? current.uri;
            
            const vs = getVS(current.id);
            

            return isVid ? (
              <MinimalVideoEditor
                durationSec={durationSec || 0}
                coverMs={coverMs}

                onScrubStart={() => {
                  const cur = selected[idx];
                  if (!cur) return;

                  const ref = getVideoRef(alignKey(cur));

                  setScrubbing(true);

                  // ✅ state + VS pausieren
                  setPlaying(false);
                  patchVS(cur.id, { playing: false });

                  // ✅ PLAYER hart pausieren
                  ref?.pauseAsync?.().catch(() => {});
                  ref?.setStatusAsync({ shouldPlay: false }).catch(() => {});
                }}

                // ✅ SlidingComplete soll nur "Scrub beendet" signalisieren – KEIN Thumb rendern
                onScrubComplete={async (ms) => {
                  try {
                    // optional: final seek (sauber)
                    await handleCoverChange(ms);
                  } finally {
                    setScrubbing(false);
                  }
                }}

                onChangeCover={handleCoverChange}
                

                // ✅ NEU: explizites "Cover setzen" (macht Thumb + speichert am Asset)
                onConfirmCover={async (ms) => {
                  if (scrubbing) return;
                  await handleCoverCommit(ms);
                }}
                confirmedCoverMs={vs.confirmedCoverMs}
                playing={playing}
                onTogglePlay={togglePlayPause}
                rate={rate}
                onCycleRate={async () => {
                  if (scrubbing) return;

                  const cur = selected[idx];
                  if (!cur) return;

                  const key = alignKey(cur);
                  const ref = getVideoRef(key);
                  if (!ref) return;

                  const steps = [0.5, 1, 1.5, 2] as const;
                  const currentRate = (getVS(cur.id)?.rate ?? rate) as any;
                  const i = steps.indexOf(currentRate);
                  const next = steps[(Math.max(0, i) + 1) % steps.length];

                  setRate(next);
                  patchVS(cur.id, { rate: next });

                  await runPlayerOp(async () => {
                    const st: any = await ref.getStatusAsync().catch(() => null);
                    const isLoaded = !!st?.isLoaded;

                    const keepPlaying = isLoaded ? !!st?.isPlaying : !!getVS(cur.id).playing;
                    const pos = isLoaded ? (st.positionMillis ?? coverMsRef.current ?? 0) : (coverMsRef.current ?? 0);

                    await ref.setStatusAsync({
                      rate: next,
                      shouldCorrectPitch: true,
                      shouldPlay: keepPlaying,
                      positionMillis: pos,
                    });
                  });
                }}
              />

            ) : (
              <>
                {showFilters && (
                  <FiltersBarSheet
                    open={showFilters}
                    sourceUri={uri}
                    active={perFilter[current.id] ?? "none"}
                    onChange={(k) => setFilterFor(current.id, k)}
                    adjustMatrix={buildAdjustMatrix(perAdj[current.id] ?? DEFAULT_ADJUST)}
                    onClose={closePanels}
                  />
                )}

              </>
            );
          })()}


          {!isStep2Video && (
  
          <View pointerEvents="box-none" style={[s.igBottomWrap, { bottom: insets.bottom + 14 }]}>
            <View style={s.igToolsRow}>
              {/* Filter */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={[s.igToolBtnWide, showFilters && s.igToolBtnActive]}
                onPress={() => {
                  const cur = selected[idx] ?? selected[0];
                  if (!cur || cur.mediaType === "video") {
                    Alert.alert(t("postwizard.filters.title"), t("postwizard.filters.photosOnly"));
                    return;
                  }
                  setShowFilters((v) => {
                    const next = !v;
                    if (next) setShowAdjust(false);
                    return next;
                  });
                }}
              >
                <Ionicons name="color-filter-outline" size={18} color={C.text} />
                <RNText style={s.igToolTxt}>{t("postwizard.filters.label")}</RNText>
              </TouchableOpacity>

              {/* Bearbeiten (wenn aktiv -> transparent + disabled) */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  s.igToolBtnWide,
                  showAdjust && s.igToolBtnDisabled, // ✅ transparent/disabled
                ]}
                disabled={showAdjust} // ✅ NICHT benutzbar wenn offen
                onPress={() => {
                  const cur = selected[idx] ?? selected[0];
                  if (!cur || cur.mediaType === "video") {
                    Alert.alert(t("postwizard.editing.title"), t("postwizard.editing.photosOnly"));
                    return;
                  }
                  setShowAdjust((v) => {
                    const next = !v;
                    if (next) setShowFilters(false);
                    return next;
                  });
                  setShowFilters(false);
                }}
              >
                <Ionicons name="options-outline" size={18} color={C.text} />
                <RNText style={[s.igToolTxt, showAdjust && { opacity: 0.35 }]}>{t("postwizard.edit")}</RNText>
              </TouchableOpacity>
            </View>

        
          </View>
          )}


        </>
      )}

 
      {/* ===================== STEP 3 ===================== */}
      {step === 3 && (
        <PublishForm
          isVideo={selected[step3Idx]?.mediaType === "video"}
          sourceUri={(() => {
            const cur = selected[step3Idx] ?? selected[0];
            return cur ? (cur.playableUri ?? cur.uri) : "";
          })()}
          posterUri={(() => {
            const cur = selected[step3Idx] ?? selected[0];
            const t = cur?.thumbUri;
            return t && !t.startsWith("ph://") ? t : undefined;
          })()}
          list={selected
            .map((a) => {
              const playable = a.playableUri ?? a.uri;
              if (!playable || isPhUri(playable)) return null;

              const key = alignKey(a);

              return {
                uri: playable,
                isVideo: a.mediaType === "video",
                thumbUri: a.thumbUri && !isPhUri(a.thumbUri) ? a.thumbUri : undefined,
                filterMatrix: a.mediaType === "video" ? undefined : filterToMatrix(perFilter[a.id] ?? "none"),
                adjustMatrix: a.mediaType === "video" ? undefined : buildAdjustMatrix(perAdj[a.id] ?? DEFAULT_ADJUST),
                align: perAlign[key] ?? { scale: 1, tx: 0, ty: 0 },
                width: a.width,
                height: a.height,
                alignBaseSize: W,
              };
            })
            .filter(Boolean) as any}
          caption={caption}
          onCaption={setCaption}
          location={location}
          onLocation={setLocation}
          onLocationCoords={(lat, lng) => {
            setLocationLat(lat);
            setLocationLng(lng);
          }}
          interestSuggestions={INTEREST_SUGGESTIONS}
          selectedInterests={interestLabels}
          onToggleInterest={toggleInterest}
          creating={creating || uploading}
          onShare={onShare}
          selectedGroupLinkId={selectedGroupLinkId}
          onSelectGroupLink={onSelectGroupLink}
          selectedUserIds={selectedUserIds}
          onToggleUser={onToggleUser}
        />
      )}



      {/* Hidden baker */}
      {renderTask && (
        <View style={s.hiddenBakeWrap}>
          <ViewShot
            key={`shot-${renderTask.id}`}
            ref={hiddenShotRef}
            style={s.hiddenBakeShot}
            options={{ result: "tmpfile", format: "jpg", quality: 0.95 }}
          >
            <AlignableSquare
              size={Dimensions.get("window").width}
              mediaW={renderTask.width}
              mediaH={renderTask.height}
              showGrid={false}
              fit="cover"
              value={renderTask.align ?? { scale: 1, tx: 0, ty: 0 }}
              onChange={() => {}}
            >
              <LargePreview
                sourceUri={renderTask.uri}
                isVideo={false}
                filterMatrix={renderTask.fm}
                adjustMatrix={renderTask.am}
                vignette={false}
                 contentFit="cover" 
                instant
              />
            </AlignableSquare>

          </ViewShot>
        </View>
      )}
      {/* ✅ AdjustBar als echtes Screen-Overlay (immer ganz oben im Tree) */}
      {step === 2 && !isVideo && (() => {
        const current = selected[idx] ?? selected[0];
        if (!current) return null;

        return (
          <AdjustBar
            open={showAdjust}
            values={perAdj[current.id] ?? DEFAULT_ADJUST}
            onChange={(next) => setAdjFor(current.id, next)}
            onClose={closePanels}
          />
        );
      })()}

    </View>
  );
}

/** ---------- Styles (theme-driven wie ProfileUnifiedScreen) ---------- */
const styles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    igToolsRow: {
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: C.border,
  borderRadius: 16,
  paddingVertical: 10,
  paddingHorizontal: 10,
},

// ✅ NEU: breite Tool Buttons (2 Stück nebeneinander)
igToolBtnWide: {
  flex: 1,
  height: 44,
  borderRadius: 14,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: C.border,
},

// ✅ NEU: disabled/transparent Zustand für Bearbeiten
igToolBtnDisabled: {
  opacity: 0.35, // transparent
},


    // ===== IG-like header (Step 2) =====
igHeader: {
  paddingHorizontal: 14,
  paddingBottom: 10,
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
},
igIconBtn: {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: C.border,
},
audioPill: {
  flex: 1,
  minHeight: 44,
  borderRadius: 22,
  paddingHorizontal: 12,
  paddingVertical: 10,
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: C.border,
},
audioThumb: {
  width: 28,
  height: 28,
  borderRadius: 6,
  backgroundColor: C.primary,
  opacity: 0.65,
},
audioTitle: { color: C.text, fontWeight: "800", fontSize: 13 },
audioSub: { color: C.subtext, fontWeight: "700", fontSize: 11, marginTop: 2 },

// ===== IG-like bottom tools (Step 2) =====
igBottomWrap: {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 14,
  zIndex: 80,
  elevation: 80,
  flexDirection: "row",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  marginBottom:30,
  
},

igToolBtn: {
  width: 60,
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
},
igToolBtnActive: {
  opacity: 1,
},
igToolTxt: {
  color: C.text,
  fontSize: 11,
  fontWeight: "800",
},
igNextBtn: {
  height: 44,
  paddingHorizontal: 16,
  borderRadius: 22,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  backgroundColor: C.primary,
},
igNextTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },

igPanelWrap: {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 74,
},


    previewMask: {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
          // ✅ gleiche Höhe wie Preview
  backgroundColor: C.bg,    // ✅ “schneidet” optisch weg
},


    toolbarAbs: {
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 40,
  elevation: 40,
  backgroundColor: C.bg,
},

previewAbs: {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  backgroundColor: C.bg,
  overflow: "hidden", // ✅ echtes Crop
  zIndex: 20,
  elevation: 20,
},

topBar: {
  flex: 1,
  paddingHorizontal: 12,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: C.bg,
},


    stickyTopBar: {
          // ⚠️ TOOLBAR_H ist const im File, passt
  paddingHorizontal: 12,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: C.bg,
  zIndex: 60,
  elevation: 60,
},

previewUnderBar: {
  position: "absolute",
  left: 0,
  right: 0,
  backgroundColor: C.bg,
  overflow: "hidden",
  zIndex: 10,
  elevation: 10,
},

    container: { flex: 1, backgroundColor: C.bg },

    headerHost: {
      zIndex: 50,
      backgroundColor: C.bg,
    },

    stage: {
      flex: 1,
      backgroundColor: C.bg,
    },

  

    previewInner: { width: "100%", height: "100%" },

    // Multi Button
    multiBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
      maxWidth: 170,
    },
    multiTxt: { color: C.text, fontWeight: "800" },

    dotsOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 8,
      zIndex: 40,
      elevation: 40,
    },

    // Step 2 card
    card: {
      width: Dimensions.get("window").width,
      height: Dimensions.get("window").width,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      marginTop: 45
    },

    primaryPill: {
      backgroundColor: C.card,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    primaryPillTxt: { color: C.text, fontWeight: "800" },

    // Editor (Video)
    editorWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: Platform.select({ ios: 18, android: 14 }),
      paddingHorizontal: 12,
    },
    editorCard: {
      backgroundColor: isDark ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.55)",
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    controlsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    ctrlBtn: {
      backgroundColor: C.card,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    ctrlBtnActive: {
      backgroundColor: C.card,
      borderColor: C.text,
      opacity: 0.9,
    },
    ctrlTxt: { color: C.text, fontWeight: "800" },
    ctrlDiv: { width: 8, height: 1, backgroundColor: C.border },

    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    timeText: { color: C.subtext, fontSize: 12, fontVariant: ["tabular-nums"] },
    timeCaption: { color: C.text, fontWeight: "800", fontSize: 12, opacity: 0.85 },

    nudgeRow: { marginTop: 6, flexDirection: "row", justifyContent: "space-between" },
    nudgeBtn: {
      backgroundColor: C.card,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    nudgeTxt: { color: C.text, fontWeight: "700", fontSize: 12 },

    // Hidden bake
    hiddenBakeWrap: {
      position: "absolute",
      left: -9999,
      top: -9999,
      width: Dimensions.get("window").width,
      height: Dimensions.get("window").width,
      backgroundColor: "#000",
    },
    hiddenBakeShot: {
      width: Dimensions.get("window").width,
      height: Dimensions.get("window").width,
      backgroundColor: "#000",
    },
  });
