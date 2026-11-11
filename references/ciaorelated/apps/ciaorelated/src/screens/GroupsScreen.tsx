import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { gql, useMutation, useQuery } from "@apollo/client";
import * as Clipboard from "expo-clipboard";

import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";
import { brand } from "../config/brand";
import { buildJoinUrl } from "../config/webLinks";
import GroupLinkSheet from "./GroupLinkSheet";
import type { RootStackParamList } from "../../App";

import { useTranslation } from "react-i18next";

const MY_GROUP_LINKS = gql`
  query MyJoinedGroupLinks {
    myJoinedGroupLinks {
        id
        title
        type
        visibility
        slug
        createdAt
        memberCount
    }
    }


`;



const LEAVE_GROUP = gql`
  mutation LeaveGroup($groupId: ID!) {
    leaveGroup(groupId: $groupId)
  }
`;

function iconForType(type: string) {
  switch (type) {
    case "DROP":
      return "shirt-outline";
    case "EVENT":
      return "flash";
    case "COMMUNITY":
      return "people";
    case "UNI":
      return "school";
    case "BUSINESS":
      return "briefcase";
    case "FAMILY":
      return "home";
    default:
      return "albums-outline";
  }
}

function typeTint(type: string, C: any) {
  if (type === "EVENT") return { bg: "rgba(255,184,77,0.17)", fg: "#FFB84D" };
  if (type === "COMMUNITY") return { bg: "rgba(79,140,255,0.13)", fg: C.primary ?? C.text };
  if (type === "UNI") return { bg: "rgba(54,211,153,0.13)", fg: "#36D399" };
  if (type === "BUSINESS") return { bg: "rgba(168,85,247,0.14)", fg: "#A855F7" };
  if (type === "FAMILY") return { bg: "rgba(244,114,182,0.14)", fg: "#F472B6" };
  return { bg: "rgba(255,255,255,0.08)", fg: C.text };
}

function isOwnerLeaveError(error: unknown) {
  const raw = String((error as any)?.message ?? "");
  return raw.toLowerCase().includes("owner cannot leave");
}

export default function GroupsScreen() {
  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = styles(C);

  const { t } = useTranslation();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const [showCreate, setShowCreate] = useState(false);

  const { data, refetch } = useQuery(MY_GROUP_LINKS, { fetchPolicy: "cache-and-network" });
  const [leaveGroup] = useMutation(LEAVE_GROUP);

    const groups = useMemo(() => {
    return [...(data?.myJoinedGroupLinks ?? [])].sort(
        (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    }, [data?.myJoinedGroupLinks]);


  const onCopy = useCallback(async (slug?: string | null) => {
    if (!slug) return;

    const url = buildJoinUrl(slug);
    await Clipboard.setStringAsync(url);

    Alert.alert(t("groups.copiedTitle"), t("groups.inviteLinkCopied"));
    }, []);


  const onLeave = useCallback((groupId: string, title: string) => {
    Alert.alert(
        t("groups.leave.title"),
        t("groups.leave.body", { title }),
        [
            { text: t("common.cancel"), style: "cancel" },
            {
            text: t("groups.leave.confirm"),
            style: "destructive",
            onPress: async () => {
                try {
                await leaveGroup({ variables: { groupId } });
                refetch();
                } catch (e: any) {
                if (isOwnerLeaveError(e)) {
                  Alert.alert(t("groups.leave.ownerTitle"), t("groups.leave.ownerBody"));
                  return;
                }
                Alert.alert(t("common.error"), t("groups.leave.failed"));
                }
            },
            },
        ]
        );

  }, [leaveGroup, refetch, t]);

  return (
    <Screen scroll={false}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowCreate(true)} hitSlop={12} style={s.headerAddBtn}>
          <Ionicons name="add" size={24} color={C.bg} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.scrollContent}>
        <View style={s.hero}>
          <Text style={s.heroEyebrow}>{t("groups.liveFeed")}</Text>
          <Text style={s.heroTitle}>{t("groups.hubTitle")}</Text>
          <Text style={s.heroSub}>{t("groups.hubSubtitle")}</Text>
        </View>

        {groups.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIcon}>
              <Ionicons name="people-circle-outline" size={34} color={C.text} />
            </View>
            <Text style={s.emptyTitle}>{t("groups.emptyTitle", { appName: brand.appName })}</Text>
            <Text style={s.emptySub}>{t("groups.emptyBody")}</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreate(true)}>
              <Ionicons name="add-circle-outline" size={18} color={C.bg} />
              <Text style={s.emptyBtnText}>{t("groups.createANewGroupLink")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.cardsStack}>
            {groups.map((g: any) => {
              const tint = typeTint(g.type, C);
              return (
                <View key={g.id} style={s.communityCard}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => nav.navigate("CommunitySpace", { id: g.id, title: g.title, slug: g.slug, type: g.type })}
                    style={s.cardMain}
                  >
                    <View style={[s.cardIcon, { backgroundColor: tint.bg }]}>
                      <Ionicons name={iconForType(g.type) as any} size={21} color={tint.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.cardMetaRow}>
                        <View style={s.livePill}>
                          <View style={s.liveDot} />
                          <Text style={s.liveText}>{t("groups.liveFeed")}</Text>
                        </View>
                        <Text style={s.typePill}>{t(`grouplinksheet.type.${String(g.type ?? "community").toLowerCase()}`)}</Text>
                      </View>
                      <Text style={s.cardTitle} numberOfLines={1}>{g.title ?? t("groups.groupFallback")}</Text>
                      <Text style={s.cardSub} numberOfLines={1}>
                        <Ionicons name={g.visibility === "PUBLIC" ? "globe-outline" : "lock-closed-outline"} size={12} color={C.subtext} />
                        {" "}{t(g.visibility === "PUBLIC" ? "communityprivacy.public" : "communityprivacy.private")}{" · "}
                        {t("communityspace.peopleHere", { count: g.memberCount ?? 0 })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={C.subtext} />
                  </TouchableOpacity>

                  <View style={s.actionsRow}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => nav.navigate("CommunitySpace", { id: g.id, title: g.title, slug: g.slug, type: g.type })}>
                      <Ionicons name="sparkles-outline" size={14} color={C.text} />
                      <Text style={s.actionText} numberOfLines={1}>{t("groups.liveFeed")}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.actionBtn} onPress={() => onCopy(g.slug)}>
                      <Ionicons name="link-outline" size={14} color={C.text} />
                      <Text style={s.actionText} numberOfLines={1}>{t("groups.copyLink")}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[s.actionBtn, s.dangerBtn]} onPress={() => onLeave(g.id, g.title)}>
                      <Ionicons name="exit-outline" size={14} color={C.danger} />
                      <Text style={[s.actionText, { color: C.danger }]} numberOfLines={1}>{t("groups.leaveGroup")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {showCreate && <GroupLinkSheet onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    header: {
      height: 54,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.bg,
    },
    headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", zIndex: 2 },
    headerAddBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: C.text },
    scrollContent: { paddingHorizontal: 14, paddingBottom: 28 },
    hero: { paddingTop: 8, paddingBottom: 18 },
    heroEyebrow: { color: C.primary ?? C.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
    heroTitle: { color: C.text, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: 0, marginTop: 5 },
    heroSub: { color: C.subtext, fontSize: 14, lineHeight: 19, fontWeight: "700", marginTop: 7 },
    cardsStack: { gap: 12 },
    communityCard: {
      backgroundColor: C.card,
      borderRadius: 18,
      overflow: "hidden",
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 12,
    },
    cardMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingBottom: 12,
    },
    cardIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
    cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    livePill: { height: 22, borderRadius: 11, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(54,211,153,0.13)" },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#36D399" },
    liveText: { color: C.text, fontSize: 11, fontWeight: "900" },
    typePill: { color: C.subtext, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
    cardTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
    cardSub: { color: C.subtext, fontSize: 12, fontWeight: "700", marginTop: 3 },
    actionsRow: {
      flexDirection: "row",
      gap: 6,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      minWidth: 0,
      height: 34,
      paddingHorizontal: 4,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: "transparent",
    },
    actionText: { color: C.text, fontWeight: "700", fontSize: 11, flexShrink: 1 },
    dangerBtn: { borderColor: C.danger },
    emptyCard: {
      marginTop: 16,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
      padding: 22,
      alignItems: "center",
    },
    emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", marginBottom: 14 },
    emptyTitle: { color: C.text, fontSize: 21, fontWeight: "900", textAlign: "center" },
    emptySub: { color: C.subtext, fontSize: 14, lineHeight: 19, fontWeight: "700", textAlign: "center", marginTop: 8 },
    emptyBtn: {
      marginTop: 18,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      backgroundColor: C.text,
    },
    emptyBtnText: { color: C.bg, fontWeight: "900" },
  });
