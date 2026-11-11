// apps/ciaorelated/src/screens/StoryComposeScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  Pressable,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as ImageManipulator from "expo-image-manipulator";
import ViewShot from "react-native-view-shot";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { gql, useMutation } from "@apollo/client";

import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import jpeg from "jpeg-js";

import { useTheme } from "../theme/ThemeProvider";
import Screen from "./components/Screen";
import { STORIES_FEED, MY_STORIES, MY_STORIES_RECENT } from "../graphql/queries/stories";

import { useTranslation } from "react-i18next";

const { width: WIN_W, height: WIN_H } = Dimensions.get("window");

const EXPORT_W = 1080;
const EXPORT_H = 1920;

// CTA sizing
const CTA_H = 52;
const CTA_SIDE_PAD = 30;

const ASPECT = 16 / 9;
function computeCanvas() {
  let canvasW = WIN_W;
  let canvasH = Math.round(canvasW * ASPECT);
  if (canvasH > WIN_H) {
    canvasH = WIN_H;
    canvasW = Math.round(canvasH / ASPECT);
  }
  const left = Math.round((WIN_W - canvasW) / 2);
  const top = 0; // behind notch
  return { canvasW, canvasH, left, top };
}
const CANVAS = computeCanvas();

/* === GraphQL === */
const GET_SIGNED_STORY_UPLOAD = gql`
  mutation GetSignedStoryUpload($mime: String!, $size: Int!) {
    getSignedStoryUpload(mime: $mime, size: $size) {
      key
      putUrl
    }
  }
`;
const CREATE_STORY = gql`
  mutation CreateStory($input: CreateStoryInput!) {
    createStory(input: $input) {
      id
      mediaUrl
      thumbUrl
      mime
      isVideo
      createdAt
    }
  }
`;

type RouteParams = {
  media: {
    id?: string;
    uri: string;
    type: "photo" | "video";
    duration?: number;
    filename?: string;
  };
};

/* ---------- Utils ---------- */

const hasExt = (p: string) => /\.[a-z0-9]+$/i.test(p || "");
const pickExtFor = (kind: "photo" | "video") => (kind === "video" ? (Platform.OS === "ios" ? "mov" : "mp4") : "jpg");

const extFromName = (name?: string) => {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".mp4")) return "mp4";
  if (n.endsWith(".mov")) return "mov";
  if (n.endsWith(".m4v")) return "m4v";
  if (n.endsWith(".webm")) return "webm";
  if (n.endsWith(".png")) return "png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
  return undefined;
};

const guessMime = (ext: string, kind: "photo" | "video") => {
  const e = ext.toLowerCase();
  if (kind === "video") {
    if (e === "mov" || e === "m4v") return "video/quicktime";
    if (e === "mp4") return "video/mp4";
    return Platform.OS === "ios" ? "video/quicktime" : "video/mp4";
  }
  if (e === "png") return "image/png";
  return "image/jpeg";
};

const toIntSeconds = (x?: number | null) => {
  if (x == null) return null;
  const v = Number(x);
  if (!Number.isFinite(v)) return null;
  const sec = v > 1800 ? Math.round(v / 1000) : Math.round(v);
  return Math.max(0, sec);
};

const parseS3Error = (body?: string) => {
  if (!body) return null;
  const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1];
  const msg = body.match(/<Message>([^<]+)<\/Message>/)?.[1];
  return code || msg ? `${code ?? "S3Error"}: ${msg ?? ""}`.trim() : null;
};

const base64ToUint8Array = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

const averageColorFromJpegBase64 = (b64: string) => {
  const bytes = base64ToUint8Array(b64);
  const raw = jpeg.decode(bytes, { useTArray: true }) as unknown as { data: Uint8Array; width: number; height: number };
  const data = raw.data;

  let r = 0,
    g = 0,
    b = 0,
    c = 0;
  const totalPx = Math.max(1, raw.width * raw.height);
  const stepPx = Math.max(1, Math.floor(totalPx / 256));
  const step = stepPx * 4;

  for (let i = 0; i < data.length; i += step) {
    r += data[i + 0];
    g += data[i + 1];
    b += data[i + 2];
    c++;
  }

  r = Math.round(r / Math.max(1, c));
  g = Math.round(g / Math.max(1, c));
  b = Math.round(b / Math.max(1, c));

  const mix = (v: number, target: number, t: number) => Math.round(v * (1 - t) + target * t);
  r = mix(r, 18, 0.38);
  g = mix(g, 18, 0.38);
  b = mix(b, 18, 0.38);

  return `rgb(${r},${g},${b})`;
};

const hexToRgba = (hex: string, a: number) => {
  const h = (hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
};

type FitMode = "FIT" | "FILL";

/* ---------- Text Stickers ---------- */

type TextStylePreset = "classic" | "strong" | "mono";

type TextSticker = {
  id: string;
  text: string;
  preset: TextStylePreset;
  color: string;

  bgOn: boolean;
  bgColor: string;
  bgOpacity: number;

  x: number;
  y: number;
  s: number;
  r: number;
};

function buildTextStyle(preset: TextStylePreset, color: string) {
  switch (preset) {
    case "strong":
      return { color, fontSize: 40, fontWeight: "900" as const, letterSpacing: 0.2, textAlign: "center" as const };
    case "mono":
      return {
        color,
        fontSize: 34,
        fontWeight: "800" as const,
        textAlign: "center" as const,
        fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
      };
    default:
      return { color, fontSize: 36, fontWeight: "800" as const, textAlign: "center" as const };
  }
}

function StickerItem({
  sticker,
  isActive,
  onActivate,
  onDelete,
  aX,
  aY,
  aS,
  aR,
}: {
  sticker: TextSticker;
  isActive: boolean;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  aX: SharedValue<number>;
  aY: SharedValue<number>;
  aS: SharedValue<number>;
  aR: SharedValue<number>;
}) {
  const { t } = useTranslation();

  const style = useAnimatedStyle(() => {
    const tx = isActive ? aX.value : sticker.x;
    const ty = isActive ? aY.value : sticker.y;
    const sc = isActive ? aS.value : sticker.s;
    const rr = isActive ? aR.value : sticker.r;
    return { transform: [{ translateX: tx }, { translateY: ty }, { rotateZ: `${rr}rad` }, { scale: sc }] };
  });

  const bg = sticker.bgOn ? hexToRgba(sticker.bgColor, sticker.bgOpacity) : "transparent";
  const txtStyle = buildTextStyle(sticker.preset, sticker.color);

  // ✅ no double tap here (editing is via overlay-doubletap)
  const tap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(240)
    .onEnd(() => runOnJS(onActivate)(sticker.id));

  const longPress = Gesture.LongPress()
    .minDuration(420)
    .onStart(() => runOnJS(onDelete)(sticker.id));

  const g = Gesture.Exclusive(longPress, tap);

  return (
    <GestureDetector gesture={g}>
      <Animated.View style={stylesSticker.anchor} pointerEvents="box-none">
        <Animated.View
          style={[
            stylesSticker.inner,
            style,
            {
              backgroundColor: bg,
              borderWidth: sticker.bgOn ? StyleSheet.hairlineWidth : 0,
              borderColor: "rgba(255,255,255,0.16)",
            },
          ]}
        >
          <Text style={[txtStyle, { maxWidth: CANVAS.canvasW - 40 }]}>{sticker.text}</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const stylesSticker = StyleSheet.create({
  anchor: {
    position: "absolute",
    left: CANVAS.canvasW / 2,
    top: CANVAS.canvasH / 2,
  },
  inner: {
    transform: [{ translateX: -80 }, { translateY: -20 }],
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },
});

/* ---------- Screen ---------- */

export default function StoryComposeScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { media } = route.params as RouteParams;
  const insets = useSafeAreaInsets();

  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = useMemo(() => styles(COLORS), [COLORS]);

  const isVideo = media.type === "video";

  const [fileUri, setFileUri] = useState<string>("");
  const [fileExt, setFileExt] = useState<string>("");
  const [posterUri, setPosterUri] = useState<string | undefined>();
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fitMode, setFitMode] = useState<FitMode>("FILL");
  const [bgColor, setBgColor] = useState<string>(COLORS.bg);

  const viewShotRef = useRef<ViewShot>(null);

  // media transform
  const scale = useSharedValue(1.15);
  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // stickers
  const [stickers, setStickers] = useState<TextSticker[]>([]);
  const [activeStickerId, setActiveStickerId] = useState<string | null>(null);

  // active sticker transforms
  const aX = useSharedValue(0);
  const aY = useSharedValue(0);
  const aS = useSharedValue(1);
  const aR = useSharedValue(0);

  const aStartX = useSharedValue(0);
  const aStartY = useSharedValue(0);
  const aStartS = useSharedValue(1);
  const aStartR = useSharedValue(0);

  const clampW = (v: number, min: number, max: number, fallback: number) => {
    "worklet";
    if (!Number.isFinite(v) || Number.isNaN(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  };

  // bg only when zoomed out
  const bgAnimatedStyle = useAnimatedStyle(() => ({ opacity: scale.value < 0.99 ? 1 : 0 }));

  const resetTransform = useCallback(
    (nextMode?: FitMode) => {
      translateX.value = 0;
      translateY.value = 0;
      rotation.value = 0;
      const m = nextMode ?? fitMode;
      scale.value = m === "FIT" ? 1.0 : 1.15;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitMode]
  );

  useEffect(() => {
    resetTransform(fitMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitMode]);

  const fgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { rotateZ: `${rotation.value}rad` }, { scale: scale.value }],
  }));

  const toggleFitMode = useCallback(() => {
    setFitMode((m) => {
      const next = m === "FIT" ? "FILL" : "FIT";
      resetTransform(next);
      return next;
    });
  }, [resetTransform]);

  const commitAndCloseSticker = useCallback(() => {
    if (!activeStickerId) return;
    const id = activeStickerId;

    const nx = Number.isFinite(aX.value) ? aX.value : 0;
    const ny = Number.isFinite(aY.value) ? aY.value : 0;
    const ns = Number.isFinite(aS.value) ? aS.value : 1;
    const nr = Number.isFinite(aR.value) ? aR.value : 0;

    setStickers((prev) => prev.map((t) => (t.id === id ? { ...t, x: nx, y: ny, s: ns, r: nr } : t)));
    setActiveStickerId(null);
  }, [activeStickerId, aX, aY, aS, aR]);

  const activateSticker = useCallback(
    (id: string) => {
      const st = stickers.find((x) => x.id === id);
      if (!st) return;
      setActiveStickerId(id);
      aX.value = st.x;
      aY.value = st.y;
      aS.value = st.s;
      aR.value = st.r;
    },
    [stickers, aX, aY, aS, aR]
  );

  const deleteSticker = useCallback(
    (id: string) => {
      Alert.alert(
        t("storycompose.text.deleteTitle"),
        t("storycompose.text.deleteBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () => {
              setStickers((p) => p.filter((x) => x.id !== id));
              if (activeStickerId === id) setActiveStickerId(null);
            },
          },
        ]
      );
    },
    [activeStickerId, t]
  );


  /* ---------- Text Modal ---------- */

  const [textModalOpen, setTextModalOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftPreset, setDraftPreset] = useState<TextStylePreset>("classic");
  const [draftColor, setDraftColor] = useState("#ffffff");
  const [draftBgOn, setDraftBgOn] = useState(true);
  const [draftBgColor, setDraftBgColor] = useState("#000000");
  const [draftBgOpacity, setDraftBgOpacity] = useState(0.45);
  const [editingId, setEditingId] = useState<string | null>(null);

  const openNewText = useCallback(() => {
    setEditingId(null);
    setDraftText("");
    setDraftPreset("classic");
    setDraftColor("#ffffff");
    setDraftBgOn(true);
    setDraftBgColor("#000000");
    setDraftBgOpacity(0.45);
    setTextModalOpen(true);
  }, []);

  const openEditText = useCallback(
    (id: string) => {
      const st = stickers.find((x) => x.id === id);
      if (!st) return;
      setEditingId(id);
      setDraftText(st.text);
      setDraftPreset(st.preset);
      setDraftColor(st.color);
      setDraftBgOn(st.bgOn);
      setDraftBgColor(st.bgColor);
      setDraftBgOpacity(st.bgOpacity);
      setTextModalOpen(true);
    },
    [stickers]
  );

  const openEditActiveSticker = useCallback(() => {
    if (!activeStickerId) return;
    const id = activeStickerId;
    setTimeout(() => openEditText(id), 0);
  }, [activeStickerId, openEditText]);

  const saveTextSticker = useCallback(() => {
    const t = (draftText || "").trim();
    if (!t) {
      setTextModalOpen(false);
      return;
    }

    if (editingId) {
      setStickers((prev) =>
        prev.map((x) =>
          x.id === editingId
            ? { ...x, text: t, preset: draftPreset, color: draftColor, bgOn: draftBgOn, bgColor: draftBgColor, bgOpacity: draftBgOpacity }
            : x
        )
      );
      setTextModalOpen(false);
      return;
    }

    const id = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const created: TextSticker = {
      id,
      text: t,
      preset: draftPreset,
      color: draftColor,
      bgOn: draftBgOn,
      bgColor: draftBgColor,
      bgOpacity: draftBgOpacity,
      x: 0,
      y: 0,
      s: 1,
      r: 0,
    };

    setStickers((prev) => [...prev, created]);
    setTextModalOpen(false);
    requestAnimationFrame(() => activateSticker(id));
  }, [draftText, draftPreset, draftColor, draftBgOn, draftBgColor, draftBgOpacity, editingId, activateSticker]);

  /* ---------- Gestures ---------- */

  // ✅ media disabled while sticker active
  const mediaEnabled = !activeStickerId;

  const mediaPinch = Gesture.Pinch()
    .enabled(mediaEnabled)
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      scale.value = clampW(next, 0.25, 10.0, 1);
    });

  const mediaRotate = Gesture.Rotation()
    .enabled(mediaEnabled)
    .onBegin(() => {
      startRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      rotation.value = clampW(startRotation.value + e.rotation, -50, 50, 0);
    });

  const mediaPan = Gesture.Pan()
    .enabled(mediaEnabled)
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = clampW(startX.value + e.translationX, -9999, 9999, 0);
      translateY.value = clampW(startY.value + e.translationY, -9999, 9999, 0);
    });

  const mediaTransform = Gesture.Simultaneous(mediaPinch, mediaRotate, mediaPan);

  const mediaDoubleTap = Gesture.Tap()
    .enabled(mediaEnabled)
    .numberOfTaps(2)
    .maxDuration(280)
    .maxDistance(12)
    .onEnd(() => runOnJS(toggleFitMode)());

  // ✅ Exclusive prevents "jumping zoom" (doubletap won't fight pinch)
  const mediaGestures = Gesture.Exclusive(mediaDoubleTap, mediaTransform);

  // ✅ sticker overlay gestures (NO requireExternalGestureToFail -> no TS error)
  const stickerEnabled = !!activeStickerId;

  const stickerPan = Gesture.Pan()
    .enabled(stickerEnabled)
    .onBegin(() => {
      aStartX.value = aX.value;
      aStartY.value = aY.value;
    })
    .onUpdate((e) => {
      aX.value = clampW(aStartX.value + e.translationX, -9999, 9999, 0);
      aY.value = clampW(aStartY.value + e.translationY, -9999, 9999, 0);
    });

  const stickerPinch = Gesture.Pinch()
    .enabled(stickerEnabled)
    .onBegin(() => {
      aStartS.value = aS.value;
    })
    .onUpdate((e) => {
      const next = aStartS.value * e.scale;
      aS.value = clampW(next, 0.25, 10.0, 1);
    });

  const stickerRotate = Gesture.Rotation()
    .enabled(stickerEnabled)
    .onBegin(() => {
      aStartR.value = aR.value;
    })
    .onUpdate((e) => {
      aR.value = clampW(aStartR.value + e.rotation, -50, 50, 0);
    });

  const stickerTransform = Gesture.Simultaneous(stickerPan, stickerPinch, stickerRotate);

  // Tap: finish (only if it wasn't a transform)
  const stickerTapFinish = Gesture.Tap()
    .enabled(stickerEnabled)
    .maxDuration(220)
    .maxDistance(10)
    .onEnd(() => runOnJS(commitAndCloseSticker)());

  // DoubleTap: edit (only if it wasn't a transform)
  const stickerDoubleTapEdit = Gesture.Tap()
    .enabled(stickerEnabled)
    .numberOfTaps(2)
    .maxDuration(280)
    .maxDistance(12)
    .onEnd(() => runOnJS(openEditActiveSticker)());

  // ✅ Exclusive: doubleTap > tap > transforms
  const stickerOverlayAll = Gesture.Exclusive(stickerDoubleTapEdit, stickerTapFinish, stickerTransform);

  /* ---------- GraphQL ---------- */
  const [getUpload] = useMutation(GET_SIGNED_STORY_UPLOAD);
  const [createStory] = useMutation(CREATE_STORY, {
    refetchQueries: [
      { query: STORIES_FEED, variables: { offset: 0, limit: 20 } },
      { query: MY_STORIES },
      { query: MY_STORIES_RECENT },
    ],
    awaitRefetchQueries: true,
  });

  /* ---------- Prepare file ---------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        let srcUri = media.uri;
        let nameExt = extFromName(media.filename);

        if ((srcUri.startsWith("ph://") || srcUri.startsWith("content://")) && media.id) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(media.id);
            if (info.localUri) srcUri = info.localUri;
            if (!nameExt && (info as any).filename) nameExt = extFromName((info as any).filename);
          } catch {}
        }

        let finalExt = nameExt || (hasExt(srcUri) ? srcUri.split(".").pop()! : undefined);
        if (!finalExt) finalExt = pickExtFor(media.type);

        if (srcUri.startsWith("file://") && hasExt(srcUri)) {
          if (!alive) return;
          setFileUri(srcUri);
          setFileExt(finalExt);
        } else {
          const dest = `${FileSystem.cacheDirectory}story-${Date.now()}.${finalExt}`;
          await FileSystem.copyAsync({ from: srcUri, to: dest });
          if (!alive) return;
          setFileUri(dest);
          setFileExt(finalExt);
        }

        if (alive && media.type === "video") {
          try {
            const t = await VideoThumbnails.getThumbnailAsync(srcUri.startsWith("file://") ? srcUri : (srcUri as string), { time: 500 });
            if (alive) setPosterUri(t.uri);
          } catch {}
        }
      } catch (e: any) {
        if (alive) setLoadErr(e?.message || t("storycompose.errors.prepareLocalFile"));
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.uri, media.id, media.filename, media.type, t]);

  useEffect(() => {
    if (!fileUri) return;

    // Start: nichts abschneiden
    setFitMode("FIT");
    translateX.value = 0;
    translateY.value = 0;
    rotation.value = 0;
    scale.value = 1.0;
  }, [fileUri]);


  /* ---------- Extract bg color (photo only) ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!fileUri || isVideo) return;
      try {
        const tiny = await ImageManipulator.manipulateAsync(fileUri, [{ resize: { width: 32 } }], {
          format: ImageManipulator.SaveFormat.JPEG,
          compress: 0.6,
          base64: true,
        });
        if (!alive) return;
        if (tiny.base64) setBgColor(averageColorFromJpegBase64(tiny.base64));
        else setBgColor(COLORS.bg);
      } catch {
        if (!alive) return;
        setBgColor(COLORS.bg);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fileUri, isVideo, COLORS.bg]);

  /* ---------- Upload helpers ---------- */

  const getSize = async (uri: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      const s2 = (info as FileSystem.FileInfo & { size?: number }).size;
      if (typeof s2 === "number" && s2 > 0) return s2;
    } catch {}
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      if (typeof blob.size === "number" && blob.size > 0) return blob.size;
    } catch {}
    return 0;
  };

  const putToSignedUrl = async (putUrl: string, uri: string, mime: string) => {
    try {
      const res = await FileSystem.uploadAsync(putUrl, uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mime },
      });
      if (res.status >= 200 && res.status < 300) return { ok: true as const };
      return { ok: false as const, status: res.status, body: res.body };
    } catch {}

    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const put = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
      if (put.ok) return { ok: true as const };
      const body = await put.text().catch(() => "");
      return { ok: false as const, status: put.status, body };
    } catch (e: any) {
      return { ok: false as const, status: 0, body: String(e?.message || e) };
    }
  };

  const doUpload = async (uri: string, ext: string, kindOverride?: "photo" | "video") => {
    const kind = kindOverride ?? media.type;
    let mime = guessMime(ext, kind);
    const size = await getSize(uri);

    let { data } = await getUpload({ variables: { mime, size } });
    let { key, putUrl } = data.getSignedStoryUpload as { key: string; putUrl: string };

    let put = await putToSignedUrl(putUrl, uri, mime);
    if (put.ok) return { key, mime };

    if (Platform.OS === "ios" && kind === "video" && mime !== "video/quicktime") {
      mime = "video/quicktime";
      ({ data } = await getUpload({ variables: { mime, size } }));
      ({ key, putUrl } = data.getSignedStoryUpload);
      put = await putToSignedUrl(putUrl, uri, mime);
      if (put.ok) return { key, mime };
    }

    const s3err = parseS3Error((put as any).body);
    throw new Error(s3err || t("storycompose.errors.uploadFailedHttp", { status: (put as any).status ?? 0 }));
  };

  const exportEditedPhoto = async () => {
    if (activeStickerId) commitAndCloseSticker();

    const shot = await viewShotRef.current?.capture?.();
    if (!shot) throw new Error(t("storycompose.errors.exportFailed"));


    // 1) Infos holen (width/height vom Screenshot)
    const info = await ImageManipulator.manipulateAsync(shot, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
    const srcW = info.width ?? EXPORT_W;
    const srcH = info.height ?? EXPORT_H;

    // 2) Immer nach BREITE skalieren => Seiten bleiben 1:1 wie Preview
    const scale = EXPORT_W / srcW;
    const resizedH = Math.round(srcH * scale);

    const resized = await ImageManipulator.manipulateAsync(
      shot,
      [{ resize: { width: EXPORT_W } }], // ✅ nur width!
      { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
    );

    // 3) Wenn Höhe minimal abweicht: nur VERTIKAL zentriert croppen (niemals links/rechts!)
    if (resizedH > EXPORT_H) {
      const cropY = Math.floor((resizedH - EXPORT_H) / 2);
      const cropped = await ImageManipulator.manipulateAsync(
        resized.uri,
        [{ crop: { originX: 0, originY: cropY, width: EXPORT_W, height: EXPORT_H } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      );
      return cropped.uri;
    }

    // Wenn minimal kleiner (sollte fast nie passieren): einfach so lassen (kein Seiten-Crop)
    return resized.uri;
  };


  const share = async () => {
    try {
      if (!fileUri) throw new Error(t("storycompose.errors.fileNotReady"));
      setBusy(true);
      setLoadErr(null);

      if (activeStickerId) commitAndCloseSticker();

      let uploadUri = fileUri;
      let uploadExt = fileExt;

      if (!isVideo) {
        uploadUri = await exportEditedPhoto();
        uploadExt = "jpg";
      }

      const { key, mime } = await doUpload(uploadUri, uploadExt, isVideo ? "video" : "photo");

      let thumbKey: string | undefined;
      if (isVideo && posterUri) {
        try {
          const tSize = await getSize(posterUri);
          const { data: up } = await getUpload({ variables: { mime: "image/jpeg", size: tSize } });
          const { key: tKey, putUrl: tUrl } = up.getSignedStoryUpload;
          const ok = await putToSignedUrl(tUrl, posterUri, "image/jpeg");
          if (ok.ok) thumbKey = tKey;
        } catch {}
      }

      const durationSec = isVideo ? toIntSeconds(media.duration) : null;
      const edit = {
        fitMode,
        media: {
          x: translateX.value,
          y: translateY.value,
          s: scale.value,
          r: rotation.value,
        },
        stickers, // TextSticker[] (id,text,preset,color,bgOn,bgColor,bgOpacity,x,y,s,r)
      };

      await createStory({
        variables: {
          input: {
            key,
            mime,
            duration: durationSec,
            isCloseFriends: false,
            thumbKey,
            editJson: JSON.stringify(edit),
          },
        },
      });


      nav.goBack();
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("common.unknownError"));
    } finally {
      setBusy(false);
    }
  };

  const dur = Math.max(0, Math.floor(toIntSeconds(media.duration) ?? 0));
  const durLabel = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}`;
  const overrideExtAndroid = isVideo ? (fileExt || "mp4") : undefined;

  // Theme
  const rootBg = COLORS.bg ?? "#000";
  const closeBg =
    typeof COLORS.card === "string" && COLORS.card.startsWith("#") ? hexToRgba(COLORS.card, 0.72) : "rgba(0,0,0,0.45)";
  const ctaBg =
    typeof COLORS.card === "string" && COLORS.card.startsWith("#") ? hexToRgba(COLORS.card, 0.92) : "rgba(0,0,0,0.82)";

  // ✅ Always dark shading -> no big white band in light theme
  const shadeTop = "rgba(0,0,0,0)";
  const shadeBottom = "rgba(0,0,0,0.38)";

  // Close not too high
  const closeTop = Math.max(12, (insets?.top ?? 0) );

  // CTA not too low (fix: button too far down)
  const ctaBottom = Math.max(10, (insets?.bottom ?? 0) );

  // Smaller shade height (fix: huge white/empty area)
  const ctaShadeH = ctaBottom + CTA_H + 16;

  return (
    <Screen scroll={false}>
      <View style={[s.root, { backgroundColor: rootBg }]}>
        {/* CAPTURE AREA (exact story) */}
        <ViewShot
          ref={viewShotRef}
          style={[
            s.canvas,
            {
              width: CANVAS.canvasW,
              height: CANVAS.canvasH,
              left: CANVAS.left,
              top: CANVAS.top,
            },
          ]}
          options={{ format: "jpg", quality: 0.98, result: "tmpfile" }}
        >
          <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: bgColor }, bgAnimatedStyle]} />
          <LinearGradient colors={["rgba(0,0,0,0.14)", "rgba(0,0,0,0.03)", "rgba(0,0,0,0.14)"]} style={StyleSheet.absoluteFillObject} />

          {/* MEDIA */}
          <GestureDetector gesture={mediaGestures}>
            <Animated.View style={StyleSheet.absoluteFillObject}>
              <Animated.View style={[StyleSheet.absoluteFillObject, fgStyle]}>
                {isVideo ? (
                  fileUri ? (
                    <Video
                      key={fileUri}
                      source={{ uri: fileUri, overrideFileExtensionAndroid: overrideExtAndroid as any }}
                      style={StyleSheet.absoluteFillObject}
                      resizeMode={fitMode === "FIT" ? ResizeMode.CONTAIN : ResizeMode.COVER}
                      shouldPlay
                      isLooping
                      usePoster={!!posterUri}
                      posterSource={posterUri ? { uri: posterUri } : undefined}
                      onLoadStart={() => setLoadErr(null)}
                      onError={(e) => {
                        setLoadErr(t("storycompose.errors.videoLoadFailed"));
                        console.warn("Video load error", e);
                      }}
                    />
                  ) : (
                    <View style={s.centerOverlay}>
                      <ActivityIndicator />
                    </View>
                  )
                ) : (
                  <ExpoImage
                    source={{ uri: fileUri }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit={fitMode === "FIT" ? "contain" : "cover"}
                    cachePolicy="memory-disk"
                    transition={120}
                  />
                )}
              </Animated.View>
            </Animated.View>
          </GestureDetector>

          {isVideo && (
            <View style={s.badgeTopLeft}>
              <Text style={s.badgeTxt}>⏱ {durLabel}</Text>
            </View>
          )}

          {/* STICKERS */}
          {stickers.map((st) => (
            <StickerItem
              key={st.id}
              sticker={st}
              isActive={activeStickerId === st.id}
              onActivate={activateSticker}
              onDelete={deleteSticker}
              aX={aX}
              aY={aY}
              aS={aS}
              aR={aR}
            />
          ))}

          {/* ACTIVE STICKER OVERLAY */}
          {activeStickerId && (
            <GestureDetector gesture={stickerOverlayAll}>
              <Animated.View style={[StyleSheet.absoluteFillObject, { zIndex: 999 }]} />
            </GestureDetector>
          )}

          {!!loadErr && (
            <View style={s.errorOverlay}>
              <Text style={s.errorTxt}>{loadErr}</Text>
            </View>
          )}
        </ViewShot>

        {/* Overlays (NOT captured) */}
        <View style={[s.closeWrap, { top: closeTop }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => {
              if (activeStickerId) commitAndCloseSticker();
              nav.goBack();
            }}
            style={[s.closeBtn, { backgroundColor: closeBg, borderColor: COLORS.border }]}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/*  Text Tool 

        <View style={[s.toolsWrap, { top: closeTop }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => {
              if (activeStickerId) commitAndCloseSticker();
              openNewText();
            }}
            style={[s.toolBtn, { backgroundColor: closeBg, borderColor: COLORS.border }]}
            activeOpacity={0.9}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>Aa</Text>
          </TouchableOpacity>
        </View>*/}

        {/* CTA shade */}
        <View style={[s.ctaShade, { left: CANVAS.left, width: CANVAS.canvasW, height: ctaShadeH }]} pointerEvents="none">
          <LinearGradient colors={[shadeTop, shadeBottom]} style={StyleSheet.absoluteFillObject} />
        </View>

        {/* CTA */}
        <View style={[s.ctaWrap, { left: CANVAS.left, width: CANVAS.canvasW, bottom: ctaBottom }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={share}
            disabled={busy || !fileUri}
            style={[s.ctaBtn, { backgroundColor: ctaBg, borderColor: COLORS.border }, (busy || !fileUri) && s.btnDisabled]}
            activeOpacity={0.9}
          >
            {busy ? <ActivityIndicator /> : <Text style={[s.ctaTxt, { color: COLORS.text }]}>{t("storycompose.yourStory")}</Text>}
          </TouchableOpacity>
        </View>

        {/* Text Modal */}
        <Modal visible={textModalOpen} transparent animationType="fade" onRequestClose={() => setTextModalOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalWrap}>
            <Pressable style={s.modalBackdrop} onPress={() => setTextModalOpen(false)} />

            <View style={[s.modalCard, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => setTextModalOpen(false)} style={s.modalIconBtn} activeOpacity={0.85}>
                  <Ionicons name="close" size={18} color={COLORS.text} />
                </TouchableOpacity>

                <Text style={[s.modalTitle, { color: COLORS.text }]}>
                  {t("storycompose.text.title")}
                </Text>


                <TouchableOpacity onPress={saveTextSticker} style={s.modalIconBtn} activeOpacity={0.85}>
                  <Ionicons name="checkmark" size={20} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder={t("storycompose.typeText")}
                placeholderTextColor={COLORS.subtext}
                autoFocus
                multiline
                style={[s.input, { color: COLORS.text, borderColor: COLORS.border }]}
              />

              <View style={s.presetRow}>
                {(["classic", "strong", "mono"] as TextStylePreset[]).map((p) => {
                  const active = draftPreset === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setDraftPreset(p)}
                      style={[
                        s.presetPill,
                        {
                          backgroundColor: active ? hexToRgba(COLORS.text ?? "#ffffff", 0.12) : "transparent",
                          borderColor: COLORS.border,
                        },
                      ]}
                      activeOpacity={0.9}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: active ? "900" : "700" }}>
                        {t(`storycompose.text.preset.${p}`)}
                      </Text>

                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.colorRow}>
                {["#ffffff", "#000000", "#ff2d55", "#34c759", "#0a84ff", "#ffd60a"].map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setDraftColor(c)}
                    style={[
                      s.colorDot,
                      {
                        backgroundColor: c,
                        borderColor: draftColor === c ? COLORS.text : COLORS.border,
                        borderWidth: draftColor === c ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                    activeOpacity={0.9}
                  />
                ))}
              </View>

              <View style={s.bgRow}>
                <TouchableOpacity
                  onPress={() => setDraftBgOn((v) => !v)}
                  style={[
                    s.bgToggle,
                    {
                      borderColor: COLORS.border,
                      backgroundColor: draftBgOn ? hexToRgba(COLORS.text ?? "#ffffff", 0.10) : "transparent",
                    },
                  ]}
                  activeOpacity={0.9}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    {draftBgOn ? t("storycompose.text.background.on") : t("storycompose.text.background.off")}
                  </Text>
                </TouchableOpacity>

                {draftBgOn && (
                  <View style={s.bgMiniRow}>
                    {["#000000", "#ffffff"].map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setDraftBgColor(c)}
                        style={[
                          s.bgDot,
                          {
                            backgroundColor: c,
                            borderColor: draftBgColor === c ? COLORS.text : COLORS.border,
                            borderWidth: draftBgColor === c ? 2 : StyleSheet.hairlineWidth,
                          },
                        ]}
                        activeOpacity={0.9}
                      />
                    ))}

                    {[0.3, 0.45, 0.6].map((o) => (
                      <TouchableOpacity
                        key={String(o)}
                        onPress={() => setDraftBgOpacity(o)}
                        style={[
                          s.opacityPill,
                          {
                            borderColor: COLORS.border,
                            backgroundColor: Math.abs(draftBgOpacity - o) < 0.001 ? hexToRgba(COLORS.text ?? "#ffffff", 0.10) : "transparent",
                          },
                        ]}
                        activeOpacity={0.9}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12 }}>{Math.round(o * 100)}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 10 }}>
                {t("storycompose.text.help")}
              </Text>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Screen>
  );
}

/** ---------- Styles ---------- */
const styles = (COLORS: any) =>
  StyleSheet.create({
    root: { flex: 1 },
    canvas: { position: "absolute", overflow: "hidden", backgroundColor: "transparent" },

    centerOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },

    badgeTopLeft: {
      position: "absolute",
      top: 10,
      left: 10,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    badgeTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },

    errorOverlay: {
      position: "absolute",
      left: 10,
      right: 10,
      bottom: 10,
      backgroundColor: "rgba(239,68,68,0.92)",
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.25)",
    },
    errorTxt: { color: "#fff", fontWeight: "900" },

    closeWrap: { position: "absolute", left: 12, zIndex: 50 },
    closeBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },

    toolsWrap: { position: "absolute", right: 12, zIndex: 50 },
    toolBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },

    ctaShade: { position: "absolute", bottom: 0, zIndex: 40 },
    ctaWrap: { position: "absolute", paddingHorizontal: CTA_SIDE_PAD, zIndex: 45 },
    ctaBtn: {
      height: CTA_H,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
    },
    ctaTxt: { fontWeight: "900" },
    btnDisabled: { opacity: 0.55 },

    modalWrap: { flex: 1, justifyContent: "center" },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
    modalCard: { marginHorizontal: 16, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    modalTitle: { fontWeight: "900", fontSize: 16 },
    modalIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
    input: { minHeight: 120, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, fontWeight: "700" },
    presetRow: { flexDirection: "row", gap: 10, marginTop: 10 },
    presetPill: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
    colorRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    colorDot: { width: 26, height: 26, borderRadius: 13 },

    bgRow: { marginTop: 12 },
    bgToggle: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
    bgMiniRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" },
    bgDot: { width: 24, height: 24, borderRadius: 12 },
    opacityPill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  });
