// apps/ciaorelated/src/screens/ReelsScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Animated,
  InteractionManager,
  StatusBar,
  Platform
} from "react-native";
import { useNavigation, useIsFocused, useFocusEffect, useRoute } from "@react-navigation/native";
import {
  gql,
  useApolloClient,
  useLazyQuery,
  useQuery,
  NetworkStatus,
  useMutation,
} from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PixelRatio, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useTheme } from "../theme/ThemeProvider";
import { VlogPostCard } from "./components/post/VlogPostCard";
import { CommunitySearchResults } from "./components/community/CommunityDiscovery";
import { useMarkPostViewed } from "../hooks/useMarkPostViewed";

import { FOLLOW } from "../graphql/mutations/social";
import { Audio } from "expo-av";
import { gridPlaceholderDark, gridPlaceholderLight } from "../../assets/placeholders";
import { hapticImpact } from "../lib/safeHaptics";
import {
  CONTEXT_KIND_IMAGES,
  contextIconFor,
  contextImageFor,
  normalizeContextImageKey,
  normalizeContextKind,
} from "../lib/contextBubbleImages";

import { useTranslation } from "react-i18next";

const ME_QUERY = gql`
  query {
    me {
      id
      username
      avatarUrl
      city
      __typename
    }
  }
`;


const { width: SCREEN_W } = Dimensions.get("window");
const px = (v: number) => Math.round(v * PixelRatio.get()) / PixelRatio.get();

/* -------------------- GraphQL -------------------- */

/* -------------------- GraphQL -------------------- */
// ⚠️ Legacy: POSTS_VLOGS (Popular-Vlogs) wird hier bewusst NICHT mehr genutzt.
// Der Mix-Feed wird ausschließlich über Contexts (contextBubbles + suggestPostsByContext) gebaut.


const POSTS_VLOGS = gql`
  query ReelsVlogs($limit: Int, $days: Int) {
    reelsVlogs(limit: $limit, days: $days) {
      edges {
        id slug title coverUrl coverThumbUrl memberCount postCount
        owner { id username avatarUrl }
        __typename
      }
      nextCursor
      __typename
    }
  }
`;


const VLOG_POSTS = gql`
  query VlogPosts($vlogId: ID!, $offset: Int, $limit: Int) {
    vlogPosts(vlogId: $vlogId, offset: $offset, limit: $limit) {
      id kind imageUrl videoUrl thumbUrl caption location likeCount isLiked commentCount createdAt
      isCarousel
      media { id kind imageUrl videoUrl thumbUrl order __typename }
      author { id username avatarUrl avatarThumbUrl isPrivate isFollowing followRequested __typename }
      taggedUsers {
        status
        user { id username avatarUrl __typename }
        __typename
      }
      __typename
    }
  }
`;
///////
const VLOGS_SEARCH = gql`
  query VlogsSearch($q: String!, $limit: Int!) {
    vlogsSearch(q: $q, limit: $limit) {
      edges {
        id slug title coverUrl coverThumbUrl memberCount postCount
        owner { id username avatarUrl }
        __typename
      }
      nextCursor
      __typename
    }
  }
`;
const LIKE_POST = gql`
  mutation LikePost($postId: ID!) {
    likePost(postId: $postId) { id likeCount isLiked __typename }
  }
`;
const UNLIKE_POST = gql`
  mutation UnlikePost($postId: ID!) {
    unlikePost(postId: $postId) { id likeCount isLiked __typename }
  }
`;

const CREATE_THREAD = gql`
  mutation CreateThread($memberUserIds: [ID!]!, $title: String) {
    createThread(memberUserIds: $memberUserIds, title: $title) {
      id
    }
  }
`;

const CONTEXT_BUBBLES = gql`
  query ContextBubbles($city: String, $limit: Int, $windowHours: Int) {
    contextBubbles(city: $city, limit: $limit, windowHours: $windowHours) {
      contextId
      key
      label
      kind
      score
    }
  }
`;

const MY_LIVE_COMMUNITIES = gql`
  query MyLiveCommunitiesForMoments {
    myJoinedGroupLinks {
      id
      title
      type
      slug
      memberCount
      createdAt
      __typename
    }
  }
`;

const SUGGEST_POSTS_BY_CONTEXT = gql`
  query SuggestPostsByContext($contextKey: String!, $kind: PostKind, $offset: Int, $limit: Int) {
    suggestPostsByContext(contextKey: $contextKey, kind: $kind, offset: $offset, limit: $limit) {
      id kind imageUrl videoUrl thumbUrl caption location likeCount isLiked commentCount createdAt
      isCarousel
      media { id kind imageUrl videoUrl thumbUrl order __typename }
      author { id username avatarUrl avatarThumbUrl isPrivate isFollowing followRequested __typename }
      taggedUsers { status user { id username avatarUrl __typename } __typename }
      communityContext { groupId title type slug reason sharedCount __typename }
      __typename
    }
  }
`;

const VLOG_BY_SLUG = gql`
  query VlogBySlug($slug: String!) {
    vlogBySlug(slug: $slug) {
      id
      slug
      title
      coverUrl
      coverThumbUrl
      memberCount
      postCount
      owner { id username avatarUrl __typename }
      __typename
    }
  }
`;
const POSTS_FEED = gql`
  query ReelsFeed($offset: Int = 0, $limit: Int = 40) {
    reelsFeed(offset: $offset, limit: $limit) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      caption
      location
      likeCount
      isLiked
      commentCount
      createdAt
      isCarousel
      media { id kind imageUrl videoUrl thumbUrl order __typename }
      author { id username avatarUrl avatarThumbUrl isPrivate isFollowing followRequested __typename }
      taggedUsers { status user { id username avatarUrl __typename } __typename }
      communityContext { groupId title type slug reason sharedCount __typename }
      __typename
    }
  }
`;

const COMMUNITY_MOMENTS_FEED = gql`
  query CommunityMomentsFeed($offset: Int = 0, $limit: Int = 40) {
    communityMomentsFeed(offset: $offset, limit: $limit) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      caption
      location
      likeCount
      isLiked
      commentCount
      createdAt
      isCarousel
      media { id kind imageUrl videoUrl thumbUrl order __typename }
      author { id username avatarUrl avatarThumbUrl isPrivate isFollowing followRequested __typename }
      taggedUsers { status user { id username avatarUrl __typename } __typename }
      communityContext { groupId title type slug reason sharedCount __typename }
      __typename
    }
  }
`;
const SEARCH_CONTEXTS = gql`
  query SearchContexts($q: String!, $limit: Int, $windowHours: Int) {
    searchContexts(q: $q, limit: $limit, windowHours: $windowHours) {
      kind
      score

      contextId
      contextKey
      label
      contextKind

      hashtag
      hashtagKey

      postCount
      uniqueLikerCount
      likeCount
      isPromoted
      __typename
    }
  }
`;


/* -------------------- Constants -------------------- */
const ALL = "__ALL__";

type BarItem =
  | { kind: "MIX"; uiKey: "MIX"; key: "__ALL__"; title: string; imageSource?: any }
  | { kind: "VLOG"; uiKey: string; key: string; title: string; coverUrl?: string; coverThumbUrl?: string; memberCount?: number; postCount?: number }
  | { kind: "CONTEXT"; uiKey: string; key: string; title: string; meta?: string; source?: "BUBBLE" | "SEARCH_CONTEXT" | "SEARCH_HASHTAG"; contextKind?: string | null; imageSource?: any };


const NONE = "__NONE__" as const;

type TopPick =
  | { kind: "NONE"; key: typeof NONE }
  | { kind: "MIX"; key: "__ALL__" }
  | { kind: "VLOG"; key: string }
  | { kind: "CONTEXT"; key: string };

function normalizeContextBubbleLabel(value?: string | null) {
  return String(value ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function barItemDedupeKey(item: BarItem) {
  if (item.kind !== "CONTEXT") return `${item.kind}:${item.key}`;
  const normalizedKind = normalizeContextKind(item.contextKind, item.key);
  const labelKey = normalizeContextBubbleLabel(item.title);
  if (normalizedKind === "CITY" || normalizedKind === "PLACE") return `geo:${labelKey}`;
  if (normalizedKind === "INTEREST") return `interest:${normalizeContextImageKey(item.key || item.title)}`;
  if (normalizedKind === "HASHTAG") return `hashtag:${normalizeContextImageKey(item.key || item.title)}`;
  return `${normalizedKind || "context"}:${labelKey || item.key}`;
}

function dedupeBarItems(items: BarItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = barItemDedupeKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* -------------------- Popular Bar -------------------- */
function PopularVlogsBar({
  items,
  selected,
  onSelect,
  title,
  gapBelow = 8,
  C,
}: {
  items: BarItem[];
  selected: TopPick;
  onSelect: (x: TopPick) => void;
  title: string;
  gapBelow?: number;
  C: any;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const data = items;

  const [cardW, setCardW] = React.useState(160);
  const [rowH, setRowH] = React.useState(160);
  const [gap, setGap] = React.useState(10);

  const TITLE_H = 28;
  const META_H = 56;
  const BORDER_W = 1;


  const onLayout = React.useCallback(
    (e: any) => {
      const W = e?.nativeEvent?.layout?.width || SCREEN_W;

      const SIDE_PAD_L = Math.max(12, insets.left);
      const SIDE_PAD_R = Math.max(12, insets.right);
      const usable = W - SIDE_PAD_L - SIDE_PAD_R;

      const GAP_R = px(W >= 768 ? 12 : 10);
      setGap(GAP_R);

      const MIN_CARD_W = W >= 1024 ? 220 : W >= 768 ? 180 : W >= 420 ? 150 : 140;
      const MIN_ROW_H = W >= 768 ? 160 : 120;

      const perRow = Math.max(2, Math.floor((usable + GAP_R) / (MIN_CARD_W + GAP_R)));
      const w = px((usable - GAP_R * (perRow - 1)) / perRow);
      const coverH = px((w * 9) / 16);
      const cH = px(coverH + META_H + 2 * BORDER_W);

      setCardW(w);
      setRowH(Math.max(cH, MIN_ROW_H));
    },
    [insets.left, insets.right]
  );

  const SIDE_PAD_L = Math.max(12, insets.left);
  const SIDE_PAD_R = Math.max(12, insets.right);
  const { theme } = useTheme();
    

  const gridPlaceholder =
      theme.mode === "dark" ? gridPlaceholderDark : gridPlaceholderLight;

  const cardStyles = useMemo(() => pv(C), [C]);

  const renderCard = ({ item }: { item: BarItem }) => {
    const active = selected.kind === item.kind && selected.key === item.key;

    const coverH = (cardW * 9) / 16;
    

    const top = (() => {
      if (item.kind === "VLOG") {
        return (
          <ExpoImage
            source={{ uri: item.coverUrl ?? item.coverThumbUrl ?? gridPlaceholder }}
            style={{ width: cardW, height: coverH, backgroundColor: "rgba(255,255,255,0.04)", opacity: 0.88 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={80}
            allowDownscaling
            recyclingKey={item.key}
          />
        );
      }

      // MIX oder CONTEXT
      const smallIcon =
        item.kind === "MIX" ? "sparkles-outline" : `${contextIconFor(item.contextKind, item.key, "small")}-outline`;
      const largeIcon =
        item.kind === "MIX" ? "sparkles-outline" : `${contextIconFor(item.contextKind, item.key, "large")}-outline`;
      const imageSource = item.kind === "MIX"
        ? item.imageSource
        : item.imageSource ?? contextImageFor(item.contextKind, item.key, item.title);

      return (
        <View style={{ width: cardW, height: coverH, backgroundColor: "rgba(255,255,255,0.06)" }}>
          {!!imageSource ? (
            <ExpoImage
              source={imageSource}
              style={[StyleSheet.absoluteFillObject, { opacity: 0.84 }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={100}
              allowDownscaling
              recyclingKey={`${item.key}:context-image`}
            />
          ) : (
            <View style={contextFallbackStyles.coverIcon}>
              <ContextGlyph icon={largeIcon} size={42} color="#fff" />
            </View>
          )}
          <LinearGradient
            colors={imageSource ? ["rgba(0,0,0,0.04)", "rgba(0,0,0,0.38)"] : ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.12)"]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "flex-start", padding: 9 }}>
            <ContextGlyph icon={smallIcon} size={18} color="#fff" />
          </View>
        </View>
      );
    })();

    const metaText =
    item.kind === "VLOG"
      ? t("reels.meta.vlog", { posts: item.postCount ?? 0, members: item.memberCount ?? 0 })
      : item.kind === "CONTEXT"
        ? (item.meta ?? t("reels.meta.context"))
        : t("reels.meta.discoveryMix");


    return (
      <TouchableOpacity
        onPress={() => onSelect({ kind: item.kind, key: item.key } as TopPick)}
        style={[cardStyles.card, active && cardStyles.cardActive, { width: cardW, height: rowH }]}
        activeOpacity={0.95}
      >
        <View style={{ width: cardW, height: coverH, overflow: "hidden" }}>
          {top}
        </View>

        <View style={{ width: cardW, height: 56, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text numberOfLines={1} style={cardStyles.title}>{item.title ?? "—"}</Text>
          <Text numberOfLines={1} style={cardStyles.sub}>{metaText}</Text>
        </View>
      </TouchableOpacity>
    );
  };


  return (
    <View onLayout={onLayout} style={{ height: TITLE_H + rowH, position: "relative", marginBottom: gapBelow }}>
      <View style={{ position: "absolute", top: 0, left: SIDE_PAD_L, right: SIDE_PAD_R, height: TITLE_H, justifyContent: "center" }}>
        <Text style={{ color: C.text, fontWeight: "800", fontSize: 16, includeFontPadding: false, textAlignVertical: "center" }}>
          {title}</Text>
      </View>

      <View style={{ position: "absolute", top: TITLE_H, left: 0, right: 0, height: rowH }}>
        <FlatList
          horizontal
          data={data}
          keyExtractor={(item) => item.uiKey}
          renderItem={renderCard}
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews={false}
          ListHeaderComponent={<View style={{ width: SIDE_PAD_L }} />}
          ListFooterComponent={<View style={{ width: SIDE_PAD_R }} />}
          ItemSeparatorComponent={() => <View style={{ width: gap }} />}
          snapToInterval={cardW + gap}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          getItemLayout={(_, index) => ({
            length: cardW,
            offset: SIDE_PAD_L + index * (cardW + gap),
            index,
          })}
        />
      </View>
    </View>
  );
}

const pv = (C: any) =>
  StyleSheet.create({
    card: {
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: 1,
    },
    cardActive: { opacity: 1, borderColor: C.primary ?? "#4F8CFF" },
    title: { color: C.text, fontWeight: "800" },
    sub: { color: C.subtext, marginTop: 2, fontSize: 12 },
  });

function MiniContextBar({
  items,
  selected,
  onSelect,
  C,
}: {
  items: BarItem[];
  selected: TopPick;
  onSelect: (x: TopPick) => void;
  C: any;
}) {
  const insets = useSafeAreaInsets();

  const renderItem = ({ item }: { item: BarItem }) => {
    const active = selected.kind === item.kind && selected.key === item.key;
    const icon = item.kind === "MIX"
      ? "sparkles-outline"
      : item.kind === "VLOG"
        ? "albums-outline"
        : `${contextIconFor(item.contextKind, item.key, "small")}-outline`;
    const largeIcon = item.kind === "MIX"
      ? "sparkles-outline"
      : item.kind === "VLOG"
        ? "albums-outline"
        : `${contextIconFor(item.contextKind, item.key, "large")}-outline`;
    const imageSource = item.kind === "VLOG"
      ? item.coverThumbUrl || item.coverUrl
        ? { uri: item.coverThumbUrl ?? item.coverUrl }
        : null
      : item.kind === "MIX"
        ? item.imageSource
        : item.imageSource ?? contextImageFor(item.contextKind, item.key, item.title);

    return (
      <TouchableOpacity
        onPress={() => onSelect({ kind: item.kind, key: item.key } as TopPick)}
        activeOpacity={0.86}
        style={[
          miniStyles.chip,
          {
            backgroundColor: C.card,
            borderColor: active ? C.text : "rgba(255,255,255,0.28)",
          },
        ]}
      >
        {!!imageSource ? (
          <ExpoImage
            source={imageSource}
            style={[StyleSheet.absoluteFillObject, { opacity: 0.8 }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={90}
            allowDownscaling
            recyclingKey={`${item.key}:mini-context-image`}
          />
        ) : (
          <View style={contextFallbackStyles.miniIcon}>
            <ContextGlyph icon={largeIcon} size={25} color="#fff" />
          </View>
        )}
        <LinearGradient
          colors={active ? ["rgba(0,0,0,0.1)", "rgba(0,0,0,0.56)"] : ["rgba(0,0,0,0.2)", "rgba(0,0,0,0.68)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <ContextGlyph icon={icon} size={14} color="#fff" />
        <Text style={[miniStyles.chipText, { color: "#fff" }]} numberOfLines={1}>
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.uiKey}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingLeft: Math.max(12, insets.left),
        paddingRight: Math.max(12, insets.right),
        gap: 8,
      }}
    />
  );
}

const miniStyles = StyleSheet.create({
  chip: {
    height: 36,
    maxWidth: 178,
    minWidth: 0,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "900",
    flexShrink: 1,
    minWidth: 0,
  },
});

function ContextGlyph({
  icon,
  size,
  color,
}: {
  icon: string;
  size: number;
  color: string;
}) {
  if (icon === "hash" || icon === "hash-outline") {
    return (
      <Text
        style={{
          color,
          fontSize: size,
          lineHeight: size + 2,
          fontWeight: "900",
          includeFontPadding: false,
        }}
      >
        #
      </Text>
    );
  }
  return <Ionicons name={icon as any} size={size} color={color} />;
}

const contextFallbackStyles = StyleSheet.create({
  coverIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  miniIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});

function CommunityLiveStrip({
  groups,
  onOpen,
  onManage,
  C,
}: {
  groups: any[];
  onOpen: (group: any) => void;
  onManage: () => void;
  C: any;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const data = Array.isArray(groups) ? groups.slice(0, 8) : [];
  if (!data.length) return null;

  return (
    <View style={communityStripStyles.wrap}>
      <FlatList
        horizontal
        data={[{ id: "__label__", kind: "LABEL" }, ...data, { id: "__all__", kind: "ALL" }]}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingLeft: Math.max(12, insets.left),
          paddingRight: Math.max(12, insets.right),
          gap: 8,
        }}
        renderItem={({ item }) => {
          if (item.kind === "LABEL") {
            return (
              <View style={communityStripStyles.labelChip}>
                <View style={communityStripStyles.liveDot} />
                <Text style={[communityStripStyles.labelText, { color: C.text }]}>
                  {t("reels.communities.liveTitle")}
                </Text>
              </View>
            );
          }
          if (item.kind === "ALL") {
            return (
              <TouchableOpacity
                onPress={onManage}
                activeOpacity={0.85}
                style={[communityStripStyles.allChip, { borderColor: C.border }]}
              >
                <Text style={[communityStripStyles.allText, { color: C.subtext }]}>
                  {t("reels.communities.manage")}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={C.subtext} />
              </TouchableOpacity>
            );
          }
          const isEvent = item?.type === "EVENT";
          return (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => onOpen(item)}
              style={[
                communityStripStyles.card,
                { backgroundColor: C.card, borderColor: C.border },
              ]}
              >
              <View
                style={[
                  communityStripStyles.iconBubble,
                  { backgroundColor: isEvent ? "rgba(255,184,77,0.18)" : "rgba(79,140,255,0.14)" },
                ]}
              >
                <Ionicons
                  name={isEvent ? "flash" : "people"}
                  size={14}
                  color={isEvent ? "#FFB84D" : (C.primary ?? C.text)}
                />
              </View>

              <Text style={[communityStripStyles.cardTitle, { color: C.text }]} numberOfLines={1}>
                {item?.title ?? t("communityspace.communityFallback")}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const communityStripStyles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  card: {
    height: 40,
    maxWidth: 176,
    minWidth: 92,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    overflow: "hidden",
  },
  iconBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  labelChip: {
    height: 40,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 2,
  },
  labelText: {
    fontSize: 13,
    fontWeight: "900",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#36D399",
  },
  allChip: {
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  allText: {
    fontSize: 12,
    fontWeight: "900",
  },
  cardTitle: { fontSize: 13, fontWeight: "900", flexShrink: 1, minWidth: 0 },
});

/* -------------------- Screen -------------------- */
export default function ReelsScreen() {
 
  const { t } = useTranslation();
  
  // Autoplay: sichtbarer Post
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndexRef = useRef<number>(0);
  const refetchBubblesRef = useRef<null | ((variables?: any) => Promise<any>)>(null);

  const clearActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const client = useApolloClient();
  const isFocused = useIsFocused();

  const wasBlurredRef = useRef(false);
const {
  data: rfData,
  loading: rfLoading,
  fetchMore: rfFetchMore,
  refetch: refetchReels,
  networkStatus: rfNS,
  error: rfError
} = useQuery(POSTS_FEED, {
  variables: { offset: 0, limit: 40 },
  fetchPolicy: "cache-and-network",
  nextFetchPolicy: "cache-first",
  notifyOnNetworkStatusChange: true,
});

const {
  data: communityFeedData,
  fetchMore: communityFeedFetchMore,
  refetch: refetchCommunityMoments,
  networkStatus: communityFeedNS,
  error: communityFeedError,
} = useQuery(COMMUNITY_MOMENTS_FEED, {
  variables: { offset: 0, limit: 40 },
  fetchPolicy: "cache-and-network",
  nextFetchPolicy: "cache-first",
  notifyOnNetworkStatusChange: true,
});

const basePosts = useMemo(() => rfData?.reelsFeed ?? [], [rfData]);
const communityMomentPosts = useMemo(
  () => communityFeedData?.communityMomentsFeed ?? [],
  [communityFeedData]
);
const [activeIndex, setActiveIndex] = useState(0);

const mixDoneRef = useRef(false);
const lastLenRef = useRef(0);


const BASE_PAGE = 40;
const PAGE_LIMIT = 20;
const baseFetchingRef = useRef(false);
const baseDoneRef = useRef(false);
const communityFetchingRef = useRef(false);
const communityDoneRef = useRef(false);
const feedListRef = useRef<any>(null);



const loadMoreBase = useCallback(async (): Promise<number> => {
  if (baseFetchingRef.current) return 0;
  if (baseDoneRef.current) return 0;
  if (!rfFetchMore) return 0;

  baseFetchingRef.current = true;

  try {
    const prevLen = basePostsRef.current.length;
    let addedCount = 0;

    await rfFetchMore({
      variables: { offset: prevLen, limit: BASE_PAGE },
      updateQuery: (prev, { fetchMoreResult }) => {
        const prevItems = prev?.reelsFeed ?? [];
        const nextItems = fetchMoreResult?.reelsFeed ?? [];
        const merged = [...prevItems, ...nextItems];
        const uniq = Array.from(new Map(merged.map((x: any) => [x.id, x])).values());
        addedCount = Math.max(0, uniq.length - prevItems.length);
        if (nextItems.length < BASE_PAGE || addedCount === 0) baseDoneRef.current = true;
        basePostsRef.current = uniq;
        return { ...prev, reelsFeed: uniq };
      },
    });

    return addedCount;
  } finally {
    baseFetchingRef.current = false;
  }
}, [rfFetchMore]);

const loadMoreCommunityMoments = useCallback(async (): Promise<number> => {
  if (communityFetchingRef.current) return 0;
  if (communityDoneRef.current) return 0;
  if (!communityFeedFetchMore) return 0;

  communityFetchingRef.current = true;

  try {
    const prevLen = communityMomentPostsRef.current.length;
    let addedCount = 0;

    await communityFeedFetchMore({
      variables: { offset: prevLen, limit: BASE_PAGE },
      updateQuery: (prev, { fetchMoreResult }) => {
        const prevItems = prev?.communityMomentsFeed ?? [];
        const nextItems = fetchMoreResult?.communityMomentsFeed ?? [];
        const merged = [...prevItems, ...nextItems];
        const uniq = Array.from(new Map(merged.map((x: any) => [x.id, x])).values());
        addedCount = Math.max(0, uniq.length - prevItems.length);
        if (nextItems.length < BASE_PAGE || addedCount === 0) communityDoneRef.current = true;
        communityMomentPostsRef.current = uniq;
        return { ...prev, communityMomentsFeed: uniq };
      },
    });

    return addedCount;
  } finally {
    communityFetchingRef.current = false;
  }
}, [communityFeedFetchMore]);




const [mixedPosts, setMixedPosts] = useState<any[]>([]);
const [mixLoading, setMixLoading] = useState(false);

const ctxLoadedCountRef = useRef<Record<string, number>>({});
const ctxExhaustedRef = useRef<Record<string, boolean>>({});
const ctxPostsPoolRef = useRef<any[]>([]);
const mixReqRef = useRef(0);

const PAGE_PER_CTX = 6;
const MIN_MIX_POSTS = 18;
const CONTEXT_BUBBLE_WINDOW_HOURS = 24 * 30;

function postAuthorId(p: any) {
  return p?.author?.id ?? p?.authorId ?? null;
}

function postContextKey(p: any) {
  return p?.__ctx?.key ?? p?.__ctx?.contextKey ?? null;
}

function postRecencyMs(p: any) {
  const t = p?.createdAt ? new Date(p.createdAt).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function hasRecentRepeat(out: any[], candidate: any, getter: (p: any) => string | null, windowSize: number, maxCount: number) {
  const key = getter(candidate);
  if (!key) return false;
  const recent = out.slice(Math.max(0, out.length - windowSize));
  return recent.filter((p) => getter(p) === key).length >= maxCount;
}

function buildPreferredMix(ctx: any[], base: any[], target: number, existing: any[] = []) {
  const byId = new Map<string, any>();
  for (const p of [...existing, ...ctx, ...base]) {
    if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
  }

  const out = Array.from(new Map((existing ?? []).filter((p) => p?.id).map((p) => [p.id, p])).values());
  const used = new Set(out.map((p: any) => p.id));

  let ctxPool = Array.from(new Map((ctx ?? []).filter((p) => p?.id && !used.has(p.id)).map((p) => [p.id, p])).values());
  let basePool = Array.from(new Map((base ?? []).filter((p) => p?.id && !used.has(p.id)).map((p) => [p.id, p])).values());

  const contextRatio = 0.68;

  const pick = (pool: any[], source: "ctx" | "base", strict = true) => {
    if (!pool.length) return null;
    const now = Date.now();
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const sameAuthor = hasRecentRepeat(out, p, postAuthorId, 7, 1);
      const sameContext = source === "ctx" && hasRecentRepeat(out, p, postContextKey, 5, 2);
      if (strict && (sameAuthor || sameContext)) continue;

      const ageHours = Math.max(0, (now - postRecencyMs(p)) / 36e5);
      const recency = Math.exp(-ageHours / 72);
      const popularity = Math.log1p(Number(p?.likeCount ?? 0)) * 0.08 + Math.log1p(Number(p?.commentCount ?? 0)) * 0.12;
      const orderBias = 1 / (i + 1);
      const sourceBoost = source === "ctx" ? 0.35 : 0;
      const penalty = (sameAuthor ? 0.9 : 0) + (sameContext ? 0.45 : 0);
      const score = sourceBoost + recency + popularity + orderBias - penalty;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) return null;
    return pool.splice(bestIndex, 1)[0];
  };

  while (out.length < target && (ctxPool.length || basePool.length)) {
    const appended = out.length - used.size;
    const ctxAlready = out.filter((p: any) => !!p.__ctx).length;
    const desiredCtx = Math.ceil((out.length + 1) * contextRatio);
    const preferCtx = ctxAlready < desiredCtx || appended % 3 !== 2;

    let next =
      preferCtx
        ? pick(ctxPool, "ctx", true) ?? pick(basePool, "base", true)
        : pick(basePool, "base", true) ?? pick(ctxPool, "ctx", true);

    next =
      next ??
      (preferCtx
        ? pick(ctxPool, "ctx", false) ?? pick(basePool, "base", false)
        : pick(basePool, "base", false) ?? pick(ctxPool, "ctx", false));

    if (!next) break;
    if (used.has(next.id)) continue;
    used.add(next.id);
    out.push(byId.get(next.id) ?? next);
  }

  return out.slice(0, target);
}

const [mixDone, setMixDone] = useState(false);

const loadMixedInitial = useCallback(
  async (_contexts: any[], _base: any[], communityPosts: any[] = []) => {
    setMixDone(false);
    mixDoneRef.current = false;
    lastLenRef.current = 0;
    communityDoneRef.current = false;

    const myReq = ++mixReqRef.current;
    setMixLoading(true);

    try {
      // Communities is intentionally strict: only explicit community posts
      // and normal public posts by people who share a community with me.
      const communityCtx = { key: "__COMMUNITIES__", label: "Communities", kind: "COMMUNITY" };
      const communitySeed = Array.from(
        new Map((communityPosts ?? []).filter((p: any) => p?.id).map((p: any) => [p.id, { ...p, __ctx: communityCtx }])).values()
      );
      ctxLoadedCountRef.current = {};
      ctxExhaustedRef.current = {};
      ctxPostsPoolRef.current = communitySeed;

      if (mixReqRef.current !== myReq) return;
      setMixedPosts(communitySeed);
      if (communitySeed.length < MIN_MIX_POSTS) {
        mixDoneRef.current = true;
        setMixDone(true);
      }
    } finally {
      setMixLoading(false);
    }
  },
  []
);



useEffect(() => {
  if (!isFocused) {
    // ✅ du bist von diesem Tab weg
    wasBlurredRef.current = true;
    return;
  }

  // ✅ wieder focused (Tab zurück)
  if (wasBlurredRef.current) {
    wasBlurredRef.current = false;

    // ganz nach oben
    feedListRef.current?.scrollToOffset({ offset: 0, animated: false });

    // autoplay / active state reset
    setActiveId(null);
    activeIndexRef.current = 0;
  }
}, [isFocused]);


    const { theme } = useTheme();
    const C = theme.colors as any;
    const s = styles(C, theme.mode === "dark");
  


  const insets = useSafeAreaInsets();

  // ✅ fixe Header-Höhe (wie Feed-Header)
  const HEADER_H = 52;
  const androidStatusTop = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
  const headerPadTop = Math.max(insets.top, androidStatusTop, 10); // safe + optisch

  // ⬇️ "Scroll hint" arrow animation
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const actionStepShake = useRef(new Animated.Value(0)).current;
  const actionFloatValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const actionFloatOffsets = useRef([
    { x: -4, y: 3 },
    { x: 3, y: -4 },
    { x: -3, y: -5 },
    { x: 4, y: 2 },
  ]).current;
  const actionShakeOffsets = useRef([
    { x: -0.38, y: 0.18 },
    { x: 0.32, y: -0.16 },
    { x: -0.3, y: -0.2 },
    { x: 0.36, y: 0.15 },
  ]).current;
  const [actionFloatRunKey, setActionFloatRunKey] = useState(0);


  const [selected, setSelected] = useState<TopPick>({ kind: "MIX", key: "__ALL__" });
  


  useEffect(() => {
    // ✅ bei jedem Wechsel neu starten
    arrowAnim.stopAnimation();
    arrowAnim.setValue(0);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [arrowAnim, selected.kind, selected.key]);

  const arrowTranslateY = arrowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8], // up/down
  });

  useEffect(() => {
    if (!isFocused) {
      actionFloatValues.forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
      return;
    }

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const loops = actionFloatValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 1550 + index * 230,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 1550 + index * 230,
            useNativeDriver: true,
          }),
        ])
      )
    );

    actionFloatValues.forEach((value) => {
      value.stopAnimation();
      value.setValue(0);
    });

    loops.forEach((loop, index) => {
      timers.push(setTimeout(() => loop.start(), index * 170));
    });

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((loop) => loop.stop());
    };
  }, [actionFloatRunKey, actionFloatValues, selected.kind, selected.key, isFocused]);

  const actionFloatStyle = useCallback(
    (index: number) => {
      const value = actionFloatValues[index];
      const offset = actionFloatOffsets[index];
      const shakeOffset = actionShakeOffsets[index] ?? { x: 1.4, y: 0.7 };
      const shakeX = actionStepShake.interpolate({
        inputRange: [0, 1, 2, 3, 4],
        outputRange: [0, shakeOffset.x, -shakeOffset.x * 0.9, shakeOffset.x * 0.48, 0],
      });
      const shakeY = actionStepShake.interpolate({
        inputRange: [0, 1, 2, 3, 4],
        outputRange: [0, shakeOffset.y, -shakeOffset.y * 0.75, shakeOffset.y * 0.35, 0],
      });
      const floatX = value.interpolate({
        inputRange: [0, 1],
        outputRange: [0, offset.x],
      });
      const floatY = value.interpolate({
        inputRange: [0, 1],
        outputRange: [0, offset.y],
      });
      return {
        transform: [
          { translateX: Animated.add(floatX, shakeX) },
          { translateY: Animated.add(floatY, shakeY) },
        ],
      };
    },
    [actionFloatOffsets, actionFloatValues, actionShakeOffsets, actionStepShake]
  );

  const triggerPostStepFeedback = useCallback(() => {
    hapticImpact();
    actionStepShake.stopAnimation();
    actionStepShake.setValue(0);
    Animated.sequence([
      Animated.timing(actionStepShake, { toValue: 1, duration: 34, useNativeDriver: true }),
      Animated.timing(actionStepShake, { toValue: 2, duration: 34, useNativeDriver: true }),
      Animated.timing(actionStepShake, { toValue: 3, duration: 34, useNativeDriver: true }),
      Animated.timing(actionStepShake, { toValue: 4, duration: 42, useNativeDriver: true }),
    ]).start(() => {
      actionStepShake.setValue(0);
    });
  }, [actionStepShake]);

  // ...restliche Hooks/Logic unverändert

  useFocusEffect(
    React.useCallback(() => {
      return () => setActiveId(null);
    }, [])
  );

  const [hasFocusedItem, setHasFocusedItem] = useState(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = React.useReducer((x) => x + 1, 0);
  const markPostViewed = useMarkPostViewed();
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (inHeaderRef.current) return; // ✅ block

    const top = viewableItems?.find((v: any) => v.isViewable && v.item?.id);
    const nextId = top?.item?.id ?? null;
    const nextIndex = typeof top?.index === "number" ? top.index : null;

    const previousId = activeIdRef.current;
    if (nextId && nextId !== previousId) {
      setActiveId(nextId);
      markPostViewed(nextId);
      if (previousId) {
        triggerPostStepFeedback();
      }
    }

    if (nextIndex !== null && nextIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextIndex;
      forceRender();
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
    minimumViewTime: 80,
    waitForInteraction: true,
  }).current;

  const tabBarH = useBottomTabBarHeight();
  const y = -(insets.bottom || 0);

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });
  const myUserId = meData?.me?.id ?? null;

  const [localLiked, setLocalLiked] = useState<Record<string, boolean>>({});
  const [localFollowed, setLocalFollowed] = useState<Record<string, boolean>>({});

  const {
    data: cbData,
    loading: cbLoading,
    refetch: refetchBubbles,
    networkStatus: cbNS,
    error: cbError
  } = useQuery(CONTEXT_BUBBLES, {
    variables: { limit: 12, windowHours: CONTEXT_BUBBLE_WINDOW_HOURS },
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });
  const { data: communitiesData } = useQuery(MY_LIVE_COMMUNITIES, {
    fetchPolicy: "cache-and-network",
  });
  const liveCommunities = useMemo(
    () =>
      [...(communitiesData?.myJoinedGroupLinks ?? [])].sort((a: any, b: any) => {
        const aEvent = a?.type === "EVENT" ? 1 : 0;
        const bEvent = b?.type === "EVENT" ? 1 : 0;
        if (aEvent !== bEvent) return bEvent - aEvent;
        return Number(b?.memberCount ?? 0) - Number(a?.memberCount ?? 0);
      }),
    [communitiesData?.myJoinedGroupLinks]
  );

  const bubblesRefreshTimerRef = useRef<any>(null);
  const requestBubblesRefresh = useCallback(() => {
    if (!refetchBubbles) return;

    if (bubblesRefreshTimerRef.current) {
      clearTimeout(bubblesRefreshTimerRef.current);
    }

    bubblesRefreshTimerRef.current = setTimeout(() => {
      refetchBubbles({ limit: 12, windowHours: CONTEXT_BUBBLE_WINDOW_HOURS }).catch(() => {});
    }, 450);
  }, [refetchBubbles]);


  

  const contextBubbles = cbData?.contextBubbles ?? [];

  const mixSourceContexts = useMemo(() => {
    return (contextBubbles ?? []).slice(0, 10);
  }, [contextBubbles]);

  const mixKey = useMemo(() => {
    if (selected.kind !== "MIX") return "";
    const keys = mixSourceContexts.map((c: any) => c.key).filter(Boolean).sort();
    const communityKeys = communityMomentPosts.map((p: any) => p?.id).filter(Boolean).slice(0, 40).sort();
    return [...keys, `communities:${communityKeys.join(",")}`].join("|");
  }, [selected.kind, mixSourceContexts, communityMomentPosts]);


  // Suche
  const [query, setQuery] = useState("");
  const [runSearchCtx, { data: sctxData, loading: sCtxLoading }] =
  useLazyQuery(SEARCH_CONTEXTS, { fetchPolicy: "network-only" });

  const searchHits = sctxData?.searchContexts ?? [];  
  const isSearching = query.trim().length > 0;

  useEffect(() => {
    const incoming = String(route.params?.initialLocationSearch ?? "").trim();
    if (!incoming) return;

    setQuery(incoming);
    setSelected({ kind: "MIX", key: "__ALL__" });
    feedListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    runSearchCtx({ variables: { q: incoming, limit: 24, windowHours: 168 } }).catch(() => {});
  }, [route.params?.initialLocationSearch, route.params?.searchNonce, runSearchCtx]);

  // Beliebte Vlogs
  

  const POPULAR_BAR_MAX = 24;
  

  
  // Auswahl

  

  const selectedSlug = selected.kind === "VLOG" ? selected.key : null;

  const { data: vlogDetailData } = useQuery(VLOG_BY_SLUG, {
    skip: !selectedSlug,
    variables: selectedSlug ? { slug: selectedSlug } : undefined,
    fetchPolicy: "cache-first",
  });

  const selectedVlog = vlogDetailData?.vlogBySlug ?? null;
  const vlogId = selectedVlog?.id ?? null;

  useEffect(() => {
    return () => {
      if (bubblesRefreshTimerRef.current) {
        clearTimeout(bubblesRefreshTimerRef.current);
      }
      if (ctxRefreshTimerRef.current) {
        clearTimeout(ctxRefreshTimerRef.current);
      }
    };
  }, []);



  // Single Vlog Posts
  const isVlog = selected.kind === "VLOG";

  const { data, loading, fetchMore, refetch, networkStatus, error } = useQuery(VLOG_POSTS, {
    skip: !isVlog || !vlogId,
    variables: isVlog && vlogId ? { vlogId, offset: 0, limit: 20 } : undefined,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });


  const singlePosts = data?.vlogPosts ?? [];
  
const baseReadyRef = useRef(false);

const basePostsRef = useRef<any[]>([]);
useEffect(() => { basePostsRef.current = basePosts; }, [basePosts]);

const communityMomentPostsRef = useRef<any[]>([]);
useEffect(() => { communityMomentPostsRef.current = communityMomentPosts; }, [communityMomentPosts]);

const mixSourceContextsRef = useRef<any[]>([]);
useEffect(() => { mixSourceContextsRef.current = mixSourceContexts; }, [mixSourceContexts]);


const lastLoadedMixKeyRef = useRef<string>("");

useEffect(() => {
  if (selected.kind !== "MIX") return;
  if ((basePostsRef.current?.length ?? 0) === 0) return;

  const nextKey = mixKey || "";

  const keyChanged = lastLoadedMixKeyRef.current !== nextKey;
  const canRebuildNow = inHeaderRef2.current; // ✅ nur oben

  // ✅ initial load immer
  if (!lastLoadedMixKeyRef.current) {
    lastLoadedMixKeyRef.current = nextKey;
    loadMixedInitial(mixSourceContextsRef.current, basePostsRef.current, communityMomentPostsRef.current);
    return;
  }

  // ✅ nur rebuild wenn oben
  if (keyChanged && canRebuildNow) {
    lastLoadedMixKeyRef.current = nextKey;
    loadMixedInitial(mixSourceContextsRef.current, basePostsRef.current, communityMomentPostsRef.current);
  }

  return () => {
    mixReqRef.current++;
  };
}, [selected.kind, mixKey, basePosts.length, communityMomentPosts.length, loadMixedInitial]);




// load more: limit pro context erhöhen, nur Delta anhängen
const mixFetchingRef = useRef(false);

const loadMoreMixed = useCallback(async () => {
  if (mixDoneRef.current) return;
  if (mixFetchingRef.current) return;
  mixFetchingRef.current = true;

  const myReq = ++mixReqRef.current;
  setMixLoading(true);

  try {
    const newly: any[] = [];
    let addedCommunity = 0;

    if (!communityDoneRef.current) {
      const before = communityMomentPostsRef.current.length;
      addedCommunity = await loadMoreCommunityMoments();
      const after = communityMomentPostsRef.current.slice(before);
      const communityCtx = { key: "__COMMUNITIES__", label: "Communities", kind: "COMMUNITY" };
      newly.push(...after.map((p: any) => ({ ...p, __ctx: communityCtx })));
    }

    const mergedCtx = [...ctxPostsPoolRef.current, ...newly];
    const uniqueCtx = Array.from(new Map(mergedCtx.map((p: any) => [p.id, p])).values());
    ctxPostsPoolRef.current = uniqueCtx;

    const target = Math.max(MIN_MIX_POSTS, mixedPosts.length + PAGE_PER_CTX * 2);
    const nextMix = buildPreferredMix(uniqueCtx, [], target, mixedPosts);

    if (mixReqRef.current !== myReq) return;

    setMixedPosts(nextMix);

    // STOP-Kriterium: Länge hat sich nicht erhöht UND es kam auch wirklich keine neue Quelle dazu.
    // Apollo refs können sonst eine Render-Runde hinterherhinken und den Mix zu früh beenden.
    const nextLen = nextMix.length;
    const prevLen = lastLenRef.current || mixedPosts.length;

    if (nextLen <= prevLen && newly.length === 0 && addedCommunity === 0) {
      mixDoneRef.current = true;
      setMixDone(true);
    } else {
      lastLenRef.current = nextLen;
    }
  } finally {
    setMixLoading(false);
    mixFetchingRef.current = false;
  }
}, [mixedPosts, loadMoreCommunityMoments]);


  // MIX (ALL) Posts

  const mixedCursorsRef = useRef<Record<string, number>>({});
  const mixedDoneRef = useRef<Record<string, boolean>>({});

const contextKindLabel = useCallback(
  (kind?: string | null) => {
    switch (normalizeContextKind(kind)) {
      case "HASHTAG":
        return t("reels.contextKind.hashtag", { defaultValue: "Hashtag" });
      case "CITY":
        return t("reels.contextKind.city", { defaultValue: "Stadt" });
      case "INTEREST":
        return t("reels.contextKind.interest", { defaultValue: "Interesse" });
      case "TOPIC":
        return t("reels.contextKind.topic", { defaultValue: "Thema" });
      case "PLACE":
        return t("reels.contextKind.place", { defaultValue: "Ort" });
      case "EDU_FIELD":
        return t("reels.contextKind.eduField", { defaultValue: "Studium" });
      case "EDU_ORG":
        return t("reels.contextKind.eduOrg", { defaultValue: "Campus" });
      case "EDU_LEVEL":
        return t("reels.contextKind.eduLevel", { defaultValue: "Ausbildung" });
      default:
        return kind ? String(kind) : t("reels.meta.contextKindFallback");
    }
  },
  [t]
);

const barItems: BarItem[] = useMemo(() => {
  const hasCommunityMomentPosts = communityMomentPosts.length > 0;
  const mix: BarItem = {
    kind: "MIX",
    uiKey: "MIX",
    key: "__ALL__",
    title: t("reels.communityMix"),
    imageSource: hasCommunityMomentPosts ? CONTEXT_KIND_IMAGES.MIX : null,
  };


  const searchItems: BarItem[] = isSearching
    ? (searchHits ?? []).slice(0, 12).map((h: any) => {
        // CONTEXT hit
        if (h.kind === "CONTEXT") {
          const realKey = h.contextKey; // already the context key
          const normalizedKind = normalizeContextKind(h.contextKind, realKey);
          return {
            kind: "CONTEXT",
            uiKey: `sc:${realKey}`,     // ✅ unique react key
            key: realKey,               // ✅ selection key
            title: h.label ?? "—",
            meta: `${contextKindLabel(normalizedKind)} · ${Math.round(h.score ?? 0)}`,
            source: "SEARCH_CONTEXT",
            contextKind: normalizedKind,
            imageSource: contextImageFor(normalizedKind, realKey, h.label),
          } as BarItem;
        }

        // HASHTAG hit → treat as CONTEXT selection: tag:<hashtagKey>
        const realKey = `tag:${h.hashtagKey}`;
        const meta =
          `${h.isPromoted ? t("reels.meta.promoted") : t("reels.meta.hashtag")} · ` +
          `${t("reels.meta.postsCount", { count: h.postCount ?? 0 })} · ` +
          `${t("reels.meta.likersCount", { count: h.uniqueLikerCount ?? 0 })}`;


        return {
          kind: "CONTEXT",
          uiKey: `sh:${realKey}`,       // ✅ unique react key
          key: realKey,                 // ✅ selection key
          title: h.hashtag ?? `#${h.hashtagKey}`,
          meta,
          source: "SEARCH_HASHTAG",
          contextKind: "HASHTAG",
          imageSource: contextImageFor("HASHTAG", realKey, h.hashtag ?? h.hashtagKey),
        } as BarItem;
      })
    : [];

  const bubbleItems: BarItem[] = !isSearching
    ? (contextBubbles ?? [])
        .filter((c: any) => {
          const key = String(c?.key ?? "");
          const label = String(c?.label ?? "").trim();
          const score = Number(c?.score ?? 0);
          return !!key && !!label && score > 0 && !key.startsWith("group:");
        })
        .slice(0, 10)
        .map((c: any) => {
        const kindLabel = contextKindLabel(normalizeContextKind(c.kind, c.key));
        const normalizedKind = normalizeContextKind(c.kind, c.key);
        return {
          kind: "CONTEXT",
          uiKey: `b:${c.key}`,            // ✅ unique react key
          key: c.key,                     // ✅ selection key
          title: c.label,
          meta: kindLabel,
          source: "BUBBLE",
          contextKind: normalizedKind,
          imageSource: contextImageFor(normalizedKind, c.key, c.label),
        } as BarItem;
      })
    : [];

  return isSearching ? [mix, ...dedupeBarItems(searchItems)] : [mix, ...dedupeBarItems(bubbleItems)];
}, [communityMomentPosts.length, contextBubbles, contextKindLabel, isSearching, searchHits, t]);

const momentsBarTitle = useMemo(() => {
  if (isSearching) return t("reels.searchResults");
  return barItems.length > 1 ? t("reels.activeRooms") : t("reels.forYou");
}, [barItems.length, isSearching, t]);







// 2) Wenn Suche geleert wird -> zurück zu Mix
useEffect(() => {
  if (isSearching) return;
  setSelected({ kind: "MIX", key: "__ALL__" });
}, [isSearching]);


  // Likes (für Mix local, sonst Cache)
  const [likePost] = useMutation(LIKE_POST);
  const [unlikePost] = useMutation(UNLIKE_POST);
  const [followUser] = useMutation(FOLLOW);
  const [createThread] = useMutation(CREATE_THREAD);

  const [singleLikeMirror, setSingleLikeMirror] = useState<
    Record<string, { isLiked: boolean; likeCount: number }>
  >({});

  // Data source
  const isContext = selected.kind === "CONTEXT";

 

   const { data: ctxFeedData,loading: ctxLoading,
  fetchMore: fetchMoreCtx,
  refetch: refetchCtx, networkStatus: ctxNS,  } = useQuery(SUGGEST_POSTS_BY_CONTEXT, {
    skip: !isContext,
    variables: isContext ? { contextKey: selected.key, kind: "POST", offset: 0, limit: PAGE_LIMIT } : undefined,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });
  const contextPosts = ctxFeedData?.suggestPostsByContext ?? [];

  const ctxRefreshTimerRef = useRef<any>(null);

  const requestCtxRefresh = useCallback(() => {
    if (!refetchCtx) return;
    if (selected.kind !== "CONTEXT") return;

    if (ctxRefreshTimerRef.current) {
      clearTimeout(ctxRefreshTimerRef.current);
    }

    ctxRefreshTimerRef.current = setTimeout(() => {
      refetchCtx().catch(() => {});
    }, 450);
  }, [refetchCtx, selected.kind]);




  const onToggleLike = useCallback(
  async (p: any) => {
    const wasLiked = !!p.isLiked;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? +1 : -1;

    // ✅ 1) IMMER local list updaten (entscheidend!)
    if (selected.kind === "MIX") {
      setMixedPosts((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                isLiked: nextLiked,
                likeCount: Math.max(0, (x.likeCount ?? 0) + delta),
              }
            : x
        )
      );
    } else {
      // ⚠️ AUCH für Single-Vlog local spiegeln
      setSingleLikeMirror((m) => ({
        ...m,
        [p.id]: {
          isLiked: nextLiked,
          likeCount: Math.max(0, (p.likeCount ?? 0) + delta),
        },
      }));
    }

    try {
      if (nextLiked) {
        await likePost({ variables: { postId: p.id } });
      } else {
        await unlikePost({ variables: { postId: p.id } });
      }
      InteractionManager.runAfterInteractions(() => {
        if (selected.kind !== "MIX") {
          requestBubblesRefresh();
          requestCtxRefresh();
          return;
        }

        // MIX: nur refreshen wenn oben
        if (inHeaderRef2.current) requestBubblesRefresh();
      });

    } catch {
      // ❌ rollback
      if (selected.kind === "MIX") {
        setMixedPosts((prev) =>
          prev.map((x) =>
            x.id === p.id
              ? {
                  ...x,
                  isLiked: wasLiked,
                  likeCount: Math.max(0, (x.likeCount ?? 0) - delta),
                }
              : x
          )
        );
      }
    }
  },
  [selected.kind, likePost, unlikePost, requestBubblesRefresh, requestCtxRefresh]
);

useEffect(() => {
  if (!isSearching) return;

  const hits = Array.isArray(searchHits) ? searchHits : [];
  if (!hits.length) return;

  const top = hits[0];

  // top → selectedKey (CONTEXT oder HASHTAG)
  const topKey =
    top.kind === "CONTEXT"
      ? top.contextKey
      : `tag:${top.hashtagKey}`;

  // nur setzen, wenn noch MIX aktiv ODER aktueller Context nicht mehr in hits ist
  const stillInHits =
    selected.kind === "CONTEXT" &&
    hits.some((h: any) => {
      const k = h.kind === "CONTEXT" ? h.contextKey : `tag:${h.hashtagKey}`;
      return k === selected.key;
    });

  if (selected.kind === "MIX" || !stillInHits) {
    setSelected({ kind: "CONTEXT", key: topKey });
  }
}, [isSearching, searchHits, selected.kind, selected.key]);



  // Load more Single
  const [canLoadMore, setCanLoadMore] = useState(true);
  const fetchingMoreRef = useRef(false);

  useEffect(() => {
    setCanLoadMore(true);
    fetchingMoreRef.current = false;
  }, [vlogId, selected.kind]);

  useEffect(() => {
    if (selected.kind === "MIX") return;
    if (selected.kind === "VLOG" && !loading) setCanLoadMore((singlePosts?.length ?? 0) >= PAGE_LIMIT);
    if (selected.kind === "CONTEXT" && !ctxLoading) setCanLoadMore((contextPosts?.length ?? 0) >= PAGE_LIMIT);
  }, [ctxLoading, contextPosts?.length, loading, singlePosts?.length, selected.kind]);

  const onEndReachedSingle = useCallback(() => {
    if (selected.kind === "MIX" || fetchingMoreRef.current || !canLoadMore) return;

    fetchingMoreRef.current = true;

    if (selected.kind === "CONTEXT") {
      fetchMoreCtx?.({
        variables: { contextKey: selected.key, kind: "POST", offset: contextPosts.length, limit: PAGE_LIMIT },
        updateQuery: (prev, { fetchMoreResult }) => {
          fetchingMoreRef.current = false;
          const next = fetchMoreResult?.suggestPostsByContext ?? [];
          if (next.length < PAGE_LIMIT) setCanLoadMore(false);

          const merged = [...(prev.suggestPostsByContext ?? []), ...next];
          const unique = Array.from(new Map(merged.map((p: any) => [p.id, p])).values());
          return { ...prev, suggestPostsByContext: unique };
        },
      }).catch(() => {
        fetchingMoreRef.current = false;
      });
      return;
    }

    if (!vlogId) {
      fetchingMoreRef.current = false;
      return;
    }

    fetchMore?.({
      variables: { vlogId, offset: singlePosts.length, limit: PAGE_LIMIT },
      updateQuery: (prev, { fetchMoreResult }) => {
        fetchingMoreRef.current = false;
        const next = fetchMoreResult?.vlogPosts ?? [];
        if (next.length < PAGE_LIMIT) setCanLoadMore(false);

        const merged = [...(prev.vlogPosts ?? []), ...next];
        const unique = Array.from(new Map(merged.map((p: any) => [p.id, p])).values());
        return { ...prev, vlogPosts: unique };
      },
    }).catch(() => {
      fetchingMoreRef.current = false;
    });
  }, [canLoadMore, contextPosts.length, fetchMore, fetchMoreCtx, selected, singlePosts.length, vlogId]);

  // Debounce Search
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => {
      if (!q) return;
      runSearchCtx({ variables: { q, limit: 24, windowHours: 168 } });
    }, 250);
    return () => clearTimeout(t);
  }, [query, runSearchCtx]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);


  // Header UI spacing (responsive)
  const { width: W } = useWindowDimensions();
  const isTablet = W >= 768;
  const searchMt = Math.max(8, Math.round(W * (isTablet ? 0.02 : 0.04)));
  const searchMb = Math.max(6, Math.round(W * (isTablet ? 0.015 : 0.03)));
  const popularGap = Math.max(4, Math.round(W * (isTablet ? 0.012 : 0.02)));


  const listData =
  selected.kind === "MIX" ? mixedPosts :
  selected.kind === "CONTEXT" ? contextPosts :
  selected.kind === "VLOG" ? singlePosts :
  [];




  const hasPosts = (listData?.length ?? 0) > 0;


  const activePost = activeId
  ? (listData ?? []).find((p: any) => p?.id === activeId) ?? null
  : null;


  const activeAuthor = activePost?.author ?? null;
  const activeAuthorId = activeAuthor?.id ?? null;

  const isOwnPost = !!myUserId && !!activeAuthorId && myUserId === activeAuthorId;

  // ✅ Follow gilt auch als “nicht followbar”, wenn request schon raus ist
  const alreadyFollowedOrRequested = !!activeAuthor?.isFollowing || !!activeAuthor?.followRequested;

  // Like Status (kommt aus Post)
  const alreadyLiked = !!activePost?.isLiked;

  // Follow-Status: lokal (zuverlässig)
  const isFollowed = activeAuthorId ? !!localFollowed[activeAuthorId] : false;
  const followActionDone = isOwnPost || alreadyFollowedOrRequested || isFollowed;


  // Like-Status: local override -> sonst aus Post
  const isLiked =
    activePost?.id ? (localLiked[activePost.id] ?? !!activePost.isLiked) : false;
  const likeActionDone = isLiked;


  const { height: H } = useWindowDimensions();

  // deine Tabbar ist fix 80 hoch (aus Tabs.tsx)
  const TABBAR_H = 80;

  // wieviel “Luft” zwischen cards
  const CARD_GAP = 18;
  const MINI_CONTEXT_H = 56;
  const STICKY_HEADER_H = headerPadTop + MINI_CONTEXT_H;
  const [listHeaderH, setListHeaderH] = useState(0);
  const ItemSep = useCallback(() => <View style={{ height: CARD_GAP }} />, []);



  // sichtbare Card-Höhe (1 Card pro Screen, unter fixed header + über tabbar)
  const CARD_H = Math.max(
    200,
    H - STICKY_HEADER_H - TABBAR_H
  );
  const feedStartOffset = Math.max(0, listHeaderH - STICKY_HEADER_H);

const scrollToNext = useCallback(() => {
  const nextIndex = (activeIndexRef.current ?? 0) + 1;
  if (!listData?.length) return;
  if (nextIndex >= listData.length) return;

  const offset = feedStartOffset + nextIndex * (CARD_H + CARD_GAP);
  feedListRef.current?.scrollToOffset({ offset, animated: true });

  activeIndexRef.current = nextIndex;
  setActiveId(listData[nextIndex]?.id ?? null);
}, [listData, feedStartOffset, CARD_H, CARD_GAP]);

  const scrollToFirstPost = useCallback(() => {
  if (!listData?.length) return;

  feedListRef.current?.scrollToOffset({
    offset: feedStartOffset,
    animated: true,
  });

  activeIndexRef.current = 0;
}, [listData, feedStartOffset]);


  const doFollow = useCallback(async () => {
  if (!activePost) return;

  const userId = activePost.author?.id;
  const isPrivate = !!activePost.author?.isPrivate;
  if (!userId) return;

  if (isOwnPost) return;
  if (alreadyFollowedOrRequested) return;

  try {
    await followUser({
      variables: { userId },
      optimisticResponse: { follow: true },
      update(cache) {
        const userEntityId = cache.identify({ __typename: "User", id: userId });
        if (!userEntityId) return;

        cache.modify({
          id: userEntityId,
          fields: {
            isFollowing() {
              return !isPrivate; // public => true
            },
            followRequested() {
              return isPrivate; // private => request
            },
          },
        });
      },
    });

    // ✅ WICHTIG für MIX (ALL): mixedPosts sind local state -> dort extra updaten
    if (selected.kind === "MIX") {
      setMixedPosts((prev) =>
        prev.map((p) =>
          p.author?.id === userId
            ? {
                ...p,
                author: {
                  ...p.author,
                  isFollowing: !isPrivate,
                  followRequested: isPrivate,
                },
              }
            : p
        )
      );
    }

    // ➡️ danach weiter
    scrollToNext();
  } catch {
    // ignore
  }
}, [activePost, followUser, isOwnPost, alreadyFollowedOrRequested, scrollToNext, selected.kind, setMixedPosts]);





  const openMessage = useCallback(async () => {
    const userId = activePost?.author?.id;
    const username = activePost?.author?.username;
    if (!userId) return;
    try {
      const res = await createThread({ variables: { memberUserIds: [userId], title: null } });
      const threadId = res.data?.createThread?.id;
      if (threadId) {
        nav.navigate("Chat", { threadId, title: username ?? "Chat" });
      }
    } catch {
      // ignore
    }
  }, [activePost?.author?.id, activePost?.author?.username, createThread, nav]);

 

  const doLike = useCallback(() => {
  const p = activePost;
  if (!p) return;
  if (p.isLiked) return;

  // ✅ 1) Erst springen wie X
  scrollToNext();

  // ✅ 2) Like im Hintergrund auf dem vorherigen Post ausführen (ohne await)
  // Dadurch kann Header/Snap während der Scroll-Animation nicht mehr “reinfunken”.
  onToggleLike(p).catch(() => {});
}, [activePost, onToggleLike, scrollToNext]);



const refreshing =
  mixLoading ||
  (selected.kind === "CONTEXT" && (ctxLoading || ctxNS === NetworkStatus.refetch)) ||
  (selected.kind === "MIX" && (
    cbLoading ||
    cbNS === NetworkStatus.refetch ||
    rfLoading ||
    rfNS === NetworkStatus.refetch ||
    communityFeedNS === NetworkStatus.refetch
  ));


const onRefresh = useCallback(async () => {
  try {
    if (selected.kind === "MIX") {
      const [bRes, rRes, cRes] = await Promise.all([
        refetchBubbles?.({ limit: 12, windowHours: CONTEXT_BUBBLE_WINDOW_HOURS }),
        refetchReels?.({ offset: 0, limit: 40 }),
        refetchCommunityMoments?.({ offset: 0, limit: 40 }),
      ]);

      const freshContexts = bRes?.data?.contextBubbles ?? [];
      const freshBase = rRes?.data?.reelsFeed ?? [];
      const freshCommunity = cRes?.data?.communityMomentsFeed ?? [];
      baseDoneRef.current = false;
      communityDoneRef.current = false;
      setMixDone(false)

      await loadMixedInitial((freshContexts ?? []).slice(0, 10), freshBase, freshCommunity);
    } else if (selected.kind === "CONTEXT") {
      await refetchCtx?.();
    }
  } catch {}
}, [selected.kind, refetchBubbles, refetchReels, refetchCommunityMoments, refetchCtx, loadMixedInitial]);

  const headerLockedRef = useRef(false);

const listHeaderHRef = useRef(0);

const onHeaderLayout = useCallback((e: any) => {
  const h = Math.round(e.nativeEvent.layout.height || 0);
  if (!h) return;

  // ✅ WICHTIG: Während man im Feed ist, KEIN neues header-measurement erlauben
  if (!inHeaderRef2.current) return;

  // ✅ Nur updaten, wenn es wirklich anders ist
  if (listHeaderHRef.current === h) return;

  listHeaderHRef.current = h;
  setListHeaderH(h);
}, []);

  const [inHeader, setInHeader] = useState(true);
  const inHeaderRef = useRef(true);
  useEffect(() => { inHeaderRef.current = inHeader; }, [inHeader]);
  const miniContextAnim = useRef(new Animated.Value(0)).current;



  const ListHeader = useMemo(() => {
    return (
      <View
       onLayout={onHeaderLayout}
        style={{ paddingTop: headerPadTop }}
      >
        <Animated.View
          pointerEvents={inHeader ? "auto" : "none"}
          style={{
            opacity: miniContextAnim.interpolate({
              inputRange: [0, 0.08, 1],
              outputRange: [1, 0, 0],
              extrapolate: "clamp",
            }),
          }}
        >
        <View style={s.headerRow}>
          <Text style={s.brand}>{t("reels.title")}</Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <TouchableOpacity onPress={() => nav.navigate("Groups")} hitSlop={10} style={s.iconBtn}>
              <Ionicons name="people-circle-outline" size={24} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => nav.navigate("CommunityInfluence")} hitSlop={10} style={s.iconBtn}
              accessibilityRole="button" accessibilityLabel={t("influence.title")}>
              <Ionicons name="flash-outline" size={23} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        <CommunityLiveStrip
          groups={liveCommunities}
          onManage={() => nav.navigate("Groups")}
          onOpen={(group) =>
            nav.navigate("CommunitySpace", {
              id: group.id,
              title: group.title,
              slug: group.slug,
              type: group.type,
            })
          }
          C={C}
        />

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={C.subtext} style={{ marginRight: 8 }} />
          <TextInput
            placeholder={t("reels.searchContext")}
            placeholderTextColor={C.subtext}
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() =>
              query.trim() && runSearchCtx({ variables: { q: query.trim(), limit: 24, windowHours: 168 } })
            }

            clearButtonMode="while-editing"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close" size={18} color={C.subtext} />
            </TouchableOpacity>
          )}
        </View>

          <CommunitySearchResults query={query} />

          {/* Popular Bar */}
          {cbLoading && !(contextBubbles?.length ?? 0) ? (
            <View style={{ padding: 12 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <PopularVlogsBar
              items={barItems}
              selected={selected}
              onSelect={setSelected}
              title={momentsBarTitle}
              gapBelow={popularGap}
              C={C}
            />
          )}

          {hasPosts && (
            <View style={s.scrollHintWrap} pointerEvents="box-none">
              

              <TouchableOpacity
                onPress={scrollToFirstPost}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={!hasPosts}
                style={{ marginTop: 6 }}
              >
                <Animated.View
                  style={{
                    transform: [
                      {
                        translateY: arrowAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 10],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="chevron-down" size={30} color={C.subtext} />
                </Animated.View>
              </TouchableOpacity>

            </View>
          )}
        </Animated.View>

        <View style={{ height: 6 }} />
      </View>
    );
  }, [
    s, C, query, runSearchCtx,
    nav,
    headerPadTop,
    cbLoading,
     contextBubbles,
      barItems,          // ✅ WICHTIG
      liveCommunities,
      selected,          // ✅ WICHTIG
      popularGap,
      hasPosts,
      arrowAnim,
      scrollToFirstPost,
      inHeader,
      miniContextAnim,
  ]);

  const onLikeChangedFromCard = useCallback(
  (postId: string, nextLiked: boolean, nextLikeCount: number) => {
    if (selected.kind === "MIX") {
      // MIX: local state ist Quelle → hier updaten
      setMixedPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLiked: nextLiked, likeCount: nextLikeCount } : p
        )
      );
    } else {
      // Single: Apollo cache oder lokale mirror (je nachdem was du nutzt)
      // Wenn du KEIN mirror nutzt, ist das hier trotzdem sinnvoll:
      const cacheId = client.cache.identify({ __typename: "Post", id: postId });
      if (cacheId) {
        client.cache.modify({
          id: cacheId,
          fields: {
            isLiked() {
              return nextLiked;
            },
            likeCount() {
              return nextLikeCount;
            },
          },
        });
      }
    }
  },
  [selected.kind, client]
);

  const renderItem = useCallback(
    ({ item }: any) => {
      const isFocusedItem = item.id === activeId;

      return (
        <View style={{ height: CARD_H, }}>
          <VlogPostCard
            post={item}
            isActive={isFocusedItem}
            screenFocused={isFocused}
            myId={null}
            onLikeChanged={onLikeChangedFromCard}
            C={C}
          />
        </View>
      );
    },
    [CARD_H, activeId, isFocused, C, onLikeChangedFromCard]
  );

  const ListEmpty = useMemo(() => {
    if (refreshing) return null;

    const text =
      selected.kind === "MIX"
        ? (isSearching ? t("reels.empty.noResults") : t("reels.empty.noPosts"))
        : t("reels.empty.noPostsInVlog");


    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: C.subtext }}>{text}</Text>
      </View>
    );
  }, [refreshing, selected.kind, isSearching, C.subtext]);
  const STEP = CARD_H + CARD_GAP;

// ✅ KEIN HEADER_H hier, weil paddingTop das schon abdeckt
const BASE_OFFSET = feedStartOffset;

const snapOffsets = useMemo(() => {
  return (listData ?? []).map((_:any, i:any) => BASE_OFFSET + i * STEP);
}, [listData, BASE_OFFSET, STEP]);



  // Variante A: nur wenn irgendein Post fokussiert ist


  const lastActivePostRef = useRef<any>(null);

  useEffect(() => {
    if (activePost) lastActivePostRef.current = activePost;
  }, [activePost]);

  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);




  const TOP_EPS = 8;
  const scrollYRef = useRef(0);


const inHeaderRef2 = useRef(true); // getrennt von inHeaderRef, damit klar ist was wir tracken

useEffect(() => {
  const offset = inHeaderRef2.current ? 0 : Math.max(0, listHeaderHRef.current - STICKY_HEADER_H);
  feedListRef.current?.scrollToOffset({ offset, animated: false });

  if (!inHeaderRef2.current) {
    activeIndexRef.current = 0;
    setActiveId(null);
  }
}, [selected.kind, vlogId, STICKY_HEADER_H]);

useEffect(() => {
  if (inHeaderRef2.current) return;

  const firstPostId = listData?.[0]?.id ?? null;
  if (!firstPostId) {
    setActiveId(null);
    lastActivePostRef.current = null;
    return;
  }

  const currentActiveId = activeIdRef.current;
  const currentStillVisible = !!currentActiveId && listData.some((p: any) => p?.id === currentActiveId);
  if (currentStillVisible) return;

  activeIndexRef.current = 0;
  setActiveId(firstPostId);
  lastActivePostRef.current = listData[0];
}, [listData, selected.kind, selected.key]);

useEffect(() => {
  if (inHeaderRef2.current) return;
  if (!listData?.length) return;

  const idx = Math.max(0, Math.min(listData.length - 1, activeIndexRef.current ?? 0));
  const offset = feedStartOffset + idx * (CARD_H + CARD_GAP);

  requestAnimationFrame(() => {
    feedListRef.current?.scrollToOffset({ offset, animated: false });
  });
}, [listData, feedStartOffset, CARD_H, CARD_GAP]);

const onScroll = useCallback(
  (e: any) => {
    if (!listHeaderH) return;
    const y = e.nativeEvent.contentOffset.y;
    scrollYRef.current = y;

    const transitionDistance = Math.max(1, feedStartOffset);
    const stickyProgress = Math.max(0, Math.min(1, y / transitionDistance));
    miniContextAnim.setValue(stickyProgress);

    const nextInHeader = y < (feedStartOffset - TOP_EPS);

    // ✅ nur bei tatsächlichem Wechsel updaten
    if (inHeaderRef2.current === nextInHeader) return;

    inHeaderRef2.current = nextInHeader;
    setInHeader(nextInHeader);
    hapticImpact();

    // ✅ Side-Effects hier, NICHT im setState-Updater
    if (nextInHeader) {
      setActiveId(null);
      activeIndexRef.current = 0;
    } else {
      const firstId = listData?.[0]?.id ?? null;
      if (firstId) {
        activeIndexRef.current = 0;
        setActiveId(firstId);
      }
    }
  },
  [feedStartOffset, listData, listHeaderH, miniContextAnim]
);




  const showActions =
  !inHeader && (!!activeId || (activeIndexRef.current ?? 0) > 0);

  const previousShowActionsRef = useRef(false);
  useEffect(() => {
    if (showActions && !previousShowActionsRef.current) {
      setActionFloatRunKey((x) => x + 1);
    }
    previousShowActionsRef.current = showActions;
  }, [showActions]);

  const snapEnabled = listHeaderH > 0;

  const ensureTopFocus = useCallback(() => {
  if (!listData?.length) return;

  // “ganz oben”: Header + bisschen Toleranz
  const TOP_EPS = 8;
  const isAtTop = scrollYRef.current <= (feedStartOffset + TOP_EPS);

  if (isAtTop) {
    // erster Post gilt als fokussiert
    activeIndexRef.current = 0;
    setActiveId(listData[0]?.id ?? null);
  }
}, [listData, feedStartOffset]);

const prefetchedRef = useRef(new Set<string>());

useEffect(() => {
  const first = (listData ?? []).slice(0, 10);
  const urls = first
    .map((p:any) => p.thumbUrl ?? p.imageUrl ?? p.videoUrl)
    .filter(Boolean);

  const todo = urls.filter((u:string) => !prefetchedRef.current.has(u));
  todo.forEach((u:string) => prefetchedRef.current.add(u));

  if (todo.length) ExpoImage.prefetch(todo).catch(()=>{});
}, [listData]);



const syncActiveFromOffset = useCallback((y: number) => {
  if (!listData?.length) return;

  const step = CARD_H + CARD_GAP;

  // y enthält header + listheader schon drin
  const raw = (y - feedStartOffset) / step;
  const idx = Math.max(0, Math.min(listData.length - 1, Math.round(raw)));

  activeIndexRef.current = idx;
  setActiveId(listData[idx]?.id ?? null);
}, [listData, CARD_H, CARD_GAP, feedStartOffset]);

const EndFooter = useMemo(() => {
  // MIX: Ende anzeigen wenn done + nicht loading + es gibt posts
  const showEnd =
    selected.kind === "MIX" &&
    mixDone &&
    !mixLoading &&
    (listData?.length ?? 0) > 0;

  if (selected.kind === "MIX" && mixLoading) {
    return (
      <View style={{ padding: 14 }}>
        <ActivityIndicator />
        <Text style={[s.sub, { textAlign: "center", marginTop: 6 }]}>{t("reels.loadingMore")}</Text>
      </View>
    );
  }

  if (showEnd) {
    return (
      <View style={{ paddingVertical: 22, alignItems: "center" }}>
        <Text style={[s.sub, { fontWeight: "800" }]}>{t("reels.end")}</Text>
        <View style={{ height: TABBAR_H + 90 }} />
      </View>
    );
  }

  // Default spacer (damit Tabbar nichts überdeckt)
  return <View style={{ height: TABBAR_H + 120 }} />;
}, [selected.kind, mixDone,  mixLoading, listData?.length, TABBAR_H, s.sub]);

  const hasSnap = snapOffsets.length > 0;
  return (
    <SafeAreaView style={s.screen} edges={["left", "right"]}>
      <StatusBar
        barStyle={theme.statusBar}
        translucent={false}
        backgroundColor={C.bg}
      />
      <FlashList
        ref={feedListRef}
        data={listData}
        keyExtractor={(p:any) => p.id}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSep}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        estimatedItemSize={CARD_H + CARD_GAP}
        estimatedListSize={{ width: W, height: H }}
        drawDistance={CARD_H * 2}
        onScroll={onScroll}
        scrollEventThrottle={16}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        snapToOffsets={hasSnap ? snapOffsets : undefined}
        disableIntervalMomentum={hasSnap}
        decelerationRate="fast"
        snapToAlignment="start"
        onEndReachedThreshold={0.35}
        onEndReached={selected.kind === "MIX" && !mixDone ? loadMoreMixed : onEndReachedSingle}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            tintColor={C.text}
            progressViewOffset={headerPadTop + 56}
            refreshing={!!refreshing}
            onRefresh={onRefresh}
          />
        }
        ListFooterComponent={EndFooter}
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 16 }}
      />

      <Animated.View
        pointerEvents={inHeader ? "none" : "auto"}
        style={[
          s.miniContextOverlay,
          {
            top: 0,
            height: headerPadTop + 56,
            paddingTop: headerPadTop + 9,
            opacity: miniContextAnim,
            transform: [
              {
                translateY: miniContextAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-10, 0],
                }),
              },
            ],
          },
        ]}
      >
        <ExpoImage
          pointerEvents="none"
          source={require("../../assets/sticky-header-bg-bw.png")}
          style={s.miniContextBgImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0.18)", "rgba(0,0,0,0.06)", "rgba(0,0,0,0.22)"]}
          locations={[0, 0.52, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={s.miniContextBgVeil}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            theme.mode === "dark" ? "rgba(11,15,26,0.24)" : "rgba(255,255,255,0.28)",
            theme.mode === "dark" ? "rgba(11,15,26,0.10)" : "rgba(255,255,255,0.12)",
            theme.mode === "dark" ? "rgba(11,15,26,0.88)" : "rgba(255,255,255,0.90)",
            theme.mode === "dark" ? "rgba(11,15,26,0.98)" : "rgba(255,255,255,0.98)",
          ]}
          locations={[0, 0.34, 0.64, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={s.miniContextBgEdgeFade}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.055)", "rgba(255,255,255,0.00)"]}
          locations={[0, 0.34, 1]}
          start={{ x: 0.04, y: 0 }}
          end={{ x: 0.96, y: 1 }}
          style={s.miniContextBgShine}
        />
        <MiniContextBar
          items={barItems}
          selected={selected}
          onSelect={setSelected}
          C={C}
        />
      </Animated.View>

      {/* Tinder-like Actions (wirkt auf aktuell fokussierten Post) */}
      {showActions && (
        <>
          <View pointerEvents="box-none" style={s.actionBackdropWrap}>
            <LinearGradient
              pointerEvents="none"
              colors={[
                "rgba(0,0,0,0.42)",
                "rgba(0,0,0,0.20)",
                "rgba(0,0,0,0.00)",
              ]}
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0 }}
              style={s.actionBackdrop}
            />
          </View>

          <View pointerEvents="box-none" style={[s.actionOverlay, { bottom: tabBarH + y - 30 }]}>
            <View style={s.actionRowWrap} pointerEvents="box-none">
              <View style={s.actionRow} pointerEvents="box-none">
              <Animated.View style={actionFloatStyle(0)}>
              <TouchableOpacity
                onPress={openMessage}
                activeOpacity={0.85}
                style={[s.actionPill, s.actionPillSmall, !activePost && { opacity: 0.5 }]}
                disabled={!activePost}
              >
                <LinearGradient
                  pointerEvents="none"
                  colors={["rgba(255,255,255,0.36)", "rgba(255,255,255,0.08)", "rgba(255,255,255,0.00)"]}
                  locations={[0, 0.42, 1]}
                  style={s.actionPillGloss}
                />
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#F5F7FB" />
              </TouchableOpacity>
              </Animated.View>

         <Animated.View style={actionFloatStyle(1)}>
         <TouchableOpacity
            onPress={doFollow}
            activeOpacity={0.85}
            disabled={!activePost || followActionDone}
            style={[
              s.actionPill,
              s.actionPillSmall,
              (!activePost || followActionDone) && s.actionPillDisabled,
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.36)", "rgba(255,255,255,0.08)", "rgba(255,255,255,0.00)"]}
              locations={[0, 0.42, 1]}
              style={s.actionPillGloss}
            />
            <Ionicons
              name={followActionDone ? "person" : "person-add-outline"}
              size={22}
              color={followActionDone ? "rgba(245,247,251,0.44)" : "#2F80FF"}
            />
          </TouchableOpacity>
          </Animated.View>



         <Animated.View style={actionFloatStyle(2)}>
         <TouchableOpacity
            onPress={doLike}
            activeOpacity={0.85}
            disabled={!activePost || likeActionDone}
            style={[s.actionPill, s.actionPillLarge, (!activePost || likeActionDone) && s.actionPillDisabled]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.40)", "rgba(255,255,255,0.09)", "rgba(255,255,255,0.00)"]}
              locations={[0, 0.42, 1]}
              style={s.actionPillGloss}
            />
            <Ionicons
              name={likeActionDone ? "heart" : "heart-outline"}
              size={26}
              color={likeActionDone ? "rgba(245,247,251,0.44)" : "#9AD95B"}
            />
          </TouchableOpacity>
          </Animated.View>



          <Animated.View style={actionFloatStyle(3)}>
          <TouchableOpacity
            onPress={scrollToNext}
            activeOpacity={0.85}
            style={[s.actionPill, s.actionPillSmall, !activePost && { opacity: 0.5 }]}
            disabled={!activePost}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.36)", "rgba(255,255,255,0.08)", "rgba(255,255,255,0.00)"]}
              locations={[0, 0.42, 1]}
              style={s.actionPillGloss}
            />
            <Ionicons name="chevron-down" size={24} color="#F5F7FB" />
          </TouchableOpacity>
          </Animated.View>
              </View>
            </View>
          </View>
        </>
      )}

      {!!(rfError || cbError || communityFeedError) && (
        <View style={{ padding: 12 }}>
          <Text style={{ color: C.danger ?? "#F87171" }}>
            {t("common.error")}: {(rfError || cbError || communityFeedError)?.message}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

/* -------------------- Styles -------------------- */
const styles = (C: any, isDark = true) => {
  const headerGlass = isDark ? "rgba(11,15,26,0.82)" : "rgba(255,255,255,0.86)";
  const pillGlass = isDark ? "rgba(255,255,255,0.105)" : "rgba(255,255,255,0.28)";

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    fixedHeaderWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      backgroundColor: C.bg,
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRow: {
      height: 52,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brand: { color: C.text, fontWeight: "900", fontSize: 22, letterSpacing: 0.3 },
    iconBtn: { padding: 6, borderRadius: 10 },

    sub: { color: C.subtext },

    miniContextOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 56,
      zIndex: 54,
      justifyContent: "center",
      paddingTop: 9,
      paddingBottom: 3,
      backgroundColor: headerGlass,
      overflow: "hidden",
      borderBottomColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.58)",
      borderBottomWidth: StyleSheet.hairlineWidth,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.18 : 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    miniContextBgImage: {
      ...StyleSheet.absoluteFillObject,
      opacity: isDark ? 0.34 : 0.24,
    },
    miniContextBgVeil: {
      ...StyleSheet.absoluteFillObject,
    },
    miniContextBgEdgeFade: {
      ...StyleSheet.absoluteFillObject,
    },
    miniContextBgShine: {
      ...StyleSheet.absoluteFillObject,
      opacity: isDark ? 0.78 : 0.55,
    },

    searchWrap: {
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: C.bg,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    searchInput: { flex: 1, color: C.text, paddingVertical: 6, fontSize: 16 },

    header: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },

    
    
    scrollHintWrap: {
      marginTop: 5,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    scrollHintText: {
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center",
      opacity: 0.92,
    },
    actionBackdropWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 230,
      zIndex: 55,
    },
    actionBackdrop: {
      flex: 1,
    },
    // Floating Tinder-like action buttons
    actionOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 60,
    },
    actionRowWrap: {
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderRadius: 999,
      overflow: "visible",
      borderWidth: 0,
      backgroundColor: "transparent",
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
    },
    actionPill: {
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: pillGlass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.52)" : "rgba(255,255,255,0.82)",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.28 : 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    actionPillGloss: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 999,
      opacity: 0.92,
    },
    actionPillDisabled: {
      opacity: 0.48,
      backgroundColor: isDark ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.18)",
      borderColor: "rgba(255,255,255,0.24)",
    },
    actionPillSmall: {
      width: 56,
      height: 56,
    },
    actionPillLarge: {
      width: 70,
      height: 70,
    },

  });
};
