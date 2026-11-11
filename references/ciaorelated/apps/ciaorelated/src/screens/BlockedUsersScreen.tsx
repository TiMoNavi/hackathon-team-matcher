// src/screens/BlockedUsersScreen.tsx
import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { gql, useQuery, useMutation } from "@apollo/client";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";
import { avatarPlaceholder } from "../../assets/placeholders";

import { useTranslation } from "react-i18next";

const BLOCKED_USERS = gql`
  query BlockedUsers {
    blockedUsers {
      id
      username
      avatarUrl
    }
  }
`;

const UNBLOCK_USER = gql`
  mutation UnblockUser($userId: ID!) {
    unblockUser(userId: $userId)
  }
`;

export default function BlockedUsersScreen() {
  const { t } = useTranslation();

  const navigation = useNavigation();
  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = styles(COLORS);

  const { data, loading, refetch } = useQuery(BLOCKED_USERS, {
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const [unblock] = useMutation(UNBLOCK_USER);

  const list = useMemo(() => data?.blockedUsers ?? [], [data]);

  const onUnblock = useCallback(
    (userId: string, username?: string) => {
      Alert.alert(
        t("blockedusers.unblockTitle"),
        username
          ? t("blockedusers.unblockBodyNamed", { username })
          : t("blockedusers.unblockBodyFallback"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("blockedusers.unblock"),
            style: "destructive",
            onPress: async () => {
              try {
                await unblock({
                  variables: { userId },
                  optimisticResponse: { unblockUser: true },
                  update(cache) {
                    const prev = cache.readQuery<{ blockedUsers: any[] }>({
                      query: BLOCKED_USERS,
                    });
                    if (!prev) return;
                    cache.writeQuery({
                      query: BLOCKED_USERS,
                      data: {
                        blockedUsers: prev.blockedUsers.filter((u) => u.id !== userId),
                      },
                    });
                  },
                });
              } catch (e) {
                console.warn("unblock error", e);
                refetch?.();
              }
            },
          },
        ]
      );
    },
    [unblock, refetch, t]
  );

  return (
    <Screen scroll={false}>
      <View style={s.container}>
        {/* Header wie in anderen Screens */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => (navigation as any).goBack()}
            hitSlop={12}
            style={s.headerIconBtn}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {t("blockedusers.blockedProfiles")}</Text>
          </View>

          <View style={s.headerRightSpace} />
        </View>

        {loading && list.length === 0 ? (
          <View style={s.center}>
            <ActivityIndicator />
          </View>
        ) : list.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="ban-outline" size={28} color={COLORS.subtext} />
            </View>
            <Text style={s.emptyTitle}>{t("blockedusers.noBlockedProfiles")}</Text>
            <Text style={s.emptySub}>{t("blockedusers.youCurrentlyHaveNoOneBlocked")}</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(u) => u.id}
            refreshing={loading}
            onRefresh={() => refetch?.()}
            ItemSeparatorComponent={() => <View style={s.sep} />}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <View style={s.row}>
                <View style={s.left}>
                  <ExpoImage
                    source={{ uri: item.avatarUrl || avatarPlaceholder }}
                    style={s.avatar}
                  />
                  <Text style={s.username} numberOfLines={1}>
                    {item.username}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => onUnblock(item.id, item.username)}
                  style={s.unblockBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons name="lock-open-outline" size={16} color={COLORS.text} />
                  <Text style={s.unblockText}>{t("blockedusers.unblock")}</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </Screen>
  );
}

/** ---------- Styles (wie ProfileUnified: styles(COLORS)) ---------- */
const styles = (COLORS: any) =>
  StyleSheet.create({
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

    headerIconBtn: {
      padding: 8,
    },

    headerCenter: {
      flex: 1,
      alignItems: "center",
    },

    headerTitle: {
      color: COLORS.text,
      fontSize: 16,
      fontWeight: "800",
      maxWidth: "80%",
    },

    headerRightSpace: {
      width: 40, // wie in ProfileUnifiedScreen
    },

    sep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: COLORS.border,
      marginLeft: 16,
    },

    row: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.bg,
    },

    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      minWidth: 0,
    },

    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.card,
    },

    username: {
      color: COLORS.text,
      fontWeight: "700",
      flexShrink: 1,
      maxWidth: "75%",
    },

    unblockBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: COLORS.card,
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
    },

    unblockText: {
      color: COLORS.text,
      fontWeight: "700",
      fontSize: 13,
    },

    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
      paddingBottom: 24,
    },

    emptyIconWrap: {
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

    emptyTitle: {
      color: COLORS.text,
      fontWeight: "800",
      fontSize: 16,
      textAlign: "center",
      marginBottom: 6,
    },

    emptySub: {
      color: COLORS.subtext,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },
  });
