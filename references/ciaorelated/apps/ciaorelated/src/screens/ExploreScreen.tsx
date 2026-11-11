// apps/ciaorelated/src/screens/ExploreScreen.tsx
import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { gql, useLazyQuery, useQuery } from "@apollo/client";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import FollowButton from "./components/FollowButton";
import { addRecent, getRecent, type SearchEntry } from "../lib/recentSearch";
import GridTile, { type GridTileItem } from "./components/GridTile";
import { Image as ExpoImage } from "expo-image";
import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";
import { avatarPlaceholder } from "../../assets/placeholders";
import { PixelRatio } from "react-native";

import { useTranslation } from "react-i18next";

export const SEARCH_USERS = gql`
  query SearchUsers($q: String!, $offset: Int, $limit: Int) {
    me { id }
    searchUsers(q: $q, offset: $offset, limit: $limit) {
      id
      username
      name
      avatarThumbUrl
      avatarUrl
      followerCount
      followingCount
      isMe
      isPrivate
      isFollowing
      followRequested
      __typename
    }
  }
`;

const EXPLORE_FEED = gql`
  query ExploreFeed($limit: Int!, $cursor: String) {
    exploreFeed(limit: $limit, cursor: $cursor) {
      edges {
        cursor
        node {
          id
          kind
          imageUrl
          videoUrl
          thumbUrl
          caption
          location
          likeCount
          viewCount
          commentCount
          createdAt
          author { id username avatarUrl __typename }
          __typename
        }
      }
      nextCursor
      __typename
    }
  }
`;

const { width } = Dimensions.get("window");
const GAP = 1;
const COLS = 3;


const SIZE = PixelRatio.roundToNearestPixel((width - GAP * (COLS - 1)) / COLS);

const ExploreFooter: React.FC<{
  hasMore: boolean;
  loadingMore: boolean;
  subtext: string;
}> = ({ hasMore, loadingMore, subtext }) => {
  const { t } = useTranslation();
  return(
  <View style={{ height: 96, alignItems: "center", justifyContent: "center" }}>
    {hasMore && loadingMore ? <ActivityIndicator /> : null}
    {!hasMore ? <Text style={{ color: subtext, fontSize: 12 }}>{t("explore.endReached")}</Text> : null}
  </View>)
};
type ExploreNode = {
  __typename?: string;
  id: string;
  kind: "POST" | "REEL";
  imageUrl?: string | null;
  thumbUrl?: string | null;
  videoUrl?: string | null;
  author?: { id: string; username: string; avatarUrl?: string | null } | null;
  createdAt?: string;
  caption?: string | null;
  location?: string | null;
  likeCount?: number | null;
  commentCount?: number | null;
};

type ExploreEdge = { __typename?: string; cursor: string; node: ExploreNode };

type ExploreFeed = {
  __typename?: string;
  edges: ExploreEdge[];
  nextCursor?: string | null;
};

type ExploreData = {
  exploreFeed?: ExploreFeed;
};

export default function ExploreScreen() {
  const { t } = useTranslation();

  const navigation = useNavigation<any>();

  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = useMemo(() => styles(COLORS), [COLORS]);

  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<SearchEntry[]>([]);

  // Suche (Lazy)
  const [runSearch, { data: searchData, loading: searchLoading, error: searchError, fetchMore: fetchMoreSearch }] =
    useLazyQuery(SEARCH_USERS, { fetchPolicy: "cache-and-network", notifyOnNetworkStatusChange: true });

  // Explore Feed (Cursor)
  const { data: feedData, loading: feedLoading, fetchMore: fetchMoreFeed, refetch: refetchFeed } = useQuery<ExploreData>(EXPLORE_FEED, {
    variables: { limit: 30 },
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
  });

  const nodes = useMemo<ExploreNode[]>(() => {
    const edges = feedData?.exploreFeed?.edges ?? [];
    const seen = new Set<string>();
    const out: ExploreNode[] = [];

    for (const e of edges) {
      const id = e?.node?.id;
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(e.node);
    }

    return out;
  }, [feedData?.exploreFeed?.edges]);

  const grid = useMemo(
    () =>
      nodes.map(
        (p: any): GridTileItem => ({
          id: p.id,
          kind: p.kind,
          imageUrl: p.imageUrl ?? null,
          thumbUrl: p.thumbUrl ?? null,
          videoUrl: p.videoUrl ?? null,
          isCarousel: p.isCarousel ?? null,
          viewCount: p.viewCount ?? 0,
        })
      ),
    [nodes]
  );

  const nodeById = useMemo(() => new Map(nodes.map((n:any)=>[n.id, n])), [nodes]);
  const postIds = useMemo(() => nodes.map((n:any)=>n.id), [nodes]);

  const openPost = useCallback(
    (tile: GridTileItem) => {
      const post = nodeById.get(tile.id);
      if (!post) return;

      const poster = post.thumbUrl || post.imageUrl;
      if (poster) ExpoImage.prefetch(poster).catch(() => {});

      const startIndex = Math.max(0, postIds.findIndex((id) => id === tile.id));

      navigation.push("PostDetail" as never, {
        id: post.id,
        imageUrl: post.thumbUrl || post.imageUrl || null,
        videoUrl: post.videoUrl || null,
        username: post.author?.username ?? "Unbekannt",
        avatar: post.author?.avatarUrl ?? avatarPlaceholder,
        dateLabel: post.createdAt,
        caption: post.caption ?? undefined,
        likes: post.likeCount ?? 0,
        location: post.location ?? undefined,
        authorId: post.author?.id,
        postIds,
        startIndex,
        fromProfile: false,
        fromExplore: true,
      } as never);
    },
    [navigation, nodeById, postIds]
  );


  // oben in ExploreScreen
  const prefetchedRef = useRef(new Set<string>()); // urls already prefetched
  const [prefetching, setPrefetching] = useState(false);
  const prefetchingRef = useRef(false);
  const lastPrefetchAtRef = useRef(0);

  const PREFETCH_BATCH = 24; // zB 24 Tiles
  const PREFETCH_COOLDOWN_MS = 1500;

  const onPullPrefetch = useCallback(async () => {
    if (prefetching) return;
    setPrefetching(true);
    try {
      // 👉 hier NUR prefetch (keine query refetch)
      // z.B. die nächsten 12 poster/thumbs:
      const next = nodes.slice(0, 12); // oder deine Logik
      const urls = next
        .map((p: any) => p.thumbUrl || p.imageUrl)
        .filter(Boolean);

      if (urls.length) await ExpoImage.prefetch(urls);
    } finally {
      setPrefetching(false);
    }
  }, [prefetching, nodes]);

  

  


  useEffect(() => {
    getRecent().then(setRecent);
  }, []);

  // Debounce Sucheingabe
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tRef.current) {
      clearTimeout(tRef.current);
      tRef.current = null;
    }
    const term = q.trim();
    if (!term) return;

    tRef.current = setTimeout(() => {
      runSearch({ variables: { q: term, offset: 0, limit: 30 } });
    }, 280);

    return () => {
      if (tRef.current) {
        clearTimeout(tRef.current);
        tRef.current = null;
      }
    };
  }, [q, runSearch]);

  useEffect(() => {
    const urls = nodes
      .slice(0, 30)
      .map((p:any) => p.thumbUrl || p.imageUrl)
      .filter(Boolean);

    if (urls.length) ExpoImage.prefetch(urls).catch(()=>{});
  }, [nodes]);

  // Suche-Ergebnisse
  const myId = searchData?.me?.id;
  const resultsRaw = (searchData?.searchUsers ?? []).filter((u: any) => u.id !== myId);

  const results = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const u of resultsRaw) {
      if (!u?.id) continue;
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      out.push(u);
    }
    return out;
  }, [resultsRaw]);

  const showResults = q.trim().length >= 1;

  const goToUser = useCallback(
    async (u: any) => {
      Keyboard.dismiss();
      await addRecent({ id: u.id, username: u.username, name: u.name, avatarUrl: u.avatarUrl });
      setRecent(await getRecent());
      navigation.navigate("UserProfile", { username: u.username });
    },
    [navigation]
  );

  const loadMoreSearch = useCallback(() => {
    const term = q.trim();
    if (!showResults || !results?.length) return;

    fetchMoreSearch?.({
      variables: { q: term, offset: results.length, limit: 30 },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;

        const merged = [...(prev.searchUsers ?? []), ...(fetchMoreResult.searchUsers ?? [])];
        const seen = new Set<string>();
        const uniq = merged.filter((u: any) => {
          if (!u?.id) return false;
          if (seen.has(u.id)) return false;
          seen.add(u.id);
          return true;
        });

        return { ...prev, searchUsers: uniq };
      },
    });
  }, [fetchMoreSearch, q, results, showResults]);

  // Explore Pagination
  const hasMore = !!feedData?.exploreFeed?.nextCursor;
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const onEndDuringMomentum = useRef(false);

  const lastScrollYRef = useRef(0);

  const lastRefetchAt = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (q.trim()) return;
      if (lastScrollYRef.current >= 100) return;

      const now = Date.now();
      if (now - lastRefetchAt.current < 60_000) return;

      lastRefetchAt.current = now;
      refetchFeed().catch(()=>{});
    }, [q, refetchFeed])
  );

  const getGridItemLayout = useCallback((_: any, index: number) => {
    const row = Math.floor(index / COLS);
    const rowHeight = SIZE + GAP;
    return { length: rowHeight, offset: row * rowHeight, index };
  }, []);

  useEffect(() => {
    if (!hasMore) onEndDuringMomentum.current = true;
  }, [hasMore]);

  const onEndReached = useCallback(async () => {
    const cursor = feedData?.exploreFeed?.nextCursor;
    if (!cursor) return;
    if (loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      await new Promise((r) => setTimeout(r, 16));

      await fetchMoreFeed({
        variables: { limit: 30, cursor },

        updateQuery: (prev, { fetchMoreResult }) => {
          const prevFeed = prev?.exploreFeed;
          const nextFeed = fetchMoreResult?.exploreFeed;

          if (!nextFeed) return prev;

          const prevEdges = prevFeed?.edges ?? [];
          const nextEdges = nextFeed.edges ?? [];

          const seen = new Set<string>();
          const mergedEdges: any[] = [];

          // prev zuerst (und seen füllen)
          for (const e of prevEdges) {
            const id = e?.node?.id;
            if (!id) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            mergedEdges.push(e);
          }

          // dann next (seen wird live erweitert => keine Duplikate)
          for (const e of nextEdges) {
            const id = e?.node?.id;
            if (!id) continue;
            if (seen.has(id)) continue;
            seen.add(id);
            mergedEdges.push(e);
          }

          const nextCursor =
            nextFeed.nextCursor ?? prevFeed?.nextCursor ?? null;

          return {
            ...prev,
            exploreFeed: {
              __typename: prevFeed?.__typename ?? nextFeed.__typename ?? "ExploreFeedConnection",
              nextCursor,
              edges: mergedEdges.map((e) => ({
                __typename: e.__typename ?? "ExploreFeedEdge",
                cursor: e.cursor,
                node: {
                  __typename: e.node?.__typename ?? "Post", // oder "Media" – egal, Hauptsache vorhanden
                  ...e.node,
                },
              })),
            },
          };
        },

      });
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }

  }, [feedData?.exploreFeed?.nextCursor, fetchMoreFeed]);

  const renderGridItem = useCallback(
    ({ item, index }: { item: GridTileItem; index: number }) => (
      <GridTile item={item} index={index} size={SIZE} cols={COLS} gap={GAP} onPress={openPost} />
    ),
    [openPost]
  );

  // ✅ small UX: clear button
  const clearSearch = useCallback(() => setQ(""), []);

  return (
    <Screen scroll={false}>
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          {/* Search bar (theme) */}
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={COLORS.subtext} style={{ marginRight: 8 }} />
            <TextInput
              placeholder={t("explore.seek")}
              placeholderTextColor={COLORS.subtext}
              style={s.search}
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => q.trim() && runSearch({ variables: { q: q.trim(), offset: 0, limit: 30 } })}
              keyboardAppearance={"dark" }
            />
            {!!q && (
              <TouchableOpacity onPress={clearSearch} hitSlop={10}>
                <Ionicons name="close-circle" size={18} style={{marginLeft:8}} color={COLORS.subtext} />
              </TouchableOpacity>
            )}
          </View>

          {/* Trefferliste oder Explore-Grid */}
          {showResults ? (
            <FlatList
              key="users"
              data={results}
              keyExtractor={(u) => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.userRow} activeOpacity={0.9} onPress={() => goToUser(item)}>
                  <ExpoImage
                    source={(item.avatarThumbUrl || item.avatarUrl)
                      ? { uri: item.avatarThumbUrl || item.avatarUrl }
                      :  avatarPlaceholder 
                    }
                    placeholder={avatarPlaceholder}
                    style={s.avatar}
                    contentFit="cover"
                    cachePolicy="disk"
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.username} numberOfLines={1}>
                      {item.username}
                    </Text>
                    {!!item.name && (
                      <Text style={s.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                    )}
                    <Text style={s.metaText}>
                      {item.followerCount} {t("explore.followers")}{item.followingCount} {t("explore.subscribed")}</Text>
                  </View>

                  <FollowButton
                    userId={item.id}
                    isFollowing={item.isFollowing}
                    followRequested={!!item.followRequested}
                    isPrivate={!!item.isPrivate}
                    me={item.isMe}
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={s.center}>
                  {searchLoading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ color: COLORS.subtext }}>{t("explore.noResultsFound")}</Text>
                  )}
                </View>
              }
              onEndReachedThreshold={0.6}
              onEndReached={loadMoreSearch}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 16 }}
              initialNumToRender={12}
              windowSize={7}
              removeClippedSubviews
            />
          ) : (
            <FlatList
              data={grid}
              keyExtractor={(p) => String(p.id)}
              numColumns={COLS}
              renderItem={renderGridItem}
              scrollEventThrottle={16}
              ListEmptyComponent={
                <View style={s.center}>
                  {feedLoading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ color: COLORS.subtext }}>{t("explore.nothingToDiscoverYet")}</Text>
                  )}
                </View>
              }
              ListFooterComponent={<ExploreFooter hasMore={hasMore} loadingMore={loadingMore} subtext={COLORS.subtext} />}
              
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              updateCellsBatchingPeriod={50}
              windowSize={5}
              removeClippedSubviews={Platform.OS === "ios"} // iOS ok, android oft glitchy
              // ✅ only load more if there is more
              onEndReached={
                hasMore
                  ? () => {
                      if (onEndDuringMomentum.current) return;
                      onEndDuringMomentum.current = true;
                      onEndReached();
                    }
                  : undefined
              }
              onEndReachedThreshold={hasMore ? 0.12 : 0.01}
              showsVerticalScrollIndicator={false}
              onMomentumScrollBegin={() => {
                onEndDuringMomentum.current = false;
              }}
              getItemLayout={getGridItemLayout}
              refreshControl={
                <RefreshControl
                  refreshing={prefetching}
                  onRefresh={onPullPrefetch}
                  tintColor={COLORS.text}
                />
              }
            />
          )}

          {!!searchError && (
            <View style={{ padding: 12 }}>
              <Text style={{ color: "tomato" }}>{t("explore.errorPrefix", { message: searchError.message })}</Text>
            </View>
          )}
          

        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = (COLORS: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },

    searchWrap: {
      paddingHorizontal: 12,
      paddingBottom: 10,
      paddingTop: 6,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.bg,
    },
    search: {
      flex: 1,
      backgroundColor: COLORS.card,
      borderRadius: 12,
      color: COLORS.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    userRow: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.bg,
    },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.card },
    username: { color: COLORS.text, fontWeight: "800" },
    name: { color: COLORS.text, opacity: 0.9, marginTop: 2 },
    metaText: { color: COLORS.subtext, marginTop: 2, fontSize: 12 },

    // kept for compatibility (not used directly here, GridTile handles visuals)
    tile: { width: "100%", height: "100%", backgroundColor: COLORS.card },
  });
