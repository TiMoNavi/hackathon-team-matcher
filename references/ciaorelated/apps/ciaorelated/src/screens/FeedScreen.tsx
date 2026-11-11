// apps/ciaorelated/src/screens/FeedScreen.tsx
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, NetworkStatus } from "@apollo/client";
import { useIsFocused, useNavigation } from "@react-navigation/native";

//import { FEED_QUERY } from "../graphql/queries/social";
import { HOME_FEED_QUERY } from "../graphql/queries/social";
import { SUGGESTED_COMMUNITIES } from "../graphql/queries/communities";
import { CommunityRail } from "./components/community/CommunityDiscovery";
import { feedPostId, withCommunitySuggestions, type CommunitySuggestion } from "../lib/communityDiscovery";
import { useTheme } from "../theme/ThemeProvider";

import { FeedHeader } from "./components/feed/FeedHeader";
import { StoriesBar } from "./components/feed/StoriesBar";
import { PostCard } from "./components/feed/PostCard";
import { UploadOverlay } from "./components/feed/UploadOverlay";
import { SuggestedProfilesCarousel } from "./components/feed/SuggestedProfilesCarousel";
import type { HomeFeedMode } from "./components/feed/FeedHeader";
import { useMarkPostViewed } from "../hooks/useMarkPostViewed";


import { useTranslation } from "react-i18next";

export default function FeedScreen() {
  const { t } = useTranslation();
  const PAGE_LIMIT = 20;

  const { theme } = useTheme();
  const s = React.useMemo(() => styles(theme.colors), [theme.colors]);

  const listRef = useRef<FlatList<any>>(null);
  const navigation = useNavigation<any>();
  const fetchingMoreRef = useRef(false);
  const isScreenFocused = useIsFocused();
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedMode, setFeedMode] = useState<HomeFeedMode>("SONGVERWANDT");
  const isDetailMode = feedMode !== "SONGVERWANDT";
  const [activeId, setActiveId] = useState<string | null>(null);
  const markPostViewed = useMarkPostViewed();

  const { data, loading, fetchMore, refetch, networkStatus } = useQuery(HOME_FEED_QUERY, {
    variables: { offset: 0, limit: PAGE_LIMIT, mode: feedMode },
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const { data: communityData, error: communityError, refetch: refetchCommunities } = useQuery(SUGGESTED_COMMUNITIES, {
    variables: { limit: 6 }, skip: isDetailMode, fetchPolicy: "cache-and-network",
  });
  const communities: CommunitySuggestion[] = communityError ? [] : (communityData?.suggestedCommunities ?? [])
    .filter((item: CommunitySuggestion) => !item.community.viewerIsMember && !item.community.viewerIsOwner);
  const posts = data?.homeFeed ?? [];
  const isInitialLoading = loading && networkStatus === NetworkStatus.loading;
  const visiblePosts = withCommunitySuggestions(posts, !isDetailMode && !isInitialLoading && communities.length > 0);

  useLayoutEffect(() => {
    const tabNav = navigation.getParent?.();
    if (!tabNav) return;

    if (isDetailMode) {
      tabNav.setOptions({ tabBarStyle: { display: "none" } });
      return () => tabNav.setOptions({ tabBarStyle: undefined });
    }

    tabNav.setOptions({ tabBarStyle: undefined });
    return undefined;
  }, [isDetailMode, navigation]);

  React.useEffect(() => {
    setActiveId(null);
    setHasMore(true);
    fetchingMoreRef.current = false;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [feedMode]);

  const onChangeFeedMode = useCallback((mode: HomeFeedMode) => {
    setFeedMode(mode);
  }, []);


  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setHasMore(true);
      fetchingMoreRef.current = false;
      await Promise.all([
        refetch({ offset: 0, limit: PAGE_LIMIT, mode: feedMode }),
        isDetailMode ? Promise.resolve() : refetchCommunities().catch(() => {}),
      ]);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchCommunities, feedMode, isDetailMode]);

  const loadMore = useCallback(async () => {
    if (fetchingMoreRef.current || loading || !hasMore) return;
    fetchingMoreRef.current = true;
    setLoadingMore(true);

    const beforeLen = posts.length;

    try {
      const res = await fetchMore({
        variables: { offset: beforeLen, limit: PAGE_LIMIT, mode: feedMode },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult) return prev;
          const next = fetchMoreResult.homeFeed ?? [];
          const merged = [...(prev.homeFeed ?? []), ...next];
          const unique = Array.from(new Map(merged.map((p: any) => [p.id, p])).values());

          if (next.length < PAGE_LIMIT || unique.length <= (prev.homeFeed ?? []).length) {
            setHasMore(false);
          }

          return { ...prev, homeFeed: unique };
        },
      });

      const fetched = res.data?.homeFeed ?? [];
      if (fetched.length < PAGE_LIMIT) setHasMore(false);
    } catch {
      // keep hasMore=true so a transient network hiccup can be retried by scrolling again
    } finally {
      fetchingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedMode, fetchMore, hasMore, loading, posts.length]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: any; isViewable: boolean }> }) => {
      const top = viewableItems.find((v) => v.isViewable && feedPostId(v.item));
      const postId = feedPostId(top?.item);
      setActiveId(postId);
      if (!postId) return;
      markPostViewed(postId);
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  return (
    <SafeAreaView style={s.container} edges={["top", "right", "left"]}>
      <StatusBar
        barStyle={theme.statusBar}
        translucent={false}
        backgroundColor={theme.colors.bg}
      />

      <FeedHeader mode={feedMode} onModeChange={onChangeFeedMode} detailMode={isDetailMode} />
      <FlatList
        ref={listRef}
        data={visiblePosts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const source = item?.source ?? null;

          if (item?.kind === "COMMUNITY_SUGGESTIONS") {
            return <CommunityRail title={t("communitydiscovery.suggestedTitle")} items={communities} />;
          }

          if (item?.kind === "SUGGESTED_PROFILES") {
            return (
              <SuggestedProfilesCarousel
                title={item.title ?? t("feed.suggestedForYou")}
                users={item.users ?? []}
                C={theme.colors}
              />
            );
          }

          // kind=POST | SUGGESTED_POST
          const post = item.post ?? item;
          const isSuggested = item?.kind === "SUGGESTED_POST";
          const cardId = post?.id ?? item.id;



           return (
          <PostCard
            post={post}
            isSuggested={isSuggested}
            isActive={cardId === activeId}
            screenFocused={!!isScreenFocused}
            onAfterModeration={() => refetch()}
            C={theme.colors} // ✅ Theme direkt weitergeben
            source={source}
          />
        )}}
        ListHeaderComponent={
          isDetailMode ? null : (
            <View>
              <StoriesBar />
              <UploadOverlay C={theme.colors} />
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.2}
        onEndReached={loadMore}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ height: 24 }} />
          )
        }
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={{ padding: 24 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ padding: 24 }}>
              <Text style={{ color: theme.colors.subtext }}>
                {feedMode === "FOLLOWING"
                  ? t("feed.empty.following")
                  : t("feed.followUsersToSeePostsInYourFeed")}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  });
