// apps/ciaorelated/src/screens/ActivityScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  ScrollView,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { gql, useApolloClient, useMutation, useQuery } from "@apollo/client";
import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";
import { avatarPlaceholder } from "../../assets/placeholders";


import { useTranslation } from "react-i18next";




function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}



/* -------- GraphQL -------- */
const ME_QUERY = gql`
  query MeMini {
    me {
      id
      username
    }
  }
`;

const ACTIVITY = gql`
  query Activity($offset: Int, $limit: Int) {
    activity(offset: $offset, limit: $limit) {
      edges {
        __typename

        ... on Notification {
          id
          notifKind: kind
          isRead
          createdAt
          requestStatus
          handledAt
          payload
          fromUser { id username avatarThumbUrl avatarUrl }
          post { id imageUrl thumbUrl videoUrl }
          vlog { id title slug }
        }

        ... on ActivityBundle {
          id
          bundleKind: kind
          latestAt
          createdAt
          count
          ids
          isRead
          actors { id username avatarThumbUrl avatarUrl }
          storyIds
          post { id imageUrl thumbUrl videoUrl }
        }
      }
      nextCursor
    }
  }
`;



const ACCEPT_FOLLOW_REQUEST = gql`
  mutation AcceptFollowRequest($userId: ID!) {
    acceptFollowRequest(userId: $userId)
  }
`;
const REJECT_FOLLOW_REQUEST = gql`
  mutation RejectFollowRequest($userId: ID!) {
    rejectFollowRequest(userId: $userId)
  }
`;

const MARK_ONE_READ = gql`
  mutation MarkOneRead($id: ID!) {
    markNotificationRead(id: $id)
  }
`;
const MARK_READ = gql`
  mutation MarkRead($channel: NotificationChannel!) {
    markAllRead(channel: $channel)
  }
`;

const APPROVE_POST_TAG = gql`
  mutation ApprovePostTag($postId: ID!, $userId: ID!) {
    approvePostTag(postId: $postId, userId: $userId)
  }
`;
const REJECT_POST_TAG = gql`
  mutation RejectPostTag($postId: ID!, $userId: ID!) {
    rejectPostTag(postId: $postId, userId: $userId)
  }
`;


const MARK_MANY_IDS_READ = gql`
  mutation MarkNotificationsRead($ids: [ID!]!) {
    markNotificationsRead(ids: $ids)
  }
`;

const NOTIF_READ_FRAGMENT = gql`
  fragment NotifRead on Notification {
    id
    isRead
  }
`;


/* -------- Types -------- */
type ReqStatus = "PENDING" | "ACCEPTED" | "REJECTED";

/* -------- Avatar w/ badge (StoryBubble-like ring) -------- */
function ActivityAvatar({
  uri,
  size = 44,
  bgColor,
  ringColor,
  badgeBg,
  badgeIcon,
}: {
  uri: string;
  size?: number;
  bgColor: string;
  ringColor?: string | null;
  badgeBg: string;
  badgeIcon: React.ReactNode;
}) {
  const { t } = useTranslation();

  const inner = size - 6;
  const badgeSize = Math.round(size * 0.42);
  const badgeRadius = Math.round(badgeSize / 2);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ringColor ? 2 : 0,
        borderColor: ringColor ?? "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ExpoImage
        source={uri ? { uri, cacheKey: String(uri).split("?")[0] } : avatarPlaceholder}
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: "rgba(255,255,255,0.06)",
        }}
        contentFit="cover"
        cachePolicy="disk"
        transition={80}
      />

      <View
        style={{
          position: "absolute",
          right: -(badgeSize * 0.03),
          bottom: -(badgeSize * 0.03),
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeRadius,
          backgroundColor: badgeBg,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: bgColor,
        }}
      >
        {badgeIcon}
      </View>
    </View>
  );
}

function BundleAvatar({ actors, size = 44, bgColor, badgeBg, badgeIcon }: {
  actors: Array<{ id: string; username: string; avatarThumbUrl?: string | null, avatarUrl?: string | null }>;
  size?: number;
  bgColor: string;
  badgeBg: string;
  badgeIcon: React.ReactNode;
}) {
  const list = Array.isArray(actors) ? actors.filter(Boolean) : [];

  const frontActor = list.find(a => a?.avatarThumbUrl || a?.avatarUrl) ?? list[0] ?? null;
  const backActor =
    list.find(a => a?.id !== frontActor?.id && (a?.avatarThumbUrl || a?.avatarUrl)) ??
    list.find(a => a?.id !== frontActor?.id) ??
    null;

  const uriFront = frontActor?.avatarThumbUrl || frontActor?.avatarUrl || null;
  const uriBack  = backActor?.avatarThumbUrl  || backActor?.avatarUrl  || null;

  const avatarSize = Math.round(size * 0.78);
  const border = 2;
  const badgeSize = Math.round(size * 0.42);

  const backPos = { left: 0, top: 0 };
  const frontPos = { left: size - avatarSize, top: size - avatarSize };

  const backIsPlaceholder = !uriBack;
  const frontIsPlaceholder = !uriFront;

  return (
    <View style={{ width: size, height: size }}>
      {/* back avatar (IMMER als Bild, mit placeholder fallback) */}
      <ExpoImage
        source={uriBack ? { uri: uriBack, cacheKey: String(uriBack).split("?")[0] } : avatarPlaceholder}
        style={{
          position: "absolute",
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          left: backPos.left,
          top: backPos.top,
          borderWidth: border,
          borderColor: bgColor,
          backgroundColor: backIsPlaceholder ? "rgba(255,255,255,0.10)" : bgColor,
        }}
        contentFit="cover"
        cachePolicy="disk"
        transition={80}
      />

      {/* front avatar */}
      <ExpoImage
        source={uriFront ? { uri: uriFront, cacheKey: String(uriFront).split("?")[0] } : avatarPlaceholder}
        style={{
          position: "absolute",
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarSize / 2,
          left: frontPos.left,
          top: frontPos.top,
          borderWidth: border,
          borderColor: bgColor,
          backgroundColor: frontIsPlaceholder ? "rgba(255,255,255,0.10)" : bgColor,
          zIndex: 2,
        }}
        contentFit="cover"
        cachePolicy="disk"
        transition={80}
      />

      {/* badge */}
      <View
        style={{
          position: "absolute",
          right: -Math.round(badgeSize * 0.15),
          bottom: -Math.round(badgeSize * 0.15),
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: badgeBg,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: bgColor,
          zIndex: 3,
        }}
      >
        {badgeIcon}
      </View>
    </View>
  );
}







/* -------- Badge mapping -------- */
function getBadgeForNotification(n: any, COLORS: any) {
  const payloadType = n?.payload?.type;

  let badgeBg = "rgba(255,255,255,0.10)";
  let icon: React.ReactNode = (
    <Ionicons name="notifications" size={14} color={COLORS.text} />
  );

  const kind = notifKind(n);
  if (kind === "LIKE") {
    badgeBg = "#ef4444";
    icon = <Ionicons name="heart" size={14} color="#fff" />;
  } else if (notifKind(n) === "COMMENT") {
    badgeBg = "#60a5fa";
    icon = <Ionicons name="chatbubble" size={14} color="#fff" />;
  } else if (notifKind(n) === "FOLLOW") {
    badgeBg = "#22c55e";
    icon = <Ionicons name="person-add" size={14} color="#000" />;
  } else if (notifKind(n) === "FOLLOW_REQUEST") {
    badgeBg = "#22c55e";
    icon = <Ionicons name="person-add" size={14} color="#000" />;
  } else if (notifKind(n) === "FOLLOW_REQUEST_ACCEPTED") {
    badgeBg = "#22c55e";
    icon = <Ionicons name="checkmark" size={14} color="#000" />;
  } else if (payloadType === "POST_TAG_REQUEST") {
    badgeBg = "#a78bfa";
    icon = <MaterialCommunityIcons name="tag-outline" size={14} color="#fff" />;
  } else if (notifKind(n) === "POST_SHARE_REQUEST") {
    badgeBg = "#60a5fa";
    icon = <Ionicons name="share-social" size={14} color="#fff" />;
  } else if (notifKind(n) === "POST_SHARE_APPROVED") {
    badgeBg = "#22c55e";
    icon = <Ionicons name="checkmark" size={14} color="#000" />;
  } else if (notifKind(n) === "POST_SHARE_REJECTED") {
    badgeBg = "#ef4444";
    icon = <Ionicons name="close" size={14} color="#000" />;
  } else if (notifKind(n) === "VLOG_TAG_REQUEST") {
    badgeBg = "#f59e0b";
    icon = (
      <MaterialCommunityIcons name="movie-open-outline" size={14} color="#000" />
    );
  } else if (notifKind(n) === "VLOG_TAG_APPROVED") {
    badgeBg = "#22c55e";
    icon = <Ionicons name="checkmark" size={14} color="#000" />;
  } else if (notifKind(n) === "VLOG_TAG_REJECTED") {
    badgeBg = "#ef4444";
    icon = <Ionicons name="close" size={14} color="#000" />;
  } else if (notifKind(n) === "VLOG_DELETED") {
    badgeBg = "rgba(255,255,255,0.16)";
    icon = <Ionicons name="trash-outline" size={14} color={COLORS.text} />;
  } else if (notifKind(n) === "SYSTEM" || payloadType === "DAILY_DIGEST") {
    badgeBg = "#a78bfa";
    icon = <Ionicons name="sparkles" size={14} color="#fff" />;
  }

  return { badgeBg, icon };
}
 type ActivityEdge = any; // wenn du schnell willst
  // oder sauber:
  type ActivitySection = { title: string; data: ActivityEdge[] };

const notifKind = (n: any) => n?.notifKind ?? n?.kind;     // Notification
const bundleKind = (b: any) => b?.bundleKind ?? b?.kind;   // Bundle

/* -------- Component -------- */
export default function ActivityScreen() {
  const nav = useNavigation<any>();
  const client = useApolloClient();
  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = styles(COLORS);
  const { t } = useTranslation();

  const { data: meQ } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });
  const meId = meQ?.me?.id as string | undefined;

  const { data, fetchMore, refetch, loading } = useQuery(ACTIVITY, {
    variables: { offset: 0, limit: 30 },
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const [markOneRead] = useMutation(MARK_ONE_READ);
  const [markManyRead] = useMutation(MARK_READ);

  const [approvePostTag] = useMutation(APPROVE_POST_TAG);
  const [rejectPostTag] = useMutation(REJECT_POST_TAG);


  const [rejectFollowRequest] = useMutation(REJECT_FOLLOW_REQUEST);
  const [acceptFollowRequest] = useMutation(ACCEPT_FOLLOW_REQUEST);

  const [markManyIdsRead] = useMutation(MARK_MANY_IDS_READ);


  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "NEW" | "REQUESTS">("ALL");

  // local immediate status per notificationId
  const [handling, setHandling] = useState<Record<string, ReqStatus>>({});

  const items = useMemo(() => data?.activity?.edges ?? [], [data]);

  /* -------- Utils -------- */
  function timeAgo(d: string | number | Date) {
    const ts = new Date(d).getTime();
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);

    if (min < 1) return t("activity.time.justNow");
    if (min < 60) return t("activity.time.minutes", { count: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t("activity.time.hours", { count: h });
    const dA = Math.floor(h / 24);
    return t("activity.time.days", { count: dA });
  }

  function dayBucketLabel(createdAt: string | number | Date) {
    const ts = new Date(createdAt).getTime();
    const today = startOfDay(Date.now());
    const day = startOfDay(ts);
    const diffDays = Math.floor((today - day) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return t("activity.bucket.today");
    if (diffDays === 1) return t("activity.bucket.yesterday");
    if (diffDays <= 7) return t("activity.bucket.last7Days");
    return t("activity.bucket.older");
  }

  function formatActors(actors: any[]) {
    const a = (actors ?? []).filter(Boolean);
    if (a.length === 0) return t("activity.someone");
    if (a.length === 1) return a[0].username ?? t("activity.someone");
    if (a.length === 2) return t("activity.actors.two", { a: a[0].username, b: a[1].username });
    return t("activity.actors.many", { a: a[0].username, b: a[1].username, count: a.length - 2 });
  }


  useEffect(() => {
    const urls = items.flatMap((x:any) => {
      if (x.__typename === "Notification") return [x?.fromUser?.avatarThumbUrl, x?.fromUser?.avatarUrl].filter(Boolean);
      if (x.__typename === "ActivityBundle") return (x.actors ?? []).flatMap((a:any) => [a?.avatarThumbUrl, a?.avatarUrl]).filter(Boolean);
      return [];
    });
    if (urls.length) ExpoImage.prefetch(urls).catch(()=>{});
  }, [items]);


  /* -------- Helpers -------- */
  const isPostTagRequest = useCallback(
    (n: any) => n?.payload?.type === "POST_TAG_REQUEST",
    []
  );

  const getReqStatus = useCallback((n: any): ReqStatus => {
    const st = n?.requestStatus ?? n?.payload?.status;
    if (st === "PENDING" || st === "ACCEPTED" || st === "REJECTED") return st;

    const t = n?.payload?.type;
    if (t === "POST_TAG_APPROVED" || t === "VLOG_TAG_APPROVED") return "ACCEPTED";
    if (t === "POST_TAG_REJECTED" || t === "VLOG_TAG_REJECTED") return "REJECTED";

    if (notifKind(n) === "VLOG_TAG_APPROVED") return "ACCEPTED";
    if (notifKind(n) === "VLOG_TAG_REJECTED") return "REJECTED";

    return "PENDING";
  }, []);

  const primaryLabel = useCallback((st: ReqStatus) => {
    if (st === "ACCEPTED") return t("activity.status.confirmed");
    if (st === "REJECTED") return t("activity.status.rejected");
    return t("activity.action.accept");
  }, [t]);

  const isRequest = useCallback((n: any) => {
    const t = n?.payload?.type;
    return (
      notifKind(n) === "FOLLOW_REQUEST" ||
      t === "POST_TAG_REQUEST" ||
      notifKind(n) === "POST_SHARE_REQUEST"
    );
  }, []);

  const isBundle = (x: any) => x?.__typename === "ActivityBundle";
const isNotif  = (x: any) => x?.__typename === "Notification";


const edgeIsRead = (x: any) => {
  if (isBundle(x)) return !!x.isRead;
  return !!x.isRead;
};

const edgeKind = (x: any) => (isBundle(x) ? bundleKind(x) : notifKind(x));
const isRequestEdge = (x: any) => {
  if (!isNotif(x)) return false; // bundles nie als REQUESTS listen (wie vorher)
  const t = x?.payload?.type;
  const k = notifKind(x);
  return (
    k === "FOLLOW_REQUEST" ||
    t === "POST_TAG_REQUEST" ||
    k === "POST_SHARE_REQUEST"
  );
};


  const filteredItems = useMemo(() => {
  if (filter === "NEW") return items.filter((x: any) => !edgeIsRead(x));
  if (filter === "REQUESTS") return items.filter(isRequestEdge);
  return items;
}, [items, filter]);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch({ offset: 0, limit: 30 });
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const markAllRead = useCallback(() => {
    markManyRead({ variables: { channel: "ACTIVITY" } })
      .then(() => refetch({ offset: 0, limit: 30 }))
      .catch(() => {});
  }, [markManyRead, refetch]);

  const markReadOptimistic = useCallback(
    (n: any) => {
      if (!n?.id || n.isRead) return;

      markOneRead({
        variables: { id: n.id },
        optimisticResponse: { markNotificationRead: true },
        update(cache) {
          cache.updateQuery(
            { query: ACTIVITY, variables: { offset: 0, limit: 30 } },
            (prev: any) => {
              if (!prev?.activity) return prev;
              return {
                activity: {
                  ...prev.activity,
                  edges: (prev.activity.edges ?? []).map((e: any) =>
                    e.id === n.id ? { ...e, isRead: true } : e
                  ),
                },
              };
            }
          );
        },
      }).catch(() => {});
    },
    [markOneRead]
  );

  const setRowStatusInCache = useCallback(
    (notificationId: string, status: ReqStatus) => {
      client.cache.updateQuery(
        { query: ACTIVITY, variables: { offset: 0, limit: 30 } },
        (prev: any) => {
          if (!prev?.activity) return prev;
          return {
            activity: {
              ...prev.activity,
              edges: (prev.activity.edges ?? []).map((e: any) =>
                e.id === notificationId
                  ? {
                      ...e,
                      isRead: true,
                      requestStatus: status,
                      handledAt: new Date().toISOString(),
                      payload: { ...(e.payload ?? {}), status },
                    }
                  : e
              ),
            },
          };
        }
      );
    },
    [client]
  );

  const [storyPickOpen, setStoryPickOpen] = useState(false);
const [storyPickItems, setStoryPickItems] = useState<any[]>([]);

const openStoryPicker = useCallback((bundle: any) => {
  // pro User nur 1 Eintrag (du hast actors sowieso schon uniq am Server)
  const entries = (bundle.actors ?? [])
    .filter((a: any) => a?.id)
    .map((actor: any) => ({
      actor,
      createdAt: bundle.latestAt, // reicht als "zuletzt"
    }));

  setStoryPickItems(entries);
  setStoryPickOpen(true);
}, []);



const closeStoryPicker = useCallback(() => {
  setStoryPickOpen(false);
  setStoryPickItems([]);
}, []);


  const goPost = useCallback(
  (n: any) => {
    // ✅ wenn DAILY_DIGEST, nimm payload.postIds (Swipe durch alle)
    const isDigest = n?.payload?.type === "DAILY_DIGEST";
    const digestPostIds = Array.isArray(n?.payload?.postIds) ? n.payload.postIds : [];

    const id =
      isDigest && digestPostIds.length
        ? digestPostIds[0]
        : n?.post?.id;

    if (!id) return;

    markReadOptimistic(n);

    const thumb = n.post?.thumbUrl || n.post?.imageUrl || null;
    const video = n.post?.videoUrl || null;

    const postIds = isDigest && digestPostIds.length ? digestPostIds : [id];
    const startIndex = 0;


    if (notifKind(n) === "POST_SHARE_REQUEST") {
      nav.navigate("PostDetail", {
        id,
        imageUrl: thumb,
        videoUrl: video,
        postIds,
        startIndex,
        fromActivity: true,
        requestedBy: n.fromUser
          ? { id: n.fromUser.id, username: n.fromUser.username, avatarUrl: n.fromUser.avatarUrl }
          : undefined,
      });
      return;
    }

    nav.navigate("PostDetail", { id, postIds, startIndex });
  },
  [nav, markReadOptimistic]
);


const openStoryFromRow = useCallback((n: any) => {
  // hier brauchst du deine Navigation zur StoryViewer
  // ich nehme an payload enthält storyId + author
  const storyId = n?.payload?.storyId ?? n?.payload?.id ?? n?.payload?.story?.id ?? null;
  const u = n?.fromUser;

  if (!u?.id) return;

  // mark read (optional)
  markReadOptimistic(n);

  nav.navigate("StoryViewer", {
    user: { id: u.id, username: u.username, avatar: u.avatarThumbUrl ?? u.avatarUrl ?? null },
    slides: [],              // leer -> StoryViewer lädt via fetchFromFeed
    mine: false,
    fetchFromFeed: true,
    storyId,                 // optional jump
    onlyUnread: true,
  });
}, [nav, markReadOptimistic]);

const onBundlePress = useCallback((bundle: any) => {
  if (bundleKind(bundle) === "STORY_POSTED") {
    openStoryPicker(bundle);
    return;
  }

  if (bundleKind(bundle) === "LIKE") {
    const pid = bundle.post?.id;
    if (pid) nav.navigate("PostDetail", { id: pid, postIds: [pid], startIndex: 0, fromActivity: true });
    return;
  }

}, [openStoryPicker, items, goPost]);



  const onAcceptPostTag = useCallback(
    async (n: any) => {
      if (!meId || !n.post?.id) return;

      setHandling((m) => ({ ...m, [n.id]: "ACCEPTED" }));
      setRowStatusInCache(n.id, "ACCEPTED");

      try {
        await approvePostTag({ variables: { postId: n.post.id, userId: meId } });
        await markOneRead({ variables: { id: n.id } }).catch(() => {});
        await client.refetchQueries({ include: ["TaggedPostsForMe", "ProfileGrid"] });
        await refetch({ offset: 0, limit: 30 });
      } catch {
        setHandling((m) => {
          const next = { ...m };
          delete next[n.id];
          return next;
        });
      }
    },
    [approvePostTag, client, markOneRead, meId, refetch, setRowStatusInCache]
  );

  const onRejectPostTag = useCallback(
    async (n: any) => {
      if (!meId || !n.post?.id) return;

      setHandling((m) => ({ ...m, [n.id]: "REJECTED" }));
      setRowStatusInCache(n.id, "REJECTED");

      try {
        await rejectPostTag({ variables: { postId: n.post.id, userId: meId } });
        await markOneRead({ variables: { id: n.id } }).catch(() => {});
        await client.refetchQueries({ include: ["TaggedPostsForMe", "ProfileGrid"] });
        await refetch({ offset: 0, limit: 30 });
      } catch {
        setHandling((m) => {
          const next = { ...m };
          delete next[n.id];
          return next;
        });
      }
    },
    [rejectPostTag, client, markOneRead, meId, refetch, setRowStatusInCache]
  );


  const onAcceptFollow = useCallback(
    async (n: any) => {
      if (!n?.fromUser?.id) return;
      await acceptFollowRequest({ variables: { userId: n.fromUser.id } });
      await markOneRead({ variables: { id: n.id } }).catch(() => {});
      await refetch({ offset: 0, limit: 30 });
    },
    [acceptFollowRequest, markOneRead, refetch]
  );

  const onRejectFollow = useCallback(
    async (n: any) => {
      const requesterId = n?.fromUser?.id;
      if (!requesterId) return;
      await rejectFollowRequest({ variables: { userId: requesterId } });
      await markOneRead({ variables: { id: n.id } }).catch(() => {});
      await refetch({ offset: 0, limit: 30 });
    },
    [rejectFollowRequest, markOneRead, refetch]
  );

  const buildTitle = useCallback((n: any) => {
    const user = n.fromUser;
    const username = user?.username ?? t("activity.someone");
    const payloadType = n?.payload?.type;

    const isPostShareRequest =
    notifKind(n) === "POST_SHARE_REQUEST" && payloadType !== "POST_TAG_REQUEST";

    if (notifKind(n) === "STORY_POSTED") {
      return t("activity.title.storyPosted", { username });
    }
    if (notifKind(n) === "STORY_MENTION") {
      return t("activity.title.storyMention", { username });
    }

    if (notifKind(n) === "VLOG_NEW_POST") {
      const vlogTitle = n?.vlog?.title;
      return vlogTitle
        ? t("activity.title.vlogNewPostWithTitle", { title: vlogTitle })
        : (typeof n?.payload?.text === "string"
            ? n.payload.text
            : t("activity.title.vlogNewPost"));
    }

    return (
      notifKind(n) === "FOLLOW"
        ? t("activity.title.followedYou", { username })
        : payloadType === "POST_TAG_REQUEST"
        ? t("activity.title.postTagRequest", { username })
        : isPostShareRequest
        ? t("activity.title.postShareRequest", { username })
        : notifKind(n) === "POST_SHARE_APPROVED"
        ? t("activity.title.requestAccepted", { username })
        : notifKind(n) === "POST_SHARE_REJECTED"
        ? t("activity.title.requestRejected", { username })
        : notifKind(n) === "VLOG_TAG_REQUEST"
        ? t("activity.title.vlogTagRequest", { title: n?.vlog?.title ?? t("activity.vlog") })
        : notifKind(n) === "VLOG_TAG_APPROVED"
        ? t("activity.title.vlogRequestAccepted", { title: n?.vlog?.title ?? t("activity.vlog") })
        : notifKind(n) === "VLOG_TAG_REJECTED"
        ? t("activity.title.vlogRequestRejected", { title: n?.vlog?.title ?? t("activity.vlog") })
        : notifKind(n) === "VLOG_DELETED"
        ? t("activity.title.vlogDeleted")
        : payloadType === "POST_TAG_APPROVED"
        ? t("activity.title.tagAccepted")
        : payloadType === "POST_TAG_REJECTED"
        ? t("activity.title.tagRejected")
        : notifKind(n) === "LIKE"
        ? t("activity.title.likedYourPost", { username })
        : notifKind(n) === "COMMENT"
        ? t("activity.title.commented", { username })
        : notifKind(n) === "FOLLOW_REQUEST"
        ? t("activity.title.followRequest", { username })
        : notifKind(n) === "FOLLOW_REQUEST_ACCEPTED"
        ? t("activity.title.requestAccepted", { username })
        : notifKind(n) === "SYSTEM" || payloadType === "DAILY_DIGEST"
        ? t("activity.title.highlights")
        : n.payload?.text ?? t("activity.title.activity")
    );
  }, [t]);


 


const buildBundleTitle = useCallback((b: any) => {
  if (bundleKind(b) === "STORY_POSTED") return `${formatActors(b.actors)} ...`;
  if (bundleKind(b) === "LIKE") return t("activity.bundle.likedYourPost", { actors: formatActors(b.actors) });
  return t("activity.bundleFallbackTitle");
}, [t]);

  const markBundleRead = useCallback(
  (ids: string[]) => {
    if (!ids?.length) return;

    for (const id of ids) {
      const cacheId = client.cache.identify({ __typename: "Notification", id });
      if (!cacheId) continue;

      client.cache.writeFragment({
        id: cacheId,
        fragment: NOTIF_READ_FRAGMENT,
        data: { __typename: "Notification", id, isRead: true },
      });
    }

    markManyIdsRead({
      variables: { ids },
      optimisticResponse: { markNotificationsRead: true },
    }).catch(() => {});
  },
  [client, markManyIdsRead]
);




  const onAvatarPress = useCallback(
    (n: any) => {
      const user = n.fromUser;
      if (!user?.username) return;
      markReadOptimistic(n);
      nav.navigate("UserProfile", { username: user.username });
    },
    [markReadOptimistic, nav]
  );


  const goFromRow = useCallback(
    (n: any) => {
      if (notifKind(n) === "VLOG_NEW_POST") {
        const slug = n?.vlog?.slug;
        //TODO: slug is null - we have to make sure slug != null , console.log(n.slug)
        if (slug) {
          markReadOptimistic(n);
          nav.navigate("VlogDetail", { slug, id: n?.vlog?.id, fromActivity: true });
        }
        markReadOptimistic(n);
        return;
      }
      if (notifKind(n) === "STORY_MENTION" || notifKind(n) === "STORY_POSTED") {
        const storyId = n?.payload?.storyId;
        const author = n?.payload?.author;
        if (storyId && author?.id) {
          markReadOptimistic(n);
          nav.navigate("StoryViewer", {
            user: {
              id: author.id,
              username: author.username ?? n?.fromUser?.username ?? "User",
              avatar: author.avatarUrl ?? n?.fromUser?.avatarUrl ?? null,
            },
            slides: [],
            startIndex: 0,
            storyId,
            fetchFromFeed: true,
          });
          return;
        }
      }
      
      // ✅ Daily Digest / System: PostDetail mit postIds (swipe)
      if (notifKind(n) === "SYSTEM" || n?.payload?.type === "DAILY_DIGEST") {
        const postIds = Array.isArray(n?.payload?.postIds) ? n.payload.postIds : null;
        if (postIds?.length) {
          nav.navigate("PostDetail", { id: postIds[0], postIds, startIndex: 0, fromActivity: true });
          return;
        }
      }

      if (n?.post?.id) goPost(n);
      else onAvatarPress(n);
    },
    [goPost, onAvatarPress, nav]
  );



  const sections = useMemo(() => {
    
    const unread: any[] = [];
    const buckets: Record<string, any[]> = {
      [t("activity.bucket.today")]: [],
      [t("activity.bucket.yesterday")]: [],
      [t("activity.bucket.last7Days")]: [],
      [t("activity.bucket.older")]: [],
    };


    const getCreatedAt = (it: any) =>
      it.__typename === "ActivityBundle" ? it.latestAt : it.createdAt;

    const getIsRead = (it: any) =>
      it.__typename === "ActivityBundle" ? !!it.isRead : !!it.isRead;


    for (const it of filteredItems) {
      const isRead = edgeIsRead(it);
      if (!isRead) unread.push(it);

      const label = dayBucketLabel(
        isBundle(it) ? it.latestAt : it.createdAt
      );
      (buckets[label] ?? buckets[t("activity.bucket.older")]).push(it);
    }

    const out: Array<{ title: string; data: any[] }> = [];
    if (filter === "ALL" && unread.length > 0){
      out.push({ title: t("activity.section.newCount", { count: unread.length }), data: unread });
    }
    out.push(
      { title: t("activity.bucket.today"), data: buckets[t("activity.bucket.today")] },
      { title: t("activity.bucket.yesterday"), data: buckets[t("activity.bucket.yesterday")] },
      { title: t("activity.bucket.last7Days"), data: buckets[t("activity.bucket.last7Days")] },
      { title: t("activity.bucket.older"), data: buckets[t("activity.bucket.older")] }
    );

    return out.filter((sec) => sec.data.length > 0);
  }, [filteredItems, filter]);


  const renderItem = useCallback(
    ({ item }: { item: any }) => {

      if (item.__typename === "ActivityBundle") {
        const b = item;


        const actorText = formatActors(b.actors);
          const title =
            bundleKind(b) === "STORY_POSTED"
              ? t("activity.bundle.storyPosted", { actors: actorText, verb: (b.actors?.length === 1 ? t("activity.verb.has") : t("activity.verb.have")) })
              : bundleKind(b) === "LIKE"
              ? t("activity.bundle.likedYourPost", { actors: actorText })
              : t("activity.title.activity");


        const anyUnread = !b.isRead;
        const badgeBg = bundleKind(b) === "LIKE" ? "#ef4444" : "rgba(255,255,255,0.16)";
        const icon = bundleKind(b) === "LIKE"
          ? <Ionicons name="heart" size={14} color="#fff" />
          : <Ionicons name="play" size={14} color="#fff" />;

        const thumbUri = null; // wenn server liefert
        // fallback wenn du KEIN thumbUrl im bundle hast:
        // const thumbUri = null;

        const onPressBundle = () => {
          markBundleRead(b.ids);

          if (bundleKind(b) === "LIKE") {
            const pid = b.post?.id;
            if (pid) nav.navigate("PostDetail", { id: pid, postIds: [pid], startIndex: 0, fromActivity: true });
            return;
          }

          if (bundleKind(b) === "STORY_POSTED") {
            // wenn server bundle storyIds liefert -> direkt picker
            openStoryPicker(b); // nur wenn du ids->notifications noch hast
            return;
          }
        };

        const unreadBadgeCount = !b.isRead ? 1 : 0;
        return (
          <TouchableOpacity activeOpacity={0.92} onPress={onPressBundle} style={[s.row, anyUnread && s.rowUnread]}>
            <View style={{ marginRight: 12 }}>
              <BundleAvatar actors={b.actors} size={52} bgColor={COLORS.bg} badgeBg={badgeBg} badgeIcon={icon} />
            </View>

            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={s.title} numberOfLines={2}>{title}</Text>
              <View style={s.metaRow}>
                <Text style={s.time}>{timeAgo(b.latestAt)}</Text>
                {anyUnread && <View style={s.dot} />}
                {unreadBadgeCount ? (
                  <Text style={[s.time, { fontWeight: "900" }]}>({unreadBadgeCount})</Text>
                ) : null}
              </View>
            </View>

            {thumbUri ? <ExpoImage source={{ uri: thumbUri, cacheKey: String(thumbUri).split("?")[0] }} style={s.thumb} contentFit="cover" cachePolicy="disk" /> : null}
          </TouchableOpacity>
        );
      }


     

       
      const n = item;

    // ---------------- SINGLE (dein bisheriger Code) ----------------

      const digestCount = typeof n?.payload?.count === "number" ? n.payload.count : null;
      const digestText = typeof n?.payload?.text === "string" ? n.payload.text : null;








const payloadType = n?.payload?.type;
const isDigest = n?.kind === "SYSTEM" || payloadType === "DAILY_DIGEST";

const digestAvatar =
  (n?.post?.thumbUrl || n?.post?.imageUrl || null); // wenn du bei digest ein post mitsendest

const avatarUri =
  (n?.fromUser?.avatarThumbUrl || n?.fromUser?.avatarUrl) ||
  (isDigest ? digestAvatar : null) ||
  null;



const title = buildTitle(n);
const { badgeBg, icon } = getBadgeForNotification(n, COLORS);

const ringColor = !n.isRead ? "rgba(245,96,64,0.9)" : null;
const thumbUri = n?.post?.thumbUrl || n?.post?.imageUrl || null;









      const isFollowRequest = notifKind(n) === "FOLLOW_REQUEST";
      const followStatus =
        notifKind(n) === "FOLLOW_REQUEST" && payloadType === "FOLLOW_REQUEST" ? n?.payload?.status : undefined;
      const followHandled = followStatus && followStatus !== "PENDING";

      const postReq = isPostTagRequest(n);
      

      const local = handling[n.id];
      const status: ReqStatus = local ?? getReqStatus(n);
      const handled = status !== "PENDING";

      const requestBadge =
        (postReq && status === "PENDING") ||
        (isFollowRequest && (followStatus ?? "PENDING") === "PENDING") ||
        notifKind(n) === "POST_SHARE_REQUEST";

      const isPostShareRequest = notifKind(n) === "POST_SHARE_REQUEST" && payloadType !== "POST_TAG_REQUEST";

      const hasCtas = !!(postReq || isFollowRequest);
      const RowWrapper: any = hasCtas ? View : TouchableOpacity;


      return (
        <RowWrapper
          {...(!hasCtas ? { activeOpacity: 0.92, onPress: () => goFromRow(n) } : {})}
          style={[s.row, !n.isRead && s.rowUnread]}
        >
          <TouchableOpacity onPress={() => onAvatarPress(n)} activeOpacity={0.9} style={{ marginRight: 12 }}>
          
            <ActivityAvatar
              uri={avatarUri}
              size={50}
              bgColor={COLORS.bg}
              ringColor={ringColor}
              badgeBg={badgeBg}
              badgeIcon={icon}
            />

          </TouchableOpacity>

          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={s.title} numberOfLines={2}>
              {title}
            </Text>

            {isDigest && (digestText || digestCount !== null) ? (
              <Text style={s.subTitle} numberOfLines={2}>
                {digestText ?? t("activity.digest.last24hCount", { count: digestCount })}
              </Text>
            ) : null}

            <View style={s.metaRow}>
              <Text style={s.time}>{timeAgo(n.createdAt)}</Text>
              {!n.isRead && <View style={s.dot} />}
              {requestBadge ? <Text style={s.reqMini}>{t("activity.inquiry")}</Text> : null}
              {isDigest && digestCount !== null ? (
                <Text style={s.digestMini}>{digestCount} {t("activity.posts")}</Text>
              ) : null}
            </View>

            {(postReq || isFollowRequest) && (
              <View style={s.ctaRow}>
                {postReq && (
                  <>
                    <TouchableOpacity
                      style={[
                        s.ctaBtn,
                        { backgroundColor: handled ? COLORS.card : "#22c55e", opacity: handled ? 0.6 : 1 },
                      ]}
                      disabled={handled}
                      onPress={() => onAcceptPostTag(n)}
                    >
                      <Text style={handled ? s.ctaTxt : s.ctaTxtDark}>{primaryLabel(status)}</Text>
                    </TouchableOpacity>

                    {!handled && (
                      <TouchableOpacity style={[s.ctaBtn, { backgroundColor: "#ef4444" }]} onPress={() => onRejectPostTag(n)}>
                        <Text style={s.ctaTxtDark}>{t("activity.refuse")}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                

                {isFollowRequest ? (
                  <>
                    <TouchableOpacity
                      style={[
                        s.ctaBtn,
                        { backgroundColor: followHandled ? COLORS.card : "#22c55e", opacity: followHandled ? 0.65 : 1 },
                      ]}
                      disabled={followHandled}
                      onPress={() => onAcceptFollow(n)}
                    >
                      <Text style={followHandled ? s.ctaTxt : s.ctaTxtDark}>
                        {followHandled
                          ? (followStatus === "ACCEPTED"
                              ? t("activity.status.confirmed")
                              : t("activity.status.rejected"))
                          : t("activity.action.confirm")}
                      </Text>

                    </TouchableOpacity>

                    {!followHandled && (
                      <TouchableOpacity style={[s.ctaBtn, { backgroundColor: "#ef4444" }]} onPress={() => onRejectFollow(n)}>
                        <Text style={s.ctaTxtDark}>{t("activity.refuse")}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : null}
              </View>
            )}
          </View>

          {thumbUri ? (
            <TouchableOpacity onPress={() => goPost(n)} activeOpacity={0.9}>
              <ExpoImage source={{ uri: thumbUri, cacheKey: String(thumbUri).split("?")[0] }} style={s.thumb} contentFit="cover" cachePolicy="disk" />
              {isPostShareRequest && (
                <View style={s.thumbBadge}>
                  <Ionicons name="share-social" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ) : null}
        </RowWrapper>
      );
    },
    [
      COLORS,
      s,
      buildTitle,
      goFromRow,
      goPost,
      onAvatarPress,
      onAcceptPostTag,
      onRejectPostTag,
      onAcceptFollow,
      onRejectFollow,

      handling,
      getReqStatus,
      primaryLabel,
      isPostTagRequest,

      openStoryPicker
    ]
  );

  const keyExtractor = useCallback((x: any) => x.id, []);



  const onEndReached = useCallback(() => {
    const c = data?.activity?.nextCursor;
    if (!c) return;
    fetchMore({ variables: { offset: items.length, limit: 30 } });
  }, [data?.activity?.nextCursor, fetchMore, items.length]);

  return (
    <Screen scroll={false}>
      <View style={s.container}>
        {/* HEADER fixed */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <Text style={s.hTitle}>{t("activity.activity")}</Text>

          <TouchableOpacity onPress={() => nav.navigate("NotificationSettings" as any)} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="settings-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* ✅ FILTER BAR fixed */}
        <View style={s.filtersBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filtersLeft}
            style={s.filtersScroll}
          >
            <TouchableOpacity
              onPress={() => setFilter("ALL")}
              style={[s.chip, filter === "ALL" && s.chipActive]}
              activeOpacity={0.9}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[s.chipTxt, filter === "ALL" && s.chipTxtActive]}>
                {t("activity.filter.all")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilter("NEW")}
              style={[s.chip, filter === "NEW" && s.chipActive]}
              activeOpacity={0.9}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[s.chipTxt, filter === "NEW" && s.chipTxtActive]}>
                {t("activity.filter.new")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilter("REQUESTS")}
              style={[s.chip, filter === "REQUESTS" && s.chipActive]}
              activeOpacity={0.9}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={[s.chipTxt, filter === "REQUESTS" && s.chipTxtActive]}>
                {t("activity.inquiries")}
              </Text>
            </TouchableOpacity>
          </ScrollView>


          <TouchableOpacity onPress={markAllRead} style={s.readAllChip} activeOpacity={0.9}>
            <Ionicons name="checkmark-done" size={16} color={COLORS.text} />
            <Text style={s.readAllChipTxt}>{t("activity.everyoneReads")}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.sepFull} />

        {/* LIST scrollt darunter */}
        <SectionList<any, ActivitySection>
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => {
            const isNew = String(section.title).startsWith("Neu");
            return (
              <View style={[s.sectionHeader, isNew && s.sectionHeaderNew]}>
                <Text style={[s.sectionTitle, isNew && s.sectionTitleNew]}>{section.title}</Text>
                {isNew ? <Text style={s.sectionHint}>{t("activity.tapOnEntriesToOpenThem")}</Text> : null}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          onEndReachedThreshold={0.6}
          onEndReached={onEndReached}
          refreshControl={<RefreshControl tintColor={COLORS.text} refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={{ padding: 24 }}>
              <Text style={{ color: COLORS.subtext }}>
                {loading ? t("activity.loading") : t("activity.empty")}
              </Text>
            </View>
          }
          contentContainerStyle={s.listContent}
          initialNumToRender={14}
          windowSize={7}
          removeClippedSubviews
          stickySectionHeadersEnabled={false}
        />
        <Modal transparent visible={storyPickOpen} animationType="fade" onRequestClose={closeStoryPicker}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeStoryPicker}
            style={{ flex: 1, backgroundColor: COLORS.backdrop ?? "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
          />

          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: 14,
              maxHeight: "60%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{t("activity.selectStory")}</Text>
              <TouchableOpacity onPress={closeStoryPicker} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {storyPickItems.map((entry: any) => {
              const u = entry.actor;
              const uri = u?.avatarThumbUrl || u?.avatarUrl || avatarPlaceholder;

              return (
                <TouchableOpacity
                  key={entry.storyId ?? u?.id}
                  activeOpacity={0.9}
                  onPress={() => {
                    closeStoryPicker();
                    if (!u?.id) return;

                    nav.navigate("StoryViewer", {
                      user: { id: u.id, username: u.username, avatar: u.avatarThumbUrl ?? u.avatarUrl ?? null },
                      slides: [],
                      mine: false,
                      fetchFromFeed: true,
                      onlyUnread: true,
                    });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    gap: 10,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: COLORS.border,
                  }}
                >
                  <ExpoImage source={{ uri, cacheKey: String(uri).split("?")[0] }} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.card }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      @{u?.username ?? t("activity.userFallback")}
                    </Text>

                    <Text style={{ color: COLORS.subtext, fontWeight: "700", marginTop: 2 }}>
                      {timeAgo(entry.createdAt)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
                </TouchableOpacity>
              );
            })}
          </View>
        </Modal>

      </View>
    </Screen>
  );
}

/* -------- Styles -------- */
const styles = (COLORS: any) =>
  StyleSheet.create({
    subTitle: {
      marginTop: 6,
      color: COLORS.subtext,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 17,
    },

    digestMini: {
      color: "#a78bfa",
      fontWeight: "900",
      fontSize: 12,
    },

    container: { flex: 1, backgroundColor: COLORS.bg },

    header: {
      paddingHorizontal: 14,
      height: 58,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.bg,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },
    hTitle: { color: COLORS.text, fontWeight: "900", fontSize: 22, letterSpacing: 0 },

    // ✅ fixed filters bar
    filtersBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingLeft: 14,
      paddingRight: 12,
      paddingTop: 2,
      paddingBottom: 12,
      backgroundColor: COLORS.bg,
    },
    filtersScroll: { flex: 1 },
    filtersLeft: { flexDirection: "row", gap: 8, alignItems: "center", paddingRight: 4 },

    chip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      backgroundColor: "transparent",
    },
    chipActive: {
      borderColor: COLORS.text,
      backgroundColor: COLORS.text,
    },
    chipTxt: { color: COLORS.subtext, fontWeight: "900", fontSize: 13 },
    chipTxtActive: { color: COLORS.bg },

    readAllChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      backgroundColor: COLORS.card,
      maxWidth: 132,
    },
    readAllChipTxt: { color: COLORS.text, fontWeight: "900", fontSize: 12 },

    sepFull: { height: 0, backgroundColor: "transparent" },

    sectionHeader: {
      paddingTop: 18,
      paddingBottom: 8,
      paddingHorizontal: 16,
      backgroundColor: COLORS.bg,
    },
    sectionTitle: { color: COLORS.subtext, fontWeight: "900", fontSize: 12, textTransform: "uppercase", letterSpacing: 0 },
    sectionHeaderNew: {
      backgroundColor: COLORS.bg,
      borderTopWidth: 0,
      borderBottomWidth: 0,
      borderColor: "transparent",
    },
    sectionTitleNew: { color: COLORS.text },
    sectionHint: {
      color: COLORS.subtext,
      fontSize: 12,
      marginTop: 4,
      fontWeight: "700",
    },

    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },
    rowUnread: {
      backgroundColor: COLORS.card,
      borderColor: "rgba(96,165,250,0.48)",
    },

    title: { color: COLORS.text, fontWeight: "800", lineHeight: 19, fontSize: 14 },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    time: { color: COLORS.subtext, fontSize: 12, fontWeight: "700" },
    dot: { width: 7, height: 7, backgroundColor: "#60A5FA", borderRadius: 4 },
    reqMini: { color: "#f59e0b", fontWeight: "900", fontSize: 12 },

    thumb: {
      width: 52,
      height: 52,
      borderRadius: 10,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },
    thumbBadge: {
      position: "absolute",
      right: 6,
      bottom: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.55)",
      borderWidth: 2,
      borderColor: COLORS.bg,
    },

    ctaRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
    ctaBtn: {
      minHeight: 34,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    ctaTxtDark: { color: "#000", fontWeight: "900" },
    ctaTxt: { color: COLORS.subtext, fontWeight: "900" },

    sep: {
      height: 0,
      backgroundColor: "transparent",
    },
    listContent: {
      paddingTop: 2,
      paddingBottom: 28,
    },
  });
