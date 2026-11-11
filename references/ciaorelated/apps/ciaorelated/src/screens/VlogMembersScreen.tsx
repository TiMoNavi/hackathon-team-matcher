import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useTheme } from "../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

/* ---------- GraphQL ---------- */

// 1) Mitglieder eines Vlogs (nur Admin/Owner)
const VLOG_MEMBERS = gql`
  query VlogMembers($vlogId: ID!) {
    vlogMembers(vlogId: $vlogId) {
      user { id username avatarUrl }
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

// 3) Profile suchen (⚠️ wichtig: KEIN edges, wenn dein Server das nicht hat)
const SEARCH_USERS = gql`
  query SearchUsers($q: String!, $limit: Int!) {
    searchUsers(q: $q, limit: $limit) {
      id
      username
      avatarUrl
    }
  }
`;

type Tab = "MEMBERS" | "INVITE";

export default function VlogMembersScreen() {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C), [C]);

  // Route params
  const vlogId = route.params?.vlogId as string;
  const isAdmin = !!route.params?.isAdmin;
  const ownerId = (route.params?.ownerId as string) ?? null;

  const [tab, setTab] = useState<Tab>((route.params?.initialTab as Tab) ?? "MEMBERS");
  const [searchQ, setSearchQ] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Members
  const { data: membersData, loading: membersLoading, refetch: refetchMembers } = useQuery(VLOG_MEMBERS, {
    variables: { vlogId },
    skip: !vlogId || !isAdmin,
    fetchPolicy: "network-only",
  });

  // Init selectedIds from accepted members
  useEffect(() => {
    const rows = membersData?.vlogMembers ?? [];
    const ids = rows
      .filter((m: any) => m?.status === "ACCEPTED")
      .map((m: any) => m?.user?.id)
      .filter(Boolean) as string[];

    const withOwner = ownerId ? Array.from(new Set([ownerId, ...ids])) : ids;
    setSelectedIds(new Set(withOwner));
  }, [membersData, ownerId]);

  // Search
  const [runSearch, { data: searchData, loading: searchLoading }] = useLazyQuery(SEARCH_USERS, {
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (tab !== "INVITE") return;
    const q = (searchQ ?? "").trim();
    const t = setTimeout(() => {
      if (q.length >= 1) runSearch({ variables: { q, limit: 30 } });
    }, 250);
    return () => clearTimeout(t);
  }, [tab, searchQ, runSearch]);

  const [setVlogMembers, { loading: saving }] = useMutation(SET_VLOG_MEMBERS);

  const toggle = useCallback(
    (userId: string, disabled?: boolean) => {
      if (disabled) return;
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
      });
    },
    []
  );

  const save = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const safe = ownerId ? Array.from(new Set([ownerId, ...ids])) : ids;

    try {
      await setVlogMembers({ variables: { vlogId, userIds: safe } });
      await refetchMembers?.();
      nav.goBack();
    } catch (e) {
      console.warn("setVlogMembers failed", e);
    }
  }, [selectedIds, setVlogMembers, vlogId, ownerId, refetchMembers, nav]);

  const members = useMemo(
    () => (membersData?.vlogMembers ?? []).filter((m: any) => m?.status === "ACCEPTED"),
    [membersData]
  );

  const results = useMemo(() => searchData?.searchUsers ?? [], [searchData]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.topbar}>
          <Pressable onPress={() => nav.goBack()} style={s.iconBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={C.text} />
          </Pressable>
          <Text style={s.topTitle}>{t("vlogmembers.members")}</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={s.center}>
          <Text style={s.sub}>{t("vlogmembers.youDoNotHaveAdminRights")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      {/* Topbar: X links, Titel Mitte, Speichern rechts */}
      <View style={s.topbar}>
        <Pressable onPress={() => nav.goBack()} style={s.iconBtn} hitSlop={10}>
          <Ionicons name="close" size={22} color={C.text} />
        </Pressable>

        <Text style={s.topTitle}>{t("vlogmembers.members")}</Text>

        <Pressable onPress={save} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.6 }]}>
          <Text style={s.saveTxt}>
            {saving ? t("common.ellipsis") : t("vlogmembers.save")}
          </Text>

        </Pressable>
      </View>

      {/* Tabs */}
      <View style={s.tabsRow}>
        <Pressable
          onPress={() => setTab("MEMBERS")}
          style={[s.tabBtn, tab === "MEMBERS" ? s.tabBtnActive : null]}
        >
          <Ionicons name="people-outline" size={16} color={tab === "MEMBERS" ? C.text : C.subtext} />
          <Text style={[s.tabText, tab === "MEMBERS" ? s.tabTextActive : null]}>{t("vlogmembers.members")}</Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("INVITE")}
          style={[s.tabBtn, tab === "INVITE" ? s.tabBtnActive : null]}
        >
          <Ionicons name="person-add-outline" size={16} color={tab === "INVITE" ? C.text : C.subtext} />
          <Text style={[s.tabText, tab === "INVITE" ? s.tabTextActive : null]}>{t("vlogmembers.invite")}</Text>
        </Pressable>
      </View>

      {tab === "INVITE" && (
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={18} color={C.subtext} />
          <TextInput
            value={searchQ}
            onChangeText={setSearchQ}
            placeholder={t("vlogmembers.searchProfile")}
            placeholderTextColor={C.subtext}
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {/* Content */}
      {tab === "MEMBERS" ? (
        membersLoading ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m: any) => m.user.id}
            renderItem={({ item }: any) => {
              const u = item.user;
              const isOwner = item.role === "OWNER" || u.id === ownerId;
              const checked = selectedIds.has(u.id);

              return (
                <Pressable
                  onPress={() => toggle(u.id, isOwner)}
                  style={[s.row, isOwner ? { opacity: 0.6 } : null]}
                >
                  <ExpoImage source={{ uri: u.avatarUrl ?? undefined }} style={s.avatar} />
                  <Text style={s.username}>{u.username}</Text>

                  <View style={{ flex: 1 }} />

                  <Ionicons
                    name={isOwner ? "lock-closed-outline" : checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={isOwner ? C.subtext : checked ? "#2b8a3e" : C.subtext}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={s.emptyHint}>{t("vlogmembers.noMembers")}</Text>}
          />
        )
      ) : searchLoading ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          data={results.filter((u: any) => u?.id !== ownerId)}
          keyExtractor={(u: any) => u.id}
          renderItem={({ item: u }: any) => {
            const checked = selectedIds.has(u.id);
            return (
              <Pressable onPress={() => toggle(u.id)} style={s.row}>
                <ExpoImage source={{ uri: u.avatarUrl ?? undefined }} style={s.avatar} />
                <Text style={s.username}>{u.username}</Text>

                <View style={{ flex: 1 }} />

                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? "#2b8a3e" : C.subtext}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            (searchQ ?? "").trim().length === 0 ? (
              <Text style={s.emptyHint}>{t("vlogmembers.typeANameToSearchForProfiles")}</Text>
            ) : (
              <Text style={s.emptyHint}>{t("vlogmembers.noMatchesFound")}</Text>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },

    topbar: {
      height: 56,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    iconBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
    },
    topTitle: { flex: 1, textAlign: "center", color: C.text, fontWeight: "900", fontSize: 16 },
    saveBtn: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 88,
    },
    saveTxt: { color: C.text, fontWeight: "900" },

    tabsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10 },
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
    tabText: { fontSize: 14, fontWeight: "900", color: C.subtext },
    tabTextActive: { color: C.text },

    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    searchInput: { flex: 1, color: C.text, fontSize: 16 },

    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(255,255,255,0.08)",
    },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", marginRight: 10 },
    username: { fontSize: 16, color: C.text, fontWeight: "900" },
    emptyHint: { paddingVertical: 14, paddingHorizontal: 12, color: C.subtext, fontWeight: "700" },

    center: { padding: 16 },
    sub: { color: C.subtext },
  });
