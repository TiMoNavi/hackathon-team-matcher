import React, { useMemo, useCallback, useEffect, useState, useRef } from "react";
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useRoute, useNavigation, useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";

import TaggedUsersSheet, { TaggedUser } from "./components/TaggedUsersSheet"; // (bleibt, falls du oben später brauchst)
import { useTheme } from "../theme/ThemeProvider";

import {
  avatarPlaceholder,
  gridPlaceholderDark,
  gridPlaceholderLight,
} from "../../assets/placeholders";


// ✅ Reusable Card:
import { VlogPostCard } from "./components/post/VlogPostCard";
import { useMarkPostViewed } from "../hooks/useMarkPostViewed";

import { useTranslation } from "react-i18next";

const ME_QUERY = gql`query { me { id username } }`;

const DELETE_VLOG = gql`
  mutation DeleteVlog($id: ID!) {
    deleteVlog(id: $id)
  }
`;

const { width } = Dimensions.get("window");

/* ---------- GraphQL ---------- */
export const VLOG_DETAIL = gql`
  query VlogDetail($slug: String!) {
    vlogBySlug(slug: $slug) {
      id
      title
      slug
      coverUrl
      coverThumbUrl
      description
      privacy
      postCount
      memberCount
      isAdmin
      isMember
      owner {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
      __typename
    }
  }
`;

export const VLOG_POSTS = gql`
  query VlogPosts($vlogId: ID!, $offset: Int, $limit: Int) {
    vlogPosts(vlogId: $vlogId, offset: $offset, limit: $limit) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      caption
      location
      likeCount
      commentCount
      createdAt
      isLiked
      isCarousel
      media { id kind imageUrl videoUrl thumbUrl order __typename }
      author { id username avatarThumbUrl avatarUrl __typename }
      taggedUsers {
        status
        user { id username avatarThumbUrl avatarUrl __typename }
        __typename
      }
      __typename
    }
  }
`;


// 1) Mitglieder eines Vlogs (nur Admin/Owner)
const VLOG_MEMBERS = gql`
  query VlogMembers($vlogId: ID!) {
    vlogMembers(vlogId: $vlogId) {
      user {
        id
        username
        avatarUrl
      }
      role
      status
    }
  }
`;

// 2) Mitgliederliste setzen
const SET_VLOG_MEMBERS = gql`
  mutation SetVlogMembers($vlogId: ID!, $userIds: [ID!]!) {
    setVlogMembers(vlogId: $vlogId, userIds: $userIds)
  }
`;

// 3) Profile suchen
const SEARCH_USERS = gql`
  query SearchUsers($q: String!, $limit: Int!) {
    searchUsers(q: $q, limit: $limit) {
      id
      username
      avatarUrl
    }
  }
`;

const LEAVE_VLOG = gql`
  mutation LeaveVlog($vlogId: ID!) {
    leaveVlog(vlogId: $vlogId)
  }
`;



/* ---------- Kleine UI-Bausteine ---------- */
function Chip({
  icon,
  text,
  C,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string | number;
  C: any;
}) {
  const { t } = useTranslation();

  const s = useMemo(() => styles(C), [C]);
  return (
    <View style={s.chip}>
      <Ionicons name={icon} size={12} color={C.subtext} />
      <Text style={s.chipText}>{String(text)}</Text>
    </View>
  );
}

function EmptyPosts({ onCreate, C }: { onCreate?: () => void; C: any }) {
  const s = useMemo(() => styles(C), [C]);
  const { t } = useTranslation();
  return (
    <View style={s.emptyPosts}>
      <View style={s.emptyIcon}>
        <Ionicons name="document-text-outline" size={24} color={C.text} />
      </View>
      <Text style={s.emptyTitle}>{t("vlogdetail.noPostsYet")}</Text>
      <Text style={s.emptySub}>{t("vlogdetail.shareYourFirstPostInThisVlog")}</Text>
      {!!onCreate && (
        <TouchableOpacity style={s.cta} onPress={onCreate} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color={C.text} />
          <Text style={s.ctaText}>{t("vlogdetail.createPost")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ---------- Screen ---------- */
export default function VlogDetailScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const slug = route.params?.slug as string;

  const { theme } = useTheme();
  const { t } = useTranslation();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C), [C]);
  const gridPlaceholder =
  theme.mode === "dark" ? gridPlaceholderDark : gridPlaceholderLight;
  const id = route?.params?.id as string | undefined;
  const {
    data: detail,
    loading: loadingVlog,
    error: errVlog,
    refetch: refetchVlog,
  } = useQuery(VLOG_DETAIL, { variables: { slug: slug as string },skip: !slug, fetchPolicy: "cache-and-network" });
  

  const vlog = detail?.vlogBySlug;
  const vlogId = vlog?.id as string | undefined;

  const { data: meQ } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });
  const myId = meQ?.me?.id ?? null;

  const isFocused = useIsFocused();

  const [activePostId, setActivePostId] = useState<string | null>(null);
  const markPostViewed = useMarkPostViewed();
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const top = viewableItems?.find((v: any) => v.isViewable && v.item?.id);
    const id = top?.item?.id ?? null;
    setActivePostId(id);
    markPostViewed(id);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 90 }).current;

  const [deleteVlog] = useMutation(DELETE_VLOG, { refetchQueries: ["VlogsFeed", "MyVlogs"] });
    const [leaveVlog, { loading: leaving }] = useMutation(LEAVE_VLOG, {
    refetchQueries: ["VlogsFeed", "MyVlogs"],
  });

  const {
    data: postsData,
    loading: loadingPosts,
    error: errPosts,
    fetchMore,
    refetch: refetchPosts,
    networkStatus,
  } = useQuery(VLOG_POSTS, {
    skip: !vlogId,
    variables: { vlogId: vlogId!, offset: 0, limit: 20 },
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const [membersOpen, setMembersOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [membersTab, setMembersTab] = useState<"MEMBERS" | "INVITE">("MEMBERS");


  // Mitglieder laden (nur wenn Modal offen)
  const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useQuery(VLOG_MEMBERS, {
    variables: { vlogId: vlog?.id ?? "" },
    skip: !membersOpen || !vlog?.id || !vlog?.isAdmin,
    fetchPolicy: "network-only",
  });

  const [runUserSearch, { data: userSearchData, loading: userSearchLoading }] = useLazyQuery(SEARCH_USERS, {
    fetchPolicy: "network-only",
  });

  const [setVlogMembers, { loading: savingMembers }] = useMutation(SET_VLOG_MEMBERS);

  // Wenn members geladen → selectedIds initialisieren
  useEffect(() => {
    if (!membersOpen) return;
    const rows = membersData?.vlogMembers ?? [];
    const ids = rows
      .filter((m: any) => m?.status === "ACCEPTED")
      .map((m: any) => m?.user?.id)
      .filter(Boolean) as string[];
    setSelectedIds(new Set(ids));
  }, [membersOpen, membersData]);

  // Suche "debounce light"
  useEffect(() => {
    if (!membersOpen) return;
    const q = (searchQ ?? "").trim();
    const t = setTimeout(() => {
      if (q.length >= 1) runUserSearch({ variables: { q, limit: 30 } });
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ, membersOpen, runUserSearch]);

  const toggleUser = useCallback((userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const saveMembers = useCallback(async () => {
  if (!vlog?.id) return;

  const rows = membersData?.vlogMembers ?? [];
  const ownerId =
    rows.find((m: any) => m?.role === "OWNER")?.user?.id ?? vlog?.owner?.id ?? null;

  const ids = Array.from(selectedIds);

  const safeIds = ownerId ? Array.from(new Set([ownerId, ...ids])) : ids;

  try {
    await setVlogMembers({ variables: { vlogId: vlog.id, userIds: safeIds } });
    await refetchMembers?.();
    setMembersOpen(false);
  } catch (e) {
    console.warn("setVlogMembers failed", e);
  }
}, [selectedIds, setVlogMembers, vlog?.id, refetchMembers, membersData, vlog?.owner?.id]);



  const posts = useMemo(() => postsData?.vlogPosts ?? [], [postsData]);
  const LIMIT = 20;
  const [fetchingMore, setFetchingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(true);

  // Prefetch
  useEffect(() => {
    const urls: string[] = [];
    if (vlog?.coverUrl) urls.push(vlog.coverUrl);
    if (vlog?.coverThumbUrl) urls.push(vlog.coverThumbUrl);
    const first = (postsData?.vlogPosts ?? []).slice(0, 4);
    for (const p of first) {
      if (p.thumbUrl) urls.push(p.thumbUrl);
      if (p.imageUrl) urls.push(p.imageUrl);

      if (Array.isArray(p.media)) {
        for (const m of p.media) {
          if (m?.thumbUrl) urls.push(m.thumbUrl);
          if (m?.imageUrl) urls.push(m.imageUrl);
        }
      }
    }
    urls.forEach((u) => {
      try { (ExpoImage as any).prefetch?.(u); } catch {}
    });
  }, [vlog?.coverUrl, postsData?.vlogPosts, postsData?.vlogPosts]);

  useEffect(() => {
    if (postsData?.vlogPosts) {
      const got = postsData.vlogPosts.length;
      setCanLoadMore(got % LIMIT === 0 && got !== 0);
    }
  }, [postsData?.vlogPosts]);

  const loadMore = () => {
    if (!vlogId || fetchingMore || !canLoadMore) return;
    setFetchingMore(true);
    fetchMore?.({
      variables: { vlogId, offset: posts.length, limit: LIMIT },
      updateQuery: (prev, { fetchMoreResult }) => {
        setFetchingMore(false);
        if (!fetchMoreResult) return prev;
        const next = fetchMoreResult.vlogPosts ?? [];
        if (next.length < LIMIT) setCanLoadMore(false);
        const merged = [
          ...(prev.vlogPosts ?? []),
          ...next.filter((n: any) => !(prev.vlogPosts ?? []).some((p: any) => p.id === n.id)),
        ];
        return { ...prev, vlogPosts: merged };
      },
    }).catch(() => setFetchingMore(false));
  };

  const refreshing = networkStatus === 4;
  const onRefresh = useCallback(() => {
    refetchVlog?.();
    refetchPosts?.();
  }, [refetchVlog, refetchPosts]);


  /* ---------- Header (wie vorher, nur Theme-Farben) ---------- */
  const Header = () => (
    <View style={s.header}>
      <TouchableOpacity onPress={() => nav.goBack()} style={s.iconBtn}>
        <Ionicons name="chevron-back" size={22} color={C.text} />
      </TouchableOpacity>

      <Text style={s.headerTitle} numberOfLines={1}>
        {vlog?.title ?? t("vlogdetail.vlog")}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {vlog?.isAdmin && (
          <TouchableOpacity
            onPress={() => nav.navigate("VlogMembers", { vlogId: vlog.id, isAdmin: vlog.isAdmin, ownerId: vlog.owner?.id })}
            style={s.iconBtn}
          >
            <Ionicons name="people-outline" size={20} color={C.text} />
          </TouchableOpacity>
        )}


        {vlog?.isMember && vlog?.owner?.id !== myId && (
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                t("vlogdetail.leave.title"),
                t("vlogdetail.leave.body"),
                [
                  { text: t("common.cancel"), style: "cancel" },
                  {
                    text: leaving ? t("common.ellipsis") : t("vlogdetail.leave.confirm"),
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await leaveVlog({ variables: { vlogId: vlog.id } });
                        nav.goBack();
                      } catch (e: any) {
                        Alert.alert(t("common.error"), e?.message ?? t("vlogdetail.leave.failed"));
                      }
                    },
                  },
                ]
              );

            }}
            style={s.iconBtn}
            disabled={leaving}
          >
            <Ionicons name="exit-outline" size={20} color={C.danger ?? "#ef4444"} />
          </TouchableOpacity>
        )}



        {vlog?.owner?.id && myId && vlog.owner.id === myId && (
          <>
            <TouchableOpacity onPress={() => nav.navigate("EditVlog", { slug: vlog.slug })} style={s.iconBtn}>
              <Ionicons name="create-outline" size={20} color={C.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  t("vlogdetail.delete.title"),
                  t("vlogdetail.delete.body"),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("common.delete"),
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await deleteVlog({ variables: { id: vlog.id } });
                          nav.goBack();
                        } catch (e: any) {
                          Alert.alert(t("common.error"), e?.message ?? t("vlogdetail.delete.failed"));
                        }
                      },
                    },
                  ]
                );

              }}
              style={s.iconBtn}
            >
              <Ionicons name="trash-outline" size={20} color={C.danger ?? "#ef4444"} />
            </TouchableOpacity>
          </>
        )}
      </View>

    </View>
  );

  /* ---------- Loading / Error States ---------- */
  if (loadingVlog && !vlog) {
    return (
      <SafeAreaView style={s.screen}>
        <Header />
        <View style={s.centerPad}>
          <ActivityIndicator />
          <Text style={s.sub}>{t("vlogdetail.loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errVlog) {
    return (
      <SafeAreaView style={s.screen}>
        <Header />
        <View style={s.centerPad}>
          <Text style={s.err}>{t("common.error")}: {errVlog.message}</Text>
          <TouchableOpacity onPress={() => refetchVlog?.()} style={s.retryBtn} activeOpacity={0.85}>
            <Text style={s.retryText}>{t("vlogdetail.reload")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!vlog) {
    return (
      <SafeAreaView style={s.screen}>
        <Header />
        <View style={s.centerPad}>
          <Text style={s.sub}>{t("vlogdetail.vlogNotFound")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ownerAvatar =
    (vlog?.owner?.avatarThumbUrl ?? "").trim() ||
    (vlog?.owner?.avatarUrl ?? "").trim() ||
    "";


  const coverUri = (vlog?.coverUrl ?? "").trim();
  const coverThumbUri = (vlog?.coverThumbUrl ?? "").trim();

  /* ---------- ListHeaderComponent: EXACT wie dein Original Hero+Meta ---------- */
  const listHeader = (
    <>
      <View style={s.heroWrap}>
        {coverUri ? (
        <ExpoImage
          source={{ uri: coverUri }}
          placeholder={coverThumbUri ? { uri: coverThumbUri } : gridPlaceholder}
          style={s.hero}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={120}
          allowDownscaling
        />
      ) : (
        <ExpoImage
          source={gridPlaceholder}
          style={s.hero}
          contentFit="cover"
        />
      )}

        <View style={[s.heroOverlay, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
        <View style={[s.heroOverlayBottom, { backgroundColor: "rgba(0,0,0,0.55)" }]} />

        {/* Titel + Owner */}
        <View style={s.heroTitleBlock}>
          <Text style={s.title} numberOfLines={2}>
            {vlog.title}
          </Text>

          <View style={s.ownerRow}>
            <ExpoImage
              source={ownerAvatar ? { uri: ownerAvatar } : avatarPlaceholder}
              placeholder={avatarPlaceholder}
              style={s.avatar}
              contentFit="cover"
              cachePolicy="disk"
              transition={120}
            />
            <Text style={s.ownerName} numberOfLines={1}>
              {vlog.owner?.username ?? t("common.dash")}
            </Text>
          </View>
        </View>

        {/* Count-Pill */}
        <View style={s.countPill}>
          <Ionicons name="document-text-outline" size={14} color="#fff" />
          <Text style={s.countText}>{vlog.postCount ?? 0}</Text>
        </View>
      </View>

      {/* Chips + Beschreibung */}
      <View style={s.metaWrap}>
        <View style={s.chipsRow}>
          <Chip
            C={C}
            icon="lock-closed-outline"
            text={
              String(vlog.privacy).toUpperCase() === "PRIVATE"
                ? t("vlogdetail.privacy.private")
                : t("vlogdetail.privacy.public")
            }
          />
          <Chip C={C} icon="people-outline" text={vlog.memberCount ?? 0} />
          <Chip C={C} icon="document-text-outline" text={vlog.postCount ?? 0} />
        </View>

        {!!vlog.description && <Text style={s.desc}>{vlog.description}</Text>}
      </View>
    </>
  );

 


  return (
    <SafeAreaView style={s.screen}>
      <Header />
      <FlatList
        data={posts}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        keyExtractor={(p: any) => p.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <VlogPostCard
            post={item}
            isActive={item.id === activePostId}
            screenFocused={isFocused}
            myId={myId}
            onAfterModeration={() => refetchPosts?.()}
            C={C}
          />
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            tintColor={C.text}
            refreshing={!!refreshing || (loadingPosts && !postsData)}
            onRefresh={onRefresh}
          />
        }
        onEndReachedThreshold={0.35}
        onEndReached={loadMore}
        ListFooterComponent={
          fetchingMore ? (
            <View style={{ padding: 14 }}>
              <ActivityIndicator />
              <Text style={[s.sub, { textAlign: "center", marginTop: 6 }]}>{t("vlogdetail.loadingMore")}</Text>
            </View>
          ) : posts.length === 0 ? (
            <EmptyPosts C={C} onCreate={() => nav.navigate("CreateMedia", { initialMode: "POST", vlogId })} />
          ) : (
            <View style={{ height: 24 }} />
          )
        }
        contentContainerStyle={{ paddingBottom: 16 }}
      />

      {!!errPosts && (
        <View style={{ padding: 12 }}>
          <Text style={s.err}>
            {t("vlogdetail.postsError")}: {errPosts.message}
          </Text>

        </View>
      )}

    </SafeAreaView>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
      backgroundColor: "rgba(255,255,255,0.04)",
    },

    searchInput: {
      flex: 1,
      fontSize: 16,
      color: C.text,
    },

    tabsPill: {
      flexDirection: "row",
      padding: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.04)",
      marginBottom: 12,
    },

    tabPillBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
      borderRadius: 999,
    },

    tabPillBtnActive: {
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.28)",
    },

    tabPillText: {
      color: C.subtext,
      fontWeight: "900",
      fontSize: 13,
    },

    tabPillTextActive: {
      color: C.text,
    },

    modalTopBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },

    modalIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.06)",
    },

    modalTitle: {
      flex: 1,
      textAlign: "center",
      color: C.text,
      fontSize: 18,
      fontWeight: "900",
      marginHorizontal: 10,
    },

    modalSaveBtn: {
      paddingHorizontal: 14,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
      backgroundColor: "rgba(255,255,255,0.12)",
    },

    modalSaveBtnText: {
      color: C.text,
      fontWeight: "900",
      fontSize: 13,
    },

    modalWrap: {
      flex: 1,
      paddingTop: 56,
      paddingHorizontal: 14,
      backgroundColor: C.bg,
    },

  

    modalTopBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.06)",
    },

    modalTopBtnText: {
      color: C.text,
      fontWeight: "700",
      fontSize: 13,
    },

    modalTopBtnPrimary: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
      backgroundColor: "rgba(255,255,255,0.12)",
    },

    modalTopBtnPrimaryText: {
      color: C.text,
      fontWeight: "800",
      fontSize: 13,
    },

    sectionTitle: {
      fontSize: 12,
      fontWeight: "800",
      color: C.subtext,
      marginTop: 10,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },

    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.04)",
      marginBottom: 10,
    },

    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.08)",
      marginRight: 10,
    },

    username: {
      fontSize: 16,
      color: C.text,
      fontWeight: "800",
      maxWidth: "70%",
    },

    emptyHint: {
      paddingVertical: 14,
      color: C.subtext,
    },

    tabsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },

    tabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.04)",
    },

    tabBtnActive: {
      backgroundColor: "rgba(255,255,255,0.10)",
      borderColor: "rgba(255,255,255,0.22)",
    },

    tabText: {
      fontSize: 14,
      fontWeight: "700",
      color: C.subtext,
    },

    tabTextActive: {
      color: C.text,
    },

   
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
   
    headerBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: C.border,
    },
    headerBtnText: {
      color: C.text,
      fontWeight: "600",
    },

    
    screen: { flex: 1, backgroundColor: C.bg },
    centerPad: { padding: 16, alignItems: "center" },
    sub: { color: C.subtext, marginTop: 6 },
    err: { color: "#ff6b6b" },

    retryBtn: {
      borderColor: C.border,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.06)",
      marginTop: 10,
    },
    retryText: { color: C.text, fontWeight: "600" },

    /* Header */
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomColor: "rgba(255,255,255,0.08)",
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    iconBtn: { padding: 8, marginHorizontal: 2 },
    headerTitle: { flex: 1, color: C.text, fontSize: 18, fontWeight: "800", paddingLeft: 4 },

    /* Hero */
    heroWrap: { position: "relative" },
    hero: { width, height: (width * 9) / 16, backgroundColor: "#111" },
    heroPlaceholder: { alignItems: "center", justifyContent: "center" },

    heroOverlay: { position: "absolute", inset: 0 as any },
    heroOverlayBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 100 },

    heroTitleBlock: { position: "absolute", left: 12, right: 12, bottom: 12 },
    title: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "900",
      textShadowColor: "rgba(0,0,0,0.65)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 6,
    },


    ownerRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },

    avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
    ownerName: {
      color: "rgba(255,255,255,0.92)",
      fontSize: 13,
      fontWeight: "800",
      marginTop: 1,
      textShadowColor: "rgba(0,0,0,0.55)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },

    countPill: {
      position: "absolute",
      right: 10,
      top: 10,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: "rgba(0,0,0,0.6)",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
    },
    countText: { color: "#fff", marginLeft: 6, fontWeight: "700", fontSize: 12 },

    /* Meta */
    metaWrap: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
    chipsRow: { flexDirection: "row", gap: 8 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
    },
    chipText: { color: C.subtext, fontSize: 12, fontWeight: "600", marginLeft: 2 },

    desc: { color: C.subtext, fontSize: 13, marginTop: 10 },

    /* Empty */
    emptyPosts: { alignItems: "center", marginTop: 16, paddingHorizontal: 24 },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "rgba(255,255,255,0.06)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    emptyTitle: { color: C.text, fontSize: 18, fontWeight: "800", marginBottom: 6, textAlign: "center" },
    emptySub: { color: C.subtext, textAlign: "center", marginBottom: 16 },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(255,255,255,0.06)",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      borderColor: C.border,
      borderWidth: 1,
    },
    ctaText: { color: C.text, fontWeight: "800" },
  });
