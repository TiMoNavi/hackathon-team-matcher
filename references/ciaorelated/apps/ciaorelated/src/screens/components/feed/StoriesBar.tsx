// apps/ciaorelated/src/screens/feed/components/StoriesBar.tsx
import React, { useCallback, useMemo } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect, useNavigation, type NavigationProp } from "@react-navigation/native";
import { gql, useQuery } from "@apollo/client";

import StoryBubble from "../../components/StoryBubble";
import { STORIES_FEED } from "../../../graphql/queries/social";
import { useTheme } from "../../../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

type Slide = {
  id: string;
  uri: string;
  when?: string;
  thumb?: string | null;
  isVideo?: boolean;
  durationSec?: number | null;

  editJson?: string | null;
  mime?: string | null;

  // ✅ NEW (DB-based)
  seenByMe?: boolean | null;
};

type UserEntry = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
  slides: Slide[];
  // perf: precomputed
  fullyRead: boolean;
  lastTs: number;
};
type RootStackParamList = {
  StoryViewer: {
    user: { id: string; username: string; avatar: string };
    slides: Slide[];
    startIndex?: number;
    mine?: boolean;
    queue?: Array<{ user: { id: string; username: string; avatar: string }; slides: Slide[] }>;
    queueIndex?: number;
  };
  NewStory: undefined;
};

const ME_QUERY = gql`
  query {
    me {
      id
      username
      avatarUrl
      avatarThumbUrl
      __typename
    }
  }
`;

export function StoriesBar() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = React.useMemo(() => styles(C), [C]);

  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data: meData } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });

  const myId = meData?.me?.id as string | undefined;
  const myAvatar = meData?.me?.avatarUrl ?? null;
  const myAvatarThumb = meData?.me?.avatarThumbUrl ?? null;

  const { data, loading, refetch } = useQuery(STORIES_FEED, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
  });

  useFocusEffect(
    React.useCallback(() => {
      // ✅ nach StoryViewer zurück -> Feed-Daten aktualisieren
      refetch().catch(() => {});
    }, [refetch])
  );




  const byUser = useMemo(() => {
    const map: Record<string, Omit<UserEntry, "fullyRead" | "lastTs">> = {};
    const orderIds: string[] = [];

    const feed = (data as any)?.storiesFeed ?? [];
    for (const s of feed) {
      const u = s?.author;
      if (!u?.id) continue;

      if (!map[u.id]) {
        map[u.id] = {
          id: u.id,
          username: u.username,
          avatarUrl: u.avatarUrl ?? null,
          avatarThumbUrl: u.avatarThumbUrl ?? null,
          slides: [],
        };
        orderIds.push(u.id);
      }

      map[u.id].slides.push({
        id: s.id,
        uri: s.mediaUrl,
        thumb: s.thumbUrl ?? null,
        isVideo: !!s.isVideo,
        durationSec: s.duration ?? null,
        when: s.createdAt,
        editJson: s.editJson ?? null,
        mime: s.mime ?? null,
        seenByMe: s.seenByMe ?? null,
      });
    }

    // older -> newer
    for (const uid of Object.keys(map)) {
      map[uid].slides.sort((a, b) => {
        const ta = new Date(a.when ?? 0).getTime();
        const tb = new Date(b.when ?? 0).getTime();
        return ta - tb;
      });
    }

    // ✅ perf: fullyRead + lastTs einmal berechnen
    const finalMap: Record<string, UserEntry> = {};
    for (const uid of orderIds) {
      const entry = map[uid];
      const slides = entry.slides ?? [];
      const fullyRead = slides.length ? slides.every((x) => x.seenByMe === true) : true;

      const lastWhen = slides[slides.length - 1]?.when;
      const lastTs = lastWhen ? new Date(lastWhen).getTime() : 0;

      finalMap[uid] = { ...entry, fullyRead, lastTs };
    }

    return { map: finalMap, orderIds };
  }, [data]);

  

  const myEntry: UserEntry | null = myId && byUser.map[myId] ? byUser.map[myId] : null;

  const others: UserEntry[] = useMemo(
    () =>
      byUser.orderIds
        .filter((id) => id !== myId)
        .map((id) => byUser.map[id])
        .filter(Boolean),
    [byUser.orderIds, byUser.map, myId]
  );

  // ✅ DB-based: fully read if ALL slides have seenByMe === true
  const isUserFullyRead = useCallback((u: UserEntry) => u.fullyRead, []);

  // ✅ sort: unread first, read last
  const sortedOthers = useMemo(() => {
    const copy = [...others];
    copy.sort((a, b) => {
      const ar = a.fullyRead ? 1 : 0;
      const br = b.fullyRead ? 1 : 0;
      if (ar !== br) return ar - br;

      // within same bucket: most-recent user first
      return b.lastTs - a.lastTs;
    });
    return copy;
  }, [others, isUserFullyRead]);

  const unreadUsers = useMemo(
    () => sortedOthers.filter((u) => !isUserFullyRead(u)),
    [sortedOthers, isUserFullyRead]
  );

  // ✅ startIndex = first unread slide; if all read => last slide
  const computeStartIndex = useCallback((u: UserEntry) => {
    const slides = u.slides ?? [];
    if (!slides.length) return 0;

    const firstUnread = slides.findIndex((s) => s.seenByMe !== true);
    if (firstUnread >= 0) return firstUnread;
    // ✅ wenn alles gesehen -> wieder von Anfang
    return 0;
  }, []);

  const openStory = useCallback(
    async (u: UserEntry) => {
      const mine = myId ? u.id === myId : false;

      const startIndex = mine ? 0 : computeStartIndex(u);

      // ✅ Queue only unread users → loop exists only while unread exists
      const uIsRead = !mine && isUserFullyRead(u);

      const q =
        !mine && !uIsRead
          ? unreadUsers.map((x) => ({
              user: {
                id: x.id,
                username: x.username,
                avatar: (x.avatarThumbUrl ?? x.avatarUrl ?? "") as string,
              },
              slides: x.slides,
            }))
          : undefined;

      const qIndex = q ? Math.max(0, q.findIndex((it) => it.user.id === u.id)) : 0;

      const params: RootStackParamList["StoryViewer"] = {
        user: {
          username: u.username,
          id: u.id,
          avatar: (u.avatarThumbUrl ?? u.avatarUrl ?? "") as string,
        },
        slides: u.slides,
        startIndex,
        mine,
        queue: q,
        queueIndex: q ? qIndex : undefined,
      };

      const parent: any = (navigation as any).getParent?.() ?? navigation;
      if (typeof parent.push === "function") parent.push("StoryViewer", params);
      else parent.navigate("StoryViewer", params);
    },
    [navigation, myId, unreadUsers, isUserFullyRead, computeStartIndex]
  );

  const openMyBubble = useCallback(() => {
    if (myEntry) openStory(myEntry);
    else {
      const root: any = (navigation as any).getParent?.()?.getParent?.() ?? (navigation as any).getParent?.() ?? navigation;
      root.navigate("CreateMedia", { initialMode: "STORY", nonce: Date.now() });
    }
  }, [myEntry, openStory, navigation]);

  const showEmpty = !loading && sortedOthers.length === 0 && !myEntry;

  const items = useMemo(() => {
  const list: Array<
    | { type: "me" }
    | { type: "divider" }
    | { type: "user"; u: UserEntry }
    | { type: "empty" }
    | { type: "loading" }
  > = [{ type: "me" }, { type: "divider" }];

  if (loading && sortedOthers.length === 0) list.push({ type: "loading" });

  for (const u of sortedOthers) list.push({ type: "user", u });

  if (showEmpty) list.push({ type: "empty" });

  return list;
}, [loading, sortedOthers, showEmpty]);

const renderItem = useCallback(
  ({ item }: { item: (typeof items)[number] }) => {
    switch (item.type) {
      case "me":
        return (
          <StoryBubble
            avatarUri={myAvatar}
            username={meData?.me?.username ?? "me"}
            thumbUri={myAvatarThumb}
            label={t("storiesbar.yourStory")}
            hasActive={!!myEntry}
            onPress={openMyBubble}
            size={72}
            bgColor={C.bg}
            avatarBgColor={C.card}
            labelColor={C.subtext}
          />
        );
      case "divider":
        return <View style={s.divider} />;
      case "loading":
        return (
          <View style={{ height: 86, justifyContent: "center" }}>
            <ActivityIndicator />
          </View>
        );
      case "empty":
        return (
          <View style={{ height: 86, justifyContent: "center" }}>
            <Text style={{ color: C.subtext }}>{t("storiesbar.noStoriesYet")}</Text>
          </View>
        );

      case "user": {
        const u = item.u;
        return (
          <StoryBubble
            avatarUri={u.avatarUrl ?? null}
            thumbUri={u.avatarThumbUrl ?? null}
            label={u.username}
            username={u.username}
            hasActive={true}
            seen={u.fullyRead}
            onPress={() => openStory(u)}
            size={72}
            bgColor={C.bg}
            avatarBgColor={C.card}
            labelColor={C.subtext}
          />
        );
      }
    }
  },
  [C.bg, C.card, C.subtext, myAvatar, myAvatarThumb, myEntry, openMyBubble, openStory]
);

return (
  <View style={s.wrap}>
    <FlashList
      horizontal
      data={items}
      renderItem={renderItem}
      keyExtractor={(it:any, idx:any)=> (it.type === "user" ? `u:${it.u.id}` : `${it.type}:${idx}`)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 2, alignItems: "center" }}
      ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
      estimatedItemSize={86}
      extraData={myEntry?.id}
    />
  </View>
);
}

const styles = (C: any) =>
  StyleSheet.create({
    wrap: {
      paddingVertical: 8,
      backgroundColor: C.bg,
    },
    divider: {
      width: 1,
      height: 36,
      backgroundColor: C.border,
      alignSelf: "center",
      marginHorizontal: 2,
    },
  });
