// =============================================
// File: apps/ciaorelated/src/screens/create/StoryWizard.tsx
// Fullscreen Story flow: capture/select + image/video, single shutter (tap/long-press)
// + Preview Editor: pan/pinch/rotate + double-tap FIT/FILL + X close top-left
// Themed like ProfileUnifiedScreen (ThemeProvider + Ionicons, card/border/bg)
// UI change:
// - "Wählen" icon button top-right
// - bottom center: shutter (camera) OR send (when picked) at same position/height
// =============================================
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  FlatList,
  PanResponder,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { Camera, CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { Video, ResizeMode } from "expo-av";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useIsFocused } from "@react-navigation/native";

import ViewShot from "react-native-view-shot";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeProvider";

import { hapticImpact, hapticSuccess } from "../../lib/safeHaptics";
import { STORIES_FEED, MY_STORIES, MY_STORIES_RECENT } from "../../graphql/queries/stories";
import { StoryCamera, type Shot } from "./components/StoryCamera";
import { avatarPlaceholder } from "../../../assets/placeholders";
import * as MediaLibrary from "expo-media-library";


import { useTranslation } from "react-i18next";
import i18n from "../../i18n";

const { width: W, height: H } = Dimensions.get("window");

type PropsS = {
  onDone: () => void;
  onToggleBottomBar: (visible: boolean) => void;
  onSetTitle?: (t: string) => void;
  sharePostId?: string | null;
  onRegisterBarActions?: (a: { pick: () => void; flip: () => void; canPick?: boolean; canFlip?: boolean } | null) => void;
  onLastAssetUri?: (uri: string | null) => void;
};

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
const SHARE_POST = gql`
  query SharePostToStory($id: ID!) {
    post(id: $id) {
      id
      caption
      imageUrl
      thumbUrl
      videoUrl
      isCarousel
      media {
        id
        kind
        imageUrl
        thumbUrl
        videoUrl
      }
      author {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
    }
  }
`;

const ME_FOR_STORY = gql`
  query MeForStoryTools {
    me {
      id
      username
      avatarUrl
      avatarThumbUrl
      city
    }
  }
`;

const SEARCH_STORY_MENTION_USERS = gql`
  query SearchStoryMentionUsers($q: String!, $limit: Int) {
    searchUsers(q: $q, limit: $limit) {
      id
      username
      avatarUrl
      avatarThumbUrl
    }
  }
`;

const SEARCH_PLACES = gql`
  query SearchStoryPlaces($q: String!, $limit: Int) {
    searchPlaces(q: $q, limit: $limit) {
      id
      title
      subtitle
      lat
      lng
    }
  }
`;

/** -------- Helpers -------- */

type FitMode = "FIT" | "FILL";

function computeCanvas() {
  // ✅ Editor immer fullscreen, kein Letterboxing/Schwarz oben
  return { canvasW: W, canvasH: H, left: 0, top: 0 };
}
const CANVAS = computeCanvas();


const EXPORT_W = 1080;
const EXPORT_H = 1920;

const hexToRgba = (hex: string, a: number) => {
  const h = (hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
};

async function exportEditedPhoto(viewShotRef: React.RefObject<ViewShot | null>) {
  const shot = await viewShotRef.current?.capture?.();
  if (!shot) throw new Error(i18n.t("storycompose.errors.exportFailed"));

  // ✅ kein forced 1080x1920, kein crop
  const out = await ImageManipulator.manipulateAsync(
    shot,
    [], // nothing
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );

  return out.uri;
}


type Picked =
  | { type: "photo"; uri: string; width?: number; height?: number }
  | { type: "video"; uri: string; duration?: number };

type StoryOverlay =
  | { id: string; kind: "text"; text: string; color: string; bg: string; x: number; y: number; size: number }
  | { id: string; kind: "sticker"; variant?: "plain"; text: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; x: number; y: number }
  | { id: string; kind: "link"; text: string; url: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; x: number; y: number }
  | { id: string; kind: "mention"; text: string; username: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; x: number; y: number }
  | { id: string; kind: "location"; text: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; x: number; y: number }
  | { id: string; kind: "poll"; question: string; options: string[]; color: string; bg: string; x: number; y: number }
  | { id: string; kind: "question"; prompt: string; placeholder: string; avatarUri?: string | null; color: string; bg: string; x: number; y: number };

const overlayId = () => `story_overlay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const STORY_TEXT_COLORS = ["#FFFFFF", "#111827", "#F97316", "#EC4899", "#22C55E", "#60A5FA", "#FACC15"];
type ToolModal = "link" | "mention" | "location" | "poll" | "question" | null;

type PlaceSuggestion = {
  id?: string;
  title: string;
  subtitle?: string | null;
  lat?: number;
  lng?: number;
};

function useDebouncedValue<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}


async function pickStory(setPicked: (p: Picked) => void, t: any) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    return Alert.alert(t("storywizard.pick.permissionTitle"), t("storywizard.pick.permissionBody"));
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsEditing: false,
    quality: 1,
    videoMaxDuration: 30,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  if (res.canceled) return;

  const a = res.assets[0];
  if (a.type === "video") {
    const raw = (a as any).duration ?? 0;
    const sec = raw > 1800 ? Math.round(raw / 1000) : Math.round(raw);
    if (sec > 30) return Alert.alert(t("storywizard.pick.videoTooLongTitle"), t("storywizard.pick.videoTooLongBody"));
    setPicked({ type: "video", uri: a.uri, duration: sec });
  } else {
    setPicked({ type: "photo", uri: a.uri, width: a.width, height: a.height });
  }
}
const STORY_BG_PALETTE = [
  "#0B0F1A",
  "#1D1636",
  "#1C2A5A",
  "#3A1457",
  "#0F2E2B",
  "#2B1B11",
  "#1E1E1E",
  "#0B2A4F",
];

function hashToIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return mod ? h % mod : 0;
}

async function cropToStageAspect(
  uri: string,
  w: number | undefined,
  h: number | undefined,
  stageW: number,
  stageH: number
) {
  if (!w || !h) return uri;

  const stageAspect = stageW / stageH;
  const imgAspect = w / h;

  let cropW = w;
  let cropH = h;
  let originX = 0;
  let originY = 0;

  if (imgAspect > stageAspect) {
    // zu breit -> links/rechts weg
    cropW = Math.round(h * stageAspect);
    originX = Math.round((w - cropW) / 2);
  } else {
    // zu hoch -> oben/unten weg
    cropH = Math.round(w / stageAspect);
    originY = Math.round((h - cropH) / 2);
  }

  const out = await ImageManipulator.manipulateAsync(
    uri,
    [
      { rotate: 0 }, // ✅ EXIF/Orientation “baken”
      { crop: { originX, originY, width: cropW, height: cropH } },
    ],
    { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
  );

  return out.uri;
}

function getImageSize(uri: string) {
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ w, h }),
      (e) => reject(e)
    );
  });
}

async function bakeStoryJpeg(uri: string, w?: number, h?: number) {
  const screenAspect = W / H; // device aspect (9:16-ish)
  let actions: ImageManipulator.Action[] = [];

  if (w && h) {
    const imgAspect = w / h;

    let cropW = w, cropH = h, originX = 0, originY = 0;

    if (imgAspect > screenAspect) {
      cropW = Math.round(h * screenAspect);
      originX = Math.round((w - cropW) / 2);
    } else {
      cropH = Math.round(w / screenAspect);
      originY = Math.round((h - cropH) / 2);
    }

    actions.push({ crop: { originX, originY, width: cropW, height: cropH } });
  }

  actions.push({ resize: { width: 1080, height: 1920 } });

  const out = await ImageManipulator.manipulateAsync(
    uri,
    actions,
    { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG }
  );
  return out.uri;
}


/** -------- StoryWizard -------- */
export function StoryWizard({ onDone, onToggleBottomBar, onSetTitle, sharePostId, onRegisterBarActions, onLastAssetUri }: PropsS) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = styles(COLORS);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [overlays, setOverlays] = useState<StoryOverlay[]>([]);
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [toolModal, setToolModal] = useState<ToolModal>(null);
  const [draftText, setDraftText] = useState("");
  const [draftColor, setDraftColor] = useState("#FFFFFF");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollA, setPollA] = useState("Ja");
  const [pollB, setPollB] = useState("Nein");
  const [pollExtraOptions, setPollExtraOptions] = useState<string[]>([]);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [locationResults, setLocationResults] = useState<PlaceSuggestion[]>([]);
  const overlayDragRef = useRef<{ id: string; startX: number; startY: number; pageX: number; pageY: number; moved: boolean } | null>(null);
  const [overlayDragActive, setOverlayDragActive] = useState(false);
  const [overlayDragOverTrash, setOverlayDragOverTrash] = useState(false);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const viewShotRef = useRef<ViewShot | null>(null);
  const bgShotRef = useRef<ViewShot | null>(null);

  const STORY_BAR_BASE_H = 98;

  // ✅ Media ist größer, nicht verschoben
  const stageTop = 0;
  const reservedBottom = STORY_BAR_BASE_H + (insets.bottom ?? 0);

  const stageW = W;
  const stageH = Math.max(1, H - reservedBottom - (insets.top ?? 0));



  // Optional: Background im freien Bereich (unten)
  const freeAreaBg = COLORS.bg; // oder COLORS.bg / "#000"

    


  const [fitMode, setFitMode] = useState<FitMode>("FIT");
  const [camReady, setCamReady] = useState(false);

  const [cameraKey, setCameraKey] = useState(0);
  const cameraRemountAttemptedRef = useRef(false);

  // media transform
  const scale = useSharedValue(1.0);
  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // ✅ shared post sticker transform (only in shareMode)
  const pX = useSharedValue(0);
  const pY = useSharedValue(0);
  const pS = useSharedValue(1);
  const pR = useSharedValue(0);
  const fromCameraRef = useRef(false);


  const pStartX = useSharedValue(0);
  const pStartY = useSharedValue(0);
  const pStartS = useSharedValue(1);
  const pStartR = useSharedValue(0);

  const POST_W = 320;
  const [postH, setPostH] = React.useState(52 + 320 + 48); // header + media + caption bar (default)
  const [timerSec, setTimerSec] = useState<0 | 3 | 10>(0);
  const [countdown, setCountdown] = useState<number>(0);
  const [videoThumbFrameUri, setVideoThumbFrameUri] = useState<string | null>(null);
  const [exportingThumb, setExportingThumb] = useState(false);

  async function ensureVideoThumbFrame(uri: string) {
    if (videoThumbFrameUri) return videoThumbFrameUri;
    const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 700 });
    setVideoThumbFrameUri(thumb.uri);
    return thumb.uri;
  }

  function nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  useEffect(() => {
  if (!picked) return;

  // 🔁 Transform-States komplett zurücksetzen
  scale.value = 1;
  startScale.value = 1;

  pX.value = 0;
  pY.value = 0;
  pStartX.value = 0;
  pStartY.value = 0;

  rotation.value = 0;
  pStartR.value = 0;

  // falls vorhanden: Fit-Modus neutral starten
  setFitMode?.("FIT");
}, [picked]);


  useEffect(() => {
    if (picked) {
      setCountdown(0);
    }
  }, [picked]);

  useEffect(() => {
    if (picked || camReady) return;
    if (cameraRemountAttemptedRef.current) return;

    const t = setTimeout(() => {
      if (camReady || picked || cameraRemountAttemptedRef.current) return;
      cameraRemountAttemptedRef.current = true;
      setCameraKey((k) => k + 1);
    }, 8000);

    return () => clearTimeout(t);
  }, [camReady, picked]);


  useEffect(() => {
  if (!isFocused) return;
  if (!picked) {
    cameraRemountAttemptedRef.current = false;
    setCamReady(false); // nur wenn wir wirklich Kamera anzeigen
  }
}, [isFocused, picked]);



  const postPan = Gesture.Pan()
    .onBegin(() => {
      pStartX.value = pX.value;
      pStartY.value = pY.value;
    })
    .onUpdate((e) => {
      pX.value = pStartX.value + e.translationX;
      pY.value = pStartY.value + e.translationY;
    });

  const postPinch = Gesture.Pinch()
    .onBegin(() => {
      pStartS.value = pS.value;
    })
    .onUpdate((e) => {
      const next = pStartS.value * e.scale;
      pS.value = Math.max(0.5, Math.min(2.3, next));
    });

  const postRotate = Gesture.Rotation()
    .onBegin(() => {
      pStartR.value = pR.value;
    })
    .onUpdate((e) => {
      pR.value = Math.max(-3.5, Math.min(3.5, pStartR.value + e.rotation));
    });

  const postGestures = Gesture.Simultaneous(postPan, postPinch, postRotate);

  const postStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pX.value },
      { translateY: pY.value },
      { rotateZ: `${pR.value}rad` },
      { scale: pS.value },
    ],
  }));



  const shareMode = !!sharePostId;
  const canShare = shareMode ? true : !!picked;

  const [lastAssetUri, setLastAssetUri] = useState<string | null>(null);

  async function loadLastAssetPreview() {
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (perm.status !== "granted") {
        const req = await MediaLibrary.requestPermissionsAsync();
        if (req.status !== "granted") return;
      }

      const assets = await MediaLibrary.getAssetsAsync({
        first: 1,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      const uri = assets.assets?.[0]?.uri ?? null;
      if (!uri) return;

      // ✅ prefetch (damit ExpoImage schneller rendert)
      try {
        await ExpoImage.prefetch(uri);
      } catch {}

      setLastAssetUri(uri);
      onLastAssetUri?.(uri);
    } catch (e) {
      console.warn("loadLastAssetPreview error", e);
    }
  }


  // 1) Beim Mount einmal (früh)
  useEffect(() => {
    if (!shareMode) void loadLastAssetPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Beim Focus nur refreshen, wenn gerade Kamera view aktiv ist
  useEffect(() => {
    if (!shareMode && isFocused && !picked) {
      void loadLastAssetPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, picked?.uri, shareMode]);



  const { data: shareData, loading: shareLoading } = useQuery(SHARE_POST, {
    variables: { id: sharePostId as string },
    skip: !sharePostId,
  });
  const { data: meData } = useQuery(ME_FOR_STORY, { fetchPolicy: "cache-first" });
  const me = meData?.me ?? null;
  const [searchMentionUsers, { data: mentionSearchData }] = useLazyQuery(SEARCH_STORY_MENTION_USERS, {
    fetchPolicy: "cache-and-network",
  });
  const [runPlaceSearch, placeSearch] = useLazyQuery(SEARCH_PLACES, {
    fetchPolicy: "network-only",
  });
  const debouncedLocationQuery = useDebouncedValue(locationQuery, 300);

  const sharePost = shareData?.post ?? null;
  const shareAuthorAvatar =
    sharePost?.author?.avatarThumbUrl ||
    sharePost?.author?.avatarUrl ||
    avatarPlaceholder;

  const asExpoSource = (src: any) => {
    if (!src) return undefined;
    if (typeof src === "string") return { uri: src };
    return src; // require(...) etc.
  };



  const first = sharePost?.media?.[0] ?? null;
  const [torch, setTorch] = useState(false);

  const stickerOptions = React.useMemo(
    () => [
      { tool: "location" as const, label: t("storywizard.stickers.location"), icon: "location-outline" as const, color: "#8B5CF6" },
      { tool: "mention" as const, label: t("storywizard.stickers.mention"), icon: "at-outline" as const, color: "#F97316" },
      { tool: "question" as const, label: t("storywizard.stickers.question"), icon: "help-circle-outline" as const, color: "#D946EF" },
      { tool: "poll" as const, label: t("storywizard.stickers.poll"), icon: "options-outline" as const, color: "#3B82F6" },
      { tool: "link" as const, label: t("storywizard.stickers.link"), icon: "link-outline" as const, color: "#0EA5E9" },
    ],
    [t]
  );

  const addTextOverlay = React.useCallback(() => {
    const text = draftText.trim();
    if (!text) return;
    setOverlays((prev) => {
      if (editingOverlayId) {
        return prev.map((o) => (o.id === editingOverlayId && o.kind === "text" ? { ...o, text, color: draftColor } : o));
      }
      return [
        ...prev,
        {
          id: overlayId(),
          kind: "text",
          text,
          color: draftColor,
          bg: "rgba(0,0,0,0.34)",
          x: W / 2,
          y: stageH * 0.42,
          size: 30,
        },
      ];
    });
    setDraftText("");
    setEditingOverlayId(null);
    setTextEditorOpen(false);
  }, [draftColor, draftText, editingOverlayId, stageH]);

  const addOverlay = React.useCallback((overlay: any, yRatio = 0.46) => {
    setOverlays((prev) => {
      if (editingOverlayId) {
        return prev.map((item) =>
          item.id === editingOverlayId
            ? ({ ...item, ...overlay, id: item.id, x: item.x, y: item.y } as StoryOverlay)
            : item
        );
      }
      return [
        ...prev,
        {
          ...overlay,
          id: overlayId(),
          x: W / 2,
          y: stageH * yRatio,
        } as StoryOverlay,
      ];
    });
    setEditingOverlayId(null);
  }, [editingOverlayId, stageH]);

  const openTool = React.useCallback((tool: ToolModal) => {
    if (!tool) return;
    setEditingOverlayId(null);
    if (tool === "location") setLocationQuery("");
    if (tool === "mention") setMentionQuery("");
    if (tool === "link") {
      setLinkUrl("");
      setLinkLabel("");
    }
    if (tool === "poll") {
      setPollQuestion("");
      setPollA(t("storywizard.poll.yes"));
      setPollB(t("storywizard.poll.no"));
      setPollExtraOptions([]);
    }
    if (tool === "question") setQuestionPrompt(t("storywizard.question.defaultPrompt"));
    setToolModal(tool);
  }, [t]);

  const removeOverlay = React.useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const editOverlay = React.useCallback((o: StoryOverlay) => {
    setEditingOverlayId(o.id);
    if (o.kind === "text") {
      setDraftText(o.text);
      setDraftColor(o.color);
      setTextEditorOpen(true);
      return;
    }
    if (o.kind === "link") {
      setLinkUrl(o.url);
      setLinkLabel(o.text);
      setToolModal("link");
      return;
    }
    if (o.kind === "mention") {
      setMentionQuery(o.username || o.text.replace(/^@/, ""));
      setToolModal("mention");
      return;
    }
    if (o.kind === "location") {
      setLocationQuery(o.text);
      setToolModal("location");
      return;
    }
    if (o.kind === "poll") {
      setPollQuestion(o.question);
      setPollA(o.options[0] || t("storywizard.poll.yes"));
      setPollB(o.options[1] || t("storywizard.poll.no"));
      setPollExtraOptions(o.options.slice(2, 4));
      setToolModal("poll");
      return;
    }
    if (o.kind === "question") {
      setQuestionPrompt(o.prompt);
      setToolModal("question");
    }
  }, [t]);

  const moveOverlay = React.useCallback((id: string, x: number, y: number) => {
    const nextX = Math.max(36, Math.min(W - 36, x));
    const nextY = Math.max(36, Math.min(stageH - 36, y));
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, x: nextX, y: nextY } : o)));
  }, [stageH]);

  const shareMediaUrl =
    // ✅ 1) Carousel first item
    first?.thumbUrl ||
    first?.imageUrl ||
    // ✅ 2) Single post
    sharePost?.thumbUrl ||
    sharePost?.imageUrl ||
    // ✅ 3) If only videoUrl exists, we still need a thumb; fallback stays null
    null;

  const isShareVideo =
    (first?.kind === "VIDEO") ||
    (!!first?.videoUrl) ||
    (!!sharePost?.videoUrl);

  const bgColor = React.useMemo(() => {
    const key = shareMediaUrl ?? sharePostId ?? "story";
    return STORY_BG_PALETTE[hashToIndex(key, STORY_BG_PALETTE.length)];
  }, [shareMediaUrl, sharePostId]);

  const editorBg = shareMode ? bgColor : (COLORS.bg ?? "#000");


  const clampW = (v: number, min: number, max: number, fallback: number) => {
    "worklet";
    if (!Number.isFinite(v) || Number.isNaN(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  };

  const resetTransform = (nextMode?: FitMode) => {
    translateX.value = 0;
    translateY.value = 0;
    rotation.value = 0;
    const m = nextMode ?? fitMode;
    scale.value = m === "FIT" ? 1.0 : 1.15;
  };

  useEffect(() => {
    setOverlays([]);
    setTextEditorOpen(false);
    setEditingOverlayId(null);
    setToolModal(null);
    setDraftText("");
  }, [picked?.uri]);

  useEffect(() => {
    if (toolModal !== "mention") return;
    const q = mentionQuery.trim().replace(/^@/, "");
    if (q.length < 1) return;
    const timer = setTimeout(() => {
      searchMentionUsers({ variables: { q, limit: 12 } }).catch(() => {});
    }, 180);
    return () => clearTimeout(timer);
  }, [mentionQuery, searchMentionUsers, toolModal]);

  useEffect(() => {
    if (!picked) return;
    const next: FitMode = fromCameraRef.current ? "FILL" : "FIT";
    setFitMode(next);
    resetTransform(next);
    fromCameraRef.current = false;
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.uri]);

  useEffect(() => {
    setVideoThumbFrameUri(null);
    setExportingThumb(false);
  }, [picked?.uri]);

  const toggleFitMode = () => {
    setFitMode((m) => {
      const next = m === "FIT" ? "FILL" : "FIT";
      resetTransform(next);
      return next;
    });
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      scale.value = clampW(next, 0.25, 10.0, 1);
    });

  const rotateG = Gesture.Rotation()
    .onBegin(() => {
      startRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      rotation.value = clampW(startRotation.value + e.rotation, -50, 50, 0);
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = clampW(startX.value + e.translationX, -9999, 9999, 0);
      translateY.value = clampW(startY.value + e.translationY, -9999, 9999, 0);
    });

  const transform = Gesture.Simultaneous(pinch, rotateG, pan);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .maxDistance(12)
    .onEnd(() => runOnJS(toggleFitMode)());

  const mediaGestures = Gesture.Exclusive(doubleTap, transform);

  const fgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${rotation.value}rad` },
      { scale: scale.value },
    ],
  }));

  const [getSigned] = useMutation(GET_SIGNED_STORY_UPLOAD);
  const [createStory] = useMutation(CREATE_STORY, {
    refetchQueries: [
      { query: STORIES_FEED, variables: { offset: 0, limit: 20 } },
      { query: MY_STORIES },
      { query: MY_STORIES_RECENT },
    ],
  });

  useEffect(() => {
    onToggleBottomBar(true);

    if (shareMode) onSetTitle?.("Story teilen");
    else onSetTitle?.(picked ? "Story teilen" : "Neue Story");

  }, [picked, onSetTitle, onToggleBottomBar, shareMode]);

  async function putToSignedUrl(putUrl: string, fileUri: string, mime: string) {
    try {
      const res = await FileSystem.uploadAsync(putUrl, fileUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mime },
      });
      if (res.status === 200 || res.status === 204) return true;
    } catch {}

    const fileResp = await fetch(fileUri);
    const blob = await fileResp.blob();
    const put = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
    return put.ok;
  }

  const [facing, setFacing] = useState<"back" | "front">("back");

  

  const toggleFacing = React.useCallback(() => {
    setFacing((p) => {
      const next = p === "back" ? "front" : "back";
      if (next === "front") setTorch(false);
      return next;
    });
  }, []);

  const pickFromBar = React.useCallback(() => {
  if (countdown > 0) return;
  if (picked) return;
  fromCameraRef.current = false;
  void pickStory(setPicked, t);
}, [countdown, picked]);

const flipFromBar = React.useCallback(() => {
  if (countdown > 0) return;
  if (picked) return;
  toggleFacing();
}, [countdown, picked, toggleFacing]);

const barActions = React.useMemo(() => ({
  pick: pickFromBar,
  flip: flipFromBar,
  canPick: countdown === 0 && !picked,
  canFlip: countdown === 0 && !picked,
}), [pickFromBar, flipFromBar, countdown, picked]);

useEffect(() => {
  onRegisterBarActions?.(barActions);
  return () => onRegisterBarActions?.(null);
}, [onRegisterBarActions, barActions]);

const onShare = async () => {
  setBusy(true);
  try {
    // ---------------- SHARE MODE (Post Sticker) ----------------
    if (shareMode) {
      if (!sharePostId) throw new Error(t("storywizard.upload.postNotFound"));

      const uploadUri = await exportEditedPhoto(bgShotRef);
      const mime = "image/jpeg";

      const info: any = await FileSystem.getInfoAsync(uploadUri);
      const size = info?.size ?? 0;
      if (!size) throw new Error(t("storywizard.upload.emptyFile"));

      const { data: main } = await getSigned({ variables: { mime, size } });
      const { key, putUrl } = main.getSignedStoryUpload as { key: string; putUrl: string };

      const okMain = await putToSignedUrl(putUrl, uploadUri, mime);
      if (!okMain) throw new Error(t("storywizard.upload.failed"));

      const editJson = JSON.stringify({
        bgColor,
        sharedPost: {
          postId: sharePostId,
          x: pX.value,
          y: pY.value,
          s: pS.value,
          r: pR.value,
        },
      });

      await createStory({
        variables: { input: { key, mime, thumbKey: null, duration: null, editJson } },
      });

      setBusy(false);
      onDone();
      return;
    }

    // ---------------- NORMAL MODE ----------------
    if (!picked) return;

    const photoWillBeBaked = picked.type === "photo";
    const edit = {
      stage: { w: stageW, h: stageH },
      fitMode: photoWillBeBaked ? "FILL" : fitMode,
      overlays: photoWillBeBaked ? [] : overlays.map((o) => ({ ...o })),
      media: {
        x: photoWillBeBaked ? 0 : translateX.value,
        y: photoWillBeBaked ? 0 : translateY.value,
        s: photoWillBeBaked ? 1 : scale.value,
        r: photoWillBeBaked ? 0 : rotation.value,
      },
    };
    const editJson = JSON.stringify(edit);

    let uploadUri = picked.uri;
    let mime = "image/jpeg";
    let durationSec: number | undefined;
    let thumbKey: string | undefined;

    // 1) MAIN upload
    if (picked.type === "photo") {
      // The uploaded story image is the exact visible editor canvas. This makes
      // library picks, camera shots, thumbs and StoryViewer alignment identical.
      uploadUri = await exportEditedPhoto(viewShotRef);
      mime = "image/jpeg";
    } else {
      mime = Platform.OS === "ios" ? "video/quicktime" : "video/mp4";
      durationSec = typeof picked.duration === "number" ? Math.round(picked.duration) : undefined;
    }

    const info: any = await FileSystem.getInfoAsync(uploadUri);
    const size = info?.size ?? 0;
    if (!size) throw new Error(t("storywizard.upload.emptyFile"));

    const { data: main } = await getSigned({ variables: { mime, size } });
    const { key, putUrl } = main.getSignedStoryUpload as { key: string; putUrl: string };

    const okMain = await putToSignedUrl(putUrl, uploadUri, mime);
    if (!okMain) throw new Error(t("storywizard.upload.failed"));

    // 2) THUMB upload: same visible canvas as StoryViewer.
    let thumbCaptureUri: string | null = null;
    if (picked.type === "photo") {
      thumbCaptureUri = uploadUri;
    } else {
      const frame = await ensureVideoThumbFrame(picked.uri);
      if (frame) {
        setExportingThumb(true);
        await nextFrame();
        await nextFrame();
        thumbCaptureUri = await exportEditedPhoto(viewShotRef);
        setExportingThumb(false);
      }
    }

    if (thumbCaptureUri) {
      const tinf: any = await FileSystem.getInfoAsync(thumbCaptureUri);
      const tSize = tinf?.size ?? 0;
      if (tSize > 0) {
        const { data: tSigned } = await getSigned({ variables: { mime: "image/jpeg", size: tSize } });
        const { key: tKey, putUrl: tUrl } = tSigned.getSignedStoryUpload as { key: string; putUrl: string };
        const okThumb = await putToSignedUrl(tUrl, thumbCaptureUri, "image/jpeg");
        if (okThumb) thumbKey = tKey;
      }
    }

    // 3) CREATE
    await createStory({
      variables: {
        input: {
          key,
          mime,
          thumbKey: thumbKey ?? null,
          duration: durationSec,
          editJson,
        },
      },
    });

    setBusy(false);
    onDone();
  } catch (e: any) {
    setBusy(false);
    Alert.alert(t("common.error"), e?.message ?? t("storywizard.upload.unknownError"));
  }
};

const saveStoryPreviewToLibrary = React.useCallback(async () => {
  if ((!picked && !shareMode) || savingToLibrary) return;

  try {
    setSavingToLibrary(true);
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("storywizard.save.permissionTitle"), t("storywizard.save.permissionBody"));
      return;
    }

    let saveUri: string | null = null;

    if (shareMode) {
      saveUri = await exportEditedPhoto(bgShotRef);
    } else if (picked?.type === "photo") {
      saveUri = await exportEditedPhoto(viewShotRef);
    } else if (picked?.type === "video") {
      await ensureVideoThumbFrame(picked.uri);
      setExportingThumb(true);
      await nextFrame();
      await nextFrame();
      saveUri = await exportEditedPhoto(viewShotRef);
      setExportingThumb(false);
    }

    if (!saveUri) throw new Error(t("storywizard.save.failedBody"));

    await MediaLibrary.saveToLibraryAsync(saveUri);
    hapticSuccess();
    Alert.alert(
      t("storywizard.save.successTitle"),
      picked?.type === "video"
        ? t("storywizard.save.videoFrameSuccessBody")
        : t("storywizard.save.successBody")
    );
  } catch (e: any) {
    Alert.alert(t("storywizard.save.failedTitle"), e?.message ?? t("storywizard.save.failedBody"));
  } finally {
    setExportingThumb(false);
    setSavingToLibrary(false);
  }
}, [bgShotRef, ensureVideoThumbFrame, nextFrame, picked, savingToLibrary, shareMode, t, viewShotRef]);


  // Layout positions

  const bottomCenterY = shareMode
  ? Math.max(60, (insets.bottom ?? 0) + 60)   // 🔼 höher für Post→Story
  : Math.max(60, (insets.bottom ?? 0) + 20);
  const cameraBottomCenterY = Math.max(22, (insets.bottom ?? 0) - 18);
  const closeTop = (insets.top ?? 0) + 8;

  const chromeBg =
    typeof COLORS.card === "string" && COLORS.card.startsWith("#")
      ? hexToRgba(COLORS.card, 0.72)
      : "rgba(0,0,0,0.45)";

  const trashCenterY = Math.max(120, stageH - 82);
  const isPointInTrash = React.useCallback((pageX: number, pageY: number) => {
    const dx = pageX - W / 2;
    const dy = pageY - trashCenterY;
    return Math.sqrt(dx * dx + dy * dy) <= 66;
  }, [trashCenterY]);

  useEffect(() => {
  (async () => {
    await Camera.requestCameraPermissionsAsync();
    await Camera.requestMicrophonePermissionsAsync();
  })();
}, []);

  const renderOverlayLayer = (interactive: boolean) => (
    <View pointerEvents={interactive ? "auto" : "none"} style={StyleSheet.absoluteFillObject}>
      {overlays.map((o) => (
        <View
          key={o.id}
          onStartShouldSetResponder={() => interactive}
          onMoveShouldSetResponder={() => interactive}
          onResponderGrant={(e: any) => {
            if (!interactive) return;
            setOverlayDragActive(true);
            setOverlayDragOverTrash(false);
            overlayDragRef.current = {
              id: o.id,
              startX: o.x,
              startY: o.y,
              pageX: e.nativeEvent.pageX,
              pageY: e.nativeEvent.pageY,
              moved: false,
            };
          }}
          onResponderMove={(e: any) => {
            const d = overlayDragRef.current;
            if (!interactive || !d || d.id !== o.id) return;
            const dx = e.nativeEvent.pageX - d.pageX;
            const dy = e.nativeEvent.pageY - d.pageY;
            if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
            moveOverlay(o.id, d.startX + dx, d.startY + dy);
            setOverlayDragOverTrash(d.moved && isPointInTrash(e.nativeEvent.pageX, e.nativeEvent.pageY));
          }}
          onResponderRelease={(e: any) => {
            const d = overlayDragRef.current;
            overlayDragRef.current = null;
            setOverlayDragActive(false);
            setOverlayDragOverTrash(false);
            if (!interactive || !d || d.id !== o.id) return;
            if (d.moved && isPointInTrash(e.nativeEvent.pageX, e.nativeEvent.pageY)) {
              removeOverlay(o.id);
              hapticImpact();
              return;
            }
            if (!d.moved) editOverlay(o);
          }}
          onResponderTerminate={() => {
            overlayDragRef.current = null;
            setOverlayDragActive(false);
            setOverlayDragOverTrash(false);
          }}
          style={[
            s.storyOverlayItem,
            o.kind === "text" ? s.storyTextOverlay : s.storyStickerOverlay,
            (o.kind === "poll" || o.kind === "question") && s.storyCardOverlay,
            {
              left: o.x,
              top: o.y,
              backgroundColor: o.kind === "poll" || o.kind === "question" ? "transparent" : o.bg,
              transform: [
                { translateX: o.kind === "poll" || o.kind === "question" ? -123 : -80 },
                { translateY: o.kind === "poll" || o.kind === "question" ? -42 : -24 },
              ],
            },
          ]}
        >
          {o.kind === "poll" ? (
            <View style={s.pollCard}>
              <View style={s.pollQuestionBand}>
                <Text style={s.pollQuestionText} numberOfLines={2}>{o.question || t("storywizard.poll.questionPlaceholder")}</Text>
              </View>
              {o.options.slice(0, 4).map((opt) => (
                <View key={opt} style={s.pollOptionRow}>
                  <Text style={s.pollOptionText} numberOfLines={1}>{opt}</Text>
                </View>
              ))}
            </View>
          ) : o.kind === "question" ? (
            <View style={s.questionCard}>
              <View style={s.questionAvatarWrap}>
                <ExpoImage source={o.avatarUri ? { uri: o.avatarUri } : avatarPlaceholder} style={s.questionAvatar} contentFit="cover" />
              </View>
              <Text style={s.questionPrompt} numberOfLines={2}>{o.prompt}</Text>
              <View style={s.questionInputFake}>
                <Text style={s.questionInputText} numberOfLines={1}>{o.placeholder}</Text>
              </View>
            </View>
          ) : (
            <>
              {o.kind !== "text" && "icon" in o && <Ionicons name={o.icon} size={21} color={o.color} style={s.storyStickerIcon} />}
              <Text
                numberOfLines={2}
                style={[
                  o.kind === "text" ? s.storyTextOverlayText : s.storyStickerText,
                  { color: o.kind === "text" ? o.color : "#111827", fontSize: o.kind === "text" ? o.size : 20 },
                ]}
              >
                {"text" in o ? o.text : ""}
              </Text>
            </>
          )}
        </View>
      ))}
      {interactive && overlayDragActive && (
        <View pointerEvents="none" style={[s.trashDropWrap, { top: trashCenterY - 34 }]}>
          <View style={[s.trashDropZone, overlayDragOverTrash && s.trashDropZoneActive]}>
            <Ionicons name="trash-outline" size={overlayDragOverTrash ? 34 : 29} color="#fff" />
          </View>
        </View>
      )}
    </View>
  );

  const filteredMentions = React.useMemo(() => {
    const q = mentionQuery.trim().replace(/^@/, "").toLowerCase();
    const remote = Array.isArray(mentionSearchData?.searchUsers)
      ? mentionSearchData.searchUsers.map((u: any) => ({
          username: u.username,
          avatar: u.avatarThumbUrl || u.avatarUrl || null,
        }))
      : [];
    return remote.filter((item: { username: string; avatar: string | null }) => !q || item.username.toLowerCase().includes(q));
  }, [mentionQuery, mentionSearchData]);

  useEffect(() => {
    const q = debouncedLocationQuery.trim();
    if (toolModal !== "location" || q.length < 2) {
      setLocationResults([]);
      return;
    }
    runPlaceSearch({ variables: { q, limit: 8 } })
      .then((res) => {
        const arr: PlaceSuggestion[] = (res?.data?.searchPlaces ?? []).map((p: any) => ({
          id: p.id,
          title: p.title,
          subtitle: p.subtitle,
          lat: p.lat,
          lng: p.lng,
        }));
        setLocationResults(arr);
      })
      .catch(() => setLocationResults([]));
  }, [debouncedLocationQuery, runPlaceSearch, toolModal]);

  const filteredLocations = React.useMemo(() => {
    const q = locationQuery.trim().toLowerCase();
    const used = overlays
      .filter((o): o is Extract<StoryOverlay, { kind: "location" }> => o.kind === "location")
      .map((o): PlaceSuggestion => ({ title: o.text, subtitle: null }))
      .filter((item, index, arr) => item.title && arr.findIndex((x) => x.title.toLowerCase() === item.title.toLowerCase()) === index)
      .filter((item) => !q || item.title.toLowerCase().includes(q));
    const remote = locationResults.filter(
      (item) => !used.some((u) => u.title.toLowerCase() === String(item.title || "").toLowerCase())
    );
    return [...remote, ...used];
  }, [locationQuery, locationResults, overlays]);

  const cleanUrl = React.useCallback((value: string) => {
    const raw = value.trim();
    if (!raw) return "";
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }, []);

  const linkPreviewLabel = React.useMemo(() => {
    const label = linkLabel.trim();
    if (label) return label;
    const raw = linkUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
    return raw || t("storywizard.link.previewFallback");
  }, [linkLabel, linkUrl, t]);

  const addLinkSticker = React.useCallback(() => {
    const url = cleanUrl(linkUrl);
    if (!url) return;
    addOverlay({
      kind: "link",
      text: linkPreviewLabel,
      url,
      icon: "link-outline",
      color: "#38A3FF",
      bg: "#FFFFFF",
    });
    setToolModal(null);
  }, [addOverlay, cleanUrl, linkPreviewLabel, linkUrl]);

  const addMentionSticker = React.useCallback((username?: string) => {
    const clean = (username || mentionQuery).trim().replace(/^@/, "");
    if (!clean) return;
    addOverlay({
      kind: "mention",
      text: `@${clean}`,
      username: clean,
      icon: "at-outline",
      color: "#F97316",
      bg: "#FFFFFF",
    });
    setToolModal(null);
  }, [addOverlay, mentionQuery]);

  const addLocationSticker = React.useCallback((name?: string) => {
    const text = (name || locationQuery).trim();
    if (!text) return;
    addOverlay({
      kind: "location",
      text,
      icon: "location-outline",
      color: "#8B5CF6",
      bg: "#FFFFFF",
    });
    setToolModal(null);
  }, [addOverlay, locationQuery]);

  const addPollSticker = React.useCallback(() => {
    const question = pollQuestion.trim() || t("storywizard.poll.defaultQuestion");
    const a = pollA.trim() || t("storywizard.poll.yes");
    const b = pollB.trim() || t("storywizard.poll.no");
    const extras = pollExtraOptions.map((x) => x.trim()).filter(Boolean).slice(0, 2);
    addOverlay({
      kind: "poll",
      question,
      options: [a, b, ...extras].slice(0, 4),
      color: "#111827",
      bg: "#FFFFFF",
    }, 0.38);
    setToolModal(null);
  }, [addOverlay, pollA, pollB, pollExtraOptions, pollQuestion, t]);

  const addQuestionSticker = React.useCallback(() => {
    addOverlay({
      kind: "question",
      prompt: questionPrompt.trim() || t("storywizard.question.defaultPrompt"),
      placeholder: t("storywizard.question.placeholder"),
      avatarUri: me?.avatarThumbUrl || me?.avatarUrl || null,
      color: "#111827",
      bg: "#FFFFFF",
    }, 0.46);
    setToolModal(null);
  }, [addOverlay, me?.avatarThumbUrl, me?.avatarUrl, questionPrompt, t]);

  const toolDoneDisabled =
    (toolModal === "link" && !linkUrl.trim()) ||
    (toolModal === "mention" && !mentionQuery.trim()) ||
    (toolModal === "location" && !locationQuery.trim());

  const toolSheetPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dy > 72 || gesture.vy > 1.1) setToolModal(null);
        },
      }),
    []
  );

  const renderToolModal = () => {
    if (!toolModal) return null;
    const title =
      toolModal === "link"
        ? t("storywizard.link.title")
        : toolModal === "mention"
          ? t("storywizard.mention.title")
          : toolModal === "location"
            ? t("storywizard.location.title")
            : toolModal === "poll"
              ? t("storywizard.poll.title")
              : t("storywizard.question.title");
    const onDonePress =
      toolModal === "link"
        ? addLinkSticker
        : toolModal === "mention"
          ? () => addMentionSticker()
          : toolModal === "location"
            ? () => addLocationSticker()
            : toolModal === "poll"
              ? addPollSticker
              : addQuestionSticker;

    return (
      <Modal transparent visible animationType="fade" onRequestClose={() => setToolModal(null)}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setToolModal(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.toolModalRoot} pointerEvents="box-none">
          <View style={s.toolSheet} {...toolSheetPanResponder.panHandlers}>
          <View style={s.toolHandle} />
          {toolModal !== "location" ? (
            <View style={s.toolHeader}>
              <TouchableOpacity onPress={() => setToolModal(null)} hitSlop={12}>
                <Text style={s.toolCancel}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
              <Text style={s.toolTitle}>{title}</Text>
              <TouchableOpacity onPress={onDonePress} disabled={toolDoneDisabled} hitSlop={12}>
                <Text style={[s.toolDone, toolDoneDisabled && s.toolDoneDisabled]}>{t("common.done", { defaultValue: "Done" })}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.locationHeader}>
              <Ionicons name="navigate" size={34} color="#fff" />
              <Text style={s.toolTitle}>{title}</Text>
              <TouchableOpacity onPress={() => setToolModal(null)} hitSlop={12}>
                <Text style={s.toolCancel}>{t("common.cancel", { defaultValue: "Cancel" })}</Text>
              </TouchableOpacity>
            </View>
          )}

          {toolModal === "link" && (
            <View style={s.toolContent}>
              <Text style={s.inputLabel}>{t("storywizard.link.urlLabel")}</Text>
              <TextInput
                value={linkUrl}
                onChangeText={setLinkUrl}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://example.com"
                placeholderTextColor="rgba(255,255,255,0.42)"
                style={s.underlineInput}
              />
              <Text style={s.toolHelp}>{t("storywizard.link.help")}</Text>
              <View style={s.linkCustomizeRow}>
                <Ionicons name="add" size={34} color="rgba(255,255,255,0.7)" />
                <TextInput
                  value={linkLabel}
                  onChangeText={setLinkLabel}
                  placeholder={t("storywizard.link.labelPlaceholder")}
                  placeholderTextColor="rgba(255,255,255,0.42)"
                  style={s.linkLabelInput}
                />
              </View>
              <View style={s.linkPreviewWrap}>
                <View style={s.previewStickerPill}>
                  <Ionicons name="link-outline" size={24} color="#38A3FF" />
                  <Text style={s.previewStickerText} numberOfLines={1}>{linkPreviewLabel}</Text>
                </View>
              </View>
            </View>
          )}

          {toolModal === "mention" && (
            <View style={s.mentionContent}>
              <View style={s.mentionInputPill}>
                <Ionicons name="at-outline" size={34} color="#F97316" />
                <TextInput
                  value={mentionQuery}
                  onChangeText={(value) => setMentionQuery(value.replace(/^@+/, ""))}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t("storywizard.mention.placeholder")}
                  placeholderTextColor="#8A8D93"
                  style={s.mentionInput}
                />
              </View>
              <FlatList
                horizontal
                data={filteredMentions}
                keyExtractor={(item) => item.username}
                contentContainerStyle={s.mentionList}
                ListEmptyComponent={
                  mentionQuery.trim().length >= 2 ? (
                    <Text style={s.sheetEmptyText}>{t("common.noResults", { defaultValue: "No results" })}</Text>
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.mentionAvatarItem} onPress={() => addMentionSticker(item.username)} activeOpacity={0.86}>
                    <ExpoImage source={item.avatar ? { uri: item.avatar } : avatarPlaceholder} style={s.mentionAvatar} contentFit="cover" />
                    <Text style={s.mentionAvatarName} numberOfLines={1}>{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {toolModal === "location" && (
            <View style={s.locationContent}>
              <Text style={s.locationLead}>{t("storywizard.location.lead")}</Text>
              <Text style={s.locationSub}>{t("storywizard.location.sub")}</Text>
              <View style={s.searchBox}>
                <Ionicons name="search" size={24} color="#8A8F99" />
                <TextInput
                  value={locationQuery}
                  onChangeText={setLocationQuery}
                  placeholder={t("storywizard.location.search")}
                  placeholderTextColor="#8A8F99"
                  style={s.searchInput}
                />
              </View>
              <FlatList
                data={filteredLocations}
                keyExtractor={(item, index) => item.id ?? `${item.title}-${index}`}
                ListEmptyComponent={
                  locationQuery.trim().length >= 2 && !placeSearch.loading ? (
                    <Text style={s.sheetEmptyText}>{t("common.noResults", { defaultValue: "No results" })}</Text>
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.locationRow} onPress={() => addLocationSticker(item.title)} activeOpacity={0.82}>
                    <Text style={s.locationName} numberOfLines={1}>{item.title}</Text>
                    {!!item.subtitle && <Text style={s.locationMeta} numberOfLines={1}>{item.subtitle}</Text>}
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {toolModal === "poll" && (
            <View style={s.pollBuilderWrap}>
              <View style={s.pollBuilderCard}>
                <View style={s.pollBuilderHeader}>
                  <TextInput
                    value={pollQuestion}
                    onChangeText={setPollQuestion}
                    autoFocus
                    maxLength={60}
                    placeholder={t("storywizard.poll.questionPlaceholder")}
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    style={s.pollBuilderQuestion}
                  />
                </View>
                <View style={s.pollBuilderBody}>
                  <TextInput value={pollA} onChangeText={setPollA} maxLength={24} style={s.pollBuilderOption} placeholderTextColor="#9CA3AF" />
                  <TextInput value={pollB} onChangeText={setPollB} maxLength={24} style={s.pollBuilderOption} placeholderTextColor="#9CA3AF" />
                  {pollExtraOptions.map((opt, index) => (
                    <View key={`extra-${index}`} style={s.pollExtraOptionRow}>
                      <TextInput
                        value={opt}
                        onChangeText={(value) => setPollExtraOptions((prev) => prev.map((item, i) => (i === index ? value : item)))}
                        maxLength={24}
                        style={[s.pollBuilderOption, s.pollExtraOptionInput]}
                        placeholder={t("storywizard.poll.optionPlaceholder", { defaultValue: "Option" })}
                        placeholderTextColor="#9CA3AF"
                      />
                      <TouchableOpacity onPress={() => setPollExtraOptions((prev) => prev.filter((_, i) => i !== index))} style={s.pollRemoveOption} hitSlop={10}>
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {pollExtraOptions.length < 2 && (
                    <TouchableOpacity style={s.pollAddOption} onPress={() => setPollExtraOptions((prev) => [...prev, ""])} activeOpacity={0.82}>
                      <Text style={s.pollAddOptionText}>{t("storywizard.poll.addOption")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}

          {toolModal === "question" && (
            <View style={s.questionBuilderWrap}>
              <View style={s.questionBuilderCard}>
                <ExpoImage source={me?.avatarThumbUrl || me?.avatarUrl ? { uri: me.avatarThumbUrl || me.avatarUrl } : avatarPlaceholder} style={s.questionBuilderAvatar} contentFit="cover" />
                <TextInput
                  value={questionPrompt}
                  onChangeText={setQuestionPrompt}
                  autoFocus
                  maxLength={60}
                  placeholder={t("storywizard.question.defaultPrompt")}
                  placeholderTextColor="#111827"
                  style={s.questionBuilderPrompt}
                />
                <View style={s.questionBuilderInput}>
                  <Text style={s.questionBuilderInputText}>{t("storywizard.question.placeholder")}</Text>
                </View>
              </View>
              <Text style={s.questionHelper}>{t("storywizard.question.help")}</Text>
            </View>
          )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  return (
    <View style={[s.root, { backgroundColor: COLORS.bg }]}>
      {/* Close top-left */}
      <View style={[s.topLeftWrap, { top: closeTop }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => {
            if (picked) setPicked(null);
            else onDone();
          }}
          style={[s.iconBtn, { backgroundColor: chromeBg, borderColor: COLORS.border }]}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Pick (Wählen) top-right */}
      <View style={[s.topRightWrap, { top: closeTop }]} pointerEvents="box-none">
      

        {!shareMode && !picked  && facing === "back" && (
          <TouchableOpacity
            onPress={() => 
              {if (countdown > 0) return;
                setTorch((v) => !v)}}
            style={[s.iconBtn, { backgroundColor: chromeBg, borderColor: COLORS.border }]}
            activeOpacity={0.85}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={torch ? "flash" : "flash-off"}
              size={18}
              color={COLORS.text}
            />
          </TouchableOpacity>
        )}



        

      </View>

     
      {/* Fullscreen: Preview or Camera */}
      <View style={[s.previewWrap, StyleSheet.absoluteFillObject, { backgroundColor: editorBg }]}>
  {/* ================= SHARE MODE (Post -> Story) ================= */}
  {shareMode ? (
    <View style={StyleSheet.absoluteFillObject}>
      {/* Loading Guard */}
      {shareLoading && (
        <View style={s.shareLoadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.shareLoadingText}>{t("storywizard.loadingPost")}</Text>
        </View>
      )}

      {/* Wenn kein Post kommt (API/Cache) */}
      {!shareLoading && !sharePost && (
        <View style={s.shareLoadingOverlay} pointerEvents="none">
          <Text style={s.shareLoadingText}>{t("storywizard.postNotFound")}</Text>
        </View>
      )}

      {/* ✅ EXPORT-FLÄCHE (wird hochgeladen) */}
      {!!sharePost && (
        <>
          {/* 1) Upload-Quelle */}
          <ViewShot
            ref={bgShotRef}
            style={StyleSheet.absoluteFillObject}
            options={{ format: "jpg", quality: 0.98, result: "tmpfile" }}
          >
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bgColor }]} />

            {!!shareMediaUrl && (
              <ExpoImage
                source={{ uri: shareMediaUrl }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                contentPosition="center"
                transition={0}
              />
            )}

            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.18)" }]} />

            {/* PostCard kommt NICHT hier rein */}
          </ViewShot>

          {/* 2) Sichtbarer Editor-Layer */}
          <View style={StyleSheet.absoluteFillObject} pointerEvents="auto">
            <GestureDetector gesture={postGestures}>
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: POST_W,
                    marginLeft: -POST_W / 2,
                    marginTop: -postH / 2,
                  },
                  postStyle,
                ]}
              >
                <View onLayout={(e) => setPostH(e.nativeEvent.layout.height)} style={s.postCard}>
                  <View style={s.postHeader}>
                    <ExpoImage
                      source={asExpoSource(shareAuthorAvatar)}
                      style={s.postAvatar}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                    <Text style={s.postUsername} numberOfLines={1}>
                      {sharePost?.author?.username ?? " "}
                    </Text>
                  </View>

                  <View style={s.postMediaBox}>
                    {!!shareMediaUrl ? (
                      <ExpoImage
                        source={{ uri: shareMediaUrl }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                        contentPosition="center"
                        cachePolicy="disk"
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="videocam" size={34} color="rgba(255,255,255,0.85)" />
                        <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.9)", fontWeight: "800" }}>
                          Video
                        </Text>
                      </View>
                    )}
                  </View>

                  {!!sharePost?.caption && (
                    <View style={s.postCaptionBar}>
                      <Text style={s.postCaptionText} numberOfLines={1}>
                        <Text style={{ fontWeight: "900" }}>
                          {sharePost?.author?.username ?? "user"}{" "}
                        </Text>
                        {sharePost.caption}
                      </Text>
                    </View>
                  )}
                </View>
              </Animated.View>
            </GestureDetector>
          </View>
        </>
      )}


      {/* ✅ SEND Button (gleich wie bei normal picked) */}
      <View style={[s.bottomRow, { bottom: bottomCenterY }]} pointerEvents="box-none">
        <View style={s.sideSpacer} />
        <View style={s.bottomCenterWrap}>
          <Pressable
            onPress={onShare}
            disabled={busy || shareLoading || !sharePost}
            style={({ pressed }) => [
              s.sendBtn,
              { backgroundColor: COLORS.primary ?? "#4F46E5" },
              pressed && !busy && s.sendPressed,
              (busy || shareLoading || !sharePost) && s.sendDisabled,
            ]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={22} color="#fff" />}
          </Pressable>
        </View>
        <View style={s.sideSpacer} />
      </View>
    </View>
  ) : (
    /* ================= NORMAL MODE (Camera / Pick) ================= */
    <>
      {/* 🔥 Kamera bleibt IMMER gemountet (warm) */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: stageH,
          overflow: "hidden",
          backgroundColor: editorBg,
        }}
      >
        <View style={StyleSheet.absoluteFillObject} pointerEvents={picked ? "none" : "auto"}>
          <StoryCamera
            facing={facing}
            torch={torch}
            timerSec={timerSec}
            onCountdown={setCountdown}
            key={`cam-${cameraKey}`}
            enabled={isFocused && !picked}
            onReadyChange={setCamReady}
            onShot={async (s) => {
              fromCameraRef.current = true;
              if (s.type === "photo") {
                const uri = await cropToStageAspect(s.uri, s.width, s.height, stageW, stageH);
                setPicked({ type: "photo", uri, width: stageW, height: stageH });
              }
              else setPicked(s);
            }}
            renderShutter={({ ready, recording, onPressIn, onPressOut, onTouchMove }) => (
                <View style={[s.bottomRow, { bottom: cameraBottomCenterY }]} pointerEvents="box-none">
                  

                  {/* CENTER: Shutter exakt Mitte */}
                  <View style={s.centerFixed}>
                    <Pressable
                      disabled={!ready}
                      onPressIn={onPressIn}
                      onPressOut={onPressOut}
                      onTouchMove={onTouchMove}
                      pressRetentionOffset={{ top: 1200, bottom: 1200, left: 360, right: 360 }}
                      onResponderTerminationRequest={() => false}
                      hitSlop={{ top: 16, bottom: 16, left: 24, right: 24 }}
                      style={({ pressed }) => [
                        s.shutterBtn,
                        pressed && !recording && s.shutterPressed,
                        recording && s.shutterRecording,
                        !ready && s.shutterDisabled,
                      ]}
                    >
                      <View style={[s.shutterInner, recording && s.shutterInnerRec]} />
                    </Pressable>

                    {!ready && (
                      <View style={{ position: "absolute", top: -48, alignSelf: "center" }}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    )}
                  </View>

                  {countdown > 0 && (
                    <View pointerEvents="none" style={s.countdownOverlay}>
                      <Text style={s.countdownText}>{countdown}</Text>
                    </View>
                  )}


                  {/* RIGHT — Timer */}
                  <View style={s.rightOfCenter}>
                    <TouchableOpacity
                      onPress={() => setTimerSec((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))}
                      style={[
                        s.timerBtn,
                        { backgroundColor: chromeBg, borderColor: COLORS.border },
                      ]}
                      activeOpacity={0.85}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons name="timer-outline" size={19} color={COLORS.text} />

                      {/* ✅ deutlich sichtbare Sek-Anzeige */}
                      {timerSec > 0 && (
                        <View style={s.timerPill} pointerEvents="none">
                          <Text style={s.timerPillText}>{timerSec}s</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>


                </View>
              )}
          />
        </View>

        {/* Preview */}
        {picked && (
            <View style={StyleSheet.absoluteFillObject} pointerEvents="auto">
              <ViewShot
                ref={viewShotRef}
                style={StyleSheet.absoluteFillObject}
                options={{ format: "jpg", quality: 0.98, result: "tmpfile" }}
              >
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: editorBg }]} />

                <GestureDetector gesture={mediaGestures}>
                  <Animated.View style={StyleSheet.absoluteFillObject}>
                    <Animated.View style={[StyleSheet.absoluteFillObject, fgStyle]}>
                      {picked.type === "video" ? (
                        exportingThumb && videoThumbFrameUri ? (
                          <ExpoImage
                            source={{ uri: videoThumbFrameUri }}
                            style={StyleSheet.absoluteFillObject}
                            contentFit={fitMode === "FIT" ? "contain" : "cover"}
                            contentPosition="center"
                            transition={0}
                          />
                        ) : (
                        <Video
                          source={{ uri: picked.uri }}
                          style={StyleSheet.absoluteFillObject}
                          resizeMode={fitMode === "FIT" ? ResizeMode.CONTAIN : ResizeMode.COVER}
                          shouldPlay={isFocused}
                          isLooping
                          useNativeControls={false}
                        />
                        )
                      ) : (
                        <ExpoImage
                          source={{ uri: picked.uri }}
                          style={StyleSheet.absoluteFillObject}
                          contentFit={fitMode === "FIT" ? "contain" : "cover"}   // ✅ wichtig: FIT wirkt wirklich
                          contentPosition="center"
                          transition={150}
                        />
                      )}
                    </Animated.View>
                  </Animated.View>
                </GestureDetector>
                {renderOverlayLayer(false)}
              </ViewShot>

              {renderOverlayLayer(true)}

              {/*
                Story action buttons are intentionally hidden for now.
                Keep this block here so text, sticker, link, location, poll,
                question, mention and download tools can be resumed later.

                <View style={[s.storyToolRail, { top: Math.max(70, (insets.top ?? 0) + 30) }]}>
                  <TouchableOpacity
                    style={[s.storyToolButton, savingToLibrary && { opacity: 0.65 }]}
                    onPress={saveStoryPreviewToLibrary}
                    disabled={savingToLibrary}
                    activeOpacity={0.88}
                  >
                    {savingToLibrary ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Ionicons name="download-outline" size={27} color="#fff" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.storyToolButton}
                    onPress={() => {
                      setEditingOverlayId(null);
                      setDraftText("");
                      setTextEditorOpen(true);
                    }}
                    activeOpacity={0.88}
                  >
                    <Text style={s.storyToolText}>Aa</Text>
                  </TouchableOpacity>
                  <View style={s.storyInlineStickers}>
                    {stickerOptions.map((item) => (
                      <TouchableOpacity key={item.label} style={s.storyMiniStickerBtn} onPress={() => openTool(item.tool)} activeOpacity={0.88}>
                        <Ionicons name={item.icon} size={20} color={item.color} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              */}

              {/* SEND — gleiche Position wie Shutter (unverändert) */}
              <View style={[s.bottomRow, { bottom: bottomCenterY }]} pointerEvents="box-none">
                <View style={s.sideSpacer} />
                <View style={s.bottomCenterWrap}>
                  <Pressable
                    onPress={onShare}
                    disabled={busy}
                    style={({ pressed }) => [
                      s.sendBtn,
                      { backgroundColor: COLORS.primary ?? "#4F46E5" },
                      pressed && !busy && s.sendPressed,
                      busy && s.sendDisabled,
                    ]}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={22} color="#fff" />}
                  </Pressable>
                </View>
                <View style={s.sideSpacer} />
              </View>
            </View>
          )}
      </View>

      {!picked && !camReady && (
        <View style={s.camLoadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.camLoadingText}>{t("storywizard.cameraIsLoading")}</Text>
        </View>
      )}
    </>
  )}
</View>

      {renderToolModal()}

      <Modal transparent visible={textEditorOpen} animationType="fade" onRequestClose={() => setTextEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.textEditorModal}>
          <View style={s.textEditorTop}>
            <TouchableOpacity onPress={() => setTextEditorOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={addTextOverlay} hitSlop={12}>
              <Text style={s.doneText}>{t("common.done", { defaultValue: "Done" })}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={draftText}
            onChangeText={setDraftText}
            autoFocus
            multiline
            maxLength={80}
            placeholder={t("storywizard.textPlaceholder")}
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={[s.storyTextInput, { color: draftColor }]}
          />
          <View style={s.colorRow}>
            {STORY_TEXT_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setDraftColor(c)}
                style={[s.colorDot, { backgroundColor: c }, draftColor === c && s.colorDotActive]}
              />
            ))}
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

/** ---- styles ---- */
const styles = (COLORS: any) =>
  StyleSheet.create({
    storyToolRail: {
      position: "absolute",
      right: 22,
      zIndex: 190,
      gap: 14,
      alignItems: "center",
    },
    storyToolButton: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: "rgba(20,22,24,0.58)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.16)",
    },
    storyToolText: {
      color: "#fff",
      fontSize: 28,
      fontWeight: "800",
    },
    storyInlineStickers: {
      gap: 10,
      alignItems: "center",
    },
    storyMiniStickerBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(255,255,255,0.92)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    storyOverlayItem: {
      position: "absolute",
      minWidth: 92,
      maxWidth: 270,
      minHeight: 44,
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    storyTextOverlay: {
      maxWidth: 280,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.18)",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    storyTextOverlayText: {
      fontWeight: "900",
      textAlign: "center",
      lineHeight: 34,
      textShadowColor: "rgba(0,0,0,0.35)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 5,
    },
    storyStickerOverlay: {
      backgroundColor: "#fff",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(17,24,39,0.08)",
    },
    storyCardOverlay: {
      minWidth: 0,
      maxWidth: 280,
      minHeight: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: "transparent",
      overflow: "visible",
    },
    storyStickerText: {
      fontWeight: "900",
      flexShrink: 1,
      lineHeight: 24,
      letterSpacing: 0,
    },
    storyStickerIcon: {
      marginRight: 8,
      flexShrink: 0,
    },
    trashDropWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 260,
      elevation: 260,
    },
    trashDropZone: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: "rgba(10,12,16,0.72)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.26)",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      transform: [{ scale: 1 }],
    },
    trashDropZoneActive: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(239,68,68,0.88)",
      borderColor: "rgba(255,255,255,0.62)",
      transform: [{ scale: 1.08 }],
    },
    pollCard: {
      width: 238,
      borderRadius: 20,
      backgroundColor: "#FFFFFF",
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(17,24,39,0.08)",
    },
    pollQuestionBand: {
      minHeight: 56,
      backgroundColor: "#080D14",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    pollQuestionText: {
      color: "#FFFFFF",
      fontSize: 17,
      lineHeight: 21,
      fontWeight: "900",
      textAlign: "center",
      textTransform: "uppercase",
    },
    pollOptionRow: {
      marginHorizontal: 14,
      marginTop: 10,
      height: 44,
      borderRadius: 14,
      backgroundColor: "#F1F2F5",
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    pollOptionText: {
      color: "#343840",
      fontSize: 15,
      fontWeight: "900",
    },
    questionCard: {
      width: 246,
      borderRadius: 20,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      paddingTop: 30,
      paddingHorizontal: 16,
      paddingBottom: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(17,24,39,0.08)",
    },
    questionAvatarWrap: {
      position: "absolute",
      top: -28,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
    },
    questionAvatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
    },
    questionPrompt: {
      color: "#111827",
      fontSize: 20,
      lineHeight: 24,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 14,
    },
    questionInputFake: {
      width: "100%",
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: "#E5E5E7",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    questionInputText: {
      color: "#6B7280",
      fontSize: 15,
      fontWeight: "700",
    },
    toolModalRoot: {
      flex: 1,
      justifyContent: "flex-end",
    },
    toolSheet: {
      maxHeight: H * 0.78,
      minHeight: 330,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: "#111318",
      paddingTop: 10,
      paddingBottom: 22,
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -8 },
      elevation: 20,
    },
    toolHandle: {
      alignSelf: "center",
      width: 46,
      height: 5,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.72)",
      marginBottom: 16,
    },
    toolHeader: {
      paddingHorizontal: 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    locationHeader: {
      paddingHorizontal: 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(255,255,255,0.12)",
      paddingBottom: 22,
    },
    toolCancel: {
      color: "#7EA2FF",
      fontSize: 18,
      fontWeight: "700",
      textDecorationLine: "underline",
    },
    toolTitle: {
      color: "#FFFFFF",
      fontSize: 19,
      fontWeight: "900",
    },
    toolDone: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "900",
      textDecorationLine: "underline",
    },
    toolDoneDisabled: {
      opacity: 0.28,
    },
    toolContent: {
      paddingHorizontal: 28,
      paddingTop: 30,
    },
    inputLabel: {
      color: "rgba(255,255,255,0.48)",
      fontSize: 14,
      fontWeight: "800",
      textTransform: "uppercase",
      marginBottom: 8,
    },
    underlineInput: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "700",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.76)",
    },
    toolHelp: {
      marginTop: 14,
      color: "rgba(255,255,255,0.58)",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
    },
    linkCustomizeRow: {
      marginTop: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    linkLabelInput: {
      flex: 1,
      color: "#FFFFFF",
      fontSize: 21,
      fontWeight: "800",
    },
    linkPreviewWrap: {
      marginTop: 52,
      alignItems: "center",
      gap: 14,
    },
    moreOptionsText: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
    },
    previewStickerPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 18,
      minHeight: 60,
      maxWidth: W - 72,
      borderRadius: 16,
      backgroundColor: "#FFFFFF",
    },
    previewStickerText: {
      color: "#111827",
      fontSize: 24,
      fontWeight: "800",
      flexShrink: 1,
    },
    mentionContent: {
      minHeight: 300,
      paddingTop: 36,
      paddingBottom: 18,
    },
    mentionInputPill: {
      alignSelf: "center",
      minWidth: 220,
      maxWidth: W - 72,
      height: 72,
      paddingHorizontal: 22,
      borderRadius: 18,
      backgroundColor: "#FFFFFF",
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    mentionInput: {
      minWidth: 120,
      flex: 1,
      color: "#111827",
      fontSize: 26,
      fontWeight: "800",
    },
    mentionList: {
      marginTop: 54,
      paddingHorizontal: 18,
      gap: 28,
      minHeight: 112,
    },
    mentionAvatarItem: {
      width: 96,
      alignItems: "center",
    },
    mentionAvatar: {
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: "rgba(255,255,255,0.16)",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.88)",
    },
    mentionAvatarName: {
      marginTop: 8,
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
      maxWidth: 112,
    },
    locationContent: {
      minHeight: 430,
      paddingHorizontal: 28,
      paddingTop: 18,
    },
    locationLead: {
      color: "#FFFFFF",
      fontSize: 21,
      fontWeight: "900",
      textAlign: "center",
    },
    locationSub: {
      color: "rgba(255,255,255,0.62)",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 8,
      marginHorizontal: 12,
    },
    searchBox: {
      marginTop: 26,
      height: 60,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.12)",
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      gap: 12,
    },
    searchInput: {
      flex: 1,
      color: "#FFFFFF",
      fontSize: 21,
      fontWeight: "700",
    },
    locationRow: {
      paddingVertical: 18,
    },
    locationName: {
      color: "#FFFFFF",
      fontSize: 23,
      fontWeight: "700",
    },
    locationMeta: {
      marginTop: 6,
      color: "rgba(255,255,255,0.56)",
      fontSize: 17,
      fontWeight: "700",
    },
    pollBuilderWrap: {
      minHeight: 360,
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 28,
      paddingBottom: 18,
    },
    pollBuilderCard: {
      width: Math.min(292, W - 72),
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: "#FFFFFF",
    },
    pollBuilderHeader: {
      minHeight: 88,
      backgroundColor: "#080D14",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    pollBuilderQuestion: {
      color: "#FFFFFF",
      fontSize: 20,
      lineHeight: 24,
      fontWeight: "900",
      textAlign: "center",
      textTransform: "uppercase",
    },
    pollBuilderBody: {
      padding: 18,
      gap: 12,
    },
    pollBuilderOption: {
      height: 50,
      borderRadius: 16,
      backgroundColor: "#F0F1F4",
      color: "#343840",
      fontSize: 16,
      fontWeight: "900",
      paddingHorizontal: 18,
    },
    pollAddOption: {
      height: 50,
      borderRadius: 16,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: "#E4E7ED",
      alignItems: "center",
      justifyContent: "center",
    },
    pollAddOptionText: {
      color: "#C9CED8",
      fontSize: 17,
      fontWeight: "900",
    },
    pollExtraOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    pollExtraOptionInput: {
      flex: 1,
    },
    pollRemoveOption: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EEF0F4",
    },
    questionBuilderWrap: {
      minHeight: 360,
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 52,
      paddingBottom: 28,
      paddingHorizontal: 28,
    },
    questionBuilderCard: {
      width: Math.min(310, W - 76),
      borderRadius: 20,
      backgroundColor: "#FFFFFF",
      paddingTop: 54,
      paddingHorizontal: 22,
      paddingBottom: 20,
      alignItems: "center",
    },
    questionBuilderAvatar: {
      position: "absolute",
      top: -34,
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 3,
      borderColor: "#FFFFFF",
      backgroundColor: "#F3F4F6",
    },
    questionBuilderPrompt: {
      color: "#111827",
      width: "100%",
      fontSize: 22,
      lineHeight: 27,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 18,
    },
    questionBuilderInput: {
      width: "100%",
      height: 58,
      borderRadius: 14,
      backgroundColor: "#E5E5E7",
      alignItems: "center",
      justifyContent: "center",
    },
    questionBuilderInputText: {
      color: "#6B7280",
      fontSize: 18,
      fontWeight: "700",
    },
    questionHelper: {
      marginTop: 24,
      color: "#FFFFFF",
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "900",
      textAlign: "center",
      maxWidth: 300,
    },
    sheetEmptyText: {
      color: "rgba(255,255,255,0.62)",
      fontSize: 15,
      fontWeight: "800",
      textAlign: "center",
      paddingVertical: 18,
      paddingHorizontal: 24,
    },
    textEditorModal: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.62)",
      paddingTop: 52,
      paddingHorizontal: 20,
    },
    textEditorTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    doneText: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "900",
      textDecorationLine: "underline",
    },
    storyTextInput: {
      flex: 1,
      textAlign: "center",
      textAlignVertical: "center",
      fontSize: 42,
      fontWeight: "900",
      paddingHorizontal: 8,
    },
    colorRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 12,
      paddingBottom: 24,
    },
    colorDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.55)",
    },
    colorDotActive: {
      borderColor: "#fff",
      transform: [{ scale: 1.18 }],
    },
    shareLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.35)",
      zIndex: 600,
      elevation: 600,
    },
    shareLoadingText: {
      marginTop: 12,
      color: "#fff",
      fontWeight: "900",
      opacity: 0.9,
    },
    camLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      // ✅ nicht komplett schwarz drüber – sonst wirkt alles “weg”
      backgroundColor: "rgba(0,0,0,0.35)",
      zIndex: 500,     // unter Pillbar
      elevation: 500,
    },

    camLoadingText: {
      marginTop: 12,
      color: "#fff",
      fontWeight: "800",
      opacity: 0.9,
    },

    camLoading: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#000",
    },

    rightOfCenter: {
      position: "absolute",
      left: "50%",
      // ✅ Abstand nach rechts (anpassen wenn du willst)
      transform: [{ translateX: 90 }],
      alignItems: "center",
      justifyContent: "center",
    },

    timerBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible", // wichtig damit Pill nicht abgeschnitten wird
    },

    timerPill: {
      position: "absolute",
      bottom: -18,
      paddingHorizontal: 10,
      height: 20,
      borderRadius: 10,
      backgroundColor: "rgba(0,0,0,0.78)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.25)",
    },

    timerPillText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.2,
    },

    timerBadge: {
      position: "absolute",
      right: -6,
      top: -6,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      backgroundColor: "rgba(0,0,0,0.75)",
      alignItems: "center",
      justifyContent: "center",
    },
    timerBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "900",
    },

    countdownOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 96, // über der shutter row
      alignItems: "center",
      justifyContent: "center",
    },
    countdownText: {
      fontSize: 54,
      fontWeight: "900",
      color: "#fff",
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowOffset: { width: 0, height: 4 },
      textShadowRadius: 10,
    },

    bottomRow: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 140,
      height: 90,
      justifyContent: "center",
    },

    centerFixed: {
      position: "absolute",
      left: "50%",
      transform: [{ translateX: -33 }], // 66/2 -> Shutter ist 66 breit
      alignItems: "center",
      justifyContent: "center",
    },

    leftOfCenter: {
      position: "absolute",
      left: "50%",
      // ✅ Abstand: je größer negative Zahl, desto weiter nach links
      transform: [{ translateX: -130 }],
      alignItems: "center",
      justifyContent: "center",
    },

    sideSpacer: { width: 40, height: 40 },

    libraryBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    libraryPreview2: {
      width: 40,
      height: 40,
      borderRadius: 12,
    },


    bottomCenterWrap: {
      alignItems: "center",
      justifyContent: "center",
    },

    

    bottomRightSpacer: {
      width: 44,
      height: 44,
    },

    iconBtnSquare: {
      width: 36,
      height: 36,
      borderRadius: 10,
    },

    libraryPreview: {
      width: 34,
      height: 34,
      borderRadius: 9,
    },


    postCard: {
      width: 320,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,0.92)",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    postHeader: {
      height: 52,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "rgba(255,255,255,0.96)",
    },
    postAvatar: { width: 30, height: 30, borderRadius: 15 },
    postUsername: { fontSize: 16, fontWeight: "900", color: "#111827", maxWidth: 240 },
    postMediaBox: { width: "100%", height: 320, backgroundColor: "#0B0F1A" },
    postCaptionBar: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: "rgba(255,255,255,0.96)",
    },
    postCaptionText: { fontSize: 14, color: "#111827" },

    root: { flex: 1 },

    previewWrap: { flex: 1, backgroundColor: "transparent" },
    canvas: { position: "absolute", overflow: "hidden", backgroundColor: "transparent" },

    // top chrome
    topLeftWrap: { position: "absolute", left: 12, zIndex: 200 },
    topRightWrap: {
      position: "absolute",
      right: 10,
      zIndex: 200,
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
    },

    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },


    // camera permission card
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
    permissionCard: {
      width: "86%",
      maxWidth: 420,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    permissionBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
    },

    // recording badge
    recBadge: {
      position: "absolute",
      top: 24,
      alignSelf: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
    },

  

    // shutter (camera)
    shutterBtn: {
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 4,
      borderColor: "#fff",
      backgroundColor: "#0b0b0b",
      alignItems: "center",
      justifyContent: "center",
    },
    shutterPressed: { transform: [{ scale: 0.96 }] },
    shutterDisabled: { opacity: 0.45 },
    shutterRecording: { width: 86, height: 86, borderRadius: 43, borderColor: "#ff5a5f" },

    shutterInner: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "#e5e5e5",
    },
    shutterInnerRec: { width: 30, height: 30, borderRadius: 6, backgroundColor: "#ff5a5f" },

    // send button (replaces shutter, same size)
    sendBtn: {
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    sendPressed: { transform: [{ scale: 0.96 }] },
    sendDisabled: { opacity: 0.6 },
  });
