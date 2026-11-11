// apps/ciaorelated/src/screens/components/feed/PostCard.tsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { gql, Reference, useMutation, useQuery } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";

import { ADD_COMMENT, DELETE_COMMENT } from "../../../graphql/mutations/comments";
import { RotatingSuggestionLabel } from "./RotatingSuggestionLabel";
import { avatarPlaceholder } from "../../../../assets/placeholders";
import { useTranslation } from "react-i18next";


// ✅ shared UI pieces
import FollowButton from "../FollowButton";
import { PostHeaderRow } from "../post/PostHeaderRow";
import { PostActionsRow } from "../post/PostActionsRow";
import { PostActionsMenu } from "../post/menu/PostActionsMenu";
import { PostMediaCarousel } from "../post/media/PostMediaCarousel";
import type { PostMediaItem } from "../post/helpers/buildPostMediaList";
import { PostCommentSheet } from "../post/comments/PostCommentSheet";
import { PostLikesSheet } from "../post/likes/PostLikesSheet";

// tags
import TaggedUsersSheet, { type TaggedUser } from "../TaggedUsersSheet";
import { PostPagerDots } from "../post/PostPagerDots";

const REPORT_CONTENT = gql`
  mutation ReportContent($input: ReportInput!) {
    reportContent(input: $input)
  }
`;

const BLOCK_USER = gql`
  mutation BlockUser($userId: ID!) {
    blockUser(userId: $userId)
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

const ME_QUERY = gql`
  query {
    me {
      id
      username
      avatarUrl
      __typename
    }
  }
`;

const DELETE_POST = gql`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`;

function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder; // local require()
}

const HASHTAG_RE = /(#[\p{L}\p{N}_]+)/gu;

export type PostSource =
  | { kind: "FEED" }
  | { kind: "GROUP"; groupId: string; title: string; groupType?: "FAMILY" | "UNI" | "BUSINESS" | "COMMUNITY" | "EVENT" | "OTHER" }
  | { kind: "SUGGESTED" }
  | { kind: "PROFILE" };


export function PostCard({
  post,
  isActive,
  screenFocused,
  isSuggested,
  onAfterModeration,
  C,
  source,
}: {
  post: any;
  isActive: boolean;
  screenFocused: boolean;
  isSuggested?: boolean;
  onAfterModeration?: () => void;
  C: any; // theme.colors
  source?: PostSource;
}) {
  const navigation = useNavigation<any>();

  // ✅ compute styles once
  const S = useMemo(() => s(C), [C]);
  const { t, i18n } = useTranslation();


  const author = post?.author ?? null;
   // ---------- me / ownership ----------
  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });
  const myId = meData?.me?.id ?? null;
  const isMine = !!myId && post?.author?.id === myId;

  const shouldShowFollow =
    !!author?.id &&
    !isMine &&
    !author?.isFollowing &&
    (
      isSuggested ||
      source?.kind === "GROUP"
    );


  const suggestedFollow =
    isSuggested && author?.id ? (
      <View style={{ minWidth: 96 }}>
        <FollowButton
          userId={author.id}
          isPrivate={!!author.isPrivate}
          isFollowing={!!author.isFollowing}
          followRequested={!!author.followRequested}
        />
      </View>
    ) : null;

  const followAccessory = shouldShowFollow ? (
    <View style={{ minWidth: 96 }}>
      <FollowButton
        userId={author.id}
        isPrivate={!!author.isPrivate}
        isFollowing={!!author.isFollowing}
        followRequested={!!author.followRequested}
      />
    </View>
  ) : null;

 

  // ---------- like state ----------
  const [likePost] = useMutation(LIKE_POST);
  const [unlikePost] = useMutation(UNLIKE_POST);

  const [liked, setLiked] = useState<boolean>(!!post?.isLiked);
  const [likes, setLikes] = useState<number>(post?.likeCount ?? 0);
  const [likesOpen, setLikesOpen] = useState(false);

  const [deletePostMut] = useMutation(DELETE_POST);

  // ---------- moderation menu ----------
  const [reportContent] = useMutation(REPORT_CONTENT);
  const [doBlockUser] = useMutation(BLOCK_USER);
  const [menuVisible, setMenuVisible] = useState(false);

  // ---------- tags / "und weitere" ----------
  const acceptedTaggedAll = useMemo(
    () =>
      (post?.taggedUsers ?? []).filter(
        (t: any) => t?.status === "ACCEPTED" || t?.status === "APPROVED"
      ),
    [post?.taggedUsers]
  );
  const taggedCount = acceptedTaggedAll.length;

  const [showTaggedSheet, setShowTaggedSheet] = useState(false);
  const [sheetTags, setSheetTags] = useState<TaggedUser[]>([]);

  // ---------- media mapping ----------
  const media: PostMediaItem[] = useMemo(() => {
    const serverThumb = post?.thumbUrl ?? null;

    if (post?.isCarousel && Array.isArray(post?.media) && post.media.length > 0) {
      return [...post.media]
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

    const isVideo = !!post?.videoUrl;
    return [
      {
        id: String(post?.id),
        kind: (isVideo ? "VIDEO" : "IMAGE") as "VIDEO" | "IMAGE",
        imageUrl: post?.imageUrl ?? null,
        videoUrl: post?.videoUrl ?? null,
        thumbUrl: serverThumb,
      },
    ];
  }, [post?.id, post?.isCarousel, post?.media, post?.imageUrl, post?.videoUrl, post?.thumbUrl]);

  const shouldPlay = isActive && screenFocused;
  const [mediaIndex, setMediaIndex] = useState(0);

  function truncate(s: string, max = 18) {
    if (!s) return "";
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function isGroupSource(s?: PostSource): s is Extract<PostSource, { kind: "GROUP" }> {
    return !!s && s.kind === "GROUP";
  }


  const subtitleNode = isGroupSource(source) && source.title
  ? (
   <RotatingSuggestionLabel
      C={C}
      labels={[
        {
          text: t("postcard.fromGroup"),
          icon: <Ionicons name="link-outline" size={12} color={C.subtext} />,
        },
        {
          text: truncate(source.title),
        },
      ]}
    />
  )
  : isSuggested
    ? <RotatingSuggestionLabel C={C} />
    : undefined;


  // reset wenn Post wechselt
  useEffect(() => {
    setMediaIndex(0);
  }, [post?.id, media.length]);

  // ---------- comments sheet (only open state here) ----------
  const [commentsOpen, setCommentsOpen] = useState(false);

  const [addComment] = useMutation(ADD_COMMENT);
  const [deleteComment] = useMutation(DELETE_COMMENT);

  const onSendComment = useCallback(
    (text: string) => {
      addComment({ variables: { postId: post.id, content: text } }).catch(() => {});
    },
    [addComment, post?.id]
  );

  const onDeleteComment = useCallback(
    (id: string) => {
      deleteComment({ variables: { commentId: id } }).catch(() => {});
    },
    [deleteComment]
  );

  // ---------- handlers ----------
  function confirmDeletePost() {
    setMenuVisible(false);

    Alert.alert(
      t("postcard.delete.title"),
      t("postcard.delete.body"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive",
        onPress: async () => {
          try {
            await deletePostMut({
              variables: { id: post.id },
              update(cache, { data }) {
                if (!data?.deletePost) return;

                cache.evict({ id: cache.identify({ __typename: "Post", id: post.id }) });
                const postIdToDelete = post.id;

                cache.modify({
                  fields: {
                    homeFeed(existingRefs: readonly Reference[] = [], { readField }) {
                      return existingRefs.filter((itemRef) => {
                        const postRef = readField<Reference>("post", itemRef);
                        const currentId = postRef ? readField<string>("id", postRef) : null;
                        return currentId !== postIdToDelete;
                      });
                    },
                  },
                });

                cache.gc();
              },
            });

            onAfterModeration?.();
          } catch (e: any) {
            Alert.alert(t("common.error"), e?.message ?? t("postcard.delete.failed"));
          }
        },
      },
    ]);
  }

  const toggleLike = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      if (next) await likePost({ variables: { postId: post.id } });
      else await unlikePost({ variables: { postId: post.id } });
    } catch {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : +1)));
    }
  }, [liked, likePost, unlikePost, post?.id]);

  const reportWithReason = useCallback(
    async (reason: "HATE_SPEECH" | "NUDITY" | "VIOLENCE" | "SPAM" | "COPYRIGHT") => {
      try {
        await reportContent({ variables: { input: { postId: post.id, reason } } });
        Alert.alert(t("common.thanks"), t("postcard.report.sent"));
        onAfterModeration?.();
      } catch (e: any) {
        Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
      }
    },
    [post?.id, reportContent, onAfterModeration]
  );

  const openReportPicker = useCallback(() => {
    Alert.alert(t("postcard.report.title"), t("postcard.report.pickReason"), [
      { text: t("postcard.report.reason.hateSpeech"), onPress: () => reportWithReason("HATE_SPEECH") },
      { text: t("postcard.report.reason.nudity"), onPress: () => reportWithReason("NUDITY") },
      { text: t("postcard.report.reason.violence"), onPress: () => reportWithReason("VIOLENCE") },
      { text: t("postcard.report.reason.spam"), onPress: () => reportWithReason("SPAM") },
      { text: t("postcard.report.reason.copyright"), onPress: () => reportWithReason("COPYRIGHT") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [reportWithReason]);

  const confirmBlock = useCallback(() => {
    const uname = post?.author?.username ?? t("common.user");

    Alert.alert(
      t("postcard.block.title"),
      t("postcard.block.body", { username: uname }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.block"), style: "destructive", 
          onPress: async () => {
            try {
              await doBlockUser({ variables: { userId: post?.author?.id } });
              Alert.alert(t("postcard.block.doneTitle"), t("postcard.block.doneBody", { username: uname }));
              onAfterModeration?.();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
            }
          },
        },
      ]
    );
  }, [doBlockUser, post?.author?.id, post?.author?.username, onAfterModeration]);

  // ✅ thumb-first for efficiency, full avatar as fallback if the thumb fails
  const avatarUriForHeader = useMemo(
    () => author?.avatarThumbUrl ?? author?.avatarUrl ?? null,
    [author?.avatarThumbUrl, author?.avatarUrl]
  );

  // ✅ move caption renderer out of render path, use computed styles
  const renderCaptionWithHashtags = useCallback(
    (caption: string) => {
      const parts = caption.split(HASHTAG_RE);

      return parts.map((part, idx) => {
        const isHashtag = part.startsWith("#") && part.length > 1;
        if (!isHashtag) return <Text key={`cap-${idx}`}>{part}</Text>;
        return (
          <Text key={`tag-${idx}`} style={S.hashtag}>
            {part}
          </Text>
        );
      });
    },
    [S.hashtag]
  );

  return (
    <View style={S.card}>
      <PostHeaderRow
        user={{
          username: author?.username ?? t("common.userFallback"),
          avatarUrl: avatarUriForHeader,
          avatarFallbackUrl: author?.avatarUrl ?? null,
        }}
        subtitle={subtitleNode}
        location={post?.location ?? null}
        rightAccessory={followAccessory}
        taggedCount={taggedCount}
        onPressUser={() => {
          if (isMine) return;
          if (author?.username) {
            navigation.navigate("UserProfile", { username: author.username, userId: author.id });
            return;
          }
          if (author?.id) {
            navigation.navigate("UserProfile", { userId: author.id });
          }
        }}
        onPressSubtitle={
          isGroupSource(source)
            ? () => navigation.navigate("CommunitySpace", { id: source.groupId, title: source.title, type: source.groupType })
            : undefined
        }
        onPressTagged={
          taggedCount > 0
            ? () => {
                setSheetTags(acceptedTaggedAll as any);
                setShowTaggedSheet(true);
              }
            : undefined
        }
        onPressMenu={() => setMenuVisible(true)}
        C={C}
      />

      <PostMediaCarousel
        postId={String(post.id)}
        isProcessing={!!post.isProcessing}
        media={media}
        shouldPlay={shouldPlay}
        onIndexChange={setMediaIndex}
      />

      <PostPagerDots count={media.length} index={mediaIndex} C={C} />

      <PostActionsRow
        liked={liked}
        likes={likes}
        comments={post?.commentCount ?? 0}
        onToggleLike={toggleLike}
        onPressLikes={() => setLikesOpen(true)}
        onPressComments={() => setCommentsOpen(true)}
        C={C}
      />

      {!!post?.caption && (
        <Text style={S.caption}>
          <Text style={S.username}>{author?.username ?? t("common.userFallback")} </Text>
          {renderCaptionWithHashtags(String(post.caption))}
        </Text>
      )}

      <Text style={S.time}>
        {post?.createdAt ? new Date(post.createdAt).toLocaleString(i18n.language) : ""}
      </Text>

      <PostActionsMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        C={C}
        showEdit={isMine}
        showDelete={isMine}
        showReport={!isMine}
        showShareToStory
        showBlock={!isMine}
        handlers={{
          onEdit: () => navigation.navigate("PostEdit", { id: post.id }),
          onDelete: confirmDeletePost,
          onReport: openReportPicker,
          onBlockUser: confirmBlock,
          onShareToStory: () =>
            navigation.navigate("CreateMedia", { initialMode: "STORY", sharePostId: post.id }),
        }}
      />

      <TaggedUsersSheet
        visible={showTaggedSheet}
        onClose={() => setShowTaggedSheet(false)}
        tags={sheetTags}
        myId={myId}
        onSelectUser={(uname) => {
          setShowTaggedSheet(false);
          navigation.navigate("UserProfile", { username: uname });
        }}
      />

      <PostLikesSheet visible={likesOpen} onClose={() => setLikesOpen(false)} postId={post.id} />

      <PostCommentSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        postAuthorId={author?.id ?? null}
        meId={meData?.me?.id ?? null}
        meUsername={meData?.me?.username ?? null}
        meAvatarUrl={meData?.me?.avatarUrl ?? null}
        C={C}
      />
    </View>
  );
}

const s = (C: any) =>
  StyleSheet.create({
    hashtag: {
      color: C.hashtag,
      fontWeight: "500",
    },
    card: { backgroundColor: C.bg },
    communityChip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginHorizontal: 12,
      marginTop: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
      maxWidth: "88%",
    },
    communityChipText: { color: C.text, fontSize: 12, fontWeight: "800" },
    caption: { paddingHorizontal: 12, paddingTop: 6, color: C.text },
    username: { fontWeight: "700", color: C.text },
    time: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: C.subtext ?? C.sub ?? "#9CA3AF",
      fontSize: 12,
    },
  });
