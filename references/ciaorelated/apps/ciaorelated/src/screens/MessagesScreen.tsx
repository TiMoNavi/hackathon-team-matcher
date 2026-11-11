import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  Alert,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, gql, useSubscription } from "@apollo/client";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../theme/ThemeProvider";
import { useFocusEffect } from "@react-navigation/native";
import { avatarPlaceholder } from "../../assets/placeholders";
import GroupLinkSheet from "./GroupLinkSheet";
import { apollo } from "../apollo";
import { uploadToS3 } from "../lib/uploadToS3";

import { useTranslation } from "react-i18next";

/* ───────────────── GraphQL ───────────────── */

const UNREAD_Q = gql`query { unreadCount { total } }`;



const THREADS = gql`
  query Threads {
    me {
      id
    }
    threads {
      id
      title
      imageUrl
      lastMessageAt
      unreadCount
      kind
      isGroupChat
      community {
        id
        title
        imageUrl
        imageThumbUrl
      }
      members {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
    }
  }
`;

const SEARCH_USERS = gql`
  query SearchUsers($q: String!, $limit: Int!) {
    searchUsers(q: $q, limit: $limit) {
      id
      username
      avatarThumbUrl
      avatarUrl
      isFollowing
    }
    me {
      id
    }
  }
`;

const CREATE_THREAD = gql`
  mutation CreateThread($memberUserIds: [ID!]!, $title: String, $imageKey: String) {
    createThread(memberUserIds: $memberUserIds, title: $title, imageKey: $imageKey) {
      id
      title
      imageUrl
      members {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
    }
  }
`;

const ME_Q = gql`
  query MeForThreads {
    me {
      id
      username
      avatarThumbUrl
      avatarUrl
    }
  }
`;

const UNREAD_SUB = gql`
  subscription {
    unreadUpdated {
      total
      perThread {
        threadId
        count
      }
    }
  }
`;


/* ───────────────── Screen ───────────────── */

export default function MessagesScreen() {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  // Theme colors (mit Fallbacks falls deine theme.colors andere keys hat)
  const C = useMemo(() => {
    const x: any = theme?.colors ?? {};
    return {
      bg: x.bg ?? x.background ?? "#0B0B0B",
      card: x.card ?? x.surface ?? "#111214",
      text: x.text ?? "#F3F4F6",
      subtext: x.subtext ?? x.sub ?? "#9CA3AF",
      border: x.border ?? "#1f2126",
      primary: x.primary ?? x.accent ?? "#4f46e5",
      danger: x.danger ?? "#ef4444",
    };
  }, [theme]);

  const styles = useMemo(() => makeStyles(C), [C]);

  const [q, setQ] = useState("");
  const [composeMode, setComposeMode] = useState<"group" | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupImageUri, setGroupImageUri] = useState<string | null>(null);
  const [groupImageMime, setGroupImageMime] = useState<string>("image/jpeg");
  const [groupImageName, setGroupImageName] = useState<string>("group-chat.jpg");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const creatingGroupRef = useRef(false);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);

  // Threads laden
  const {
    data: tData,
    loading: tLoading,
    refetch: refetchThreads,
  } = useQuery(THREADS, { fetchPolicy: "cache-and-network" });

  // Me laden (für 1:1 dedupe + "anderen" user finden)
  const { data: meData } = useQuery(ME_Q, { fetchPolicy: "cache-first" });
  const { refetch: refetchUnread } = useQuery(UNREAD_Q, {
    fetchPolicy: "cache-and-network",
  });
  const meId = tData?.me?.id ?? meData?.me?.id;

  // Suche (aktiv ab 2 Zeichen)
  const trimmedQ = q.trim();
  const doSearch = trimmedQ.length >= 2;
  const showingSearch = composeMode === "group" || doSearch;

  const { data: sData, loading: sLoading } = useQuery(SEARCH_USERS, {
    variables: { q: trimmedQ, limit: 30 },
    skip: !doSearch,
    fetchPolicy: "cache-and-network",
  });

  const [createThread, { loading: creating }] = useMutation(CREATE_THREAD);
  const selectedUserIds = useMemo(() => new Set(selectedUsers.map((user: any) => String(user.id))), [selectedUsers]);
  const canCreateSelectedGroup = selectedUsers.length > 0 && groupTitle.trim().length > 0 && !creatingGroup && !creating;

  useFocusEffect(
    React.useCallback(() => {
      // ✅ wenn man zurück in den MessagesScreen kommt, alles “nachziehen”
      refetchUnread().catch(() => {});
      refetchThreads().catch(() => {});
    }, [refetchUnread, refetchThreads])
  );

  useSubscription(UNREAD_SUB, {
    onData: ({ data, client }) => {
      const unread = data.data?.unreadUpdated;
      if (!unread) return;

      // ✅ pro Thread unreadCount direkt patchen
      for (const t of unread.perThread ?? []) {
        const cacheId = client.cache.identify({ __typename: "Thread", id: t.threadId });
        if (!cacheId) continue;

        client.cache.writeFragment({
          id: cacheId,
          fragment: gql`
            fragment _ThreadUnreadPatch on Thread {
              unreadCount
            }
          `,
          data: { unreadCount: t.count },
        });
      }

      // ✅ total ebenfalls in den Cache schreiben
      client.cache.writeQuery({
        query: UNREAD_Q,
        data: {
          unreadCount: { __typename: "UnreadCount", total: unread.total ?? 0 },
        },
      });
    },
  });



  // Sort helper: newest first
  const sortByLast = useCallback(
    (a: any, b: any) =>
      (b?.lastMessageAt ? +new Date(b.lastMessageAt) : 0) -
      (a?.lastMessageAt ? +new Date(a.lastMessageAt) : 0),
    []
  );

  // Raw threads
  const rawThreads = tData?.threads ?? [];

  /**
   * ✅ Fix: Alte Chats waren in deiner neuen Version teils "weg",
   * weil das Dedupe mit meId undefined falsche "other" berechnet hat.
   *
   * -> Dedupe nur, wenn meId existiert.
   */
  const threads = useMemo(() => {
    const byId = new Map<string, any>();
    for (const thread of rawThreads) {
      if (thread?.id && !byId.has(String(thread.id))) byId.set(String(thread.id), thread);
    }
    const sorted = [...byId.values()].sort(sortByLast);

    // Wenn meId noch nicht da ist: NICHT dedupen, sonst verschwinden Threads.
    if (!meId) return sorted;

    const map = new Map<string, string>(); // otherUserId -> threadId
    const out: any[] = [];

    for (const t of sorted) {
      const members = Array.isArray(t.members) ? t.members : [];

      // Nur echte 1:1-DMs deduplizieren. Community-/Gruppen-Chats mit zwei
      // Mitgliedern dürfen nicht verschwinden, nur weil es einen DM mit
      // derselben Person gibt.
      if ((t?.kind ?? "DM") === "DM" && members.length === 2) {
        const other = members.find((m: any) => m?.id && m.id !== meId)?.id;
        if (other) {
          // keep newest per other user
          if (!map.has(other)) {
            map.set(other, t.id);
            out.push(t);
          }
          continue;
        }
      }

      // groups or fallback
      out.push(t);
    }

    return out;
  }, [rawThreads, sortByLast, meId]);

  // Suchresultate: Followings zuerst, dann Präfix, dann alpha
  const results = useMemo(() => {
    if (!doSearch) return [];
    const list = (sData?.searchUsers ?? []).slice();
    const ql = trimmedQ.toLowerCase();

    list.sort((a: any, b: any) => {
      const fA = a.isFollowing ? 0 : 1;
      const fB = b.isFollowing ? 0 : 1;
      if (fA !== fB) return fA - fB;

      const pA = (a.username || "").toLowerCase().startsWith(ql) ? 0 : 1;
      const pB = (b.username || "").toLowerCase().startsWith(ql) ? 0 : 1;
      if (pA !== pB) return pA - pB;

      return (a.username || "").localeCompare(b.username || "");
    });

    return list;
  }, [sData?.searchUsers, doSearch, trimmedQ]);

  const openCreateMenu = () => {
    Alert.alert(t("messages.createTitle"), undefined, [
      {
        text: t("messages.newGroupChat"),
        onPress: () => {
          setComposeMode("group");
          setSelectedUsers([]);
          setGroupTitle("");
          setGroupImageUri(null);
          setGroupImageMime("image/jpeg");
          setGroupImageName("group-chat.jpg");
          setQ("");
        },
      },
      {
        text: t("messages.newCommunity"),
        onPress: () => setShowCreateCommunity(true),
      },
      {
        text: t("messages.viewCommunities"),
        onPress: () => nav.navigate("Groups"),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const openThread = (thr: any) =>
    nav.navigate("Chat", {
      threadId: thr.id,
      title: thr.title || readableThreadTitle(thr.members, meId),
    });

  // Prüfen: existiert 1:1 Thread mit userId?
  function findExistingThreadFor(userId: string) {
    for (const t of threads) {
      const ids = (t.members ?? []).map((m: any) => m.id);
      if (ids.length === 2 && ids.includes(userId)) return t;
    }
    return null;
  }

  // Start mit User: vorhandenen Thread öffnen, sonst anlegen
  const startWithUser = async (user: any) => {
    const existing = findExistingThreadFor(user.id);
    if (existing) return openThread(existing);

    const { data } = await createThread({
      variables: { memberUserIds: [user.id], title: null },
    });

    const thr = data?.createThread;
    if (thr?.id) openThread(thr);
  };

  const toggleSelectedUser = (user: any) => {
    setSelectedUsers((prev) => {
      const id = String(user.id);
      if (prev.some((item: any) => String(item.id) === id)) {
        return prev.filter((item: any) => String(item.id) !== id);
      }
      return [...prev, user];
    });
  };

  const createSelectedGroup = async () => {
    if (!selectedUsers.length) return;
    if (creatingGroupRef.current) return;
    if (!groupTitle.trim()) {
      Alert.alert(t("common.error"), t("messages.groupNameRequired"));
      return;
    }
    creatingGroupRef.current = true;
    setCreatingGroup(true);
    try {
      let imageKey: string | null = null;
      if (groupImageUri) {
        const uploaded = await uploadToS3(apollo, {
          uri: groupImageUri,
          name: groupImageName,
          type: groupImageMime,
        });
        imageKey = uploaded.key;
      }

      const { data } = await createThread({
        variables: {
          memberUserIds: selectedUsers.map((user: any) => user.id),
          title: groupTitle.trim() || null,
          imageKey,
        },
      });
      const thread = data?.createThread;
      if (thread?.id) {
        setComposeMode(null);
        setSelectedUsers([]);
        setGroupTitle("");
        setGroupImageUri(null);
        setGroupImageMime("image/jpeg");
        setGroupImageName("group-chat.jpg");
        setQ("");
        openThread(thread);
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("common.tryAgain"));
    } finally {
      creatingGroupRef.current = false;
      setCreatingGroup(false);
    }
  };

  const pickGroupImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert(t("chat.permissionMissingTitle"), t("chat.photosPermissionBody"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    const asset = res.assets?.[0];
    if (!res.canceled && asset?.uri) {
      setGroupImageUri(asset.uri);
      setGroupImageMime(asset.mimeType ?? "image/jpeg");
      setGroupImageName(asset.fileName ?? "group-chat.jpg");
    }
  };

  // Anzeige-Infos für Thread (Titel/Avatar): bei 1:1 "anderer" User
  const getThreadDisplay = (thr: any) => {
    const members = Array.isArray(thr.members) ? thr.members : [];
    const community = thr?.community;
    const isDirectMessage = !community && (thr?.kind ?? "DM") === "DM" && members.length === 2;
    const otherMember = isDirectMessage && meId ? members.find((m: any) => m?.id && m.id !== meId) : null;

    const title = community?.title || (isDirectMessage ? readableThreadTitle(members, meId) : thr.title || readableThreadTitle(members, meId));
    const avatar = community
      ? community.imageThumbUrl || community.imageUrl || null
      : isDirectMessage
        ? otherMember?.avatarThumbUrl || otherMember?.avatarUrl || null
        : thr?.imageUrl || null;

    return {
      title,
      avatar,
    };
  };

  const getThreadLabel = (thr: any) => {
    if (thr?.kind === "DISABLED") return t("messages.threadLabelDisabled");
    if (thr?.community || thr?.kind === "COMMUNITY" || thr?.kind === "BROADCAST") return t("messages.threadLabelCommunity");
    if (thr?.isGroupChat || thr?.kind === "GROUP") return t("messages.threadLabelGroup");
    return "";
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header (Theme) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("messages.chats")}</Text>

        <TouchableOpacity onPress={openCreateMenu} style={styles.headerBtn} hitSlop={12} activeOpacity={0.78}>
          <Text style={styles.headerPlus}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Suche (inline) */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={C.subtext} />
        <TextInput
          style={styles.searchInput}
          placeholder={t("messages.seek")}
          placeholderTextColor={C.subtext}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {composeMode === "group" ? (
        <View style={styles.composeBar}>
          <TouchableOpacity style={styles.groupImageBtn} onPress={pickGroupImage} activeOpacity={0.82}>
            {groupImageUri ? (
              <ExpoImage source={{ uri: groupImageUri }} style={styles.groupImagePreview} contentFit="cover" />
            ) : (
              <Ionicons name="camera-outline" size={22} color={C.subtext} />
            )}
          </TouchableOpacity>

          <View style={styles.composeMain}>
            <View style={styles.composeHeaderRow}>
              <Text style={styles.composeTitle}>{t("messages.newGroupChat")}</Text>
              <TouchableOpacity
                style={styles.composeCancelBtn}
                onPress={() => {
                  setComposeMode(null);
                  setSelectedUsers([]);
                  setGroupTitle("");
                  setGroupImageUri(null);
                  setGroupImageMime("image/jpeg");
                  setGroupImageName("group-chat.jpg");
                }}
                hitSlop={10}
              >
                <Ionicons name="close" size={20} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.groupTitleInput}
              placeholder={t("messages.groupNamePlaceholder")}
              placeholderTextColor={C.subtext}
              value={groupTitle}
              onChangeText={setGroupTitle}
              autoCorrect={false}
              maxLength={48}
            />

            <View style={styles.composeFooterRow}>
              <Text style={styles.composeSub}>
                {selectedUsers.length
                  ? t("messages.selectedPeople", { count: selectedUsers.length })
                  : t("messages.selectPeopleForGroup")}
              </Text>
              <TouchableOpacity
                style={[styles.composeCreateBtn, !canCreateSelectedGroup && { opacity: 0.45 }]}
                onPress={createSelectedGroup}
                disabled={!canCreateSelectedGroup}
                activeOpacity={0.82}
              >
                {creating || creatingGroup ? (
                  <ActivityIndicator size="small" color={C.bg} />
                ) : (
                  <Text style={styles.composeCreateText}>{t("messages.createGroup")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {/* Inhalt */}
      {!showingSearch ? (
        <FlatList
          data={threads}
          keyExtractor={(i: any) => i.id}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshing={tLoading}
          onRefresh={() => refetchThreads()}
          ListEmptyComponent={
            tLoading ? (
              <View style={{ padding: 24 }}>
                <ActivityIndicator />
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t("messages.noChatsYet")}</Text>
                <Text style={styles.emptyText}>
                  {t("messages.startAConversationUsingTheSearchFunc47e2cb")}</Text>
              </View>
            )
          }
          renderItem={({ item }: any) => {
            const { title, avatar } = getThreadDisplay(item);
            const threadLabel = getThreadLabel(item);

            return (
              <TouchableOpacity
                style={styles.item}
                onPress={() => openThread(item)}
                activeOpacity={0.85}
              >
                <ExpoImage
                  source={avatar ? { uri: avatar } : avatarPlaceholder}
                  style={styles.avatar}
                  contentFit="cover"
                  cachePolicy="disk"
                  transition={120}
                />

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.itemTopRow}>
                    <Text style={[styles.itemTitle, styles.itemTitleInRow]} numberOfLines={2}>
                      {title}
                    </Text>
                    {!!threadLabel && (
                      <View style={[styles.threadLabel, item.kind === "DISABLED" && styles.threadLabelDisabled]}>
                        <Text style={[styles.threadLabelText, item.kind === "DISABLED" && styles.threadLabelTextDisabled]} numberOfLines={1}>
                          {threadLabel}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {item.lastMessageAt ? dateShort(item.lastMessageAt) : "—"}
                  </Text>
                </View>

                {!!item.unreadCount && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u: any) => u.id}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            sLoading || creating ? (
              <View style={{ padding: 12 }}>
                <ActivityIndicator />
              </View>
            ) : null
          }
          ListEmptyComponent={
            composeMode === "group" && !doSearch ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t("messages.searchPeople")}</Text>
                <Text style={styles.emptyText}>{t("messages.searchPeopleForGroup")}</Text>
              </View>
            ) : !sLoading && doSearch ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t("messages.noResultsFound")}</Text>
                <Text style={styles.emptyText}>
                  {t("messages.tryADifferentName")}</Text>
              </View>
            ) : null
          }
          renderItem={({ item: u }: any) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => (composeMode === "group" ? toggleSelectedUser(u) : startWithUser(u))}
              activeOpacity={0.9}
            >
              <ExpoImage
                source={(u.avatarThumbUrl || u.avatarUrl || null)? { uri: (u.avatarThumbUrl || u.avatarUrl || null)} : avatarPlaceholder }
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="disk"
                transition={120}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {u.username}
                  {u.isFollowing ? (
                    <Text style={styles.followingPill}> {t("messages.followsYou")}</Text>
                  ) : null}
                </Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                  {t("messages.sendMessage")}</Text>
              </View>

              {composeMode === "group" ? (
                <View style={[styles.selectCircle, selectedUserIds.has(String(u.id)) && styles.selectCircleActive]}>
                  {selectedUserIds.has(String(u.id)) ? <Ionicons name="checkmark" size={16} color={C.bg} /> : null}
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={C.subtext} />
              )}
            </TouchableOpacity>
          )}
        />
      )}
      {showCreateCommunity ? (
        <GroupLinkSheet
          onClose={() => setShowCreateCommunity(false)}
          onCreated={() => {
            setShowCreateCommunity(false);
            refetchThreads().catch(() => {});
          }}
        />
      ) : null}
    </View>
  );
}

/* ───────────────── Helpers ───────────────── */

function readableThreadTitle(members: any[], meId?: string) {
  const list = (members || [])
    .map((m) => ({ id: m?.id, username: m?.username }))
    .filter((x) => !!x.username);

  // bei 1:1: zeig bevorzugt den anderen
  if (meId && list.length === 2) {
    const other = list.find((x) => x.id !== meId);
    if (other?.username) return other.username;
  }

  const names = list.map((x) => x.username);
  const base = names.slice(0, 3).join(", ");
  return base + (names.length > 3 ? ` +${names.length - 3}` : "");
}

function dateShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
}

/* ───────────────── Styles ───────────────── */

const makeStyles = (C: {
  bg: string;
  card: string;
  text: string;
  subtext: string;
  border: string;
  primary: string;
  danger: string;
}) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },

    header: {
      paddingHorizontal: 12,
      paddingBottom: 10,
      paddingTop: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    headerPlus: {
      color: C.text,
      fontSize: 30,
      fontWeight: "500",
      lineHeight: 42,
    },
    headerTitle: {
      flex: 1,
      color: C.text,
      fontSize: 28,
      fontWeight: "900",
      textAlign: "left",
    },

    searchRow: {
      marginHorizontal: 16,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 12,
      height: 44,
      gap: 8,
    },
    searchInput: { flex: 1, color: C.text, fontSize: 16 },
    composeBar: {
      marginHorizontal: 16,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    composeTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
    composeSub: { flex: 1, color: C.subtext, fontSize: 12, fontWeight: "600", marginTop: 2 },
    composeMain: { flex: 1, minWidth: 0, gap: 8 },
    composeHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    composeFooterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    groupImageBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.bg,
      overflow: "hidden",
    },
    groupImagePreview: {
      width: "100%",
      height: "100%",
    },
    groupTitleInput: {
      minHeight: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      color: C.text,
      paddingHorizontal: 10,
      fontSize: 14,
      fontWeight: "700",
      backgroundColor: C.bg,
    },
    composeCreateBtn: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.text,
    },
    composeCreateText: { color: C.bg, fontSize: 12, fontWeight: "900" },
    composeCancelBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },

    sep: { height: 1, backgroundColor: C.border, opacity: 0.6 },

    item: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.border,
    },
    itemTitle: { color: C.text, fontWeight: "700", fontSize: 16 },
    itemTitleInRow: { flex: 1, minWidth: 0 },
    itemSub: { color: C.subtext, fontSize: 12, marginTop: 2 },
    itemTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    threadLabel: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    threadLabelDisabled: {
      opacity: 0.85,
    },
    threadLabelText: {
      color: C.subtext,
      fontSize: 10,
      fontWeight: "800",
    },
    threadLabelTextDisabled: {
      color: C.danger,
    },

    badge: {
      backgroundColor: C.danger,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      alignSelf: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
    },
    badgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },

    emptyBox: { padding: 24, alignItems: "center" },
    emptyTitle: { color: C.text, fontWeight: "800", fontSize: 16, marginBottom: 6 },
    emptyText: { color: C.subtext, textAlign: "center" },

    followingPill: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "600",
    },
    selectCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },
    selectCircleActive: {
      borderColor: C.text,
      backgroundColor: C.text,
    },
  });
