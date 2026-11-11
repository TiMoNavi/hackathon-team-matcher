import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Dimensions,
  StyleProp,
  ViewStyle,
  ScrollView,
  ActivityIndicator
} from "react-native";
import type { ListRenderItem } from "react-native";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode, Audio } from "expo-av";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import TaggedUsersSheet, { TaggedUser } from "../../components/TaggedUsersSheet";
import { PostLikesSheet } from "../../components/post/likes/PostLikesSheet";
import { PostCommentSheet } from "./comments/PostCommentSheet";

import { avatarPlaceholder,gridPlaceholderDark, gridPlaceholderLight, } from "../../../../assets/placeholders";
import { useTheme } from "../../../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

const ME_QUERY = gql`
  query MeMini {
    me { id username avatarUrl }
  }
`;

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

const { width } = Dimensions.get("window");
const CARD_W = width - 24;

type Props = {
  post: any;
  isActive: boolean;
  screenFocused: boolean;
  myId?: string | null;
  onAfterModeration?: () => void;
  onLikeChanged?: (postId: string, nextLiked: boolean, nextLikeCount: number) => void;

  /** optional: wrapper style für reuse in anderen Screens */
  style?: StyleProp<ViewStyle>;
  /** Theme colors (aus useTheme) */
  C: any;
};

// ✅ top-level (nicht in der Component)
const HASHTAG_RE = /(#[\p{L}\p{N}_]+)/gu;

type CaptionToken = { text: string; isHashtag: boolean };

function captionParts(caption: string): CaptionToken[] {
  return caption.split(HASHTAG_RE).map((part) => ({
    text: part,
    isHashtag: part.startsWith("#") && part.length > 1,
  }));
}


export function VlogPostCard({
  post,
  isActive,
  screenFocused,
  myId,
  onAfterModeration,
  onLikeChanged,
  style,
  C,
}: Props) {
  const { t } = useTranslation();

  const navigation = useNavigation<any>();
  const s = useMemo(() => styles(C), [C]);


  const { theme } = useTheme();
  const gridPlaceholder =
  theme.mode === "dark" ? gridPlaceholderDark : gridPlaceholderLight;


  const [index, setIndex] = useState(0);

  // Like state
  const [liked, setLiked] = useState<boolean>(!!post.isLiked);
  const [likes, setLikes] = useState<number>(post.likeCount ?? 0);
  const [likePost] = useMutation(LIKE_POST);
  const [unlikePost] = useMutation(UNLIKE_POST);

  
  const captionTokens = useMemo(() => {
    const cap = String(post?.caption ?? "");
    if (!cap.trim()) return null;
    return captionParts(cap);
  }, [post?.caption]);


  // ✅ Sync: wenn parent post.isLiked / likeCount ändert, UI hier updaten
  useEffect(() => {
    setLiked(!!post?.isLiked);
    setLikes(post?.likeCount ?? 0);
  }, [post?.isLiked, post?.likeCount]);


  const isCarousel = !!post.isCarousel && Array.isArray(post.media) && post.media.length > 0;

  // Video refs
  const singleVideoRef = useRef<Video | null>(null);
  const mediaVideoRefs = useRef<Record<string, Video | null>>({});

  const acceptedTaggedAll: TaggedUser[] = useMemo(
    () =>
      (post?.taggedUsers ?? []).filter(
        (t: any) => t?.status === "ACCEPTED" || t?.status === "APPROVED"
      ),
    [post?.taggedUsers]
  );
  const taggedCount = acceptedTaggedAll.length;
  const [showTaggedSheet, setShowTaggedSheet] = useState(false);
  const [sheetTags, setSheetTags] = useState<TaggedUser[]>([]);
  const [likesOpen, setLikesOpen] = useState(false);

const mediaSorted = useMemo(() => {
    const arr = Array.isArray(post.media) ? [...post.media] : [];
    return arr.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
}, [post.media]);

    useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(i, Math.max(0, mediaSorted.length - 1))));
}, [mediaSorted.length]);

    // 4) use mediaSorted everywhere
const prevIndexRef = useRef(0);

useEffect(() => {
  const current = mediaSorted?.[index]?.id;
  const prev = mediaSorted?.[prevIndexRef.current]?.id;
  prevIndexRef.current = index;

  const shouldPlay = (id?: string) => !!(isActive && screenFocused && id && id === current);

  const prevRef = prev ? mediaVideoRefs.current[prev] : null;
  const curRef = current ? mediaVideoRefs.current[current] : null;

  prevRef?.pauseAsync?.().catch(() => {});
  if (shouldPlay(current)) curRef?.playAsync?.().catch(() => {});
  else curRef?.pauseAsync?.().catch(() => {});
}, [isActive, screenFocused, index, mediaSorted]);

  const { data: meQ } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });
  const myProfileId = meQ?.me?.id ?? myId ?? null;

  // Moderation
  const [reportContent] = useMutation(REPORT_CONTENT);
  const [doBlockUser] = useMutation(BLOCK_USER);
  const [menuVisible, setMenuVisible] = useState(false);
  const isMine = !!myProfileId && post?.author?.id === myProfileId;
  const [deletePostMut] = useMutation(DELETE_POST);
  


  async function reportPostWith(reasonKey: string) {
    await reportContent({ variables: { input: { postId: post.id, reason: reasonKey } } });
    Alert.alert(t("common.thanks"), t("postcard.report.sent"));
    onAfterModeration?.();
  }

  function openReportPicker() {
    setMenuVisible(false);
    Alert.alert(t("postcard.report.title"), t("postcard.report.pickReason"), [
      { text: t("postcard.report.reason.hateSpeech"), onPress: () => reportPostWith("HATE_SPEECH") },
      { text: t("postcard.report.reason.nudity"), onPress: () => reportPostWith("NUDITY") },
      { text: t("postcard.report.reason.violence"), onPress: () => reportPostWith("VIOLENCE") },
      { text: t("postcard.report.reason.spam"), onPress: () => reportPostWith("SPAM") },
      { text: t("postcard.report.reason.copyright"), onPress: () => reportPostWith("COPYRIGHT") },
      { text: t("common.cancel"), style: "cancel" },
    ]);

  }

  function confirmBlock() {
    setMenuVisible(false);
    const uname = post?.author?.username ?? t("common.user");
    Alert.alert(
      t("postcard.block.title"),
      t("postcard.block.body", { username: uname }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.block"),
          style: "destructive",
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
  }

function confirmDeletePost() {
  setMenuVisible(false);

    Alert.alert(t("postcard.delete.title"), t("postcard.delete.body"), [
    { text: t("common.cancel"), style: "cancel" },
    { text: t("common.delete"), style: "destructive", 
      onPress: async () => {
        try {
          await deletePostMut({
            variables: { id: post.id }, // ✅ korrekt
            update(cache, { data }) {
              if (!data?.deletePost) return;
              cache.evict({ id: cache.identify({ __typename: "Post", id: post.id }) });
              cache.gc();
              cache.modify({
                fields: {
                  vlogPosts(existingRefs = [], { readField }) {
                    return existingRefs.filter((pRef: any) => readField("id", pRef) !== post.id);
                  },
                },
              });
            },
          });

          onAfterModeration?.(); // z.B. Liste neu laden / Item entfernen
        } catch (e: any) {
          Alert.alert(t("common.error"), e?.message ?? t("postcard.delete.failed"));
        }
      },
    },
  ]);
}


 
  // Autoplay/Pause (Single-Video)
  useEffect(() => {
    const ref = singleVideoRef.current;
    if (!ref) return;
    if (isActive && screenFocused && !!post.videoUrl) ref.playAsync().catch(() => {});
    else ref.pauseAsync().catch(() => {});
  }, [isActive, screenFocused, post.videoUrl]);


  // Cleanup
  useEffect(() => {
    return () => {
      singleVideoRef.current?.pauseAsync().catch(() => {});
      Object.values(mediaVideoRefs.current).forEach((v) => v?.pauseAsync().catch(() => {}));
    };
  }, []);

  const renderCarouselItem: ListRenderItem<any> = ({ item: m, index: i }) => {
  const isVid = (m.kind === "VIDEO" || !!m.videoUrl);
  const processing = !!post.isProcessing || !!m.isProcessing;

  // ✅ WICHTIG: wenn processing → NUR LOADER, kein Thumb/Poster
  if (processing) {
    return (
      <View style={s.slide}>
        <View style={[s.mediaSquare, s.processingBox]}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  // ✅ ab hier: safe content (nach Verarbeitung)
  const fullUrl =
    m.imageUrl ||
    post.imageUrl ||
    null;

  const thumbUrl =
    m.thumbUrl ||
    post.thumbUrl ||
    null;



  const videoUrl = m.videoUrl || null;

  if (isVid && videoUrl) {
    return (
      <View style={s.slide}>
        <Video
          key={`vlogvid:${post.id}:${m.id}:${videoUrl}`}
          ref={(r) => { mediaVideoRefs.current[m.id] = r; }}
          source={{ uri: videoUrl }}
          style={s.mediaSquare}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={false}
          usePoster
          posterSource={thumbUrl ? { uri: thumbUrl } : (fullUrl ? { uri: fullUrl } : gridPlaceholder)}
          posterStyle={StyleSheet.absoluteFillObject}
          onError={(e) => console.warn("Video error", e)}
          
        />
      </View>
    );
  }

  // IMAGE
  return (
    <View style={s.slide}>
      <ExpoImage
        source={fullUrl ? { uri: fullUrl } : (thumbUrl ? { uri: thumbUrl } : gridPlaceholder)}
        placeholder={thumbUrl ? { uri: thumbUrl } : gridPlaceholder}
        style={s.mediaSquare}
        contentFit="cover"
        cachePolicy="memory-disk"
        allowDownscaling
        transition={120}
        recyclingKey={`vlogimg:${post.id}:${m.id}:${fullUrl ?? thumbUrl ?? "ph"}`} // ✅ URL im recyclingKey
      />
    </View>
  );
};



  const toggleLike = async () => {
  const nextLiked = !liked;
  const nextLikes = Math.max(0, likes + (nextLiked ? 1 : -1));

  // 1️⃣ lokale UI sofort aktualisieren
  setLiked(nextLiked);
  setLikes(nextLikes);

  // 2️⃣ Parent (ReelsScreen) informieren ✅ HIER
  onLikeChanged?.(post.id, nextLiked, nextLikes);

  try {
    // 3️⃣ Server-Mutation
    if (nextLiked) {
      await likePost({ variables: { postId: post.id } });
    } else {
      await unlikePost({ variables: { postId: post.id } });
    }
  } catch {
    // 4️⃣ Rollback lokal
    const rollbackLiked = !nextLiked;
    const rollbackLikes = Math.max(0, nextLikes + (nextLiked ? -1 : +1));

    setLiked(rollbackLiked);
    setLikes(rollbackLikes);

    // 5️⃣ Rollback auch im Parent
    onLikeChanged?.(post.id, rollbackLiked, rollbackLikes);
  }
};

  // Kommentare
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Caption
  const renderCaption = () =>
  !!captionTokens && (
    <ScrollView style={s.captionScroll} showsVerticalScrollIndicator>
      <Text style={s.postCaption}>
        <Text
          style={s.postAuthor}
          onPress={() => navigation.navigate("UserProfile", { username: post?.author?.username })}
        >
          {post.author?.username ?? t("common.userFallback")}{" "}
        </Text>

        {captionTokens.map((p, idx) => (
          <Text key={`cap-${idx}`} style={p.isHashtag ? s.hashtag : undefined}>
            {p.text}
          </Text>
        ))}
      </Text>
    </ScrollView>
  );

  // Header wie im Feed
  const authorAvatar =
  post?.author?.avatarThumbUrl ||
  post?.author?.avatarUrl|| null;

  

  const authorUsername = post.author?.username ?? t("common.userFallback");
 
  const singleFull = post?.imageUrl ?? null;
  const singleThumb = post?.thumbUrl ?? null;

  const poster =
    post?.thumbUrl ||
    post?.imageUrl ||
    null;

  const communityReason = useMemo(() => {
    const ctx = post?.communityContext;
    if (ctx?.title) {
      const hasMultipleShared = ctx.reason === "SHARED_COMMUNITIES" || Number(ctx.sharedCount ?? 0) > 1;
      return {
        text: hasMultipleShared
          ? t("vlogpostcard.sharedCommunities")
          : ctx.reason === "SHARED_MEMBER"
            ? t("vlogpostcard.alsoInCommunity", { title: ctx.title })
            : t("vlogpostcard.fromCommunity", { title: ctx.title }),
        community: hasMultipleShared ? null : ctx,
      };
    }

    if (post?.__ctx?.kind === "COMMUNITY") {
      return {
        text: t("vlogpostcard.alsoInYourCommunity"),
        community: null,
      };
    }

    return null;
  }, [post?.communityContext, post?.__ctx, t]);

  const openCommunityReason = () => {
    const community = communityReason?.community;
    if (!community?.groupId) return;

    navigation.navigate("CommunitySpace", {
      id: community.groupId,
      title: community.title,
      type: community.type,
      slug: community.slug,
    });
  };

  const AuthorMediaOverlay = () => (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.16)", "rgba(0,0,0,0.62)"]}
        locations={[0, 0.44, 1]}
        style={s.mediaGradient}
      />
      <View style={s.mediaAuthorOverlay}>
        <View style={s.mediaAuthorRow}>
          <TouchableOpacity
            onPress={() => navigation.navigate("UserProfile", { username: authorUsername })}
            activeOpacity={0.9}
            style={s.mediaAvatarRing}
          >
            <ExpoImage
              source={authorAvatar ? { uri: authorAvatar } : avatarPlaceholder}
              placeholder={avatarPlaceholder}
              style={s.mediaAvatar}
              contentFit="cover"
              cachePolicy="disk"
            />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={s.mediaUsername}
              onPress={() => navigation.navigate("UserProfile", { username: authorUsername })}
              numberOfLines={1}
            >
              {authorUsername}
            </Text>
            {communityReason ? (
              <TouchableOpacity
                activeOpacity={communityReason.community ? 0.78 : 1}
                onPress={openCommunityReason}
                disabled={!communityReason.community}
                style={s.communityReasonChip}
              >
                <Ionicons name="people-outline" size={12} color="rgba(255,255,255,0.92)" />
                <Text style={s.communityReasonText} numberOfLines={1}>
                  {communityReason.text}
                </Text>
              </TouchableOpacity>
            ) : (
              !!post.location && <Text style={s.mediaLocation} numberOfLines={1}>{post.location}</Text>
            )}
          </View>
          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => setMenuVisible(true)}
            style={s.mediaMoreBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

      </View>
    </>
  );

  return (
    <View style={[s.postCard, style]}>
      {/* Media */}
      {isCarousel ? (
        <View style={s.mediaBlock}>
          <FlatList
            data={mediaSorted}
            keyExtractor={(m: any) => String(m.id)}
            extraData={post.isProcessing}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            snapToInterval={CARD_W}
            snapToAlignment="start"
            showsHorizontalScrollIndicator={false}
            style={s.carouselSquare}
            onMomentumScrollEnd={(e) => {
              const i = Math.round((e.nativeEvent.contentOffset.x || 0) / CARD_W);
              setIndex(i);
            }}
            renderItem={renderCarouselItem}
            getItemLayout={(_, i) => ({ length: CARD_W, offset: CARD_W * i, index: i })}
          />
          <View style={s.pagerDots} pointerEvents="none">
            {mediaSorted.map((_: any, i: number) => (
              <View key={i} style={[s.dot, i === index && s.dotActive]} />
            ))}
          </View>
          <AuthorMediaOverlay />
        </View>
      ) : post.videoUrl ? (
          <View style={s.mediaWrap}>
            {post.isProcessing ? (
              <View style={[s.mediaSquare, { alignItems: "center", justifyContent: "center", backgroundColor: "#000" }]}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : (
              <Video
                key={`vlogsinglevid:${post.id}:${post.videoUrl ?? "none"}`}
                ref={(r) => { singleVideoRef.current = r; }}
                source={{ uri: post.videoUrl }}
                style={s.mediaSquare}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={false}
                usePoster
                posterSource={poster ? { uri: poster } : gridPlaceholder}
                posterStyle={StyleSheet.absoluteFillObject}
              onError={(e) => console.warn("Video error", e)}
              
              />
            )}
            <AuthorMediaOverlay />
          </View>
        ) : (

        <View style={s.mediaWrap}>
        <ExpoImage
          source={singleFull ? { uri: singleFull } : (singleThumb ? { uri: singleThumb } : gridPlaceholder)}
          placeholder={singleThumb ? { uri: singleThumb } : gridPlaceholder}
          style={s.mediaSquare}
          contentFit="cover"
          cachePolicy="memory-disk"
          allowDownscaling
          transition={120}
        />
        <AuthorMediaOverlay />
        </View>
      )}

      <View style={s.contentBlock}>
        <View style={s.bubbleActions}>
          <TouchableOpacity onPress={() => setLikesOpen(true)} activeOpacity={0.86} style={s.metricBubble}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? "#FF4D67" : C.text} />
            <Text style={s.metricText}>{likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCommentsOpen(true)} activeOpacity={0.86} style={s.metricBubble}>
            <Ionicons name="chatbubble-outline" size={17} color={C.text} />
            <Text style={s.metricText}>{post?.commentCount ?? 0}</Text>
          </TouchableOpacity>
          {taggedCount > 0 && (
            <TouchableOpacity
              onPress={() => { setSheetTags(acceptedTaggedAll); setShowTaggedSheet(true); }}
              activeOpacity={0.86}
              style={s.metricBubbleWide}
            >
              <Ionicons name="people-outline" size={17} color={C.text} />
              <Text style={s.metricText} numberOfLines={1}>{taggedCount}</Text>
            </TouchableOpacity>
          )}
        </View>

        {renderCaption()}
        <Text style={s.time}>{new Date(post.createdAt).toLocaleString()}</Text>
      </View>

      <PostCommentSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        postAuthorId={post?.author?.id ?? null}
        meId={myProfileId}
        meUsername={meQ?.me?.username ?? null}
        meAvatarUrl={meQ?.me?.avatarUrl ?? null}
        C={C}
      />

      {/* Menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <View style={s.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill as any} onPress={() => setMenuVisible(false)} />
          <View style={s.menuBox}>
            <View style={s.menuHandle} />
            <View style={s.menuHeader}>
              <View style={s.menuHeaderSpacer} />
              <Text style={s.menuTitle}>{t("vlogpostcard.optionsTitle")}</Text>
              <View style={s.menuHeaderSpacer} />
            </View>
            {!isMine && (
              <TouchableOpacity style={[s.menuItem, s.menuItemBorder, s.menuDangerItem]} onPress={openReportPicker}>
                <View style={s.menuItemIcon}>
                  <Ionicons name="flag-outline" size={18} color={C.danger ?? "#F87171"} />
                </View>
                <Text style={[s.menuText, { color: C.danger ?? "#F87171", fontWeight: "800" }]}>
                  {t("vlogpostcard.reportPost")}</Text>
              </TouchableOpacity>
            )}

            {!isMine && (
              <TouchableOpacity style={[s.menuItem, s.menuItemBorder, s.menuDangerItem]} onPress={confirmBlock}>
                <View style={s.menuItemIcon}>
                  <Ionicons name="ban-outline" size={18} color="#F59E0B" />
                </View>
                <Text style={[s.menuText, { color: "#F59E0B", fontWeight: "800" }]}>
                  {t("vlogpostcard.blockUsers")}</Text>
              </TouchableOpacity>
            )}

            {isMine && (
            <TouchableOpacity style={[s.menuItem, s.menuItemBorder, s.menuDangerItem]} onPress={confirmDeletePost}>
                <View style={s.menuItemIcon}>
                  <Ionicons name="trash-outline" size={18} color={C.danger ?? "#F87171"} />
                </View>
                <Text style={[s.menuText, { color: C.danger ?? "#F87171", fontWeight: "800" }]}>
                {t("vlogpostcard.deletePost")}</Text>
            </TouchableOpacity>
            )}

          </View>
        </View>
      </Modal>

      <PostLikesSheet
        visible={likesOpen}
        onClose={() => setLikesOpen(false)}
        postId={post.id}
      />


      <TaggedUsersSheet
        visible={showTaggedSheet}
        onClose={() => setShowTaggedSheet(false)}
        tags={sheetTags}
        myId={myProfileId ?? null}
        onSelectUser={(uname) => {
          setShowTaggedSheet(false);
          navigation.navigate("UserProfile", { username: uname });
        }}
      />
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({

    processingBox: {
      backgroundColor: "#000",
      alignItems: "center",
      justifyContent: "center",
    },
    hashtag: {
      color: C.hashtag,
      fontWeight: "500", // optional, kannst auch entfernen
    },

    carouselSquare: {
      width: CARD_W,
      height: CARD_W,
      alignSelf: "center",
    },

    mediaBlock: {
      width: CARD_W,
      height: CARD_W,
      alignSelf: "center",
      overflow: "hidden",
      position: "relative",
    },

    slide: {
      width: CARD_W,
      height: CARD_W,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },

    mediaSquare: {
      width: CARD_W,
      height: CARD_W,
      backgroundColor: "rgba(255,255,255,0.04)",
    },

    // optional (für single media auch sauber)
    mediaWrap: {
      width: CARD_W,
      height: CARD_W,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
    },
    postCard: {
      marginTop: 12,
      marginHorizontal: 12,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
      position: "relative",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },

    mediaGradient: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 132,
    },
    mediaAuthorOverlay: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
    },
    mediaAuthorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    mediaAvatarRing: {
      width: 42,
      height: 42,
      borderRadius: 21,
      padding: 2,
      backgroundColor: "rgba(255,255,255,0.94)",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    mediaAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    mediaUsername: {
      color: "#fff",
      fontSize: 19,
      lineHeight: 23,
      fontWeight: "900",
      flexShrink: 1,
      minWidth: 0,
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowRadius: 7,
      textShadowOffset: { width: 0, height: 2 },
    },
    mediaLocation: {
      color: "rgba(255,255,255,0.86)",
      fontSize: 13,
      fontWeight: "800",
      marginTop: 3,
      textShadowColor: "rgba(0,0,0,0.45)",
      textShadowRadius: 6,
      textShadowOffset: { width: 0, height: 2 },
    },
    communityReasonChip: {
      alignSelf: "flex-start",
      maxWidth: "96%",
      marginTop: 5,
      paddingHorizontal: 10,
      height: 26,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(12,14,18,0.34)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.28)",
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    communityReasonText: {
      color: "rgba(255,255,255,0.93)",
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "800",
      flexShrink: 1,
      minWidth: 0,
      textShadowColor: "rgba(0,0,0,0.32)",
      textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 1 },
    },
    mediaMoreBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(12,14,18,0.44)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.28)",
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    contentBlock: {
      paddingTop: 10,
      paddingBottom: 8,
      backgroundColor: C.card,
    },
    bubbleActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 0,
      paddingBottom: 2,
    },
    metricBubble: {
      minWidth: 74,
      height: 38,
      borderRadius: 999,
      paddingHorizontal: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: C.bg,
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    metricBubbleWide: {
      minWidth: 62,
      maxWidth: 110,
      height: 38,
      borderRadius: 999,
      paddingHorizontal: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: C.bg,
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    metricText: {
      color: C.text,
      fontSize: 14,
      fontWeight: "900",
    },

   
    pagerDots: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 12,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.38)" },
    dotActive: { backgroundColor: "#fff" },

    postHeader: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    postAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: "rgba(255,255,255,0.08)" },
    postUsername: { color: C.text, fontWeight: "700" },
    postLocation: { color: C.subtext, fontSize: 12, marginTop: 2 },
    postMore: { color: C.text, fontSize: 22, paddingHorizontal: 6 },

    captionScroll: {
      maxHeight: 84,
      marginTop: 4,
      marginBottom: 2,
    },
    postCaption: { color: C.text, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 4, lineHeight: 20 },
    postAuthor: { color: C.text, fontWeight: "800", flexShrink: 1, minWidth: 0 },

    time: {
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 0,
      color: C.subtext,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0,
    },

    modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
    menuBox: {
      backgroundColor: C.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 14,
      overflow: "hidden",
    },
    menuHandle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 999,
      backgroundColor: C.border,
      marginBottom: 14,
    },
    menuHeader: {
      paddingBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    menuHeaderSpacer: {
      width: 34,
      height: 34,
    },
    menuTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "900",
    },
    menuItem: {
      minHeight: 48,
      borderRadius: 14,
      paddingHorizontal: 8,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    menuDangerItem: {
      backgroundColor: C.card,
    },
    menuItemBorder: { marginBottom: 6 },
    menuItemIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    menuText: { fontSize: 15, color: C.text, fontWeight: "800" },
  });
