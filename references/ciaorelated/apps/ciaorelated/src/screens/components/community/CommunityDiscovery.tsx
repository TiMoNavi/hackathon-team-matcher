import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../theme/ThemeProvider";
import { SEARCH_COMMUNITIES } from "../../../graphql/queries/communities";
import type { CommunitySuggestion, DiscoverableCommunity } from "../../../lib/communityDiscovery";

const PAGE_SIZE = 6;
const CARD_WIDTH = 184;

function CommunityCard({ community, reason, C, onOpen }: {
  community: DiscoverableCommunity;
  reason?: CommunitySuggestion["reason"];
  C: any;
  onOpen: (community: DiscoverableCommunity) => void;
}) {
  const { t } = useTranslation();
  const s = useMemo(() => styles(C), [C]);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [community.imageUrl]);
  const joined = community.viewerIsMember || community.viewerIsOwner;
  const type = t(`grouplinksheet.type.${community.type.toLowerCase()}`, { defaultValue: "Community" });
  return (
    <TouchableOpacity
      style={s.card} activeOpacity={0.85} onPress={() => onOpen(community)}
      accessibilityRole="button" accessibilityLabel={`${community.title}, ${type}, ${t("communitydiscovery.members", { count: community.memberCount })}`}
    >
      <View style={s.cover}>
        {community.imageUrl && !imageFailed ? (
          <Image source={{ uri: community.imageUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <Ionicons name={community.type === "DROP" ? "shirt-outline" : community.type === "EVENT" ? "flash-outline" : "people-outline"} size={32} color={C.subtext} />
        )}
        {joined ? <View style={s.joined}><Ionicons name="checkmark" size={12} color={C.text} /><Text style={s.joinedText}>{t("communitydiscovery.joined")}</Text></View> : null}
      </View>
      <View style={s.cardBody}>
        <Text style={s.type} numberOfLines={1}>{type}</Text>
        <Text style={s.name} numberOfLines={2}>{community.title}</Text>
        <Text style={s.meta} numberOfLines={1}>{t("communitydiscovery.members", { count: community.memberCount })}</Text>
        {reason ? <Text style={s.reason} numberOfLines={2}>{t(`communitydiscovery.reason.${reason.toLowerCase()}`)}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function CommunityRail({ title, items, onMore, loadingMore = false, moreError = false }: {
  title: string;
  items: Array<{ community: DiscoverableCommunity; reason?: CommunitySuggestion["reason"] }>;
  onMore?: () => void;
  loadingMore?: boolean;
  moreError?: boolean;
}) {
  const { theme } = useTheme();
  const C = theme.colors;
  const s = useMemo(() => styles(C), [C]);
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  return (
    <View style={s.section}>
      <Text style={s.heading}>{title}</Text>
      <FlatList
        horizontal data={items} keyExtractor={item => item.community.id}
        showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <CommunityCard {...item} C={C} onOpen={community => nav.navigate("CommunitySpace", {
          id: community.id, title: community.title, slug: community.slug, type: community.type,
        })} />}
        ListFooterComponent={onMore ? (
          <TouchableOpacity style={s.more} onPress={onMore} disabled={loadingMore}
            accessibilityRole="button" accessibilityLabel={t(moreError ? "communitydiscovery.retry" : "communitydiscovery.more")}>
            {loadingMore ? <ActivityIndicator color={C.text} /> : <Ionicons name={moreError ? "refresh-outline" : "arrow-forward"} size={22} color={C.text} />}
          </TouchableOpacity>
        ) : null}
      />
    </View>
  );
}

function CommunitySearchPage({ query }: { query: string }) {
  const { theme } = useTheme();
  const C = theme.colors;
  const s = useMemo(() => styles(C), [C]);
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetching = useRef(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 300); return () => clearTimeout(timer); }, []);
  const { data, loading, error, refetch, fetchMore } = useQuery(SEARCH_COMMUNITIES, {
    variables: { q: query, offset: 0, limit: PAGE_SIZE }, skip: !ready,
    fetchPolicy: "network-only", notifyOnNetworkStatusChange: true,
  });
  const results: DiscoverableCommunity[] = data?.searchCommunities?.items ?? [];
  const loadMore = async () => {
    if (fetching.current || !data?.searchCommunities?.hasMore) return;
    fetching.current = true; setLoadingMore(true); setMoreError(false);
    try {
      await fetchMore({
        variables: { offset: results.length },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult) return prev;
          const next = fetchMoreResult.searchCommunities;
          return { ...prev, searchCommunities: { ...next,
            items: [...new Map([...prev.searchCommunities.items, ...next.items].map((item: DiscoverableCommunity) => [item.id, item])).values()],
          } };
        },
      });
    } catch { setMoreError(true); }
    finally { fetching.current = false; setLoadingMore(false); }
  };
  if (results.length) return <CommunityRail title={t("communitydiscovery.searchTitle")}
    items={results.map(community => ({ community }))} onMore={data?.searchCommunities?.hasMore ? loadMore : undefined}
    loadingMore={loadingMore} moreError={moreError} />;
  return (
    <View style={s.section}>
      <Text style={s.heading}>{t("communitydiscovery.searchTitle")}</Text>
      <View style={s.status}>
        {!ready || loading ? <ActivityIndicator color={C.subtext} accessibilityLabel={t("communitydiscovery.loading")} /> : (
          <>
            <Text style={s.statusText}>{t(error ? "communitydiscovery.failed" : "communitydiscovery.empty")}</Text>
            {error ? <TouchableOpacity onPress={() => void refetch().catch(() => {})} style={s.retry}
              accessibilityRole="button" accessibilityLabel={t("communitydiscovery.retry")}>
              <Ionicons name="refresh-outline" size={20} color={C.text} />
            </TouchableOpacity> : null}
          </>
        )}
      </View>
    </View>
  );
}

export function CommunitySearchResults({ query }: { query: string }) {
  const normalized = query.trim().slice(0, 80);
  // Remount per search term so a late response cannot replace a newer search.
  return normalized ? <CommunitySearchPage key={normalized} query={normalized} /> : null;
}

const styles = (C: any) => StyleSheet.create({
  section: { paddingVertical: 14, backgroundColor: C.bg },
  heading: { color: C.text, fontSize: 16, fontWeight: "700", paddingHorizontal: 16, marginBottom: 10 },
  rail: { paddingHorizontal: 16, gap: 10, alignItems: "stretch" },
  card: { width: CARD_WIDTH, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, overflow: "hidden", backgroundColor: C.card },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: C.border, justifyContent: "center", alignItems: "center" },
  joined: { position: "absolute", top: 8, right: 8, flexDirection: "row", gap: 3, alignItems: "center", paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, backgroundColor: C.card },
  joinedText: { color: C.text, fontSize: 11, fontWeight: "600" },
  cardBody: { padding: 10 },
  type: { color: C.subtext, fontSize: 11, lineHeight: 16, marginBottom: 3 },
  name: { color: C.text, fontSize: 14, lineHeight: 19, fontWeight: "700", height: 38 },
  meta: { color: C.subtext, fontSize: 12, lineHeight: 18, marginTop: 4 },
  reason: { color: C.subtext, fontSize: 12, lineHeight: 17, height: 34, marginTop: 6 },
  more: { width: 52, height: "100%", minHeight: 48, alignItems: "center", justifyContent: "center" },
  status: { minHeight: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  statusText: { flex: 1, color: C.subtext, fontSize: 13, lineHeight: 19 },
  retry: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
