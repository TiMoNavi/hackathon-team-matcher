// apps/ciaorelated/src/screens/StoryViewer.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
  Animated,
  PanResponder,
  Modal,
  Alert,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useNavigation, useRoute, CommonActions } from "@react-navigation/native";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { gql, useApolloClient, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StackActions } from "@react-navigation/native";
import { InteractionManager } from "react-native";

import { DELETE_STORY } from "../graphql/mutations/stories";
import { STORIES_FEED } from "../graphql/queries/stories";

import { avatarPlaceholder, gridPlaceholderDark, gridPlaceholderLight } from "../../assets/placeholders";
import { hapticImpact } from "../lib/safeHaptics";

import { useTranslation } from "react-i18next";

export const MARK_STORY_VIEWED = gql`
  mutation MarkStoryViewed($storyId: ID!) {
    markStoryViewed(storyId: $storyId)
  }
`;

export const STORY_VIEWERS = gql`
  query StoryViewers($storyId: ID!, $offset: Int, $limit: Int) {
    storyViewers(storyId: $storyId, offset: $offset, limit: $limit) {
      totalCount
      hasMore
      items {
        viewedAt
        viewer {
          id
          username
          avatarThumbUrl
          avatarUrl
        }
      }
    }
  }
`;

// DM Thread + Send
export const CREATE_THREAD = gql`
  mutation CreateThread($memberUserIds: [ID!]!, $title: String) {
    createThread(memberUserIds: $memberUserIds, title: $title) {
      id
    }
  }
`;

export const SEND_MESSAGE = gql`
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
    }
  }
`;

const SHARE_POST = gql`
  query SharePostSticker($id: ID!) {
    post(id: $id) {
      id
      caption
      imageUrl
      thumbUrl
      media {
        id
        imageUrl
        thumbUrl
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

export const STORY_VIEW_COUNT = gql`
  query StoryViewCount($storyId: ID!) {
    storyViewers(storyId: $storyId, offset: 0, limit: 0) {
      totalCount
    }
  }
`;

const STORY_MENTIONS = gql`
  query StoryMentions($storyId: ID!) {
    storyMentions(storyId: $storyId) {
      id
      username
      clickCount
      mentionedUser {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
    }
  }
`;

const STORY_LINK_CLICKS = gql`
  query StoryLinkClicks($storyId: ID!) {
    storyLinkClicks(storyId: $storyId) {
      id
      overlayId
      label
      url
      clickCount
    }
  }
`;

const STORY_LOCATION_CLICKS = gql`
  query StoryLocationClicks($storyId: ID!) {
    storyLocationClicks(storyId: $storyId) {
      id
      overlayId
      label
      clickCount
    }
  }
`;

const STORY_POLL_CLICKS = gql`
  query StoryPollClicks($storyId: ID!) {
    storyPollClicks(storyId: $storyId) {
      id
      overlayId
      question
      totalClickCount
      options {
        optionIndex
        optionText
        clickCount
      }
    }
  }
`;

const STORY_QUESTION_ANSWERS = gql`
  query StoryQuestionAnswers($storyId: ID!) {
    storyQuestionAnswers(storyId: $storyId) {
      id
      storyId
      overlayId
      prompt
      answer
      createdAt
      respondent {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
    }
  }
`;

const STORY_BY_ID = gql`
  query StoryById($id: ID!) {
    story(id: $id) {
      id
      mediaUrl
      thumbUrl
      mime
      isVideo
      duration
      editJson
      isCloseFriends
      createdAt
      seenByMe
      author {
        id
        username
        avatarUrl
        avatarThumbUrl
        __typename
      }
      __typename
    }
  }
`;

const MARK_STORY_MENTION_CLICKED = gql`
  mutation MarkStoryMentionClicked($storyId: ID!, $username: String!) {
    markStoryMentionClicked(storyId: $storyId, username: $username)
  }
`;

const MARK_STORY_LINK_CLICKED = gql`
  mutation MarkStoryLinkClicked($storyId: ID!, $overlayId: String, $url: String!) {
    markStoryLinkClicked(storyId: $storyId, overlayId: $overlayId, url: $url)
  }
`;

const MARK_STORY_LOCATION_CLICKED = gql`
  mutation MarkStoryLocationClicked($storyId: ID!, $overlayId: String, $label: String!) {
    markStoryLocationClicked(storyId: $storyId, overlayId: $overlayId, label: $label)
  }
`;

const MARK_STORY_POLL_CLICKED = gql`
  mutation MarkStoryPollClicked($storyId: ID!, $overlayId: String, $optionIndex: Int!, $optionText: String!) {
    markStoryPollClicked(storyId: $storyId, overlayId: $overlayId, optionIndex: $optionIndex, optionText: $optionText)
  }
`;

const ANSWER_STORY_QUESTION = gql`
  mutation AnswerStoryQuestion($storyId: ID!, $overlayId: String, $prompt: String!, $answer: String!) {
    answerStoryQuestion(storyId: $storyId, overlayId: $overlayId, prompt: $prompt, answer: $answer)
  }
`;


const gridPlaceholderForMode = (mode?: string) => (mode === "dark" ? gridPlaceholderDark : gridPlaceholderLight);

function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder; // local require()
}



type Slide = {
  id: string;
  uri: string;
  when?: string;
  caption?: string;
  isVideo?: boolean;
  thumb?: string | null;
  userId?: string | null;
  durationSec?: number | null;
  editJson?: string | null;
  mime?: string | null;
  viewCount?: number | null;
  seenByMe?: boolean | null;
};

type RouteParams = {
  user: { id?: string; username: string; avatarUrl?: string | null; avatarThumbUrl?: string | null };
  slides: Slide[];
  startIndex?: number;
  mine?: boolean;
  queue?: Array<{
    user: { id?: string; username: string; avatarUrl?: string | null; avatarThumbUrl?: string | null };
    slides: Slide[];
  }>;
  queueIndex?: number;
  fetchFromFeed?: boolean;
  storyId?: string;
  onlyUnread?: boolean;
};

const { width, height } = Dimensions.get("window");
const IMAGE_DURATION_MS = 6000;

type EditJson = {
  stage: any;
  fitMode?: "FIT" | "FILL";
  bgColor?: string;
  media?: { x?: number; y?: number; s?: number; r?: number };
  overlays?: Array<{
    id?: string;
    kind?: "text" | "sticker" | "link" | "mention" | "location" | "poll" | "question";
    text?: string;
    url?: string;
    username?: string;
    question?: string;
    options?: string[];
    prompt?: string;
    placeholder?: string;
    avatarUri?: string | null;
    icon?: keyof typeof Ionicons.glyphMap;
    color?: string;
    bg?: string;
    x?: number;
    y?: number;
    size?: number;
  }>;
  sharedPost?: {
    postId: string;
    x?: number;
    y?: number;
    s?: number;
    r?: number;
  };
};

type ViewerRow = {
  viewedAt: string;
  viewer: { id: string; username: string;avatarThumbUrl?: string | null; avatarUrl?: string | null };
};

type HintState = { postId: string } | null;

const HINT_AUTOHIDE_MS = 3500;

function safeParseEditJson(s?: string | null): EditJson | null {
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" ? (obj as EditJson) : null;
  } catch {
    return null;
  }
}

function formatRelative(input: string | null | undefined, t: (k: string, o?: any) => string): string {
  if (!input) return "";

  // wenn schon als "vor ..." reinkommt (legacy), lass es erstmal so
  if (/vor\s+/i.test(input)) return input;

  const ts = new Date(input).getTime();
  if (!Number.isFinite(ts)) return input;

  const diffMs = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diffMs / 1000);

  if (sec < 5) return t("time.justNow");

  if (sec < 60) {
    return t("time.secondsAgo", { count: sec });
  }

  const min = Math.floor(sec / 60);
  if (min < 60) {
    return t("time.minutesAgo", { count: min });
  }

  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return t("time.hoursAgo", { count: hr });
  }

  const day = Math.floor(hr / 24);
  if (day < 7) {
    return t("time.daysAgo", { count: day });
  }

  const wk = Math.floor(day / 7);
  return t("time.weeksAgo", { count: wk });
}


const resumeKey = (uid?: string | null) => `story_resume_index:${(uid ?? "").trim() || "unknown"}`;
function computeFirstUnreadIndex(slides: Slide[]): number {
  if (!slides?.length) return 0;
  const hasSeenField = slides.some((s) => typeof (s as any).seenByMe === "boolean" || (s as any).seenByMe === null);
  if (!hasSeenField) return 0;

  const i = slides.findIndex((s: any) => s.seenByMe !== true);
  return i >= 0 ? i : 0;
}

function areAllSeen(slides: Slide[]) {
  const hasSeenField = slides.some((s: any) => typeof s.seenByMe === "boolean" || s.seenByMe === null);
  if (!hasSeenField) return false;
  return slides.every((s: any) => s.seenByMe === true);
}


function findPathToRoute(state: any, targetName: string, acc: string[] = []): string[] | null {
  if (!state?.routes) return null;

  for (const r of state.routes) {
    if (r?.name === targetName) return [...acc, r.name];

    const childState = r.state;
    if (childState) {
      const found = findPathToRoute(childState, targetName, [...acc, r.name]);
      if (found) return found;
    }
  }
  return null;
}

function buildNestedNavigateAction(path: string[], params: any) {
  // path z.B. ["MainTabs","HomeStack","PostDetail"]
  let nested: any = { name: path[path.length - 1], params };

  for (let i = path.length - 2; i >= 0; i--) {
    nested = { name: path[i], params: { screen: nested.name, params: nested.params } };
  }

  return CommonActions.navigate(nested);
}



export default function StoryViewer() {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const COLORS = (theme?.colors ?? {}) as any;
  const gridPlaceholder = useMemo(() => gridPlaceholderForMode(theme.mode), [theme.mode]);

  function avatarSource(thumb?: string | null, full?: string | null) {
    if (thumb) return { uri: thumb };
    if (full) return { uri: full };
    return avatarPlaceholder;
  }
  const s = useMemo(() => styles(COLORS), [COLORS]);
  const client = useApolloClient();

  const {
    user,
    slides: inputSlides,
    startIndex: startIndexParam,
    mine: mineParam = false,
    queue,
    queueIndex: queueIndexParam = 0,
    fetchFromFeed = false,
    storyId,
    onlyUnread = false,
  } = route.params as RouteParams;

  

  const normalizeUser = (u: any) => ({
    id: u?.id,
    username: u?.username ?? "",
    avatarThumbUrl: u?.avatarThumbUrl ?? null,
    avatarUrl: u?.avatarUrl ?? u?.avatar ?? null, // ✅ legacy support
  });

  // ✅ ACTIVE state: switch user/slides without navigation (no "zu/aufklappen")
  const [activeUser, setActiveUser] = useState<RouteParams["user"]>(normalizeUser(user));
  const [activeSlides, setActiveSlides] = useState<Slide[]>(inputSlides);
  const [mine, setMine] = useState<boolean>(!!mineParam);

  const [loadingSlides, setLoadingSlides] = React.useState(false);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  
   

  const insets = useSafeAreaInsets();


  const REPLY_BAR_H = 64;
  const REPLY_BAR_OFFSET = 22;
  const replyBottomPad = Math.max(10, insets.bottom + 6);

  const [screenH, setScreenH] = useState(Dimensions.get("window").height);

  const mediaTop = 0;
  const STORY_BAR_BASE_H = 98;  // wie BottomCreateBar
  const reservedBottom = STORY_BAR_BASE_H + (insets.bottom ?? 0);
  const mediaH = Math.max(1, screenH - reservedBottom);
  const PROGRESS_OVERLAP = 25; // px, sauber & kontrolliert


  // ✅ der echte Wizard-Viewport (Kamera-Fläche)
  const mediaViewportStyle = {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: insets.top,
    bottom: reservedBottom,
    overflow: "hidden" as const,
    backgroundColor: COLORS.bg ?? "#000",
  };




  const LIFT = 12;              // wie BottomCreateBar

  // wenn du wirklich den gleichen “freien” Bereich willst, nimm optional:
  const reservedBottomVisual = reservedBottom + LIFT; // <- das ist oft genau die 10–20px Lücke

  const tapBottomInset = reservedBottom;

  const { width } = Dimensions.get("window");
  // ✅ sichtbarer Bereich für Medien: oben bis unten (inkl. safe area), aber wir wollen oben "kleben"

  const mediaBottom = tapBottomInset; // wir lassen Media bis ganz unten laufen (Replybar liegt overlay)
 


  const WIZARD_BAR_H = 170; // <- nimm den Wert, der bei dir im Wizard real passt


 



  // queue refs (avoid stale closures)
  const queueRef = useRef<RouteParams["queue"]>(queue);
  const queueIndexRef = useRef<number>(queueIndexParam ?? 0);
  const [viewCountByStory, setViewCountByStory] = useState<Record<string, number>>({});
  const [loadViewCount] = useLazyQuery(STORY_VIEW_COUNT, {
    fetchPolicy: "cache-and-network",
  });

  type NaturalSize = { width: number; height: number } | null;

const [videoNatural, setVideoNatural] = useState<NaturalSize>(null);

const onReadyForDisplay = useCallback((e: any) => {
  const ns = e?.naturalSize;
  const w = Number(ns?.width);
  const h = Number(ns?.height);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    setVideoNatural({ width: w, height: h });
  }
}, []);


  
  useEffect(() => {
    let cancelled = false;

    async function loadIfNeeded() {
      if (!fetchFromFeed) return;
      if (loadedOnce) return;

    
      const uid = activeUser?.id ?? null;
      if (!uid && !storyId) return; // ohne uid UND ohne storyId kann man nix laden

      // Wenn wir doch schon Slides haben, sind wir "done"
      if (activeSlides?.length) {
        setLoadedOnce(true);
        return;
      }

      setLoadingSlides(true);

      try {
        const res = await client.query({
          query: STORIES_FEED,
          variables: { offset: 0, limit: 50 },
          fetchPolicy: "network-only",
        });

        const all = Array.isArray(res?.data?.storiesFeed) ? res.data.storiesFeed : [];
        
        const filtered = uid ? all.filter((s: any) => s?.author?.id === uid) : all;

        let slides: Slide[] = filtered.map((s: any) => ({
          id: s.id,
          uri: s.mediaUrl ?? s.url ?? s.signedUrl,
          when: s.createdAt,
          isVideo:
            (s.mime ?? "").startsWith("video/") ||
            /\.(mp4|mov|m4v|webm)(\?|$)/i.test(s.mediaUrl ?? s.url ?? ""),
          thumb: s.thumbUrl ?? null,
          userId: uid,
          durationSec: s.duration ? Number(s.duration) : null,
          editJson: s.editJson ?? null,
          mime: s.mime ?? null,

          // ✅ wichtig
          seenByMe: typeof s.seenByMe === "boolean" ? s.seenByMe : (s.seenByMe ?? null),
        }));

        // ✅ KRITISCH: Reihenfolge fixen (alt -> neu)
        slides.sort((a, b) => {
          const at = new Date(a.when ?? 0).getTime();
          const bt = new Date(b.when ?? 0).getTime();
          return at - bt;
        });

        if (storyId && !slides.some((x) => x.id === storyId)) {
          const one = await client.query({
            query: STORY_BY_ID,
            variables: { id: storyId },
            fetchPolicy: "network-only",
          });

          const s = one?.data?.story;
          if (s?.id) {
            slides = [{
              id: s.id,
              uri: s.mediaUrl ?? s.url ?? s.signedUrl,
              when: s.createdAt,
              isVideo:
                (s.mime ?? "").startsWith("video/") ||
                /\.(mp4|mov|m4v|webm)(\?|$)/i.test(s.mediaUrl ?? s.url ?? ""),
              thumb: s.thumbUrl ?? null,
              userId: s.author?.id ?? uid,
              durationSec: s.duration ? Number(s.duration) : null,
              editJson: s.editJson ?? null,
              mime: s.mime ?? null,
              seenByMe: typeof s.seenByMe === "boolean" ? s.seenByMe : (s.seenByMe ?? null),
            }];
          }
        }

        if (onlyUnread) {
          const unreadOnly = slides.filter((s: any) => s?.seenByMe !== true);

          // wenn wirklich nix ungesehen ist -> fallback: zeig trotzdem alles (oder du könntest hier "Keine ungesehenen" anzeigen)
          if (unreadOnly.length > 0) slides = unreadOnly;
        }



        if (cancelled) return;

        setActiveSlides(slides);
        setLoadedOnce(true);

        // optional jump
        if (storyId) {
          const idx = slides.findIndex((x) => x.id === storyId);
          if (idx >= 0) setIndex(idx);
        }
      } catch (e) {
        console.log("StoryViewer loadFromFeed failed", e);
        if (!cancelled) setLoadedOnce(true);
      } finally {
        if (!cancelled) setLoadingSlides(false);
      }
    }

    loadIfNeeded();
    return () => {
      cancelled = true;
    };
  }, [
    fetchFromFeed,
    loadedOnce,
    loadingSlides,
    activeUser?.id,
    activeSlides?.length,
    storyId,
    client,
  ]);


  useEffect(() => {
    setActiveUser(normalizeUser(user));
    if (!fetchFromFeed) {
      setActiveSlides(inputSlides);
    } else {
      // wenn Push-feed, nur initial übernehmen (meist [])
      // aber NICHT später geladene Slides überschreiben
      if (!loadedOnce) setActiveSlides(inputSlides);
    }
    setMine(!!mineParam);
    queueRef.current = queue;
    queueIndexRef.current = queueIndexParam ?? 0;
  }, [user, inputSlides, mineParam, queue, queueIndexParam]);

 


  const [hint, setHint] = React.useState<HintState>(null);
  const hideTimer = React.useRef<any>(null);
  const startIndexOverrideRef = useRef<number | null>(null);


  const showHint = React.useCallback((postId: string) => {
    setPaused(true);
    setHint({ postId });

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setHint(null);
      setPaused(false);       // ✅ weiterlaufen
    }, HINT_AUTOHIDE_MS);
    
  }, []);

  React.useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);


  const slides = activeSlides;

  const initialIndex = useMemo(() => {
    if (typeof startIndexParam === "number") return startIndexParam;
    return computeFirstUnreadIndex(slides);
  }, [startIndexParam, slides]);

  const [index, setIndex] = useState(initialIndex);

const didInitForSigRef = useRef<string | null>(null);

const slidesSig = useMemo(() => {
  // stabiler key: userId + first/last story id + length
  const first = slides?.[0]?.id ?? "none";
  const last = slides?.[slides.length - 1]?.id ?? "none";
  return `${activeUser?.id ?? "unknown"}:${slides.length}:${first}:${last}`;
}, [activeUser?.id, slides]);


useEffect(() => {
  if (!slides.length) return;

  const maxIdx = Math.max(0, slides.length - 1);

  // ✅ 0) Queue-switch override hat absolute Priorität
  // (verhindert, dass startIndexParam / alte Logik "eins davor" setzt)
  if (startIndexOverrideRef.current != null) {
    const v = Math.max(0, Math.min(startIndexOverrideRef.current, maxIdx));
    startIndexOverrideRef.current = null;

    // wichtig: diese Liste als "initialisiert" markieren,
    // sonst könnte der Effect direkt nochmal laufen
    didInitForSigRef.current = slidesSig;

    setIndex(v);
    return;
  }

  // ✅ nur einmal pro “neuer Story-Liste”
  if (didInitForSigRef.current === slidesSig) return;
  didInitForSigRef.current = slidesSig;

  // storyId deep-link hat prio
  if (storyId) {
    const idx = slides.findIndex((x) => x.id === storyId);
    if (idx >= 0) {
      setIndex(Math.max(0, Math.min(idx, maxIdx)));
      return;
    }
  }

  // onlyUnread => 0 (weil Liste schon gefiltert ist)
  if (onlyUnread) {
    setIndex(0);
    return;
  }

  const base =
    typeof startIndexParam === "number"
      ? startIndexParam
      : computeFirstUnreadIndex(slides);

  // mine: wie gehabt
  if (mine) {
    setIndex(Math.max(0, Math.min(base, maxIdx)));
    return;
  }

  // not mine: wenn alles gesehen -> 0, sonst first unread (base)
  const allSeen = areAllSeen(slides);
  if (allSeen) {
    setIndex(0);
    return;
  }

  setIndex(Math.max(0, Math.min(base, maxIdx)));
}, [slidesSig, storyId, onlyUnread, startIndexParam, mine, slides]);


  // keep latest for callbacks
  const indexRef = useRef(0);
  const slidesRef = useRef<Slide[]>(slides);
  const userRef = useRef(activeUser);
  const mineRef = useRef(mine);

  useEffect(() => void (indexRef.current = index), [index]);
  useEffect(() => void (slidesRef.current = slides), [slides]);
  useEffect(() => void (userRef.current = activeUser), [activeUser]);
  useEffect(() => void (mineRef.current = mine), [mine]);

  // overlays
  const [showActions, setShowActions] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [paused, setPaused] = useState(false);

  // Reply UI
  const [replyText, setReplyText] = useState("");
  const replyInputRef = useRef<TextInput | null>(null);
  const [emojiSheetOpen, setEmojiSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fade = useRef(new Animated.Value(1)).current;
  const shift = useRef(new Animated.Value(0)).current;

  // progress widths
  const [rowW, setRowW] = useState(0);
  const trackW = useMemo(() => {
    const len = slides.length;
    if (rowW <= 0 || len <= 0) return 0;
    return (rowW - (len - 1) * 4) / len;
  }, [rowW, slides.length]);

  const progressPx = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // keep progress value
  const progressValRef = useRef(0);
  useEffect(() => {
    const id = progressPx.addListener(({ value }) => (progressValRef.current = value));
    return () => progressPx.removeListener(id);
  }, [progressPx]);

  // timer fallback (prevents "stuck" if animation stops)
  const imgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runTokenRef = useRef(0);
  const lastSlideIdRef = useRef<string | null>(null);

  const clearImgTimeout = useCallback(() => {
    if (imgTimeoutRef.current) {
      clearTimeout(imgTimeoutRef.current);
      imgTimeoutRef.current = null;
    }
  }, []);

  // video
  const vref = useRef<Video | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  const closingRef = useRef(false);

  const total = slides?.length ?? 0;
  const cur = total > 0 && index >= 0 && index < total ? slides[index] : undefined;
  const currentStoryId = cur?.id ?? null;

  // GraphQL
  const [deleteStory, { loading: deleting }] = useMutation(DELETE_STORY, {
    onError: (e) => Alert.alert(t("common.error"), e.message),
    update(cache, _result, options) {
      const storyId = (options?.variables as any)?.id as string | undefined;
      if (!storyId) return;
      cache.evict({ id: cache.identify({ __typename: "Story", id: storyId }) });
      cache.gc();
    },
  });

const [markViewed] = useMutation(MARK_STORY_VIEWED, {
  update(cache, _res, { variables }) {
    const storyId = (variables as any)?.storyId as string | undefined;
    if (!storyId) return;

    // ✅ Falls Story als Entity normalisiert ist
    const entityId = cache.identify({ __typename: "Story", id: storyId });
    if (entityId) {
      cache.modify({
        id: entityId,
        fields: {
          seenByMe() {
            return true;
          },
        },
      });
    }

    // ✅ Zusätzlich: storiesFeed-Liste direkt patchen (wichtig wenn nicht normalisiert)
    cache.modify({
      id: "ROOT_QUERY",
      fields: {
        storiesFeed(
          existing: readonly any[] = [],
          { readField }
        ) {
          return existing.map((ref) => {
            const id = readField<string>("id", ref);
            if (id !== storyId) return ref;

            return {
              ...ref,
              seenByMe: true,
            };
          });
        },
      },
    });

  },
});

  const [createThread] = useMutation(CREATE_THREAD);
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [markMentionClicked] = useMutation(MARK_STORY_MENTION_CLICKED);
  const [markLinkClicked] = useMutation(MARK_STORY_LINK_CLICKED);
  const [markLocationClicked] = useMutation(MARK_STORY_LOCATION_CLICKED);
  const [markPollClicked] = useMutation(MARK_STORY_POLL_CLICKED);
  const [answerStoryQuestion] = useMutation(ANSWER_STORY_QUESTION);

  const VIEWERS_PAGE = 50;
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  const [viewersTotal, setViewersTotal] = useState<number>(0);
  const [viewersHasMore, setViewersHasMore] = useState<boolean>(false);
  const [viewersOffset, setViewersOffset] = useState<number>(0);
  const viewersCacheRef = useRef<Map<string, { items: ViewerRow[]; total: number; hasMore: boolean }>>(new Map());

  const [loadViewers, { data: viewersData, loading: viewersLoading }] = useLazyQuery(STORY_VIEWERS, {
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });
  const [loadMentionStats, { data: mentionStatsData }] = useLazyQuery(STORY_MENTIONS, {
    fetchPolicy: "cache-and-network",
  });
  const [loadLinkStats, { data: linkStatsData }] = useLazyQuery(STORY_LINK_CLICKS, {
    fetchPolicy: "cache-and-network",
  });
  const [loadLocationStats, { data: locationStatsData }] = useLazyQuery(STORY_LOCATION_CLICKS, {
    fetchPolicy: "cache-and-network",
  });
  const [loadPollStats, { data: pollStatsData }] = useLazyQuery(STORY_POLL_CLICKS, {
    fetchPolicy: "cache-and-network",
  });
  const [loadQuestionAnswers, { data: questionAnswersData }] = useLazyQuery(STORY_QUESTION_ANSWERS, {
    fetchPolicy: "cache-and-network",
  });

  const [questionComposer, setQuestionComposer] = useState<null | { overlayId: string | null; prompt: string }>(null);
  const [questionAnswerText, setQuestionAnswerText] = useState("");
  const [sendingQuestionAnswer, setSendingQuestionAnswer] = useState(false);

  // pro Story einmal
  const viewedOnceRef = useRef<Set<string>>(new Set());

  // detect video
  const isVideo =
    cur?.isVideo === true ||
    (cur?.durationSec ?? 0) > 0 ||
    /\.(mp4|mov|m4v|webm)(\?|$)/i.test(cur?.uri ?? "") ||
    /^video\//i.test(cur?.mime ?? "");

  // editJson only for video
  // ✅ editJson for all stories
  const edit = useMemo(() => safeParseEditJson(cur?.editJson), [cur?.editJson]);
  const sharedPost = edit?.sharedPost?.postId ? edit.sharedPost : null;
  const storyOverlays = Array.isArray(edit?.overlays) ? edit.overlays : [];


  
  

  const mediaTransformStyle = useMemo(() => {
    if (!edit?.media) return null;
    const x = Number.isFinite(edit.media.x as any) ? (edit.media.x as number) : 0;
    const y = Number.isFinite(edit.media.y as any) ? (edit.media.y as number) : 0;
    const sc = Number.isFinite(edit.media.s as any) ? (edit.media.s as number) : 1;
    const r = Number.isFinite(edit.media.r as any) ? (edit.media.r as number) : 0;



    const viewportTop = insets.top;
    const stageH_now = screenH - reservedBottom - viewportTop;

    const stageH_saved = Number(edit?.stage?.h ?? stageH_now);

    // ✅ nur kompensieren wenn saved wirklich anders war (z.B. alte Stories)
    const delta = stageH_now - stageH_saved;
    const yComp = Math.abs(delta) > 1 ? y + delta / 2 : y;


        return {
      transform: [
        { translateX: x },
        { translateY: yComp },
        { rotateZ: `${r}rad` },
        { scale: sc },
      ],
    } as const;
  }, [edit?.media]);


 

  const doCloseNow = useCallback(() => {
    // StoryViewer ist ein Modal im RootStack -> goBack ist korrekt.
    if (nav.canGoBack?.()) nav.goBack();
  }, [nav]);



  const gracefulClose = useCallback(() => {
    setPaused(true);
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(shift, { toValue: 40, duration: 160, useNativeDriver: true }),
    ]).start(() => doCloseNow());
  }, [fade, shift, doCloseNow]);

  // keep index in bounds
  useEffect(() => {
    if (total === 0) {
      // ✅ Wenn wir aus Push kommen und erst nachladen wollen: NICHT schließen.
      if (fetchFromFeed && (!loadedOnce || loadingSlides)) return;

      if (!closingRef.current) {
        closingRef.current = true;
        requestAnimationFrame(() => gracefulClose());
      }
      return;
    }
    if (index > total - 1) setIndex(total - 1);
    if (index < 0) setIndex(0);
  }, [total, index, gracefulClose, fetchFromFeed, loadedOnce, loadingSlides]);
  

  useEffect(() => {
    if (!mine) return;
    if (!currentStoryId) return;

    // ✅ already known
    if (typeof viewCountByStory[currentStoryId] === "number") return;

    loadViewCount({ variables: { storyId: currentStoryId } })
      .then((res) => {
        const n = Number(res?.data?.storyViewers?.totalCount);
        if (!Number.isFinite(n)) return;

        setViewCountByStory((prev) => ({ ...prev, [currentStoryId]: n }));

        // optional: auch in slides patchen
        setActiveSlides((old) =>
          old.map((sl) => (sl.id === currentStoryId ? { ...sl, viewCount: n } : sl))
        );
      })
      .catch(() => {});
  }, [mine, currentStoryId, loadViewCount, viewCountByStory]);


  // ✅ switch user within same screen (no navigation)
  const pan = useRef(new Animated.Value(0)).current;
  const softSwitchTo = useCallback(
    (nextUser: any, nextSlides: Slide[], nextMine: boolean, startIdx: number) => {
      closingRef.current = false;

      fade.setValue(1);
      shift.setValue(0);
      pan.setValue(0);

      setShowActions(false);
      setEmojiSheetOpen(false);
      setViewersOpen(false);
      setPaused(false);

      // reset progress
      animRef.current?.stop();
      clearImgTimeout();
      runTokenRef.current += 1;
      progressPx.setValue(0);
      lastSlideIdRef.current = null;
      setVideoReady(false);

      setActiveUser(normalizeUser(nextUser));
      setActiveSlides(nextSlides);
      setMine(!!nextMine);

      setIndex(Math.max(0, Math.min(startIdx, Math.max(0, nextSlides.length - 1))));

      try {
        vref.current?.setStatusAsync({ positionMillis: 0, shouldPlay: true });
      } catch {}
    },
    [clearImgTimeout, fade, pan, progressPx, shift]
  );

  const goNextUserInQueue = useCallback((): boolean => {
    const q = queueRef.current ?? [];
    if (!q.length) return false;

    const qi = queueIndexRef.current ?? 0;
    const nextQi = qi + 1;
    if (nextQi >= q.length) return false;

    const next = q[nextQi];
    if (!next?.user || !next?.slides?.length) return false;

    queueIndexRef.current = nextQi;

    const base = computeFirstUnreadIndex(next.slides);
    // ✅ override setzen, damit Init-Effect NICHT zurück auf startIndexParam fällt
    startIndexOverrideRef.current = base;

    softSwitchTo(next.user, next.slides, false, base);
    return true;
  }, [softSwitchTo]);

  const goPrevUserInQueue = useCallback((): boolean => {
    const q = queueRef.current ?? [];
    if (!q.length) return false;

    const qi = queueIndexRef.current ?? 0;
    const prevQi = qi - 1;
    if (prevQi < 0) return false;

    const prev = q[prevQi];
    if (!prev?.user || !prev?.slides?.length) return false;

    queueIndexRef.current = prevQi;

    // go to last slide of prev user
    softSwitchTo(prev.user, prev.slides, false, Math.max(0, prev.slides.length - 1));
    return true;
  }, [softSwitchTo]);

  const goNext = useCallback(() => {
    if (closingRef.current) return;

    const list = slidesRef.current ?? [];
    const last = list.length - 1;
    const curIdx = indexRef.current;

    if (curIdx < last) {
      setIndex(curIdx + 1);
      return;
    }

    // end of user -> try queue switch without navigation
    const switched = goNextUserInQueue();
    if (!switched && !closingRef.current) {
      closingRef.current = true;
      requestAnimationFrame(() => gracefulClose());
    }
  }, [goNextUserInQueue, gracefulClose]);

  const goPrev = useCallback(() => {
    if (closingRef.current) return;

    const curIdx = indexRef.current;
    if (curIdx > 0) {
      setIndex(curIdx - 1);
      return;
    }

    // beginning -> try previous user in queue
    const switched = goPrevUserInQueue();
    if (!switched && !closingRef.current) {
      closingRef.current = true;
      requestAnimationFrame(() => gracefulClose());
    }
  }, [goPrevUserInQueue, gracefulClose]);

  const pausePlayback = useCallback(() => {
    clearImgTimeout();
    animRef.current?.stop();
    try {
      vref.current?.setStatusAsync({ shouldPlay: false });
    } catch {}
    setPaused(true);
  }, [clearImgTimeout]);

  const resumePlayback = useCallback(() => setPaused(false), []);

  const longPressRef = useRef(false);

  const onHoldStart = useCallback(() => {
    longPressRef.current = true;
    pausePlayback();
  }, [pausePlayback]);

  const onHoldEnd = useCallback(() => {
    if (longPressRef.current) {
      longPressRef.current = false;
      resumePlayback();
    }
  }, [resumePlayback]);


  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  }, []);

  const openActions = useCallback(() => {
    pausePlayback();
    setShowActions(true);
  }, [pausePlayback]);

  const openViewers = useCallback(() => {
    if (!currentStoryId) return;
    pausePlayback();
    setViewersOpen(true);

    const cached = viewersCacheRef.current.get(currentStoryId);
    if (cached) {
      setViewers(cached.items);
      setViewersTotal(cached.total);
      setViewersHasMore(cached.hasMore);
      setViewersOffset(cached.items.length);
    } else {
      setViewers([]);
      setViewersTotal(0);
      setViewersHasMore(false);
      setViewersOffset(0);
    }

    loadViewers({ variables: { storyId: currentStoryId, offset: 0, limit: VIEWERS_PAGE } }).catch(() => {});
    loadMentionStats({ variables: { storyId: currentStoryId } }).catch(() => {});
    loadLinkStats({ variables: { storyId: currentStoryId } }).catch(() => {});
    loadLocationStats({ variables: { storyId: currentStoryId } }).catch(() => {});
    loadPollStats({ variables: { storyId: currentStoryId } }).catch(() => {});
    loadQuestionAnswers({ variables: { storyId: currentStoryId } }).catch(() => {});
  }, [currentStoryId, loadLinkStats, loadLocationStats, loadMentionStats, loadPollStats, loadQuestionAnswers, loadViewers, pausePlayback]);

  const closeViewers = useCallback(() => {
    setViewersOpen(false);
    resumePlayback();
  }, [resumePlayback]);

  const closeEmojiSheet = useCallback(() => {
    setEmojiSheetOpen(false);
    resumePlayback();
  }, [resumePlayback]);

  const goUserProfile = useCallback(
    (v: { id: string; username: string }) => {
      setViewersOpen(false);
      setPaused(true);
      nav.navigate("UserProfile", { username: v.username });
    },
    [nav]
  );

  const onMentionPress = useCallback(
    (username: string) => {
      const clean = String(username || "").replace(/^@/, "").trim();
      if (!clean || !currentStoryId) return;
      pausePlayback();
      markMentionClicked({ variables: { storyId: currentStoryId, username: clean } }).catch(() => {});
      nav.navigate("UserProfile", { username: clean });
    },
    [currentStoryId, markMentionClicked, nav, pausePlayback]
  );

  const onLinkPress = useCallback(
    async (url: string, overlayId?: string | null) => {
      if (!currentStoryId) return;
      const raw = String(url || "").trim();
      if (!raw) return;
      const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

      pausePlayback();
      markLinkClicked({
        variables: {
          storyId: currentStoryId,
          overlayId: overlayId || null,
          url: target,
        },
      }).catch(() => {});

      try {
        const canOpen = await Linking.canOpenURL(target);
        if (!canOpen) throw new Error("cannot-open-url");
        await Linking.openURL(target);
      } catch {
        showToast(t("storyviewer.linkOpenFailed"));
      }
    },
    [currentStoryId, markLinkClicked, pausePlayback, showToast, t]
  );

  const onLocationPress = useCallback(
    (label: string, overlayId?: string | null) => {
      const clean = String(label || "").replace(/\s+/g, " ").trim();
      if (!clean || !currentStoryId) return;

      pausePlayback();
      markLocationClicked({
        variables: {
          storyId: currentStoryId,
          overlayId: overlayId || null,
          label: clean,
        },
      }).catch(() => {});

      nav.dispatch(
        CommonActions.navigate({
          name: "AppTabs",
          params: {
            screen: "Vlogs",
            params: {
              initialLocationSearch: clean,
              searchNonce: Date.now(),
            },
          },
        })
      );
    },
    [currentStoryId, markLocationClicked, nav, pausePlayback]
  );

  const onPollOptionPress = useCallback(
    (overlayId: string | null, optionIndex: number, optionText: string) => {
      if (!currentStoryId) return;
      const clean = String(optionText || "").replace(/\s+/g, " ").trim();
      if (!clean) return;

      pausePlayback();
      markPollClicked({
        variables: {
          storyId: currentStoryId,
          overlayId: overlayId || null,
          optionIndex,
          optionText: clean,
        },
      }).catch(() => {});
      showToast(t("storyviewer.pollVoteSaved"));
    },
    [currentStoryId, markPollClicked, pausePlayback, showToast, t]
  );

  const onQuestionPress = useCallback(
    (overlayId: string | null, prompt: string) => {
      const cleanPrompt = String(prompt || "").replace(/\s+/g, " ").trim();
      if (!cleanPrompt) return;
      pausePlayback();
      if (mine) {
        openViewers();
        return;
      }
      setQuestionAnswerText("");
      setQuestionComposer({ overlayId, prompt: cleanPrompt });
    },
    [mine, openViewers, pausePlayback]
  );

  const closeQuestionComposer = useCallback(() => {
    setQuestionComposer(null);
    setQuestionAnswerText("");
    if (!viewersOpen && !emojiSheetOpen && !showActions) resumePlayback();
  }, [emojiSheetOpen, resumePlayback, showActions, viewersOpen]);

  const submitQuestionAnswer = useCallback(async () => {
    if (!currentStoryId || !questionComposer) return;
    const answer = questionAnswerText.replace(/\s+/g, " ").trim();
    if (!answer) return;

    setSendingQuestionAnswer(true);
    try {
      await answerStoryQuestion({
        variables: {
          storyId: currentStoryId,
          overlayId: questionComposer.overlayId,
          prompt: questionComposer.prompt,
          answer,
        },
      });
      hapticImpact();
      showToast(t("storyviewer.questionAnswerSent"));
      closeQuestionComposer();
    } catch (e: any) {
      Alert.alert(t("storyviewer.questionAnswerFailed"), e?.message ?? t("storyviewer.sendFailed"));
    } finally {
      setSendingQuestionAnswer(false);
    }
  }, [answerStoryQuestion, closeQuestionComposer, currentStoryId, questionAnswerText, questionComposer, showToast, t]);

  const openQuestionAnswerChat = useCallback(
    async (answerRow: any) => {
      const respondent = answerRow?.respondent;
      const respondentId = respondent?.id;
      if (!respondentId) return;

      try {
        const th = await createThread({ variables: { memberUserIds: [respondentId] } });
        const threadId = th?.data?.createThread?.id;
        if (!threadId) throw new Error(t("storyviewer.threadCreateFailed"));

        setViewersOpen(false);
        setPaused(true);
        nav.navigate("Chat", {
          threadId,
          title: respondent?.username ? `@${respondent.username}` : t("storyviewer.questionReplyTitle"),
          initialDraft: t("storyviewer.questionReplyDraft", {
            question: answerRow?.prompt ?? "",
            answer: answerRow?.answer ?? "",
          }),
        });
      } catch (e: any) {
        showToast(e?.message ?? t("storyviewer.threadCreateFailed"));
      }
    },
    [createThread, nav, showToast, t]
  );

  useEffect(() => {
    const next = slides[index + 1];
    if (!next) return;

    // preload thumb (für Video) und/oder image
    const uris = [next.thumb, next.uri].filter(Boolean) as string[];
    if (uris.length) {
      ExpoImage.prefetch(uris);
    }
  }, [index, slides]);


  useEffect(() => {
    const page = viewersData?.storyViewers;
    if (!page || !currentStoryId) return;

    const incoming: ViewerRow[] = (page.items ?? []) as ViewerRow[];

    setViewers((prev) => {
      const map = new Map<string, ViewerRow>();
      for (const v of prev) map.set(v.viewer.id, v);
      for (const v of incoming) map.set(v.viewer.id, v);
      const merged = Array.from(map.values()).sort((a, b) => (a.viewedAt < b.viewedAt ? 1 : -1));

      const totalCount = Number(page.totalCount ?? merged.length);
      const hasMore = !!page.hasMore;

      setViewersTotal(totalCount);
      setViewersHasMore(hasMore);
      setViewersOffset(merged.length);

      viewersCacheRef.current.set(currentStoryId, { items: merged, total: totalCount, hasMore });
        setActiveSlides((old) =>
        old.map((sl) => (sl.id === currentStoryId ? { ...sl, viewCount: totalCount } : sl))
      );

      return merged;
    });
  }, [viewersData, currentStoryId]);

  // mark viewed once (slight delay so "next slide" doesn't get marked instantly)
  const markTimerRef = useRef<any>(null);

  useEffect(() => {
  if (!currentStoryId) return;
  if (mineRef.current) return;

  if (markTimerRef.current) clearTimeout(markTimerRef.current);
  if (viewedOnceRef.current.has(currentStoryId)) return;

  markTimerRef.current = setTimeout(() => {
    if ((slidesRef.current?.[indexRef.current]?.id ?? null) !== currentStoryId) return;

    // ✅ nur einmal
    viewedOnceRef.current.add(currentStoryId);

    // ✅ 1) sofort lokal updaten (für computeFirstUnreadIndex beim Re-open)
    setActiveSlides((prev) =>
      prev.map((sl) => (sl.id === currentStoryId ? { ...sl, seenByMe: true } : sl))
    );

    // ✅ 2) Server + Apollo cache updaten (über mutation update handler)
    markViewed({ variables: { storyId: currentStoryId } }).catch(() => {});
  }, 350);

  return () => {
    if (markTimerRef.current) clearTimeout(markTimerRef.current);
  };
}, [currentStoryId, markViewed]);

  // ✅ start image progress with hard timeout fallback (NO double-start)
  const startImageAuto = useCallback(
    (fromPx: number, durationMs: number, slideId: string | null) => {
      animRef.current?.stop();
      clearImgTimeout();

      const token = ++runTokenRef.current;

      // clamp + set start
      const startPx = Math.max(0, Math.min(trackW, fromPx));
      progressPx.setValue(startPx);

      if (durationMs <= 0) {
        progressPx.setValue(trackW);
        goNext();
        return;
      }

      // timeout guarantee
      imgTimeoutRef.current = setTimeout(() => {
        if (runTokenRef.current !== token) return;
        if (closingRef.current) return;
        if (paused) return;
        if ((slidesRef.current?.[indexRef.current]?.id ?? null) !== slideId) return;
        goNext();
      }, durationMs + 40);

      animRef.current = Animated.timing(progressPx, {
        toValue: trackW,
        duration: durationMs,
        useNativeDriver: false,
      });

      animRef.current.start(({ finished }) => {
        if (runTokenRef.current !== token) return;
        if (!finished) return; // stop() -> timer handles it
        clearImgTimeout();
        if ((slidesRef.current?.[indexRef.current]?.id ?? null) !== slideId) return;
        if (closingRef.current) return;
        goNext();
      });
    },
    [clearImgTimeout, goNext, paused, progressPx, trackW]
  );

  useEffect(() => {
    setVideoNatural(null);
  }, [cur?.id]);


  // ✅ SINGLE controller effect: handles start + resume without double starting
  useEffect(() => {
    if (!cur || trackW === 0 || closingRef.current) return;

    // if overlays open, treat as paused (but your code uses setPaused anyway)
    if (paused) {
      clearImgTimeout();
      animRef.current?.stop();
      if (isVideo) vref.current?.setStatusAsync({ shouldPlay: false }).catch(() => {});
      return;
    }

    // video
    if (isVideo) {
      clearImgTimeout();
      animRef.current?.stop();
      vref.current?.setStatusAsync({ shouldPlay: true }).catch(() => {});
      return;
    }

    // image
    const slideChanged = lastSlideIdRef.current !== cur.id;
    lastSlideIdRef.current = cur.id;

    if (slideChanged) {
      setVideoReady(false);
      progressPx.setValue(0);
      startImageAuto(0, IMAGE_DURATION_MS, cur.id ?? null);
      return;
    }

    // resume same slide from current progress
    const currentPx = progressValRef.current;
    const remainingPx = Math.max(0, trackW - currentPx);
    const remainingFrac = trackW > 0 ? remainingPx / trackW : 0;
    const remainingMs = Math.max(0, Math.round(IMAGE_DURATION_MS * remainingFrac));

    startImageAuto(currentPx, remainingMs, cur.id ?? null);

    return () => {
      // cleanup on dependency change
      animRef.current?.stop();
      clearImgTimeout();
    };
  }, [cur?.id, trackW, paused, isVideo, clearImgTimeout, progressPx, startImageAuto]);

  /** video -> progress + finish */
  const onVideoStatus = (st: AVPlaybackStatus) => {
    if (!("isLoaded" in st) || !st.isLoaded) return;
    if (!videoReady) setVideoReady(true);

    const dur = st.durationMillis ?? 0;
    const pos = st.positionMillis ?? 0;

    if (dur > 0 && trackW > 0) {
      const frac = Math.min(1, pos / dur);
      progressPx.setValue(frac * trackW);
    }

    if (st.didJustFinish) goNext();
  };

  // gestures
  const touchStartYRef = useRef(0);
  const touchStartXRef = useRef(0);
  const isVerticalGestureRef = useRef(false);

  const onTouchStart = (e: any) => {
    touchStartYRef.current = e?.nativeEvent?.pageY ?? 0;
    touchStartXRef.current = e?.nativeEvent?.pageX ?? 0;
    isVerticalGestureRef.current = false;
  };

  const onTouchMove = (e: any) => {
    const y = e?.nativeEvent?.pageY ?? 0;
    const x = e?.nativeEvent?.pageX ?? 0;
    const dy = y - (touchStartYRef.current || 0);
    const dx = x - (touchStartXRef.current || 0);

    if (emojiSheetOpen || viewersOpen || showActions) return;

    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      isVerticalGestureRef.current = true;
    }
  };

  const onTouchEnd = (e: any) => {
    if (mine) return;
    if (emojiSheetOpen || viewersOpen || showActions) return;

    const endY = e?.nativeEvent?.pageY ?? 0;
    const dy = endY - (touchStartYRef.current || 0);

    if (dy < -80) {
      pausePlayback();
      setEmojiSheetOpen(true);
    }
  };

  const onTapLeft = useCallback(() => {
    if (longPressRef.current) return;          // ✅ block tap after hold
    if (isVerticalGestureRef.current) return;
    animRef.current?.stop();
    clearImgTimeout();
    vref.current?.setStatusAsync({ shouldPlay: false }).catch(() => {});
    goPrev();
  }, [clearImgTimeout, goPrev]);

  const onTapRight = useCallback(() => {
    if (longPressRef.current) return;          // ✅ block tap after hold
    if (isVerticalGestureRef.current) return;
    animRef.current?.stop();
    clearImgTimeout();
    vref.current?.setStatusAsync({ shouldPlay: false }).catch(() => {});
    goNext();                                  // ✅ goes next slide OR next story in queue
  }, [clearImgTimeout, goNext]);


  const confirmDelete = () => {
    const id = slides?.[index]?.id;
    if (!id) return;

    Alert.alert(
      t("storyviewer.deleteTitle"),
      t("storyviewer.deleteBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive",
        onPress: async () => {
          setShowActions(false);
          pausePlayback();

          try {
            await deleteStory({ variables: { id } });
            if (index < slides.length - 1) setIndex((i) => i + 1);
            else gracefulClose();
          } catch {}
        },
      },
    ]);
  };

  const sendReply = useCallback(
    async (textOrEmoji: string) => {
      if (mineRef.current) return;

      const recipientId = userRef.current?.id ?? cur?.userId ?? null;
      const payload = (textOrEmoji ?? "").trim();
      if (!payload) return;

      if (!recipientId) {
        showToast(t("storyviewer.noRecipient"));
        return;
      }

      try {
        const th = await createThread({ variables: { memberUserIds: [recipientId] } });
        const threadId = th?.data?.createThread?.id;
        if (!threadId) throw new Error(t("storyviewer.threadCreateFailed"));

        await sendMessage({
          variables: {
            input: {
              threadId,
              kind: "text",
              text: payload,
              storyId: cur?.id ?? null,
            },
          },
        });

        setReplyText("");
        Keyboard.dismiss();
        showToast(t("storyviewer.messageSent"));
      } catch (e: any) {
        const msg =
          e?.graphQLErrors?.[0]?.message ?? e?.networkError?.message ?? e?.message ?? t("storyviewer.sendFailed");
        showToast(msg);
      }
    },
    [createThread, sendMessage, showToast, cur?.id, cur?.userId]
  );

  

  // PanResponder: DOWN drag close
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,

        onMoveShouldSetPanResponder: (_evt, g) => {
          if (Math.abs(g.dy) < 16) return false;
          if (Math.abs(g.dy) < Math.abs(g.dx) * 1.2) return false;

          const startY = touchStartYRef.current || 0;
          const bottomGuard = height - (tapBottomInset + 10);
          if (startY > bottomGuard) return false;

          if (emojiSheetOpen || viewersOpen || showActions) return false;
          return true;
        },

        onMoveShouldSetPanResponderCapture: (_evt, g) => {
          if (Math.abs(g.dy) < 16) return false;
          if (Math.abs(g.dy) < Math.abs(g.dx) * 1.2) return false;

          const startY = touchStartYRef.current || 0;
          const bottomGuard = height - (tapBottomInset + 10);
          if (startY > bottomGuard) return false;

          if (emojiSheetOpen || viewersOpen || showActions) return false;
          return true;
        },

        onPanResponderMove: (_evt, g) => {
          pan.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_evt, g) => {
          if (!mine && g.dy < -80) {
            pausePlayback();
            setEmojiSheetOpen(true);
            return;
          }
          if (g.dy > 120) {
            gracefulClose();
            return;
          }
          Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [emojiSheetOpen, viewersOpen, showActions, gracefulClose, pan, tapBottomInset, mine, pausePlayback]
  );

  // keyboard pauses story
  useEffect(() => {
    const subShow = Keyboard.addListener("keyboardDidShow", () => pausePlayback());
    const subHide = Keyboard.addListener("keyboardDidHide", () => {
      if (!viewersOpen && !emojiSheetOpen && !showActions) resumePlayback();
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [pausePlayback, resumePlayback, viewersOpen, emojiSheetOpen, showActions]);

  useEffect(() => {
    return () => {
      closingRef.current = true;
      runTokenRef.current += 1;

      animRef.current?.stop();
      clearImgTimeout();

      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (markTimerRef.current) clearTimeout(markTimerRef.current);

      try { vref.current?.setStatusAsync({ shouldPlay: false }); } catch {}
    };
  }, [clearImgTimeout]);

  

  // 🔥 WICHTIG: Loading-Guard für Push / Activity Open
if (fetchFromFeed && (loadingSlides || !loadedOnce) && slides.length === 0) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.bg ?? "#000",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator />
      <Text style={{ marginTop: 10, color: COLORS.text ?? "#fff", fontWeight: "700" }}>
        {t("storyviewer.storyIsLoading")}</Text>
    </View>
  );
}

if (fetchFromFeed && loadedOnce && slides.length === 0) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg ?? "#000", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Text style={{ color: COLORS.text ?? "#fff", fontWeight: "800", textAlign: "center" }}>
        {t("storyviewer.noStoryAvailable")}</Text>
      <TouchableOpacity onPress={() => nav.goBack()} style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
        <Text style={{ color: "#fff", fontWeight: "800" }}>{t("storyviewer.back")}</Text>
      </TouchableOpacity>
    </View>
  );
}


  // render guard
  if (!cur) {
    if (!closingRef.current) {
      closingRef.current = true;
      requestAnimationFrame(() => gracefulClose());
    }
    return <View style={[{ flex: 1 }, { backgroundColor: COLORS.bg ?? "#000" }]} />;
  }

  const viewerRows: ViewerRow[] = viewers;
  const mentionStats = Array.isArray(mentionStatsData?.storyMentions) ? mentionStatsData.storyMentions : [];
  const totalMentionClicks = mentionStats.reduce((sum: number, item: any) => sum + Number(item?.clickCount ?? 0), 0);
  const linkStats = Array.isArray(linkStatsData?.storyLinkClicks) ? linkStatsData.storyLinkClicks : [];
  const totalLinkClicks = linkStats.reduce((sum: number, item: any) => sum + Number(item?.clickCount ?? 0), 0);
  const locationStats = Array.isArray(locationStatsData?.storyLocationClicks) ? locationStatsData.storyLocationClicks : [];
  const totalLocationClicks = locationStats.reduce((sum: number, item: any) => sum + Number(item?.clickCount ?? 0), 0);
  const pollStats = Array.isArray(pollStatsData?.storyPollClicks) ? pollStatsData.storyPollClicks : [];
  const totalPollClicks = pollStats.reduce((sum: number, item: any) => sum + Number(item?.totalClickCount ?? 0), 0);
  const questionAnswers = Array.isArray(questionAnswersData?.storyQuestionAnswers) ? questionAnswersData.storyQuestionAnswers : [];

  const knownCount =
    (typeof cur.viewCount === "number" && cur.viewCount >= 0 ? cur.viewCount : null) ??
    (currentStoryId ? viewCountByStory[currentStoryId] : null);

  const viewCountLabel = knownCount == null ? "…" : String(knownCount);


  const displayWhen = formatRelative(cur?.when ?? null, t);

  const overlayBg = COLORS.overlay ?? "rgba(0,0,0,0.55)";
  const overlayBorder = COLORS.overlayBorder ?? "rgba(255,255,255,0.20)";
  const onOverlayText = COLORS.onOverlayText ?? "#fff";
  const onOverlaySubtext = COLORS.onOverlaySubtext ?? "rgba(255,255,255,0.75)";
  const sheetBackdrop = COLORS.backdrop ?? "rgba(0,0,0,0.45)";
  const sheetBg =
    COLORS.sheetSolid ??
    (theme.mode === "dark" ? "#0B0F1A" : "#FFFFFF");

  const sheetBorder = COLORS.border ?? (theme.mode === "dark" ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.10)");
  const sheetRowBorder = sheetBorder;
  const danger = COLORS.danger ?? "#EF4444";
  const cancelBg = COLORS.card2 ?? COLORS.card ?? sheetBg;
  const cancelText = COLORS.text ?? onOverlayText;

  const primary = COLORS.primary ?? COLORS.text ?? "#fff";
  const avatarUri = activeUser?.avatarThumbUrl || activeUser?.avatarUrl || null;
  const avatarThumb = (activeUser as any)?.avatarThumbUrl ?? null;
  const avatarFull = (activeUser as any)?.avatarUrl ?? (activeUser as any)?.avatar ?? null; // legacy support
  const stripQS = (u?: string | null) => (u ? u.split("?")[0] : "");

  const reserved = reservedBottomVisual;

  const hasMediaTransform = !!edit?.media;
  const fitMode = edit?.fitMode ?? "FILL";    

   const videoResizeMode =
    hasMediaTransform ? ResizeMode.CONTAIN : (fitMode === "FIT" ? ResizeMode.CONTAIN : ResizeMode.COVER);


    const bottomControlsY = Math.max(18, insets.bottom + 40);

    
  
  const tapDisabled = !!hint?.postId || emojiSheetOpen || viewersOpen || showActions;

  return (
    <Animated.View 
    onLayout={(e) => setScreenH(e.nativeEvent.layout.height)}
    style={[s.container, { opacity: fade, transform: [{ translateY: shift }] }]}>
      {/* MEDIA LAYER */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { transform: [{ translateY: pan }] }]}
        {...panResponder.panHandlers}
      >


        {/* MEDIA VIEWPORT (wie Wizard) */}
        <View style={mediaViewportStyle} key={`story-media:${cur.id}`}>
        <View style={StyleSheet.absoluteFillObject}>
          {isVideo ? (
            <Video
              ref={vref}
              source={{ uri: cur.uri }}
              style={[StyleSheet.absoluteFillObject, mediaTransformStyle ?? null]}
              resizeMode={videoResizeMode}
              shouldPlay={!paused}
              isLooping={false}
              usePoster
              posterSource={cur.thumb ? { uri: cur.thumb } : gridPlaceholder}
              posterStyle={StyleSheet.absoluteFillObject} // ✅ KEIN top inset hier
              onPlaybackStatusUpdate={onVideoStatus}
              onReadyForDisplay={onReadyForDisplay}
            />
          ) : (
            <ExpoImage
              source={{ uri: cur.uri }}
              placeholder={cur.thumb ? { uri: cur.thumb } : gridPlaceholder}
              placeholderContentFit={fitMode === "FIT" ? "contain" : "cover"}
              contentFit={fitMode === "FIT" ? "contain" : "cover"}
              contentPosition="center"
              transition={180}
              cachePolicy="disk"
              style={[StyleSheet.absoluteFillObject, mediaTransformStyle ?? null]}
            />
          )}
        </View>
      </View>


        {storyOverlays.map((o, idx) => {
          const kind = typeof o?.kind === "string" ? o.kind : "sticker";
          const savedH = Number(edit?.stage?.h ?? mediaH);
          const currentH = Math.max(1, screenH - reservedBottom - insets.top);
          const yOffset = Number.isFinite(savedH) ? (currentH - savedH) / 2 : 0;
          const x = Number.isFinite(o?.x as any) ? Number(o.x) : width / 2;
          const y = (Number.isFinite(o?.y as any) ? Number(o.y) : currentH * 0.45) + insets.top + yOffset;
          const bg = typeof o?.bg === "string" ? o.bg : kind === "text" ? "rgba(0,0,0,0.34)" : "#fff";
          const color = typeof o?.color === "string" ? o.color : kind === "text" ? "#fff" : "#111827";
          const text = typeof o?.text === "string" ? o.text : "";
          const mentionUsername = kind === "mention" ? String(o?.username || text || "").replace(/^@/, "").trim() : "";
          const linkUrl = kind === "link" ? String(o?.url || "").trim() : "";
          const locationLabel = kind === "location" ? text.trim() : "";
          const pollOptions = kind === "poll" && Array.isArray(o?.options) ? o.options.slice(0, 4) : [];
          const questionPrompt = kind === "question" ? String(o?.prompt || "").trim() : "";
          const overlayIsPressable =
            (kind === "mention" && mentionUsername) ||
            (kind === "link" && linkUrl) ||
            (kind === "location" && locationLabel) ||
            kind === "poll" ||
            (kind === "question" && questionPrompt);
          const OverlayShell: any = overlayIsPressable ? Pressable : View;
          if (!text && kind !== "poll" && kind !== "question") return null;
          return (
            <OverlayShell
              key={o?.id ?? `story-overlay-${idx}`}
              pointerEvents={overlayIsPressable ? "auto" : "none"}
              onPress={
                kind === "mention"
                  ? () => onMentionPress(mentionUsername)
                  : kind === "link"
                    ? () => onLinkPress(linkUrl, typeof o?.id === "string" ? o.id : null)
                    : kind === "location"
                      ? () => onLocationPress(locationLabel, typeof o?.id === "string" ? o.id : null)
                      : kind === "question"
                        ? () => onQuestionPress(typeof o?.id === "string" ? o.id : null, questionPrompt)
                    : undefined
              }
              style={[
                s.storyOverlayItem,
                kind === "text" ? s.storyTextOverlay : s.storyStickerOverlay,
                (kind === "poll" || kind === "question") && s.storyCardOverlay,
                {
                  left: x,
                  top: y,
                  backgroundColor: kind === "poll" || kind === "question" ? "transparent" : bg,
                  transform: [
                    { translateX: kind === "poll" || kind === "question" ? -123 : -80 },
                    { translateY: kind === "poll" || kind === "question" ? -42 : -24 },
                  ],
                },
              ]}
            >
              {kind === "poll" ? (
                <View style={s.pollCard}>
                  <View style={s.pollQuestionBand}>
                    <Text style={s.pollQuestionText} numberOfLines={2}>
                      {typeof o?.question === "string" ? o.question : ""}
                    </Text>
                  </View>
                  {pollOptions.map((opt: string, optionIndex: number) => (
                    <Pressable
                      key={`${optionIndex}:${opt}`}
                      style={s.pollOptionRow}
                      onPress={() => onPollOptionPress(typeof o?.id === "string" ? o.id : null, optionIndex, opt)}
                    >
                      <Text style={s.pollOptionText} numberOfLines={1}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : kind === "question" ? (
                <View style={s.questionCard}>
                  <View style={s.questionAvatarWrap}>
                    <ExpoImage source={o?.avatarUri ? { uri: o.avatarUri } : avatarPlaceholder} style={s.questionAvatar} contentFit="cover" />
                  </View>
                  <Text style={s.questionPrompt} numberOfLines={2}>{typeof o?.prompt === "string" ? o.prompt : ""}</Text>
                  <View style={s.questionInputFake}>
                    <Text style={s.questionInputText} numberOfLines={1}>{typeof o?.placeholder === "string" ? o.placeholder : ""}</Text>
                  </View>
                </View>
              ) : (
                <>
              {kind !== "text" && (
                <Ionicons
                  name={(o?.icon as keyof typeof Ionicons.glyphMap) ?? "happy-outline"}
                  size={21}
                  color={color}
                  style={s.storyStickerIcon}
                />
              )}
              <Text
                numberOfLines={2}
                style={[
                  kind === "text" ? s.storyTextOverlayText : s.storyStickerText,
                  { color: kind === "text" ? color : "#111827", fontSize: kind === "text" ? Number(o?.size ?? 30) : 20 },
                ]}
              >
                {text}
              </Text>
                </>
              )}
            </OverlayShell>
          );
        })}

    


        {sharedPost?.postId && (
          <SharedPostOverlay
            postId={sharedPost.postId}
            x={Number.isFinite(sharedPost.x as any) ? (sharedPost.x as number) : 0}
            y={Number.isFinite(sharedPost.y as any) ? (sharedPost.y as number) : 0}
            s={Number.isFinite(sharedPost.s as any) ? (sharedPost.s as number) : 1}
            r={Number.isFinite(sharedPost.r as any) ? (sharedPost.r as number) : 0}
            onPress={() => showHint(sharedPost.postId)}
            gridPlaceholder={gridPlaceholder}
          />
        )}

        {hint?.postId ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => {
                if (hideTimer.current) clearTimeout(hideTimer.current);
                setHint(null);
                setPaused(false);
              }}
            />

            <Pressable
              onPress={() => {
                const postId = hint.postId;

                // Playback stoppen
                runTokenRef.current += 1;
                animRef.current?.stop();
                clearImgTimeout();
                if (hideTimer.current) clearTimeout(hideTimer.current);
                if (markTimerRef.current) clearTimeout(markTimerRef.current);
                try { vref.current?.setStatusAsync({ shouldPlay: false }); } catch {}

                // UI
                setHint(null);
                setPaused(true);

                // ✅ super wichtig: nach Interactions / nächstem Frame, dann REPLACE
                InteractionManager.runAfterInteractions(() => {
                  nav.dispatch(
                    StackActions.replace("PostDetail", {
                      id: postId,
                      postIds: [postId],
                      startIndex: 0,
                    } as any)
                  );
                });
              }}


              style={[
                s.postHint,
                {
                  position: "absolute",
                  alignSelf: "center",
                  bottom: Math.max(18, insets.bottom + 92),
                  backgroundColor: overlayBg,
                  borderColor: overlayBorder,
                  zIndex: 100,
                  elevation: 100,
                },
              ]}
            >
              <Text style={[s.postHintText, { color: onOverlayText }]}>{t("storyviewer.viewPost")}</Text>
              <Ionicons name="chevron-forward" size={18} color={onOverlayText} />
            </Pressable>

          </View>
        ) : null}




        {/* Tap areas only over media (stop at reply bar) */}
        <View
            style={[s.tapRowMedia, { top: insets.top, bottom: reservedBottom }]}
            pointerEvents={tapDisabled ? "none" : "box-none"}
          >
          <Pressable
            style={s.tapHalf}
            onPress={onTapLeft}
            onLongPress={onHoldStart}
            onPressOut={onHoldEnd}
            delayLongPress={180}
          />
          <Pressable
            style={s.tapHalf}
            onPress={onTapRight}
            onLongPress={onHoldStart}
            onPressOut={onHoldEnd}
            delayLongPress={180}
          />  
        </View>
      </Animated.View>

      {/* Progress */}
      <View
        style={[s.progressRow, { top: insets.top + 6 }]}
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
        pointerEvents="none"
      >
        {slides.map((_, i) => (
          <View key={i} style={[s.progressTrack, { width: trackW }]}>
            <View style={[s.progressBase, { backgroundColor: overlayBorder }]} />
            {i < index && <View style={[s.progressFill, { width: trackW, backgroundColor: onOverlayText }]} />}
            {i === index && <Animated.View style={[s.progressFill, { width: progressPx, backgroundColor: onOverlayText }]} />}
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={[s.header, { top: insets.top + 20 }]} pointerEvents="box-none">
        <View style={{ flexDirection: "row", alignItems: "center" }} pointerEvents="auto">
          <ExpoImage
            source={avatarSource(avatarThumb, avatarFull)}
            style={s.avatar}
            contentFit="cover"
            cachePolicy="disk"
            transition={120}
          />
          <Text style={[s.username, { color: onOverlayText }]}>{mine ? t("storyviewer.yourStory") : activeUser.username}</Text>
          {!!displayWhen && <Text style={[s.when, { color: onOverlaySubtext }]}> · {displayWhen}</Text>}
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={gracefulClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={onOverlayText} />
        </TouchableOpacity>
      </View>

      {/* Views bar (mine only) */}
      {mine && !!currentStoryId && (
        <View
          style={[s.bottomControls, { bottom: bottomControlsY }]}
          pointerEvents="box-none"
        >
          {/* ✅ Views: EXAKT mittig */}
          <View
            pointerEvents="box-none"
            style={s.viewsCenterWrap}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              style={[s.viewsBar, { backgroundColor: overlayBg }]}
              onPress={openViewers}
            >
              <Ionicons name="eye-outline" size={18} color={onOverlayText} />
              <Text style={[s.viewsBarText, { color: onOverlayText }]}>
                {viewCountLabel} {t("storyviewer.views")}
              </Text>
              <Ionicons name="chevron-up" size={18} color={onOverlayText} />
            </TouchableOpacity>
          </View>

          {/* ✅ Dots: rechts, beeinflussen die Mitte NICHT */}
          <TouchableOpacity
            onPress={openActions}
            activeOpacity={0.9}
            style={[s.dotsBtn, {
              backgroundColor: overlayBg,
              borderColor: overlayBorder,
            }]}
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
          >
            <Text style={{ color: onOverlayText, fontSize: 16 }}>⋯</Text>
          </TouchableOpacity>
        </View>
      )}



      {/* Reply bar (NOT mine) */}
      {!mine && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[s.replyBarWrap, { paddingBottom: replyBottomPad, marginBottom: REPLY_BAR_OFFSET }]}
          pointerEvents="box-none"
        >
          <View style={[s.replyBar, { backgroundColor: overlayBg, borderColor: overlayBorder }]} pointerEvents="auto">
            <TouchableOpacity
              onPress={() => {
                pausePlayback();
                setEmojiSheetOpen(true);
              }}
              style={s.replyIconBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.85}
            >
              <Ionicons name="happy-outline" size={20} color={onOverlayText} />
            </TouchableOpacity>

            <TextInput
              ref={(r) => {
                replyInputRef.current = r;
              }}
              value={replyText}
              onChangeText={setReplyText}
              placeholder={t("storyviewer.sendMessage")}
              placeholderTextColor={onOverlaySubtext}
              style={[s.replyInput, { color: onOverlayText }]}
              onFocus={() => pausePlayback()}
              onBlur={() => {
                if (!viewersOpen && !emojiSheetOpen && !showActions) resumePlayback();
              }}
              returnKeyType="send"
              onSubmitEditing={() => sendReply(replyText)}
              blurOnSubmit={false}
            />

            <TouchableOpacity
              onPress={() => sendReply(replyText)}
              style={s.replySendBtn}
              activeOpacity={0.85}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <Ionicons name="send" size={18} color={primary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}


      <Modal transparent visible={!!questionComposer} animationType="fade" onRequestClose={closeQuestionComposer}>
        <Pressable
          style={[s.modalBackdrop, { backgroundColor: COLORS.backdrop ?? "rgba(0,0,0,0.45)" }]}
          onPress={closeQuestionComposer}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={s.questionComposerWrap}
        >
          <View style={[s.questionComposerCard, { backgroundColor: COLORS.card ?? COLORS.bg, borderColor: COLORS.border }]}>
            <Text style={[s.questionComposerTitle, { color: COLORS.text }]} numberOfLines={2}>
              {questionComposer?.prompt}
            </Text>
            <TextInput
              value={questionAnswerText}
              onChangeText={setQuestionAnswerText}
              autoFocus
              multiline
              maxLength={400}
              placeholder={t("storyviewer.questionAnswerPlaceholder")}
              placeholderTextColor={COLORS.subtext}
              style={[s.questionComposerInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.bg }]}
            />
            <View style={s.questionComposerActions}>
              <TouchableOpacity onPress={closeQuestionComposer} style={s.questionComposerSecondary}>
                <Text style={[s.questionComposerSecondaryText, { color: COLORS.subtext }]}>
                  {t("storyviewer.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitQuestionAnswer}
                disabled={sendingQuestionAnswer || !questionAnswerText.trim()}
                style={[
                  s.questionComposerPrimary,
                  { backgroundColor: primary },
                  (sendingQuestionAnswer || !questionAnswerText.trim()) && { opacity: 0.55 },
                ]}
              >
                {sendingQuestionAnswer ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.questionComposerPrimaryText}>{t("storyviewer.sendAnswer")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>




      {/* Action Sheet */}
      <Modal
        transparent
        visible={showActions}
        animationType="fade"
        onRequestClose={() => {
          setShowActions(false);
          resumePlayback();
        }}
      >
        <Pressable
          style={[s.sheetBackdrop, { backgroundColor: sheetBackdrop }]}
          onPress={() => {
            setShowActions(false);
            resumePlayback();
          }}
        />
        <View style={[s.sheet, { backgroundColor: sheetBg, borderColor: sheetBorder }]}>
          <TouchableOpacity
            disabled={deleting}
            onPress={confirmDelete}
            style={[s.sheetRow, { borderTopColor: sheetRowBorder }]}
          >
            <Text style={[s.sheetRowText, { color: danger }]}>
              {t("storyviewer.deleteStory")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setShowActions(false);
              resumePlayback();
            }}
            style={[
              s.sheetRow,
              s.sheetCancel,
              { backgroundColor: cancelBg, borderTopColor: "transparent" },
            ]}
          >
            <Text style={[s.sheetRowText, { color: cancelText }]}>{t("storyviewer.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Viewers Modal */}
      <Modal transparent visible={viewersOpen} animationType="slide" onRequestClose={closeViewers}>
        <Pressable style={[s.modalBackdrop, { backgroundColor: COLORS.backdrop ?? "rgba(0,0,0,0.35)" }]} onPress={closeViewers} />
        <View style={[s.modalSheet, { paddingBottom: Math.max(18, insets.bottom + 10), backgroundColor: COLORS.bg }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: COLORS.text }]}>{t("storyviewer.seenBy")}</Text>
            <TouchableOpacity onPress={closeViewers} hitSlop={10}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {mentionStats.length > 0 && (
            <View style={[s.mentionStatsBox, { borderColor: COLORS.border, backgroundColor: COLORS.card ?? COLORS.bg }]}>
              <View style={s.mentionStatsHeader}>
                <Ionicons name="at-outline" size={18} color={COLORS.text} />
                <Text style={[s.mentionStatsTitle, { color: COLORS.text }]}>
                  {t("storyviewer.mentionClicks", { count: totalMentionClicks })}
                </Text>
              </View>
              {mentionStats.map((item: any) => (
                <View key={item.id} style={s.mentionStatsRow}>
                  <Text style={[s.mentionStatsName, { color: COLORS.text }]} numberOfLines={1}>
                    @{item.username}
                  </Text>
                  <Text style={[s.mentionStatsCount, { color: COLORS.subtext }]}>
                    {item.clickCount}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {linkStats.length > 0 && (
            <View style={[s.mentionStatsBox, { borderColor: COLORS.border, backgroundColor: COLORS.card ?? COLORS.bg }]}>
              <View style={s.mentionStatsHeader}>
                <Ionicons name="link-outline" size={18} color={COLORS.text} />
                <Text style={[s.mentionStatsTitle, { color: COLORS.text }]}>
                  {t("storyviewer.linkClicks", { count: totalLinkClicks })}
                </Text>
              </View>
              {linkStats.map((item: any) => (
                <View key={item.id} style={s.mentionStatsRow}>
                  <Text style={[s.mentionStatsName, { color: COLORS.text }]} numberOfLines={1}>
                    {item.label || item.url}
                  </Text>
                  <Text style={[s.mentionStatsCount, { color: COLORS.subtext }]}>
                    {item.clickCount}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {locationStats.length > 0 && (
            <View style={[s.mentionStatsBox, { borderColor: COLORS.border, backgroundColor: COLORS.card ?? COLORS.bg }]}>
              <View style={s.mentionStatsHeader}>
                <Ionicons name="location-outline" size={18} color={COLORS.text} />
                <Text style={[s.mentionStatsTitle, { color: COLORS.text }]}>
                  {t("storyviewer.locationClicks", { count: totalLocationClicks })}
                </Text>
              </View>
              {locationStats.map((item: any) => (
                <View key={item.id} style={s.mentionStatsRow}>
                  <Text style={[s.mentionStatsName, { color: COLORS.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[s.mentionStatsCount, { color: COLORS.subtext }]}>
                    {item.clickCount}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {pollStats.length > 0 && (
            <View style={[s.mentionStatsBox, { borderColor: COLORS.border, backgroundColor: COLORS.card ?? COLORS.bg }]}>
              <View style={s.mentionStatsHeader}>
                <Ionicons name="stats-chart-outline" size={18} color={COLORS.text} />
                <Text style={[s.mentionStatsTitle, { color: COLORS.text }]}>
                  {t("storyviewer.pollClicks", { count: totalPollClicks })}
                </Text>
              </View>
              {pollStats.map((poll: any) => (
                <View key={poll.id} style={s.pollStatsGroup}>
                  <Text style={[s.mentionStatsName, { color: COLORS.text }]} numberOfLines={2}>
                    {poll.question}
                  </Text>
                  {(Array.isArray(poll.options) ? poll.options : []).map((opt: any) => (
                    <View key={`${poll.id}:${opt.optionIndex}`} style={s.mentionStatsRow}>
                      <Text style={[s.mentionStatsName, { color: COLORS.subtext }]} numberOfLines={1}>
                        {opt.optionText}
                      </Text>
                      <Text style={[s.mentionStatsCount, { color: COLORS.subtext }]}>
                        {opt.clickCount}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {questionAnswers.length > 0 && (
            <View style={[s.mentionStatsBox, { borderColor: COLORS.border, backgroundColor: COLORS.card ?? COLORS.bg }]}>
              <View style={s.mentionStatsHeader}>
                <Ionicons name="help-circle-outline" size={18} color={COLORS.text} />
                <Text style={[s.mentionStatsTitle, { color: COLORS.text }]}>
                  {t("storyviewer.questionAnswers", { count: questionAnswers.length })}
                </Text>
              </View>
              {questionAnswers.map((item: any) => {
                const respondent = item?.respondent ?? {};
                const avatar = avatarSource(respondent.avatarThumbUrl ?? null, respondent.avatarUrl ?? null);
                return (
                  <Pressable
                    key={item.id}
                    style={s.questionAnswerRow}
                    onPress={() => openQuestionAnswerChat(item)}
                  >
                    <ExpoImage source={avatar} style={s.questionAnswerAvatar} contentFit="cover" />
                    <View style={s.questionAnswerTextWrap}>
                      <Text style={[s.questionAnswerName, { color: COLORS.text }]} numberOfLines={1}>
                        @{respondent.username ?? "user"}
                      </Text>
                      <Text style={[s.questionAnswerPrompt, { color: COLORS.subtext }]} numberOfLines={1}>
                        {item.prompt}
                      </Text>
                      <Text style={[s.questionAnswerBody, { color: COLORS.text }]} numberOfLines={3}>
                        {item.answer}
                      </Text>
                    </View>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.subtext} />
                  </Pressable>
                );
              })}
            </View>
          )}

          {viewersLoading && viewerRows.length === 0 ? (
            <Text style={[s.modalLoading, { color: COLORS.subtext }]}>{t("common.loading")}</Text>
          ) : (
            <FlatList
              data={viewerRows}
              keyExtractor={(it) => it.viewer.id}
              ItemSeparatorComponent={() => <View style={[s.sep, { backgroundColor: COLORS.border }]} />}
              renderItem={({ item }) => {
                const src = avatarSource((item.viewer as any).avatarThumbUrl ?? null, item.viewer.avatarUrl ?? null);

                return (
                  <Pressable
                    style={s.viewerRow}
                    onPress={() => goUserProfile(item.viewer)}
                    android_ripple={{ color: COLORS.ripple ?? "rgba(0,0,0,0.06)" }}
                  >
                    <ExpoImage
                      source={src}
                      style={s.viewerAvatar}
                      contentFit="cover"
                      cachePolicy="disk"
                      transition={120}
                    />


                    <Text style={[s.viewerName, { color: COLORS.text }]}>
                      @{item.viewer.username}
                    </Text>
                  </Pressable>
                );
              }}

              ListEmptyComponent={<Text style={[s.modalEmpty, { color: COLORS.subtext }]}>{t("storyviewer.noViewsYet")}</Text>}
              onEndReachedThreshold={0.6}
              onEndReached={() => {
                if (!currentStoryId) return;
                if (!viewersHasMore) return;
                if (viewersLoading) return;
                loadViewers({ variables: { storyId: currentStoryId, offset: viewersOffset, limit: VIEWERS_PAGE } }).catch(() => {});
              }}
              ListFooterComponent={viewersHasMore ? <Text style={[s.modalLoading, { color: COLORS.subtext }]}>{t("storyviewer.loadingMore")}</Text> : null}
            />
          )}
        </View>
      </Modal>

      {/* Emoji Sheet */}
      <Modal transparent visible={emojiSheetOpen} animationType="slide" onRequestClose={closeEmojiSheet}>
        <Pressable style={[s.modalBackdrop, { backgroundColor: COLORS.backdrop ?? "rgba(0,0,0,0.35)" }]} onPress={closeEmojiSheet} />
        <View style={[s.emojiSheet, { paddingBottom: Math.max(18, insets.bottom + 10), backgroundColor: COLORS.bg }]}>
          <View style={s.emojiHeader}>
            <Text style={[s.emojiTitle, { color: COLORS.text }]}>{t("storyviewer.quickReactions")}</Text>
            <TouchableOpacity onPress={closeEmojiSheet} hitSlop={10}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={s.emojiRow}>
            {["😂", "😍", "🔥", "👏", "😮", "😢", "❤️"].map((e) => (
              <TouchableOpacity
                key={e}
                style={[s.emojiBtn, { backgroundColor: COLORS.card }]}
                activeOpacity={0.85}
                onPress={async () => {
                  closeEmojiSheet();
                  await sendReply(e);
                }}
              >
                <Text style={s.emoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {!!toast && (
        <View
          style={[
            s.toastWrap,
            {
              bottom: replyBottomPad + REPLY_BAR_H + REPLY_BAR_OFFSET + 14,
              zIndex: 5000,
              elevation: 5000,
            },
          ]}
          pointerEvents="none"
        >
          <View style={[s.toast, { backgroundColor: overlayBg, borderColor: overlayBorder }]}>
            <Text style={[s.toastText, { color: onOverlayText }]}>{toast}</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function SharedPostOverlay({
  postId,
  x = 0,
  y = 0,
  s = 1,
  r = 0,
  onPress,
  gridPlaceholder,
}: {
  postId: string;
  x?: number;
  y?: number;
  s?: number;
  r?: number;
  onPress: () => void;
  gridPlaceholder: any;
}) {
  const { data, loading } = useQuery(SHARE_POST, {
    variables: { id: postId },
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    returnPartialData: true,
    notifyOnNetworkStatusChange: true,
  });

  const p = data?.post ?? null;



  const mediaFull =
  p?.media?.[0]?.imageUrl ||
  p?.imageUrl ||
  null;

  const mediaThumb =
    p?.media?.[0]?.thumbUrl ||
    p?.thumbUrl ||
    null;


  const POST_W = 320;
  const [postH, setPostH] = React.useState(52 + 320 + 48);

  const avatarThumb = p?.author?.avatarThumbUrl ?? null;
  const avatarFull = p?.author?.avatarUrl ?? null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: POST_W,
        marginLeft: -POST_W / 2,
        marginTop: -postH / 2,
        zIndex: 5000,
        elevation: 5000,
        transform: [
          { translateX: x },
          { translateY: y },
          { rotateZ: `${r}rad` },
          { scale: s },
        ],
      }}
    >
      <View
        onLayout={(e) => setPostH(e.nativeEvent.layout.height)}
        style={{
          width: POST_W,
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.92)",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
        }}
      >
        {/* ---------- HEADER ---------- */}
        <View
          style={{
            height: 52,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "rgba(255,255,255,0.96)",
          }}
        >
          <ExpoImage
            source={avatarSource(avatarThumb, avatarFull)}
            style={{ width: 30, height: 30, borderRadius: 15 }}
            contentFit="cover"
            cachePolicy="disk"
            transition={120}
          />

          <Text
            style={{ fontSize: 16, fontWeight: "900", color: "#111827" }}
            numberOfLines={1}
          >
            {p?.author?.username ?? " "}
          </Text>
        </View>

        {/* ---------- MEDIA ---------- */}
        <View
          style={{
            width: "100%",
            height: 320,
            backgroundColor: "rgba(0,0,0,0.08)",
          }}
        >
          {mediaFull ? (
            <ExpoImage
              source={{ uri: mediaFull }}
              placeholder={mediaThumb ? { uri: mediaThumb } : gridPlaceholder}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            // ✅ placeholder while loading
            <ExpoImage
              source={gridPlaceholder}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          )}

          {/* ✅ loading overlay (important) */}
          {loading && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator />
            </View>
          )}
        </View>

        {/* ---------- CAPTION ---------- */}
        {!!p?.caption && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: "rgba(255,255,255,0.96)",
            }}
          >
            <Text
              style={{ fontSize: 14, color: "#111827" }}
              numberOfLines={1}
            >
              <Text style={{ fontWeight: "800" }}>
                {p?.author?.username ?? "user"}{" "}
              </Text>
              {p.caption}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}



const styles = (COLORS: any) =>
  StyleSheet.create({
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
      zIndex: 80,
      elevation: 80,
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
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
    bottomControls: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 220,
      elevation: 220,
      alignItems: "center",
      justifyContent: "center",
    },

    viewsCenterWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
    },

    dotsBtn: {
      position: "absolute",
      right: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
    },

 

    postHintWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
    postHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
    },
    postHintText: { fontSize: 14, fontWeight: "900" },

    container: { flex: 1, backgroundColor: COLORS.bg ?? "#000" },

    media: { width, height,  },
    mediaWrap: {
      width: "100%",
      overflow: "hidden",
      position: "relative",
      backgroundColor: COLORS.bg ?? "#000",
      borderBottomWidth: 0,   // 🔥
    },


    tapRowMedia: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      zIndex: 1,
    },
    tapHalf: { flex: 1 },

    header: {
      position: "absolute",
      left: 12,
      right: 12,
      flexDirection: "row",
      alignItems: "center",
      zIndex: 200,
      elevation: 200,
    },
    avatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
    username: { fontWeight: "800" },
    when: { marginLeft: 2 },

    progressRow: {
      position: "absolute",
      left: 8,
      right: 8,
      flexDirection: "row",
      gap: 4,
      zIndex: 210,
      elevation: 210,
    },
    progressTrack: { height: 3, borderRadius: 3, overflow: "hidden", position: "relative" },
    progressBase: { ...StyleSheet.absoluteFillObject },
    progressFill: { position: "absolute", left: 0, top: 0, bottom: 0 },

    viewsBarWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 220,
      elevation: 220,
    },
    viewsBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    viewsBarText: { fontSize: 14, fontWeight: "700" },

    replyBarWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 12,
      zIndex: 999,
      elevation: 999,
    },
    replyBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
    },
    replyIconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    replyInput: { flex: 1, paddingVertical: 6, paddingHorizontal: 0 },
    replySendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

    fab: {
      position: "absolute",
      right: 12,
      bottom: 84,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
    },

    sheetBackdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      borderRadius: 16,
      paddingTop: 12,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
    },
    sheetRow: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    sheetRowText: { fontSize: 16, textAlign: "center", fontWeight: "700" },
    sheetCancel: { marginTop: 8, borderTopWidth: 0, borderRadius: 16, marginHorizontal: 10, marginBottom: 10 },

    modalBackdrop: { ...StyleSheet.absoluteFillObject },
    modalSheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: "70%",
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 14,
      paddingTop: 12,
    },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 },
    modalTitle: { fontSize: 16, fontWeight: "800" },
    modalLoading: { paddingVertical: 18, textAlign: "center" },
    modalEmpty: { paddingVertical: 18, textAlign: "center" },
    sep: { height: StyleSheet.hairlineWidth },

    viewerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
    viewerAvatar: { width: 38, height: 38, borderRadius: 19 },
    viewerName: { fontSize: 14, fontWeight: "700" },
    mentionStatsBox: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    mentionStatsHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    mentionStatsTitle: { fontSize: 14, fontWeight: "900" },
    mentionStatsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
      gap: 12,
    },
    mentionStatsName: { flex: 1, fontSize: 13, fontWeight: "800" },
    mentionStatsCount: { fontSize: 13, fontWeight: "900" },
    pollStatsGroup: {
      paddingTop: 4,
      paddingBottom: 6,
    },
    questionAnswerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 9,
    },
    questionAnswerAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(127,127,127,0.18)",
    },
    questionAnswerTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    questionAnswerName: { fontSize: 13, fontWeight: "900" },
    questionAnswerPrompt: { fontSize: 11, fontWeight: "700", marginTop: 1 },
    questionAnswerBody: { fontSize: 13, fontWeight: "700", marginTop: 3, lineHeight: 17 },

    questionComposerWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      paddingHorizontal: 22,
    },
    questionComposerCard: {
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 18,
    },
    questionComposerTitle: {
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
      marginBottom: 14,
    },
    questionComposerInput: {
      minHeight: 96,
      maxHeight: 160,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: "700",
      textAlignVertical: "top",
    },
    questionComposerActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 14,
    },
    questionComposerSecondary: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    questionComposerSecondaryText: { fontSize: 14, fontWeight: "800" },
    questionComposerPrimary: {
      minWidth: 104,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    questionComposerPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },

    emojiSheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    emojiHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    emojiTitle: { fontSize: 14, fontWeight: "800" },
    emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 8 },
    emojiBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    emoji: { fontSize: 22 },

    toastWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
    toast: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
    },
    toastText: { fontWeight: "700" },
  });
