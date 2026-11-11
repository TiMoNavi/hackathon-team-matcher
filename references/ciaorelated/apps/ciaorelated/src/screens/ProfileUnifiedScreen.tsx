// apps/ciaorelated/src/screens/ProfileUnifiedScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  useNavigation,
  type NavigationProp,
  CommonActions,
} from "@react-navigation/native";
import { gql, useMutation, useQuery, useApolloClient } from "@apollo/client";
import { LineChart } from "react-native-gifted-charts";

import Screen from "./components/Screen";
import GridTile, { type GridTileItem } from "./components/GridTile";
import FollowButton from "./components/FollowButton";
import ProfileSwitcherModal from "./components/ProfileSwitcherModal";
import AddAccountSheet from "./components/AddAccountSheet";

import { useTheme } from "../theme/ThemeProvider";
import { AuthVault } from "../lib/auth-vault";
import { Auth } from "../lib/auth";
import { apollo } from "../apollo";

import { MY_STORIES_RECENT } from "../graphql/queries/stories";
import { TAGGED_FOR_ME } from "../graphql/queries/profile";

import type { RootStackParamList } from "../../App";

import FollowListSheet, { type FollowListMode } from "./components/FollowListSheet";
import { avatarPlaceholder } from "../../assets/placeholders";
import { AvatarImage } from "./components/AvatarImage";
import { FlashList } from "@shopify/flash-list";

import { useTranslation } from "react-i18next";

/** ---------- Types ---------- */

type Slide = {
  id: string;
  uri: string;
  userId?: string | null;
  thumb?: string | null;
  isVideo?: boolean;
  durationSec?: number | null;
  mime?: string | null;
  editJson?: any | null;
  when?: string;
};

export type StoryViewerParams = {
  user: { username: string; avatar: string };
  slides: Slide[];
  startIndex?: number;
  mine?: boolean;
};

export type PostDetailParams = {
  id: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  username: string;
  avatar: string;
  dateLabel?: string;
  caption?: string;
  likes?: number;
  location?: string;
  authorId?: string;
  isLiked?: boolean;
  isMine?: boolean;
  postIds?: string[];
  startIndex?: number;
  fromProfile?: boolean;
};

export type ProfileStackParamList = {
  PostDetail: PostDetailParams;
  StoryViewer: StoryViewerParams;
  EditProfile: undefined;
  Settings: undefined;
};
type Profile = { id: string; username: string; avatarUrl?: string | null; avatarThumbUrl?: string | null; isPrimary?: boolean };

type MyProfilesQuery = {
  myProfiles: Profile[];
};

type VaultSession = Awaited<ReturnType<typeof AuthVault.all>>[number];

const norm = (s?: string | null) => (s ?? "").trim();
const identityKey = (s: VaultSession) => `${norm(s.accountId)}::${norm(s.profileId)}`;
const compactCount = (n: number) => {
  const value = Number.isFinite(n) ? Math.max(0, n) : 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(".0", "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(".0", "")}K`;
  return String(value);
};
const compactViewCount = (n: number, language?: string) => {
  const value = Number.isFinite(n) ? Math.max(0, n) : 0;
  const isGerman = (language ?? "").toLowerCase().startsWith("de");
  if (value >= 1_000_000) {
    const short = (value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(".0", "");
    return isGerman ? `${short} Mio.` : `${short}M`;
  }
  if (value >= 1_000) {
    const short = (value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(".0", "");
    return isGerman ? `${short} Tsd.` : `${short}K`;
  }
  return String(value);
};
const compactDateLabel = (date: Date) => `${date.getDate()}.${date.getMonth() + 1}.`;
const compactDateKeyLabel = (dateKey?: string | null) => {
  const [year, month, day] = String(dateKey ?? "").split("-").map((part) => Number(part));
  if (!year || !month || !day) return "";
  return `${day}.${month}.`;
};

/** ---------- Layout ---------- */
const COLS = 3;
const GAP = 1;
const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;
const SIZE = (SCREEN_W - GAP * (COLS - 1)) / COLS;

/** ---------- GraphQL ---------- */

const ME_QUERY = gql`
  query Me {
    me {
      id
      username
      avatarThumbUrl
      avatarUrl
      name
      bio
      postCount
      reelCount
      connectionCount
      totalLikeCount
      followerCount
      followingCount
      __typename
    }
  }
`;

const USER_QUERY = gql`
  query UserByUsername($username: String!) {
    userByUsername(username: $username) {
      id
      username
      name
      bio
      avatarThumbUrl
      avatarUrl
      postCount
      reelCount
      connectionCount
      totalLikeCount
      followerCount
      followingCount
      isMe
      isPrivate
      isFollowing
      followRequested
      sharedCommunities(limit: 6) {
        id
        title
        type
        slug
        memberCount
      }
      __typename
    }
  }
`;

const USER_BY_ID_QUERY = gql`
  query UserById($id: ID!) {
    userById(id: $id) {
      id
      username
      name
      bio
      avatarThumbUrl
      avatarUrl
      postCount
      reelCount
      connectionCount
      totalLikeCount
      followerCount
      followingCount
      isMe
      isPrivate
      isFollowing
      followRequested
      sharedCommunities(limit: 6) {
        id
        title
        type
        slug
        memberCount
      }
      __typename
    }
  }
`;


const MY_PROFILES = gql`
  query MyProfiles {
    myProfiles {
      id
      username
      avatarThumbUrl
      avatarUrl
      isPrimary
    }
  }
`;

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
      viewCount
      createdAt
      isCarousel
      hasAcceptedVlog
      taggedVlogs {
        id
      }
      author {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
      __typename
    }
  }
`;

const MY_PROFESSIONAL_DASHBOARD = gql`
  query MyProfessionalDashboard($days: Int = 30) {
    myProfessionalDashboard(days: $days) {
      totalViews
      totalUniqueViews
      views
      previousViews
      reachedProfiles
      series {
        date
        views
        uniqueViews
        interactions
      }
      interactions
      likes
      comments
      newFollowers
    }
  }
`;

const MY_PROFILE_VIEWERS = gql`
  query MyProfileViewers($offset: Int = 0, $limit: Int = 30) {
    myProfileViewers(offset: $offset, limit: $limit) {
      viewedAt
      seen
      viewer {
        id
        username
        name
        avatarThumbUrl
        avatarUrl
      }
    }
  }
`;

const MARK_PROFILE_VIEWERS_SEEN = gql`
  mutation MarkProfileViewersSeen {
    markProfileViewersSeen
  }
`;

const MARK_PROFILE_VIEWED = gql`
  mutation MarkProfileViewed($profileId: ID!) {
    markProfileViewed(profileId: $profileId)
  }
`;

const SWITCH_ACTIVE_PROFILE = gql`
  mutation SwitchActiveProfile($profileId: ID!) {
    switchActiveProfile(profileId: $profileId) {
      id
      username
      avatarUrl
      avatarThumbUrl
      account {
        id
      }
    }
  }
`;

const BLOCK_USER = gql`
  mutation BlockUser($userId: ID!) {
    blockUser(userId: $userId)
  }
`;

const CREATE_THREAD = gql`
  mutation CreateThread($memberUserIds: [ID!]!, $title: String) {
    createThread(memberUserIds: $memberUserIds, title: $title) {
      id
    }
  }
`;

const TAGGED_POSTS = gql`
  query TaggedPosts($userId: ID!, $offset: Int = 0, $limit: Int = 100) {
    taggedPosts(userId: $userId, offset: $offset, limit: $limit) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      isCarousel
      caption
      location
      likeCount
      viewCount
      isLiked
      createdAt
      author {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
      taggedUsers {
        user {
          id
        }
        status
        showOnProfile
      }
      taggedVlogs {
        id
      }
      iShowOnProfile
      __typename
    }
  }
`;
const FOLLOWERS_QUERY = gql`
  query Followers($userId: ID!, $offset: Int = 0, $limit: Int = 50) {
    followers(userId: $userId, offset: $offset, limit: $limit) {
      id
      __typename
    }
  }
`;

const FOLLOWING_QUERY = gql`
  query Following($userId: ID!, $offset: Int = 0, $limit: Int = 50) {
    following(userId: $userId, offset: $offset, limit: $limit) {
      id
      __typename
    }
  }
`;

/** ---------- Helpers ---------- */

function uniqById<T extends { id: string }>(arr: T[]): T[] {
  const m = new Map<string, T>();
  for (const it of arr) if (it?.id) m.set(it.id, it);
  return Array.from(m.values());
}
function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder;
}



export default function ProfileUnifiedScreen({ route, navigation }: any) {
  const { t, i18n } = useTranslation();

  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = styles(COLORS);

  const client = useApolloClient();

  const profileNav = useNavigation<NavigationProp<ProfileStackParamList>>();
  const rootNav = useNavigation<NavigationProp<RootStackParamList>>();

  const usernameParam: string | undefined = route?.params?.username;
  const userIdParam: string | undefined = route?.params?.userId;
  const mode: "me" | "user" = usernameParam || userIdParam ? "user" : "me";

  const [followSheetVisible, setFollowSheetVisible] = useState(false);
  const [followSheetMode, setFollowSheetMode] = useState<FollowListMode>("followers");
  const [profileViewersOpen, setProfileViewersOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardSelectedPoint, setDashboardSelectedPoint] = useState<{ dateLabel: string; value: number } | null>(null);
  const [acknowledgedProfileViewerIds, setAcknowledgedProfileViewerIds] = useState<Set<string>>(() => new Set());




  const openFollowSheet = useCallback((mode: FollowListMode) => {
    setFollowSheetMode(mode);
    setFollowSheetVisible(true);
  }, []);

  /** ---------- Tabs ---------- */
  const [tab, setTab] = useState<"posts" | "vlogs" | "reels" | "tagged">("posts");
  const serverTab = tab === "reels" ? "vlogs" : tab;

  /** ---------- Data: Me + User ---------- */
  const { data: meQ } = useQuery(ME_QUERY, { fetchPolicy: "cache-first", nextFetchPolicy: "cache-first" });
  const { data: dashboardQ, refetch: refetchDashboard } = useQuery(MY_PROFESSIONAL_DASHBOARD, {
    variables: { days: 30 },
    skip: mode !== "me",
    fetchPolicy: "network-only",
    nextFetchPolicy: "network-only",
  });
  const { data: profileViewersQ, refetch: refetchProfileViewers } = useQuery(MY_PROFILE_VIEWERS, {
    variables: { offset: 0, limit: 30 },
    skip: mode !== "me",
    fetchPolicy: "cache-and-network",
  });
  const [markProfileViewed] = useMutation(MARK_PROFILE_VIEWED);
  const [markProfileViewersSeen] = useMutation(MARK_PROFILE_VIEWERS_SEEN);
  const myId: string | null = meQ?.me?.id ?? null;

  const { data: meData, loading: meLoading, refetch: meRefetch } = useQuery(ME_QUERY, {
    skip: mode !== "me",
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-first",
    errorPolicy: "all",
  });

  const { data: userData, loading: userLoading, error: userError, refetch: userRefetch } = useQuery(USER_QUERY, {
    variables: { username: usernameParam as string },
    skip: mode !== "user" || !usernameParam,
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: userByIdData,
    loading: userByIdLoading,
    error: userByIdError,
    refetch: userByIdRefetch,
  } = useQuery(USER_BY_ID_QUERY, {
    variables: { id: userIdParam as string },
    skip: mode !== "user" || !!usernameParam || !userIdParam,
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
  });

  const user = mode === "me" ? meData?.me : (userData?.userByUsername ?? userByIdData?.userById);
  const userId: string | undefined = user?.id;
  const activeUserError = usernameParam ? userError : userByIdError;
  const activeUserLoading = usernameParam ? userLoading : userByIdLoading;
  const activeUserRefetch = usernameParam ? userRefetch : userByIdRefetch;



  const lastUserIdRef = useRef<string | null>(null);




  const avatarStableRef = useRef<string | null>(null);

  const nextAvatarThumbUri = (user?.avatarThumbUrl ?? "").trim();
  const nextAvatarFullUri = (user?.avatarUrl ?? "").trim();
  const [avatarThumbFailed, setAvatarThumbFailed] = useState(false);
  const nextAvatarUri = avatarThumbFailed
    ? (nextAvatarFullUri || nextAvatarThumbUri)
    : (nextAvatarThumbUri || nextAvatarFullUri);


  // ✅ Reset wenn anderer User / anderes Profil
  useEffect(() => {
    const uid = userId ?? null;
    if (lastUserIdRef.current !== uid) {
      lastUserIdRef.current = uid;
      avatarStableRef.current = null;
    }
  }, [userId]);



  useEffect(() => {
  if (nextAvatarUri) avatarStableRef.current = nextAvatarUri;
}, [nextAvatarUri]);

  useEffect(() => {
    setAvatarThumbFailed(false);
  }, [userId, nextAvatarThumbUri, nextAvatarFullUri]);


  // ✅ Wenn leer (kurzer Moment nach Switch/Loading) → letzte brauchbare behalten
  const stableAvatarUri = avatarStableRef.current ?? (nextAvatarUri || null);
  const avatarSrc = stableAvatarUri ? { uri: stableAvatarUri } : avatarPlaceholder;




  
  


  const isMe = mode === "me" ? true : (!!myId && !!userId && myId === userId) || !!user?.isMe;
  const profileViewers = useMemo(
    () => (Array.isArray(profileViewersQ?.myProfileViewers) ? profileViewersQ.myProfileViewers : []),
    [profileViewersQ?.myProfileViewers]
  );
  const unseenProfileViewers = useMemo(
    () =>
      profileViewers.filter((row: any) => {
        const viewerKey = row?.viewer?.id && row?.viewedAt ? `${row.viewer.id}:${row.viewedAt}` : null;
        return row && row.seen === false && viewerKey && !acknowledgedProfileViewerIds.has(viewerKey);
      }),
    [acknowledgedProfileViewerIds, profileViewers]
  );
  const latestProfileViewer = unseenProfileViewers[0]?.viewer ?? null;
  const unseenProfileViewerCount = unseenProfileViewers.length;

  const openProfileViewers = useCallback(() => {
    refetchProfileViewers?.();
    setProfileViewersOpen(true);
    const ids = profileViewers
      .filter((row: any) => row?.seen === false && row?.viewer?.id)
      .map((row: any) => `${row.viewer.id}:${row.viewedAt}`);
    if (ids.length) {
      setAcknowledgedProfileViewerIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id: string) => next.add(id));
        return next;
      });
    }
    markProfileViewersSeen().catch(() => {});
  }, [markProfileViewersSeen, profileViewers, refetchProfileViewers]);

  useEffect(() => {
    if (!userId || isMe) return;
    markProfileViewed({ variables: { profileId: userId } }).catch(() => {});
  }, [isMe, markProfileViewed, userId]);

  const isPrivate = !!user?.isPrivate;
  const isFollowing = !!user?.isFollowing;
  const locked = !isMe && isPrivate && !isFollowing;
  const gridLocked = locked && tab !== "posts";
  const sharedCommunities = useMemo(
    () => (!isMe && Array.isArray(user?.sharedCommunities) ? user.sharedCommunities : []),
    [isMe, user?.sharedCommunities]
  );
  const {
    data: followersQ,
    refetch: refetchFollowers,
  } = useQuery(FOLLOWERS_QUERY, {
    variables: { userId, offset: 0, limit: 100 },
    skip: !userId || locked,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: followingQ,
    refetch: refetchFollowing,
  } = useQuery(FOLLOWING_QUERY, {
    variables: { userId, offset: 0, limit: 100 },
    skip: !userId || locked,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const followerCount =
    (followersQ?.followers?.length ?? null) ?? (user?.followerCount ?? 0);

  const followingCount =
    (followingQ?.following?.length ?? null) ?? (user?.followingCount ?? 0);


  /** ---------- Grid ---------- */
  const { data: gridQ, loading: gridLoading, fetchMore, refetch } = useQuery(PROFILE_GRID, {
    variables: { userId, tab: serverTab, offset: 0, limit: 100 },
    skip: !userId || gridLocked,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-and-network",
  });

  const base: any[] = Array.isArray(gridQ?.profileGrid) ? gridQ!.profileGrid : [];
  useEffect(() => {
  const first = base?.[0];
  if (!first) return;
 
}, [base?.[0]?.thumbUrl, base?.[0]?.imageUrl, base?.[0]?.videoUrl]);

  useFocusEffect(
    useCallback(() => {
      if (!userId || gridLocked) return;
      refetch({ userId, tab: serverTab, offset: 0, limit: 100 });
    }, [userId, gridLocked, serverTab, refetch])
  );

 


     /** ---------- Tagged (me vs other) ---------- */
  const needsTaggedQuery =
  tab === "tagged" || (!isMe && tab === "posts"); 


  const onEndReached = useCallback(() => {
    if (!userId || (base?.length ?? 0) < 24) return;
    if (tab === "tagged") return;

    const offset = base.length;
    fetchMore({
      variables: { userId, tab: serverTab, offset, limit: 100 },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          ...prev,
          profileGrid: [...(prev.profileGrid ?? []), ...(fetchMoreResult.profileGrid ?? [])],
        };
      },
    });
  }, [userId, tab, serverTab, base?.length, fetchMore]);


  // a) Ich: TAGGED_FOR_ME wie ProfileScreen
  const { data: taggedMineQ, refetch: refetchTaggedMine } = useQuery(TAGGED_FOR_ME, {
    variables: { limit: 100 },
    skip: !isMe|| !needsTaggedQuery,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const taggedMineRaw: any[] = Array.isArray(taggedMineQ?.me?.tagged) ? taggedMineQ!.me!.tagged : [];

  const taggedMineVisible = useMemo(() => {
  const raw = taggedMineQ?.me?.tagged ?? [];
  return raw.filter((p: any) => {
    const mineTag = (p.taggedUsers ?? []).find((t: any) => t?.user?.id === taggedMineQ?.me?.id);
    return mineTag?.status === "ACCEPTED" ;
  });
}, [taggedMineQ]);


  // b) Andere: TAGGED_POSTS(userId)
  const { data: taggedOtherQ, refetch: refetchTaggedOther } = useQuery(TAGGED_POSTS, {
    variables: { userId: userId as string, offset: 0, limit: 100 },
    skip: !userId || isMe || !needsTaggedQuery|| locked,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const taggedOtherRaw: any[] = Array.isArray(taggedOtherQ?.taggedPosts) ? taggedOtherQ!.taggedPosts : [];

  const taggedOtherNormalized = useMemo(() => {
    return taggedOtherRaw.map((p: any) => ({
      ...p,
      iShowOnProfile: p?.iShowOnProfile ?? false,
      taggedUsers: Array.isArray(p?.taggedUsers) ? p.taggedUsers : [],
      taggedVlogs: Array.isArray(p?.taggedVlogs) ? p.taggedVlogs : [],
    }));
  }, [taggedOtherRaw]);

  // Posts-Tab: bei fremdem Profil dürfen "shared posts" rein, wenn Owner showOnProfile gesetzt hat (oder iShowOnProfile)
  const sharedVisibleForPosts = useMemo(() => {
    if (!userId) return [];
    return taggedOtherNormalized.filter((p: any) => {
      if (p?.iShowOnProfile === true) return true;
      const ownerTag = p.taggedUsers.find((t: any) => t?.user?.id === userId);
      return !!ownerTag?.showOnProfile;
    });
  }, [taggedOtherNormalized, userId]);

  // Tagged-Tab: beim fremden Profil alle ACCEPTED/APPROVED für Owner
  const taggedForTabOther = useMemo(() => {
    if (!userId) return [];
    return taggedOtherNormalized.filter((p: any) => {
        const ownerTag = (p.taggedUsers ?? []).find((t: any) => t?.user?.id === userId);
        return ownerTag?.status === "ACCEPTED";
    });
    }, [taggedOtherNormalized, userId]);


  const refetchTaggedAny = isMe ? refetchTaggedMine : refetchTaggedOther;





  /** ---------- DataForTab ---------- */
  const dataForTab = useMemo(() => {
    if (gridLocked) return [];
    if (tab === "posts") {
      if (locked) return uniqById(base);
      if (isMe) return uniqById(base);
      return uniqById([...base, ...sharedVisibleForPosts]);
    }

    if (tab === "vlogs" || tab === "reels") {
      return uniqById(base);
    }

    if (tab === "tagged") {
      if (isMe) return uniqById(taggedMineVisible as any[]);
      return uniqById(taggedForTabOther as any[]);
    }

    return uniqById(base);
  }, [tab, isMe, locked, gridLocked, base, sharedVisibleForPosts, taggedMineVisible, taggedForTabOther]);

  const tilesForTab = useMemo(
    () =>
      (dataForTab as any[]).map((p: any) => ({
        id: p.id,
        kind: p.kind,
        imageUrl: p.imageUrl ?? null,
        thumbUrl: p.thumbUrl ?? null,
        videoUrl: p.videoUrl ?? null,
        isCarousel: !!p.isCarousel,
        taggedVlogs: Array.isArray(p?.taggedVlogs) ? p.taggedVlogs : [],
        viewCount: p.viewCount ?? 0,
      })),
    [dataForTab]
  );

  
  const dataForTabRef = useRef<any[]>([]);
  useEffect(() => { dataForTabRef.current = dataForTab as any[]; }, [dataForTab]);

  const onPressTile = useCallback((post: GridTileItem) => {
    if (!user) return;
    const list = dataForTabRef.current;
    const allIds = list.map((p) => p.id);
    const startIndex = Math.max(0, allIds.indexOf(post.id));
    const full = list.find((p) => p.id === post.id);

    navigation.push("PostDetail", {
      id: post.id,
      imageUrl: (full?.thumbUrl ?? full?.imageUrl) ?? null,
      videoUrl: full?.videoUrl ?? null,
      username: user.username,
      avatar: (user.avatarThumbUrl ?? user.avatarUrl) ?? "",
      dateLabel: full?.createdAt,
      caption: full?.caption ?? undefined,
      likes: full?.likeCount,
      location: full?.location ?? undefined,
      authorId: full?.author?.id,
      isMine: user.id === full?.author?.id,
      isLiked: full?.isLiked,
      postIds: allIds,
      startIndex,
      fromProfile: true,
    } as any);
  }, [navigation, user]);

  const renderItem = useCallback(({ item, index }: { item: GridTileItem; index: number }) => (
    <GridTile
      item={item}
      index={index}
      size={SIZE}
      cols={COLS}
      gap={GAP}
      onPress={onPressTile}
    />
  ), [onPressTile]);

  const ROW_H = SIZE + GAP;
  const getItemLayout = useCallback((_data: any, index: number) => {
    const row = Math.floor(index / COLS);
    return { length: ROW_H, offset: ROW_H * row, index };
  }, []);



  /** ---------- Refresh ---------- */
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!userId || gridLocked) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refetch({ userId, tab: serverTab, offset: 0, limit: 100 }),
        locked ? Promise.resolve() : refetchTaggedAny?.(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [userId, locked, gridLocked, serverTab, refetch, refetchTaggedAny]);

  

  /** ---------- Me-only: Switcher + Add Sheet ---------- */
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<VaultSession[]>([]);
  const removingRef = useRef<Set<string>>(new Set());
  const lastSwitchedProfileRef = useRef<string | null>(null);

  const { data: profilesQ, refetch: refetchProfiles } = useQuery<MyProfilesQuery>(MY_PROFILES, {
    skip: !isMe,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
    });

    // dedupe OHNE Felder zu verlieren
    const myProfiles = useMemo<Profile[]>(() => {
    const list = profilesQ?.myProfiles ?? [];
    const m = new Map<string, Profile>();
    for (const p of list) if (p?.id) m.set(p.id, p);
    return Array.from(m.values());
    }, [profilesQ?.myProfiles]);

    const activeProfile = useMemo<Profile | null>(() => {
    if (!activeProfileId) return null;
    return myProfiles.find((p) => p.id === activeProfileId) ?? null;
    }, [myProfiles, activeProfileId]);

    const otherProfiles = useMemo<Profile[]>(() => {
    if (!activeProfileId) return myProfiles;
    return myProfiles.filter((p) => p.id !== activeProfileId);
    }, [myProfiles, activeProfileId]);

  const rebuildSessions = useCallback(async () => {
    const [all, active] = await Promise.all([AuthVault.all(), AuthVault.active()]);
    const aKey = active ? identityKey(active) : null;

    const byKey = new Map<string, VaultSession>();
    for (const sess of all) {
      const key = identityKey(sess) || `sid:${(sess as any).sessionId}`;
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, sess);
      else {
        const prevTs = (prev as any).updatedAt ?? (prev as any).createdAt ?? 0;
        const curTs = (sess as any).updatedAt ?? (sess as any).createdAt ?? 0;
        if (curTs >= prevTs) byKey.set(key, sess);
      }
    }

    const deduped = Array.from(byKey.values());
    const filtered = aKey ? deduped.filter((x) => identityKey(x) !== aKey) : deduped;

    setActiveProfileId(active?.profileId ?? null);
    setSessions(filtered);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isMe) return;
      Auth.getProfileId().then(setActiveProfileId);
      rebuildSessions();
    }, [isMe, rebuildSessions])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isMe) return;
      let cancelled = false;
      (async () => {
        try {
          const current = await AuthVault.active();
          if (cancelled) return;

          const pid = current?.profileId ?? null;
          setActiveProfileId(pid);
          if (!pid) return;

          if (lastSwitchedProfileRef.current === pid) return;

          // NOTE: wir triggern switchActiveProfile nur, wenn du das wirklich brauchst
          // (bei dir war das wichtig wegen server-side active profile)
          lastSwitchedProfileRef.current = pid;
        } catch (e) {
          console.warn("[ProfileUnified] focus sync error:", e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [isMe])
  );

  const [switchProfile, { loading: switching }] = useMutation(SWITCH_ACTIVE_PROFILE);

  const openSwitcher = useCallback(async () => {
    if (!isMe) return;
    await rebuildSessions();
    setShowSwitcher(true);
  }, [isMe, rebuildSessions]);




  const activateSession = useCallback(
    async (sessionId: string) => {
      try {
        const current = await AuthVault.active();
        if (current?.sessionId === sessionId) {
          setShowSwitcher(false);
          return;
        }

        await AuthVault.setActive(sessionId);
        try {
          await apollo.resetStore();
        } catch (e) {
          console.warn("activateSession resetStore warning:", e);
          await apollo.clearStore().catch(() => {});
        }
        await Promise.allSettled([meRefetch?.()].filter(Boolean) as Promise<any>[]);
        await rebuildSessions();

        setShowSwitcher(false);
        requestAnimationFrame(() => {
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "AppTabs" as never }] }));
        });
      } catch (e) {
        console.warn("activateSession error", e);
      }
    },
    [navigation, rebuildSessions, meRefetch]
  );

  const removeBySessionId = useCallback(
    async (sessionId: string) => {
      if (removingRef.current.has(sessionId)) return;
      removingRef.current.add(sessionId);
      try {
        const wasActive = (await AuthVault.active())?.sessionId === sessionId;

        await AuthVault.remove(sessionId);

        if (wasActive) {
          const all = await AuthVault.all();
          if (all.length) {
            const next = all.sort(
              (a, b) =>
                ((b as any).updatedAt ?? (b as any).createdAt ?? 0) -
                ((a as any).updatedAt ?? (a as any).createdAt ?? 0)
            )[0];
            await AuthVault.setActive(next.sessionId);
          }
        }

        try {
          await apollo.resetStore();
        } catch (e) {
          console.warn("removeSession resetStore warning:", e);
          await apollo.clearStore().catch(() => {});
        }
        await Promise.allSettled([
          meRefetch?.(),
          refetchProfiles?.(),
          refetchTaggedAny?.(),
        ].filter(Boolean) as Promise<any>[]);
        await rebuildSessions();

        setShowSwitcher(false);

        const activeNow = await AuthVault.active();
        if (!activeNow) {
          navigation.reset({ index: 0, routes: [{ name: "Gate" as never }] });
        }
      } catch (e) {
        console.warn("removeBySessionId error", e);
      } finally {
        removingRef.current.delete(sessionId);
      }
    },
    [navigation, rebuildSessions, meRefetch, refetchProfiles, refetchTaggedAny]
  );

  const activateProfile = useCallback(
    async (profileId: string) => {
      if (switching) return;
      try {
        const { data } = await switchProfile({ variables: { profileId } });
        const u = data?.switchActiveProfile;
        if (!u) return;

        const current = await AuthVault.active();
        if (current) {
          await AuthVault.update(current.sessionId, {
            profileId,
            username: u.username ?? null,
            avatarUrl: u.avatarUrl ?? null,
            avatarThumbUrl: u.avatarThumbUrl ?? null,
            accountId: u.account?.id ?? current.accountId,
          });
        }

        setActiveProfileId(profileId);
        setShowSwitcher(false);

        await apollo.resetStore();
        const meRes = await meRefetch?.();
        const newUserId = meRes?.data?.me?.id ?? u?.id;

        await Promise.all([
          refetchProfiles?.(),
          newUserId ? refetch({ userId: newUserId, tab: serverTab, offset: 0, limit: 100 }) : Promise.resolve(),
        ]);

        await rebuildSessions();
      } catch (e) {
        console.warn("activateProfile error", e);
      }
    },
    [switchProfile, switching, meRefetch, refetchProfiles, refetch, serverTab, rebuildSessions]
  );

  /** ---------- Stories (me-only) ---------- */
  const { data: myStoriesData, refetch: refetchMyStories } = useQuery(MY_STORIES_RECENT, {
    skip: !isMe,
    fetchPolicy: "cache-and-network",
  });

  const recentSlides = (myStoriesData?.myStoriesRecent ?? []).filter((st: any) => {
    const t = new Date(st.createdAt).getTime();
    return Date.now() - t <= 24 * 60 * 60 * 1000;
  });

  const hasActiveStory = recentSlides.length > 0;

  useFocusEffect(
    useCallback(() => {
      if (!isMe) return;
      refetchMyStories?.();
    }, [isMe, refetchMyStories])
  );


  useFocusEffect(
  useCallback(() => {
    if (!userId || locked) return;

    // ✅ Grid + Header (follow/private counts) + Tagged (wenn Tab relevant)
    refetch({ userId, tab: serverTab, offset: 0, limit: 100 }).catch(() => {});
    if (isMe) meRefetch?.().catch(() => {});
    else activeUserRefetch?.().catch(() => {});

    if (needsTaggedQuery) {
      refetchTaggedAny?.().catch(() => {});
    }

    // ✅ My stories bubble (nur bei mir)
    if (isMe) {
      refetchMyStories?.().catch(() => {});
      refetchDashboard?.().catch(() => {});
    }
  }, [
    userId,
    locked,
    serverTab,
    refetch,
    isMe,
    meRefetch,
    activeUserRefetch,
    needsTaggedQuery,
    refetchTaggedAny,
    refetchMyStories,
    refetchDashboard,
  ])
);

  const openMyStory = useCallback(() => {
    if (!user || !isMe) return;
    if (hasActiveStory) {
      // ✅ oldest first, newest last
      const sorted = [...recentSlides].sort(
        (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const slides = sorted.map((st: any) => ({
        id: st.id,
        uri: st.mediaUrl,
        userId: st?.user?.id ?? user?.id ?? null,
        thumb: st.thumbUrl ?? null,
        isVideo: !!st.isVideo,
        durationSec: st.duration ?? null,
        mime: st.mime ?? null,
        editJson: st.editJson ?? null,
        when: st.createdAt,
      }));

      profileNav.navigate("StoryViewer", {
        user: { id: user.id, username: user.username, avatar: (user.avatarThumbUrl ?? user.avatarUrl) ?? "" },
        slides,
        startIndex: 0,
        mine: true,
      } as any);
    } else {
      rootNav.navigate("CreateMedia", { initialMode: "STORY", nonce: Date.now() });
    }
  }, [user, isMe, hasActiveStory, recentSlides, profileNav, rootNav]);

  /** ---------- Other-only: Block ---------- */
  const [doBlockUser] = useMutation(BLOCK_USER);
  const [createThread, { loading: creatingThread }] = useMutation(CREATE_THREAD);

  const confirmBlockUser = useCallback(() => {
    if (!userId || !user?.username) return;
    const uname = user.username;

    Alert.alert(
      t("profileunified.blockUserTitle"),
      t("profileunified.blockUserMessage", { username: uname }),
      [
        { text: t("profileunified.cancel"), style: "cancel" },
        {
          text: t("profileunified.blockAction"),
          style: "destructive",
          onPress: async () => {
            try {
              await doBlockUser({ variables: { userId } });
              Alert.alert(
                t("profileunified.blockedTitle"),
                t("profileunified.blockedMessage", { username: uname })
              );
              navigation.goBack();
            } catch (e: any) {
              Alert.alert(
                t("profileunified.errorTitle"),
                e?.message ?? t("profileunified.actionFailed")
              );
            }
          },
        },
      ]
    );

  }, [doBlockUser, userId, user?.username, navigation]);

  const openMessage = useCallback(async () => {
    if (!userId || creatingThread) return;
    try {
      const res = await createThread({ variables: { memberUserIds: [userId], title: null } });
      const threadId = res.data?.createThread?.id;
      if (threadId) {
        (rootNav as any).navigate("Chat", { threadId, title: user?.username ?? "Chat" });
      }
    } catch (e: any) {
      Alert.alert(t("profileunified.errorTitle"), e?.message ?? t("profileunified.actionFailed"));
    }
  }, [createThread, creatingThread, rootNav, t, user?.username, userId]);


  /** ---------- Loading / Error ---------- */
  if (activeUserError) {
    return (
      <Screen statusBarTranslucent={false}>
        <View style={s.center}>
          <Text style={{ color: "tomato", fontWeight: "700" }}>
            {t("profileunified.errorPrefix")}: {activeUserError.message}
          </Text>
        </View>
      </Screen>
    );
  }

  const headerLoading = mode === "me" ? meLoading : activeUserLoading;
  if (headerLoading && !user) {
    return (
      <Screen statusBarTranslucent={false}>
        <View style={s.center}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen statusBarTranslucent={false}>
        <View style={s.center}>
          <Text style={{ color: COLORS.subtext }}>{t("profileunified.userNotFound")}</Text>
        </View>
      </Screen>
    );
  }

  /** ---------- Render ---------- */
  const currentName = user?.username ?? "…";
  const showingSkeleton = gridLoading && (gridQ?.profileGrid?.length ?? 0) === 0;
  const totalLikes = user?.totalLikeCount ?? 0;
  const dashboard = dashboardQ?.myProfessionalDashboard ?? null;
  const dashboardTotalViews = dashboard?.totalViews ?? 0;
  const dashboardTotalUniqueViews = dashboard?.totalUniqueViews ?? 0;
  const dashboardViews = dashboard?.views ?? 0;
  const dashboardPreviousViews = dashboard?.previousViews ?? 0;
  const dashboardReachedProfiles = dashboard?.reachedProfiles ?? dashboardTotalUniqueViews;
  const dashboardTrend = dashboardViews >= dashboardPreviousViews ? "up" : "down";
  const dashboardTrendColor = dashboardTrend === "up" ? "#22C55E" : "#EF4444";
  const dashboardTrendIcon = dashboardTrend === "up" ? "trending-up-outline" : "trending-down-outline";
  const dashboardRangeEnd = new Date();
  const dashboardRangeStart = new Date(dashboardRangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dashboardRangeStartLabel = compactDateLabel(dashboardRangeStart);
  const dashboardRangeEndLabel = compactDateLabel(dashboardRangeEnd);
  const dashboardViewsLabel = compactViewCount(dashboardViews, i18n.language);
  const dashboardPreviousViewsLabel = compactViewCount(dashboardPreviousViews, i18n.language);
  const dashboardTotalViewsLabel = compactViewCount(dashboardTotalViews, i18n.language);
  const dashboardReachedProfilesLabel = compactViewCount(dashboardReachedProfiles, i18n.language);
  const dashboardInteractionsLabel = compactViewCount(dashboard?.interactions ?? 0, i18n.language);
  const dashboardNewFollowersLabel = compactViewCount(dashboard?.newFollowers ?? 0, i18n.language);
  const profileActionWidth = Math.max(1, (SCREEN_W - 40) / 2);
  const dashboardChartInnerWidth = Math.max(1, SCREEN_W - 124);
  const dashboardSeries = Array.isArray(dashboard?.series) ? dashboard.series : [];
  const dashboardChartSource =
    dashboardSeries.length > 0
      ? dashboardSeries
      : [
          { date: dashboardRangeStartLabel, views: dashboardPreviousViews },
          { date: dashboardRangeEndLabel, views: dashboardViews },
        ];
  const dashboardChartData = dashboardChartSource.map((point: any, index: number) => {
    const isFirst = index === 0;
    const isLast = index === dashboardChartSource.length - 1;
    const isMiddle = index === Math.floor((dashboardChartSource.length - 1) / 2);
    const label = isFirst || isMiddle || isLast ? compactDateKeyLabel(point.date) || String(point.date ?? "") : "";
    const value = Number(point.views ?? 0);
    const dateLabel = compactDateKeyLabel(point.date) || String(point.date ?? "");
    return {
      value,
      label,
      labelComponent: label ? () => <Text style={s.dashboardChartDateLabel}>{label}</Text> : undefined,
      dateLabel,
      onPress: () => setDashboardSelectedPoint({ dateLabel, value }),
    };
  });
  const dashboardChartMax = Math.max(1, Math.ceil(Math.max(...dashboardChartData.map((point: any) => point.value), 0) * 1.25));
  const dashboardChartSpacing =
    dashboardChartData.length > 1
      ? Math.max(4, (dashboardChartInnerWidth - 36) / (dashboardChartData.length - 1))
      : dashboardChartInnerWidth;
  const dashboardCurrentPoint = dashboardSelectedPoint ?? {
    dateLabel: dashboardChartData[dashboardChartData.length - 1]?.dateLabel ?? "",
    value: dashboardChartData[dashboardChartData.length - 1]?.value ?? 0,
  };
  const fullRowFiller = [
    { __type: "filler", id: "__filler_a__" },
    { __type: "filler", id: "__filler_b__" },
  ];
  const profileListData: any[] = [
    { __type: "profileHeader", id: "__profile_header__" },
    ...fullRowFiller,
    { __type: "tabs", id: "__profile_tabs__" },
    { __type: "filler", id: "__tabs_filler_a__" },
    { __type: "filler", id: "__tabs_filler_b__" },
    ...(gridLocked || (locked && !tilesForTab.length && !gridLoading)
      ? [{ __type: "locked", id: "__locked__" }, { __type: "filler", id: "__locked_filler_a__" }, { __type: "filler", id: "__locked_filler_b__" }]
      : showingSkeleton
        ? Array.from({ length: 9 }).map((_, i) => ({ __type: "skeleton", id: `__skeleton_${i}__`, gridIndex: i }))
        : tilesForTab.length === 0
          ? [{ __type: "empty", id: "__empty__" }, { __type: "filler", id: "__empty_filler_a__" }, { __type: "filler", id: "__empty_filler_b__" }]
          : tilesForTab.map((tile, gridIndex) => ({ __type: "tile", id: tile.id, tile, gridIndex }))),
  ];


  return (
    <Screen scroll={false} statusBarTranslucent={false}>
      <View style={s.container}>
        {/* ---------- Header ---------- */}
        {isMe ? (
          <View style={s.header}>
            <TouchableOpacity
              style={s.usernameRow}
              onPress={openSwitcher}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.username} numberOfLines={1} ellipsizeMode="tail">
                {currentName}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.subtext} style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TouchableOpacity
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={openProfileViewers}
              style={s.viewerHeaderButton}
            >
              {latestProfileViewer ? (
                <>
                  <AvatarImage
                    thumb={latestProfileViewer.avatarThumbUrl}
                    full={latestProfileViewer.avatarUrl}
                    style={s.viewerHeaderAvatar}
                    recyclingKey={`profile-viewer-header:${latestProfileViewer.id}`}
                  />
                  {unseenProfileViewerCount > 0 && (
                    <View style={s.viewerHeaderBadge}>
                      <Text style={s.viewerHeaderBadgeText}>
                        {unseenProfileViewerCount > 99 ? "99" : String(unseenProfileViewerCount)}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <Ionicons name="footsteps-outline" size={23} color={COLORS.text} style={{ opacity: 0.92 }} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => profileNav.navigate("Settings")}
              style={s.menuButton}
            >
              <Ionicons name="menu" size={24} color={COLORS.text} style={{ opacity: 0.92 }} />
            </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={s.username} numberOfLines={1}>
                {currentName}
              </Text>
            </View>

            <TouchableOpacity
              onPress={confirmBlockUser}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ padding: 8 }}
            >
              <Ionicons name="ban-outline" size={22} color={COLORS.danger ?? "#ef4444"} />
            </TouchableOpacity>
          </View>
        )}

        <View style={s.gridWrap}>
          <FlashList
            data={profileListData}
            keyExtractor={(i: any) => String(i.id)}
            numColumns={COLS}
            stickyHeaderIndices={[3]}
            estimatedItemSize={SIZE}
            onEndReachedThreshold={0.6}
            onEndReached={onEndReached}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.subtext}
                colors={[COLORS.subtext]}
                progressBackgroundColor={COLORS.bg}
              />
            }
            removeClippedSubviews
            renderItem={({ item, index }: any) => {
              if (item.__type === "filler") return <View style={{ width: SIZE, height: 0 }} />;

              if (item.__type === "profileHeader") {
                return (
                  <View style={{ width: SCREEN_W }}>
                    <View style={s.profileInfo}>
                      <View style={s.profileHero}>
                        {isMe ? (
                          <TouchableOpacity
                            activeOpacity={0.86}
                            onPress={openMyStory}
                            style={[s.avatarAction, hasActiveStory && s.avatarActionActive]}
                          >
                            <Image
                              source={avatarSrc}
                              style={s.avatar}
                              cachePolicy="disk"
                              transition={80}
                              onError={() => {
                                if (nextAvatarThumbUri && nextAvatarFullUri && !avatarThumbFailed) {
                                  avatarStableRef.current = nextAvatarFullUri;
                                  setAvatarThumbFailed(true);
                                }
                              }}
                            />
                            {!hasActiveStory && (
                              <View style={s.avatarPlus}>
                                <Text style={s.avatarPlusText}>＋</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <View style={s.avatarAction}>
                            <Image
                              source={avatarSrc}
                              style={s.avatar}
                              cachePolicy="disk"
                              transition={80}
                              onError={() => {
                                if (nextAvatarThumbUri && nextAvatarFullUri && !avatarThumbFailed) {
                                  avatarStableRef.current = nextAvatarFullUri;
                                  setAvatarThumbFailed(true);
                                }
                              }}
                            />
                          </View>
                        )}
                        <View style={s.profileIntro}>
                          <View style={s.profileNameRow}>
                            <Text style={s.profileName} numberOfLines={1}>
                              {user?.name || user?.username}
                            </Text>
                            {isMe && (
                              <TouchableOpacity
                                activeOpacity={0.75}
                                onPress={() => profileNav.navigate("EditProfile")}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={s.editIconButton}
                              >
                                <Ionicons name="create-outline" size={15} color={COLORS.subtext} />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>

                      <View style={s.stats}>
                        <TouchableOpacity
                          style={s.statBlock}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (locked) {
                              Alert.alert(
                                t("profileunified.privateProfileTitle"),
                                t("profileunified.privateProfileMessage", { username: user.username })
                              );
                              return;
                            }
                            openFollowSheet("following");
                          }}
                        >
                          <Text style={s.statNumber}>{compactCount(followingCount ?? 0)}</Text>
                          <Text style={s.statLabel}>{t("profileunified.following")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.statBlock}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (locked) {
                              Alert.alert(
                                t("profileunified.privateProfileTitle"),
                                t("profileunified.privateProfileMessage", { username: user.username })
                              );
                              return;
                            }
                            openFollowSheet("followers");
                          }}
                        >
                          <Text style={s.statNumber}>{compactCount(followerCount ?? 0)}</Text>
                          <Text style={s.statLabel}>{t("profileunified.followers")}</Text>
                        </TouchableOpacity>
                        <View style={s.statBlock}>
                          <Text style={s.statNumber}>{compactCount(totalLikes)}</Text>
                          <Text style={s.statLabel}>{t("profileunified.likes")}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.75}
                        style={s.connectionsRow}
                        onPress={() => (rootNav as any).navigate("Groups")}
                      >
                        <Ionicons name="link-outline" size={14} color={COLORS.primary} />
                        <Text style={s.connectionsText}>
                          {(user?.connectionCount ?? 0) === 0
                            ? t("profileunified.noGroupConnections")
                            : t("profileunified.groupConnectionsCount", { count: user?.connectionCount ?? 0 })}
                        </Text>
                      </TouchableOpacity>

                      {!!user?.bio && (
                        <Text style={s.profileBio} numberOfLines={5}>
                          {user.bio}
                        </Text>
                      )}
                    </View>

                    {isMe && (
                      <TouchableOpacity
                        activeOpacity={0.82}
                        style={s.dashboardCard}
                        onPress={() => setDashboardOpen(true)}
                      >
                        <View style={s.dashboardMiniHeader}>
                          <View style={s.dashboardMiniIcon}>
                            <Ionicons name="stats-chart-outline" size={17} color={COLORS.text} />
                          </View>
                          <View style={s.dashboardMiniTextBlock}>
                            <Text style={s.dashboardTitle}>{t("profileunified.professionalDashboard")}</Text>
                            <View style={s.dashboardCompactRow}>
                              <Ionicons name={dashboardTrendIcon as any} size={16} color={dashboardTrendColor} />
                              <Text style={s.dashboardCompactText} numberOfLines={1}>
                                {t("profileunified.last30DaysWithViews", { count: dashboardViewsLabel })}
                              </Text>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={COLORS.subtext} />
                        </View>
                      </TouchableOpacity>
                    )}

                    {!isMe && (
                      <View style={s.buttonsRow}>
                        <View style={[s.profileActionSlot, { width: profileActionWidth }]}>
                          <FollowButton
                            userId={user.id}
                            isFollowing={!!user.isFollowing}
                            followRequested={!!user.followRequested}
                            isPrivate={!!user.isPrivate}
                            me={false}
                            buttonStyle={s.profileFollowButton}
                            textStyle={s.profileFollowButtonText}
                          />
                        </View>
                        <TouchableOpacity
                          style={[s.button, { width: profileActionWidth }, creatingThread && { opacity: 0.65 }]}
                          onPress={openMessage}
                          disabled={creatingThread}
                        >
                          <Text style={s.buttonText}>{t("profileunified.message")}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {!isMe && sharedCommunities.length > 0 && (
                      <View style={s.sharedCommunitiesWrap}>
                        <View style={s.sharedCommunitiesTitleRow}>
                          <Ionicons name="people-outline" size={14} color={COLORS.subtext} />
                          <Text style={s.sharedCommunitiesTitle}>
                            {t("profileunified.sharedCommunities")}
                          </Text>
                        </View>
                        <FlatList
                          horizontal
                          style={s.sharedCommunitiesScroller}
                          data={sharedCommunities}
                          keyExtractor={(community: any) => String(community.id)}
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={s.sharedCommunitiesList}
                          renderItem={({ item: community }: { item: any }) => (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={s.sharedCommunityLink}
                              onPress={() =>
                                (rootNav as any).navigate("CommunitySpace", {
                                  id: community.id,
                                  title: community.title,
                                  type: community.type,
                                  slug: community.slug,
                                })
                              }
                            >
                              <Text style={s.sharedCommunityText} numberOfLines={1}>
                                {community.title ?? t("profileunified.communityFallback")}
                              </Text>
                            </TouchableOpacity>
                          )}
                        />
                      </View>
                    )}
                  </View>
                );
              }

              if (item.__type === "tabs") {
                return (
                  <View style={[s.tabs, { width: SCREEN_W }]}>
                    <TouchableOpacity
                      style={[s.tab, tab === "posts" && s.activeTab]}
                      onPress={() => setTab("posts")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="view-grid-outline" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.tab, (tab === "vlogs" || tab === "reels") && s.activeTab]}
                      onPress={() => !locked && setTab("vlogs")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="account-group-outline" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.tab, tab === "tagged" && s.activeTab]}
                      onPress={() => !locked && setTab("tagged")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialCommunityIcons name="tag-outline" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>
                );
              }

              if (item.__type === "locked") {
                return (
                  <View style={[s.lockedWrap, { width: SCREEN_W }]}>
                    <View style={s.lockedCard}>
                      <View style={s.lockedIconWrap}>
                        <Ionicons name="lock-closed" size={28} color={COLORS.text} />
                      </View>
                      <Text style={s.lockedTitle}>{t("profileunified.thisProfileIsPrivate")}</Text>
                      <Text style={s.lockedSub}>
                        Folge @{user.username}{t("profileunified.toSeePostsAndTags")}
                      </Text>
                    </View>
                  </View>
                );
              }

              if (item.__type === "empty") {
                return (
                  <View style={[s.emptyListWrap, { width: SCREEN_W }]}>
                    {gridLoading && userId && tab !== "tagged" ? (
                      <ActivityIndicator />
                    ) : isMe && tab === "posts" ? (
                      <TouchableOpacity
                        activeOpacity={0.86}
                        style={s.emptyCreateCard}
                        onPress={() => (rootNav as any).navigate("CreateMedia", { initialMode: "POST" })}
                      >
                        <Ionicons name="add-circle-outline" size={28} color={COLORS.text} />
                        <Text style={s.emptyTitle}>{t("profileunified.createFirstPostTitle")}</Text>
                        <Text style={s.emptySub}>{t("profileunified.createFirstPostBody")}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={s.emptyPlainState}>
                        <View style={s.emptyIconOrb}>
                          <Ionicons
                            name={tab === "tagged" ? "pricetag-outline" : "images-outline"}
                            size={30}
                            color={COLORS.subtext}
                          />
                        </View>
                        <Text style={s.emptyText}>
                          {tab === "posts"
                            ? t("profileunified.noPostsYet")
                            : tab === "tagged"
                              ? t("profileunified.noTagsYet")
                              : t("profileunified.noCommunityPostsYet")}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              }

              if (item.__type === "skeleton") {
                return (
                  <View
                    style={{
                      width: SIZE,
                      height: SIZE,
                      marginRight: (item.gridIndex + 1) % COLS ? GAP : 0,
                      marginBottom: GAP,
                      backgroundColor: COLORS.card,
                    }}
                  />
                );
              }

              return (
                <GridTile
                  item={item.tile}
                  index={item.gridIndex}
                  size={SIZE}
                  cols={COLS}
                  gap={GAP}
                  onPress={onPressTile}
                />
              );
            }}
          />
        </View>
          

        {/* ---------- Me-only Modals ---------- */}
        {isMe && (
          <>
            <Modal
              visible={dashboardOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setDashboardOpen(false)}
            >
              <View style={s.viewerModalRoot}>
                <TouchableOpacity
                  activeOpacity={1}
                  style={StyleSheet.absoluteFill}
                  onPress={() => setDashboardOpen(false)}
                />
                <View style={s.dashboardSheet}>
                  <View style={s.viewerSheetHandle} />
                  <View style={s.viewerSheetHeader}>
                    <View>
                      <Text style={s.viewerSheetTitle}>{t("profileunified.professionalDashboard")}</Text>
                      <Text style={s.viewerSheetSub}>{t("profileunified.dashboardSubtitle")}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setDashboardOpen(false)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={s.viewerCloseButton}
                    >
                      <Ionicons name="close" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={s.dashboardSummaryCard}>
                    <View style={s.dashboardSummaryTop}>
                      <View>
                        <Text style={s.dashboardSummaryLabel}>{t("profileunified.totalViews")}</Text>
                        <Text style={s.dashboardSummaryValue}>{dashboardTotalViewsLabel}</Text>
                      </View>
                      <View style={[s.dashboardTrendPill, { backgroundColor: `${dashboardTrendColor}22` }]}>
                        <Ionicons name={dashboardTrendIcon as any} size={15} color={dashboardTrendColor} />
                        <Text style={[s.dashboardTrendText, { color: dashboardTrendColor }]}>
                          {dashboardTrend === "up" ? t("profileunified.viewsRising") : t("profileunified.viewsFalling")}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.dashboardSummaryText}>
                      {t("profileunified.dashboardViewExplanation", {
                        recent: dashboardViewsLabel,
                        previous: dashboardPreviousViewsLabel,
                      })}
                    </Text>
                  </View>

                  <View style={s.dashboardSectionHeader}>
                    <Text style={s.dashboardSectionTitle}>{t("profileunified.last30Days")}</Text>
                    <Text style={s.dashboardSectionMeta}>{t("profileunified.views")}</Text>
                  </View>
                  <View style={s.dashboardChart}>
                    <View style={s.dashboardGraphCard}>
                      <View style={s.dashboardFixedPointLabel}>
                        <Text style={s.dashboardPointerDate}>{dashboardCurrentPoint.dateLabel}</Text>
                        <Text style={s.dashboardPointerText}>{compactViewCount(dashboardCurrentPoint.value, i18n.language)}</Text>
                      </View>
                      <View style={s.dashboardGraphPlot}>
                        <LineChart
                          data={dashboardChartData}
                          width={dashboardChartInnerWidth}
                          height={126}
                          maxValue={dashboardChartMax}
                          noOfSections={3}
                          overflowTop={48}
                          areaChart
                          onlyPositive
                          disableScroll
                          focusEnabled
                          showStripOnFocus
                          stripColor={`${dashboardTrendColor}55`}
                          stripWidth={2}
                          hideYAxisText
                          hideRules
                          hideOrigin
                          initialSpacing={18}
                          endSpacing={18}
                          spacing={dashboardChartSpacing}
                          thickness={3}
                          color={dashboardTrendColor}
                          startFillColor={dashboardTrendColor}
                          endFillColor={dashboardTrendColor}
                          startOpacity={0.18}
                          endOpacity={0.02}
                          dataPointsRadius={3}
                          dataPointsColor={dashboardTrendColor}
                          xAxisLabelTextStyle={s.dashboardChartAxisLabel}
                          xAxisLabelsHeight={24}
                          labelsExtraHeight={16}
                          xAxisLabelsVerticalShift={7}
                          xAxisTextNumberOfLines={1}
                          yAxisThickness={0}
                          yAxisLabelWidth={0}
                          xAxisThickness={0}
                          backgroundColor="transparent"
                          getPointerProps={({ pointerIndex }: { pointerIndex: number }) => {
                            const point = dashboardChartData[pointerIndex];
                            if (!point) return;
                            setDashboardSelectedPoint((current) => {
                              if (current?.dateLabel === point.dateLabel && current?.value === point.value) return current;
                              return { dateLabel: point.dateLabel, value: point.value };
                            });
                          }}
                          onFocus={(item: any) => {
                            const dateLabel = item?.dateLabel ?? item?.label ?? "";
                            const value = Number(item?.value ?? 0);
                            setDashboardSelectedPoint({ dateLabel, value });
                          }}
                          pointerConfig={{
                            pointerStripColor: dashboardTrendColor,
                            pointerStripWidth: 2,
                            pointerColor: dashboardTrendColor,
                            radius: 5,
                            pointerLabelWidth: 0,
                            pointerLabelHeight: 0,
                            autoAdjustPointerLabelPosition: true,
                            activatePointersInstantlyOnTouch: true,
                            pointerLabelComponent: () => null,
                          }}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={s.dashboardDetailGrid}>
                    <View style={s.dashboardDetailCard}>
                      <Text style={s.dashboardNumber}>{dashboardViewsLabel}</Text>
                      <Text style={s.dashboardLabel}>{t("profileunified.views")}</Text>
                    </View>
                    <View style={s.dashboardDetailCard}>
                      <Text style={s.dashboardNumber}>{dashboardReachedProfilesLabel}</Text>
                      <Text style={s.dashboardLabel}>{t("profileunified.reachedPeople")}</Text>
                    </View>
                    <View style={s.dashboardDetailCard}>
                      <Text style={s.dashboardNumber}>{dashboardInteractionsLabel}</Text>
                      <Text style={s.dashboardLabel}>{t("profileunified.interactions")}</Text>
                    </View>
                    <View style={s.dashboardDetailCard}>
                      <Text style={s.dashboardNumber}>{dashboardNewFollowersLabel}</Text>
                      <Text style={s.dashboardLabel}>{t("profileunified.newFollowers")}</Text>
                    </View>
                  </View>

                  <View style={s.dashboardInsightRow}>
                    <Ionicons name="information-circle-outline" size={16} color={COLORS.subtext} />
                    <Text style={s.dashboardInsightText}>
                      {t("profileunified.dashboardTotalVsRecentHint")}
                    </Text>
                  </View>
                </View>
              </View>
            </Modal>

            <Modal
              visible={profileViewersOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setProfileViewersOpen(false)}
            >
              <View style={s.viewerModalRoot}>
                <TouchableOpacity
                  activeOpacity={1}
                  style={StyleSheet.absoluteFill}
                  onPress={() => setProfileViewersOpen(false)}
                />
                <View style={s.viewerSheet}>
                  <View style={s.viewerSheetHandle} />
                  <View style={s.viewerSheetHeader}>
                    <View>
                      <Text style={s.viewerSheetTitle}>{t("profileunified.profileViewers")}</Text>
                      <Text style={s.viewerSheetSub}>{t("profileunified.profileViewersSubtitle")}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setProfileViewersOpen(false)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={s.viewerCloseButton}
                    >
                      <Ionicons name="close" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>

                  <FlatList
                    data={profileViewers}
                    keyExtractor={(item: any) => String(item?.viewer?.id ?? item?.viewedAt)}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={s.viewerList}
                    ListEmptyComponent={
                      <View style={s.viewerEmpty}>
                        <Ionicons name="eye-outline" size={28} color={COLORS.subtext} />
                        <Text style={s.viewerEmptyText}>{t("profileunified.noProfileViewersYet")}</Text>
                      </View>
                    }
                    renderItem={({ item }: { item: any }) => {
                      const viewer = item?.viewer;
                      if (!viewer) return null;
                      return (
                        <TouchableOpacity
                          activeOpacity={0.82}
                          style={[s.viewerRow, item.seen === false && s.viewerRowNew]}
                          onPress={() => {
                            setProfileViewersOpen(false);
                            navigation.navigate("UserProfile" as never, { username: viewer.username } as never);
                          }}
                        >
                          <AvatarImage
                            thumb={viewer.avatarThumbUrl}
                            full={viewer.avatarUrl}
                            style={s.viewerAvatar}
                            recyclingKey={`profile-viewer-row:${viewer.id}`}
                          />
                          <View style={s.viewerTextBlock}>
                            <Text style={s.viewerName} numberOfLines={1}>
                              {viewer.name || viewer.username}
                            </Text>
                            <Text style={s.viewerUsername} numberOfLines={1}>
                              @{viewer.username}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              </View>
            </Modal>

            <ProfileSwitcherModal
              visible={showSwitcher}
              onClose={() => setShowSwitcher(false)}
              COLORS={COLORS}
              activeProfile={activeProfile}
              otherProfiles={otherProfiles}
              sessions={sessions}
              isRemoving={removingRef.current.size > 0}
              isRemovingId={(id: string) => removingRef.current.has(id)}
              onActivateProfile={(profileId: string) => {
                setShowSwitcher(false);
                requestAnimationFrame(() => activateProfile(profileId));
              }}
              onActivateSession={(sessionId: string) => {
                setShowSwitcher(false);
                requestAnimationFrame(() => activateSession(sessionId));
              }}
              onRemoveSession={(sessionId: string) => removeBySessionId(sessionId)}
              onAddAccount={() => {
                setShowSwitcher(false);
                requestAnimationFrame(() => setShowAddSheet(true));
              }}
            />

            <AddAccountSheet
              visible={showAddSheet}
              onClose={() => setShowAddSheet(false)}
              COLORS={COLORS}
              onLogin={() => {
                setShowAddSheet(false);
                rootNav.navigate("Auth", { start: "login", asAddAccount: true });

              }}
              onRegister={() => {
                setShowAddSheet(false);
                setShowSwitcher(false);
                rootNav.navigate("Auth", { start: "register", asAddAccount: true });
              }}
            />
          </>
        )}
      </View>
      <FollowListSheet
        visible={followSheetVisible}
        onClose={() => setFollowSheetVisible(false)}
        ownerUserId={userId ?? ""}
        ownerIsMe={isMe}
        mode={followSheetMode}
        onSelectUser={(uname) => {
          setFollowSheetVisible(false);
          if (!uname) return;
          setTimeout(() => {
            navigation.navigate("UserProfile" as never, { username: uname } as never);
          }, 0);
        }}
        onChanged={() => {
          if (isMe) meRefetch?.();
          else activeUserRefetch?.();
        }}
       
      />


    </Screen>
  );
}

/** ---------- Styles ---------- */
const styles = (COLORS: any) =>
  StyleSheet.create({
    rightBlock: {
      flex: 1,
      alignItems: "stretch",
      gap: 7,
      marginTop: 0,
    },

    profileHero: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
      width: "100%",
    },

    connectionsRow: {
      marginTop: 9,
      marginBottom: 3,
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "center",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: COLORS.card,
    },


    connectionsText: {
      color: COLORS.primary,
      fontSize: 12,
      fontWeight: "700",
      marginLeft: 6,
    },

    sharedCommunitiesWrap: {
      marginHorizontal: 0,
      marginTop: 8,
      marginBottom: 9,
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 10,
      backgroundColor: COLORS.bg,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    sharedCommunitiesTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
    },

    sharedCommunitiesTitle: {
      color: COLORS.subtext,
      fontSize: 12,
      fontWeight: "800",
    },

    sharedCommunitiesList: {
      gap: 12,
      paddingRight: 2,
    },

    sharedCommunitiesScroller: {
      flex: 1,
      minWidth: 0,
    },

    sharedCommunityLink: {
      maxWidth: 150,
      paddingVertical: 4,
    },

    sharedCommunityText: {
      color: COLORS.text,
      fontSize: 12,
      fontWeight: "800",
      textDecorationLine: "underline",
    },

    dashboardCard: {
      marginHorizontal: 16,
      marginTop: 6,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 16,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    dashboardMiniHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    dashboardMiniIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    dashboardMiniTextBlock: {
      flex: 1,
      minWidth: 0,
    },

    dashboardCompactRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 3,
      gap: 6,
    },

    dashboardTitle: {
      color: COLORS.text,
      fontSize: 13,
      fontWeight: "900",
    },

    dashboardCompactText: {
      color: COLORS.subtext,
      fontSize: 12,
      fontWeight: "700",
      flex: 1,
      minWidth: 0,
    },

    dashboardSheet: {
      maxHeight: SCREEN_H * 0.72,
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 24,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: COLORS.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    dashboardSummaryCard: {
      padding: 14,
      borderRadius: 18,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      marginTop: 4,
      marginBottom: 8,
    },

    dashboardSummaryTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 8,
    },

    dashboardSummaryLabel: {
      color: COLORS.subtext,
      fontSize: 12,
      fontWeight: "700",
    },

    dashboardSummaryValue: {
      color: COLORS.text,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: "900",
      marginTop: 2,
    },

    dashboardTrendPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
    },

    dashboardTrendText: {
      fontSize: 11,
      fontWeight: "800",
    },

    dashboardSummaryText: {
      color: COLORS.subtext,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
    },

    dashboardSectionHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginTop: 12,
      marginBottom: 7,
      paddingHorizontal: 2,
    },

    dashboardSectionTitle: {
      color: COLORS.text,
      fontSize: 14,
      fontWeight: "900",
    },

    dashboardSectionMeta: {
      color: COLORS.subtext,
      fontSize: 11,
      fontWeight: "800",
    },

    dashboardChart: {
      height: 190,
      marginBottom: 8,
    },

    dashboardGraphCard: {
      flex: 1,
      minHeight: 180,
      borderRadius: 18,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      overflow: "visible",
      paddingHorizontal: 14,
      paddingTop: 22,
      paddingBottom: 16,
      justifyContent: "center",
    },

    dashboardGraphPlot: {
      height: 150,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 6,
      paddingHorizontal: 18,
      transform: [{ translateX: 5 }],
    },

    dashboardChartAxisLabel: {
      color: COLORS.subtext,
      fontSize: 10,
      fontWeight: "800",
    },

    dashboardChartDateLabel: {
      width: 44,
      marginLeft: -18,
      marginTop: 5,
      color: COLORS.subtext,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "800",
      textAlign: "center",
    },

    dashboardFixedPointLabel: {
      position: "absolute",
      left: 14,
      top: 12,
      minWidth: 58,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: COLORS.text,
      alignItems: "center",
      zIndex: 2,
    },

    dashboardPointerDate: {
      color: COLORS.bg,
      opacity: 0.72,
      fontSize: 9,
      fontWeight: "800",
    },

    dashboardPointerText: {
      color: COLORS.bg,
      fontSize: 11,
      fontWeight: "900",
    },

    dashboardDetailGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: 8,
      rowGap: 8,
      marginTop: 4,
      justifyContent: "space-between",
    },

    dashboardDetailCard: {
      width: "48.5%",
      minWidth: 0,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    dashboardNumber: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: "900",
    },

    dashboardLabel: {
      color: COLORS.subtext,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },

    dashboardInsightRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      marginTop: 12,
      paddingHorizontal: 2,
    },

    dashboardInsightText: {
      flex: 1,
      minWidth: 0,
      color: COLORS.subtext,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
    },


    lockedWrap: {
      alignItems: "center",
      justifyContent: "flex-start", // ✅ statt center
      paddingHorizontal: 18,
      paddingTop: 40,              // ✅ nach oben schieben
      paddingBottom: 24,
      minHeight: SCREEN_H,
    },

    lockedCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: COLORS.card,
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 16,
      alignItems: "center",
    },

    lockedIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      marginBottom: 10,
    },

    lockedTitle: {
      color: COLORS.text,
      fontWeight: "800",
      fontSize: 16,
      textAlign: "center",
      marginBottom: 6,
    },

    lockedSub: {
      color: COLORS.subtext,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },

    container: {
      flex: 1,
      backgroundColor: COLORS.bg,
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },

    header: {
      paddingHorizontal: 16,
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
    },

    username: {
      color: COLORS.text,
      fontSize: 22,
      fontWeight: "800",
      maxWidth: "75%",
    },

    usernameRow: {
      flexDirection: "row",
      alignItems: "center",
      maxWidth: "75%",
      paddingVertical: 8,
      paddingRight: 8,
    },

    menuButton: { padding: 8 },

    viewerHeaderButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },

    viewerHeaderAvatar: {
      width: 27,
      height: 27,
      borderRadius: 10,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    viewerHeaderBadge: {
      position: "absolute",
      right: 1,
      bottom: 2,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F43F5E",
      borderWidth: 2,
      borderColor: COLORS.bg,
    },

    viewerHeaderBadgeText: {
      color: "#fff",
      fontSize: 9,
      lineHeight: 12,
      fontWeight: "900",
    },

    viewerModalRoot: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.34)",
    },

    viewerSheet: {
      maxHeight: SCREEN_H * 0.68,
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 22,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: COLORS.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    viewerSheetHandle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 999,
      backgroundColor: COLORS.border,
      marginBottom: 14,
    },

    viewerSheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },

    viewerSheetTitle: {
      color: COLORS.text,
      fontSize: 18,
      fontWeight: "900",
    },

    viewerSheetSub: {
      color: COLORS.subtext,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 2,
    },

    viewerCloseButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: COLORS.card,
    },

    viewerList: {
      paddingBottom: 10,
    },

    viewerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 14,
      gap: 10,
    },

    viewerRowNew: {
      backgroundColor: "rgba(244,63,94,0.10)",
    },

    viewerAvatar: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: COLORS.card,
    },

    viewerTextBlock: {
      flex: 1,
      minWidth: 0,
    },

    viewerName: {
      color: COLORS.text,
      fontSize: 14,
      fontWeight: "800",
    },

    viewerUsername: {
      color: COLORS.subtext,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 2,
    },

    viewerEmpty: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 34,
      gap: 8,
    },

    viewerEmptyText: {
      color: COLORS.subtext,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center",
    },

    profileInfo: {
      flexDirection: "column",
      alignItems: "center",
      marginHorizontal: 0,
      marginTop: 4,
      marginBottom: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      backgroundColor: COLORS.bg,
    },

    avatar: {
      width: 90,
      height: 90,
      borderRadius: 28,
      backgroundColor: COLORS.bg,
    },

    avatarAction: {
      width: 98,
      height: 98,
      borderRadius: 31,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: COLORS.text,
      backgroundColor: COLORS.bg,
    },

    avatarActionActive: {
      borderWidth: 2,
      borderColor: COLORS.primary,
    },

    avatarPlus: {
      position: "absolute",
      right: 0,
      bottom: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F43F5E",
      borderWidth: 2,
      borderColor: COLORS.bg,
    },

    avatarPlusText: {
      color: "#fff",
      fontSize: 18,
      lineHeight: 22,
      fontWeight: "900",
    },

    profileIntro: {
      alignItems: "center",
      marginTop: 9,
      paddingHorizontal: 10,
      width: "100%",
    },

    profileNameRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      maxWidth: "92%",
    },

    profileName: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
      flexShrink: 1,
    },

    editIconButton: {
      width: 24,
      height: 24,
      marginLeft: 5,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },

    profileBio: {
      color: COLORS.subtext,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 8,
      maxWidth: "92%",
    },

    stats: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 4,
      width: "100%",
    },

    statBlock: {
      alignItems: "center",
      flex: 1,
      minWidth: 0,
      paddingVertical: 4,
    },

    statNumber: {
      color: COLORS.text,
      fontWeight: "800",
      fontSize: 15,
    },

    statLabel: {
      color: COLORS.subtext,
      fontSize: 11,
    },

    buttonsRow: {
      flexDirection: "row",
      paddingHorizontal: 16,
      gap: 8,
      marginTop: 5,
      marginBottom: 5,
      backgroundColor: COLORS.bg,
    },

    profileActionSlot: {
      height: 38,
      borderRadius: 999,
      overflow: "hidden",
    },

    profileFollowButton: {
      flex: 1,
      width: "100%",
      alignSelf: "stretch",
      height: 38,
      minHeight: 38,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    profileFollowButtonText: {
      color: COLORS.text,
      fontSize: 14,
      fontWeight: "700",
    },

    button: {
      backgroundColor: COLORS.card,
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth, // ✅ hairline
      paddingVertical: 8,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      height: 38,
      minHeight: 38,
    },

    buttonText: {
      color: COLORS.text,
      fontSize: 14,
      fontWeight: "700",
    },

    tabs: {
      flexDirection: "row",
      height: 42,
      backgroundColor: COLORS.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: COLORS.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
    },

    tab: {
      flex: 1,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "transparent",
    },

    activeTab: {
      borderBottomColor: COLORS.text,
      opacity: 0.75,
    },

    emptyListWrap: {
      alignItems: "center",
      justifyContent: "flex-start",
      paddingHorizontal: 18,
      paddingTop: 28,
      paddingBottom: 28,
      minHeight: 220,
    },

    emptyCreateCard: {
      width: "100%",
      maxWidth: 360,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
      paddingVertical: 22,
      borderRadius: 22,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    emptyTitle: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: "800",
      marginTop: 8,
      textAlign: "center",
    },

    emptySub: {
      color: COLORS.subtext,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 5,
      textAlign: "center",
    },

    emptyPlainState: {
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
    },

    emptyIconOrb: {
      width: 78,
      height: 78,
      borderRadius: 39,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
    },

    emptyText: {
      color: COLORS.subtext,
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },

    gridWrap: {
      flex: 1,
      backgroundColor: COLORS.bg,
      paddingTop: 0,
    },
  });
