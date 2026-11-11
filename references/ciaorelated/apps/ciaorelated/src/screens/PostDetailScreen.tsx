// apps/ciaorelated/src/screens/PostDetailScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions } from "react-native";
import { gql, useApolloClient, useMutation, useQuery } from "@apollo/client";
import { useNavigation, useRoute, type RouteProp, useIsFocused } from "@react-navigation/native";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import Screen from "./components/Screen";
import TaggedUsersSheet, { type TaggedUser } from "./components/TaggedUsersSheet";

// ✅ shared reusable components (same as PostCard)
import { PostHeaderRow } from "./components/post/PostHeaderRow";
import { PostActionsRow } from "./components/post/PostActionsRow";
import { PostActionsMenu } from "./components/post/menu/PostActionsMenu";
import { PostMediaCarousel } from "./components/post/media/PostMediaCarousel";
import type { PostMediaItem } from "./components/post/helpers/buildPostMediaList";
import { PostCommentSheet } from "./components/post/comments/PostCommentSheet";
import { PostLikesSheet } from "./components/post/likes/PostLikesSheet";

import { ME_QUERY } from "../graphql/queries/profile";
import { BLOCK_USER } from "../graphql/mutations/moderation";
import {
  APPROVE_SHARED_POST,
  REJECT_SHARED_POST,
  SET_SHARED_POST_ON_PROFILE,
  SET_POST_GRID_VISIBILITY,
} from "../graphql/mutations/shares";
import { TAGGED_FOR_ME } from "../graphql/queries/profile";

// ✅ THEME
import { useTheme } from "../theme/ThemeProvider";
import { PostPagerDots } from "./components/post/PostPagerDots";
import { avatarPlaceholder } from "../../assets/placeholders";

import { useTranslation } from "react-i18next";
import { useMarkPostViewed } from "../hooks/useMarkPostViewed";

type PostDetailParams = {
  id: string;
  postIds?: string[];
  startIndex?: number;

  fromExplore?: boolean;
  fromProfile?: boolean;
};
type RouteParams = { PostDetail: PostDetailParams };

const PROFILE_GRID = gql`
  query ProfileGrid($userId: ID!, $tab: String!, $offset: Int, $limit: Int) {
    profileGrid(userId: $userId, tab: $tab, offset: $offset, limit: $limit) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      caption
      location
      likeCount
      createdAt
      isCarousel
      author {
        id
        username
        avatarUrl
      }
    }
  }
`;

const REPORT_CONTENT = gql`
  mutation ReportContent($input: ReportInput!) {
    reportContent(input: $input)
  }
`;

const DELETE_POST = gql`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`;

const LIKE_POST = gql`
  mutation LikePost($postId: ID!) {
    likePost(postId: $postId) {
      id
      likeCount
      isLiked
      __typename
    }
  }
`;
const UNLIKE_POST = gql`
  mutation UnlikePost($postId: ID!) {
    unlikePost(postId: $postId) {
      id
      likeCount
      isLiked
      __typename
    }
  }
`;

const POST_DETAIL = gql`
  query PostDetail($id: ID!) {
    post(id: $id) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      caption
      location
      createdAt
      likeCount
      isLiked
      isCarousel
      media {
        id
        idx
        kind
        imageUrl
        videoUrl
        thumbUrl
        width
        height
        durationS
      }
      author {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
      commentCount

      taggedUsers {
        user {
          id
          username
          avatarUrl
        }
        status
        showOnProfile
      }

      isMine
      iAmTagged
      iShowOnProfile
      hideFromGrid

      acceptedVlogs {
        id
        slug
        title
        owner {
          id
          username
          avatarUrl
        }
      }
      
      hasAcceptedVlog
    }
  }
`;

const SET_TAG_SHOW_ON_PROFILE = gql`
  mutation SetPostTagShowOnProfile($postId: ID!, $show: Boolean!) {
    setPostTagShowOnProfile(postId: $postId, show: $show)
  }
`;

function normalizeMedia(p: any): PostMediaItem[] {
  const serverThumb = p?.thumbUrl ?? null;

  // carousel
  if (p?.isCarousel && Array.isArray(p?.media) && p.media.length > 0) {
    return [...p.media]
      .slice(0, 10)
      .sort((a: any, b: any) => (a.idx ?? 0) - (b.idx ?? 0))
      .map((m: any) => {
        const isVideo = (m.kind ?? "").toUpperCase() === "VIDEO" || !!m.videoUrl;
        return {
          id: String(m.id),
          kind: (isVideo ? "VIDEO" : "IMAGE") as "VIDEO" | "IMAGE",
          imageUrl: m.imageUrl ?? null,
          videoUrl: m.videoUrl ?? null,
          thumbUrl: m.thumbUrl ?? serverThumb ?? null,
        };
      });
  }

  // single
  const isVideo = !!p?.videoUrl;
  return [
    {
      id: String(p?.id ?? "single"),
      kind: (isVideo ? "VIDEO" : "IMAGE") as "VIDEO" | "IMAGE",
      imageUrl: p?.imageUrl ?? null,
      videoUrl: p?.videoUrl ?? null,
      thumbUrl: serverThumb,
    },
  ];
}

// ✅ kann später in eigene Datei: components/post/detail/PostDetailItem.tsx
function PostDetailItem({
  postId,
  isActive,
  fromProfile,
  C,
}: {
  postId: string;
  isActive: boolean;
  fromProfile: boolean;
  C: any;
}) {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const isFocused = useIsFocused();
  const client = useApolloClient();

  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });
  const meId = meData?.me?.id ?? null;

  const { data: q, refetch: refetchDetail } = useQuery(POST_DETAIL, {
    variables: { id: postId },
    skip: !postId,
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-first",
    returnPartialData: true,
  });

  const p = q?.post;
  const hasPost = !!p;

  // ---------- ownership ----------
  const isMine = !!p?.isMine || (!!meId && p?.author?.id === meId);

  // ---------- like ----------
  const [likePost] = useMutation(LIKE_POST);
  const [unlikePost] = useMutation(UNLIKE_POST);

  const [liked, setLiked] = useState<boolean>(!!p?.isLiked);
  const [likes, setLikes] = useState<number>(p?.likeCount ?? 0);
  const [likesOpen, setLikesOpen] = useState(false);

  useEffect(() => {
    setLiked(!!p?.isLiked);
    setLikes(p?.likeCount ?? 0);
  }, [p?.isLiked, p?.likeCount]);

  const toggleLike = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      if (next) await likePost({ variables: { postId: p.id } });
      else await unlikePost({ variables: { postId: p.id } });
    } catch {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : +1)));
    }
  }, [liked, likePost, unlikePost, p?.id]);

  // ---------- tags / “und weitere” ----------
  const acceptedTaggedAll = useMemo(
    () =>
      (p?.taggedUsers ?? []).filter(
        (t: any) => t?.status === "ACCEPTED" || t?.status === "APPROVED"
      ),
    [p?.taggedUsers]
  );
  const taggedCount = acceptedTaggedAll.length;

  const [showTaggedSheet, setShowTaggedSheet] = useState(false);
  const [sheetTags, setSheetTags] = useState<TaggedUser[]>([]);

  // ---------- media ----------
  const media: PostMediaItem[] = useMemo(() => normalizeMedia(p), [p]);
  const shouldPlay = isActive && isFocused;

  // ✅ pager dots index (carousel)
  const [mediaIndex, setMediaIndex] = useState(0);
  useEffect(() => {
    setMediaIndex(0);
  }, [postId, media.length]);

  // ---------- comments ----------
  const [commentsOpen, setCommentsOpen] = useState(false);

  // ---------- menu ----------
  const [menuVisible, setMenuVisible] = useState(false);

  // ---- share/vlog flags like before (minimal) ----
  const isVlogPost =
    p?.kind === "REEL" ||
    p?.hasAcceptedVlog === true ||
    (Array.isArray(p?.acceptedVlogs) && p.acceptedVlogs.length > 0);

  const myTag = useMemo(
    () =>
      (Array.isArray(p?.taggedUsers) ? p.taggedUsers : []).find(
        (t: any) => t?.user?.id === meId
      ) || null,
    [p?.taggedUsers, meId]
  );

  const myTagAccepted = !!myTag && (myTag.status === "ACCEPTED" || myTag.status === "APPROVED");
  const isAcceptedShare = myTagAccepted;

  // ✅ Du willst: egal ob shared oder reel → Toggle im Profil erlauben
  const canToggleGridFromProfile = !!fromProfile && (isMine || isAcceptedShare);

  // ✅ sichtbarkeit bestimmen
  const isVisibleInMyGrid = isMine ? !p?.hideFromGrid : !!p?.iShowOnProfile;

  // ✅ text im menu
  const gridToggleLabel = isVisibleInMyGrid
  ? t("postdetail.grid.removeFromGrid")
  : t("postdetail.grid.addToGrid");

  const canToggleShareOnProfile = !isMine && isAcceptedShare && fromProfile === true && !isVlogPost;
  const canToggleOwnGrid = !!fromProfile && isMine && isVlogPost;
  const canUntagShare = myTagAccepted;

  const canRemoveFromVlog = isMine && (p?.acceptedVlogs?.length ?? 0) > 0;

  const hasMenuActions = [
    isMine,
    canRemoveFromVlog,
    canUntagShare,
    canToggleOwnGrid,
    canToggleShareOnProfile,
    !isMine, // report/block
  ].some(Boolean);

  const [approveShare] = useMutation(APPROVE_SHARED_POST, {
    refetchQueries: [{ query: TAGGED_FOR_ME, variables: { limit: 50 } }],
    awaitRefetchQueries: true,
  });
  const [rejectShare] = useMutation(REJECT_SHARED_POST, {
    refetchQueries: [{ query: TAGGED_FOR_ME, variables: { limit: 50 } }],
    awaitRefetchQueries: true,
  });

  const [setShareOnProfile] = useMutation(SET_SHARED_POST_ON_PROFILE, {
    refetchQueries: () => [
      { query: PROFILE_GRID, variables: { userId: meId, tab: "posts", offset: 0, limit: 24 } },
      { query: PROFILE_GRID, variables: { userId: meId, tab: "tagged", offset: 0, limit: 24 } },
      { query: ME_QUERY },
    ],
    awaitRefetchQueries: true,
  });

  const [setGridVisibility] = useMutation(SET_POST_GRID_VISIBILITY, {
    refetchQueries: () => [
      { query: PROFILE_GRID, variables: { userId: meId, tab: "posts", offset: 0, limit: 24 } },
      { query: PROFILE_GRID, variables: { userId: meId, tab: "vlogs", offset: 0, limit: 24 } },
      { query: PROFILE_GRID, variables: { userId: meId, tab: "tagged", offset: 0, limit: 24 } },
    ],
    awaitRefetchQueries: true,
  });

  const [doBlockUser] = useMutation(BLOCK_USER);

  const [deletePost] = useMutation(DELETE_POST, {
    variables: { id: postId },
    onCompleted: () => {
      setMenuVisible(false);
      nav.goBack();
    },
    onError: (e) => Alert.alert(t("common.error"), e.message),
    update(cache, { data }) {
      if (!data?.deletePost) return;
      cache.evict({ id: cache.identify({ __typename: "Post", id: postId }) });
      cache.gc();
    },
  });


  const reportWithReason = useCallback(
    async (reason: "HATE_SPEECH" | "NUDITY" | "VIOLENCE" | "SPAM" | "COPYRIGHT") => {
      try {
        await client.mutate({
          mutation: REPORT_CONTENT,
          variables: { input: { postId, reason } },
        });
        Alert.alert(t("common.thanks"), t("postdetail.report.sent"));
      } catch (e: any) {
        Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
      }
    },
    [client, postId, t]
  );

  const openReportPicker = useCallback(() => {
    Alert.alert(t("postdetail.report.title"), t("postdetail.report.pickReason"), [
      { text: t("postdetail.report.reason.hateSpeech"), onPress: () => reportWithReason("HATE_SPEECH") },
      { text: t("postdetail.report.reason.nudity"), onPress: () => reportWithReason("NUDITY") },
      { text: t("postdetail.report.reason.violence"), onPress: () => reportWithReason("VIOLENCE") },
      { text: t("postdetail.report.reason.spam"), onPress: () => reportWithReason("SPAM") },
      { text: t("postdetail.report.reason.copyright"), onPress: () => reportWithReason("COPYRIGHT") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [reportWithReason, t]);


  const confirmBlock = useCallback(() => {
    const uname = p?.author?.username ?? t("common.user");
    Alert.alert(
      t("postdetail.block.title"),
      t("postdetail.block.body", { username: uname }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.block"),
          style: "destructive",
          onPress: async () => {
            try {
              await doBlockUser({ variables: { userId: p?.author?.id } });
              Alert.alert(
                t("postdetail.block.doneTitle"),
                t("postdetail.block.doneBody", { username: uname })
              );
              nav.goBack();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
            }
          },
        },
      ]
    );
  }, [doBlockUser, nav, p?.author?.id, p?.author?.username, t]);


  const username = p?.author?.username ?? "user";
  
  const avatarUrl = p?.author?.avatarThumbUrl ?? p?.author?.avatarUrl;

  const [setTagShowOnProfile] = useMutation(SET_TAG_SHOW_ON_PROFILE);

  const onToggleGridVisibility = async () => {
    try {
      if (!p?.id) return;

      if (isMine) {
        // ✅ Eigener Post/Reel: hideFromGrid togglen
        // wenn aktuell hideFromGrid=true => wieder sichtbar (visible=true)
        const nextVisible = !!p.hideFromGrid;
        await setGridVisibility({ variables: { postId: p.id, visible: nextVisible } });
      } else {
        // ✅ Getaggt: showOnProfile togglen
        const nextShow = !p.iShowOnProfile;
        await setTagShowOnProfile({ variables: { postId: p.id, show: nextShow } });
      }

      await refetchDetail();
      await client.refetchQueries({ include: ["ProfileGrid"] });
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
    }
  };

  return (
    <View style={itemStyles(C).card}>
      {!hasPost ? (
        <View style={{ height: Dimensions.get("window").width + 110 }} />
      ) : (
        <>
          <PostHeaderRow
            user={{ username, avatarUrl }}
            location={p?.location ?? null}
            taggedCount={taggedCount}
            onPressUser={() => nav.navigate("UserProfile", { username })}
            onPressTagged={
              taggedCount > 0
                ? () => {
                    setSheetTags(acceptedTaggedAll as any);
                    setShowTaggedSheet(true);
                  }
                : undefined
            }
            onPressMenu={hasMenuActions ? () => setMenuVisible(true) : undefined}
            C={C}
          />

          <PostMediaCarousel 
          postId={String(p.id)}
          isProcessing={!!p.isProcessing}
          media={media} shouldPlay={shouldPlay} onIndexChange={setMediaIndex} />
          <PostPagerDots count={media.length} index={mediaIndex} C={C} />

          <PostActionsRow
            liked={liked}
            likes={likes}
            comments={p?.commentCount ?? 0}
            onToggleLike={toggleLike}
            onPressLikes={() => setLikesOpen(true)}
            onPressComments={() => setCommentsOpen(true)}
            C={C}
          />

          {!!p?.caption && (
            <Text style={itemStyles(C).caption}>
              <Text style={itemStyles(C).username}>{username} </Text>
              {p.caption}
            </Text>
          )}

          <Text style={itemStyles(C).time}>
            {p?.createdAt ? new Date(p.createdAt).toLocaleString() : ""}
          </Text>

          <PostActionsMenu
            visible={menuVisible}
            onClose={() => setMenuVisible(false)}
            C={C}
            showEdit={isMine}
            showDelete={isMine}
            showShareToStory={true}
            showRemoveTag={myTagAccepted}
            showToggleGridVisibility={canToggleGridFromProfile}
            gridToggleLabel={gridToggleLabel}
            showReport={!isMine}
            showBlock={!isMine}
            handlers={{
              onEdit: () => nav.navigate("PostEdit", { id: postId }),
              onDelete: () => deletePost(),
              onRemoveTag: async () => {
                try {
                  await rejectShare({ variables: { postId } });
                  await refetchDetail();
                } catch (e: any) {
                  Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
                }
              },
              onToggleGridVisibility: onToggleGridVisibility,
              onReport: () => openReportPicker(),
              onBlockUser: () => confirmBlock(),
              onShareToStory: () =>
                nav.navigate("CreateMedia", { initialMode: "STORY", sharePostId: postId }),
            }}
          />

          <TaggedUsersSheet
            visible={showTaggedSheet}
            onClose={() => setShowTaggedSheet(false)}
            tags={sheetTags}
            myId={meId}
            onSelectUser={(uname) => {
              setShowTaggedSheet(false);
              nav.navigate("UserProfile", { username: uname });
            }}
          />

          <PostLikesSheet visible={likesOpen} onClose={() => setLikesOpen(false)} postId={postId} />

          <PostCommentSheet
            visible={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            postId={postId}
            postAuthorId={p?.author?.id ?? null}
            meId={meData?.me?.id ?? null}
            meUsername={meData?.me?.username ?? null}
            meAvatarUrl={meData?.me?.avatarUrl ?? null}
            C={C}
          />
        </>
      )}
    </View>
  );
}

export default function PostDetailScreen() {
  const { theme } = useTheme();
  const C = theme.colors;
  const { t } = useTranslation();

  const route = useRoute<RouteProp<RouteParams, "PostDetail">>();
  const nav = useNavigation<any>();
  const HEADER_HEIGHT = 52;

  const params = (route?.params ?? {}) as Partial<PostDetailParams>;

  const postIds = useMemo(
    () =>
      Array.isArray(params.postIds) && params.postIds.length > 0
        ? (params.postIds.filter(Boolean) as string[])
        : [params.id!],
    [params.postIds, params.id]
  );

  const startIndex = Math.min(Math.max(0, params.startIndex ?? 0), postIds.length - 1);

  const listRef = useRef<React.ElementRef<typeof FlashList> | null>(null);

  const [didInitialJump, setDidInitialJump] = useState(false);
  const [viewableId, setViewableId] = useState<string | null>(postIds[startIndex] ?? null);
  const markPostViewed = useMarkPostViewed();

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: string; isViewable: boolean }> }) => {
      const first = viewableItems.find((v) => v.isViewable && typeof v.item === "string");
      if (first?.item) {
        setViewableId(first.item);
        markPostViewed(first.item);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    minimumViewTime: 120,
    viewAreaCoveragePercentThreshold: 85,
    waitForInteraction: true,
  }).current;

  useEffect(() => {
    if (didInitialJump) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex?.({
        index: startIndex,
        animated: false,
        viewPosition: 0,
        viewOffset: HEADER_HEIGHT,
      });
      setDidInitialJump(true);
    });
  }, [didInitialJump, startIndex]);

  return (
    <Screen scroll={false} backgroundColor={C.bg} barStyle="light-content">
      <View style={[styles(C).header, { backgroundColor: C.bg }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={styles(C).headerBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }}>
          <Text style={styles(C).title}>{t("postdetail.posts")}</Text>
        </View>

        <View style={styles(C).headerBtn} />
      </View>

      <FlashList<string>
        ref={listRef as any}
        data={postIds}
        keyExtractor={(id: any, i: any) => `${id}:${i}`}
        renderItem={({ item }: ListRenderItemInfo<string>) => (
          <PostDetailItem
            postId={item}
            isActive={viewableId === item}
            fromProfile={route?.params?.fromProfile === true}
            C={C}
          />
        )}
        estimatedItemSize={Dimensions.get("window").width + 420}
        initialScrollIndex={startIndex}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        initialNumToRender={1}
        numColumns={1}
        onScrollToIndexFailed={(info: any) => {
          const approx = Math.max(0, info.averageItemLength * info.index - HEADER_HEIGHT);
          listRef.current?.scrollToOffset({ offset: approx, animated: false });
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 40);
        }}
      />
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    header: {
      height: 52,
      paddingHorizontal: 12,
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { color: C.text, fontWeight: "700", fontSize: 16 },
    back: { color: C.text, fontSize: 26 },
  });

const itemStyles = (C: any) =>
  StyleSheet.create({
    card: { backgroundColor: C.bg, paddingBottom: 12 },

    caption: { paddingHorizontal: 12, paddingTop: 6, color: C.text },
    username: { fontWeight: "700", color: C.text },
    time: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: C.subtext ?? C.sub ?? "#9CA3AF",
      fontSize: 12,
    },

    // (Banner styles bleiben drin, schaden nicht; kannst du optional löschen)
    shareBanner: {
      marginHorizontal: 12,
      marginBottom: 10,
      padding: 10,
      borderRadius: 12,
      backgroundColor: "#111827",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#374151",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    shareTitle: { color: C.text, fontWeight: "700" },
    shareSub: { color: C.sub, fontSize: 12 },
    shareBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginLeft: 6 },
    shareBtnTxt: { color: "#fff", fontWeight: "800" },
  });
