import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useTheme } from "../../theme/ThemeProvider";
import FollowButton from "./FollowButton"; // <-- ggf. ../FollowButton
import { avatarPlaceholder } from "../../../assets/placeholders";

import { useTranslation } from "react-i18next";

export type FollowListMode = "followers" | "following";

type UserRow = {
  id: string;
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;

  isPrivate?: boolean | null;
  isMe?: boolean | null;

  isFollowing?: boolean | null;
  followRequested?: boolean | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;

  ownerUserId: string;
  ownerIsMe: boolean;

  mode: FollowListMode;
  onSelectUser?: (username: string) => void;
  onChanged?: () => void;
};

const FOLLOWERS_QUERY = gql`
  query Followers($userId: ID!, $offset: Int = 0, $limit: Int = 50) {
    followers(userId: $userId, offset: $offset, limit: $limit) {
      id
      username
      name
      avatarThumbUrl
      avatarUrl
      isPrivate
      isMe
      isFollowing
      followRequested
      __typename
    }
  }
`;

const FOLLOWING_QUERY = gql`
  query Following($userId: ID!, $offset: Int = 0, $limit: Int = 50) {
    following(userId: $userId, offset: $offset, limit: $limit) {
      id
      username
      name
      avatarThumbUrl
      avatarUrl
      isPrivate
      isMe
      isFollowing
      followRequested
      __typename
    }
  }
`;

const REMOVE_FOLLOWER = gql`
  mutation RemoveFollower($userId: ID!) {
    removeFollower(userId: $userId)
  }
`;

const UNFOLLOW = gql`
  mutation Unfollow($userId: ID!) {
    unfollow(userId: $userId)
  }
`;
function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder;
}

export default function FollowListSheet({
  visible,
  onClose,
  ownerUserId,
  ownerIsMe,
  mode,
  onSelectUser,
  onChanged,
}: Props) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const COLORS: any = theme.colors;

  const [busyId, setBusyId] = useState<string | null>(null);

  const showRemoveFollower = ownerIsMe && mode === "followers";

  const queryDoc = mode === "followers" ? FOLLOWERS_QUERY : FOLLOWING_QUERY;
  const dataKey = mode === "followers" ? "followers" : "following";

  const { data, loading, refetch, error } = useQuery(queryDoc, {
    variables: { userId: ownerUserId, offset: 0, limit: 100 },
    skip: !visible || !ownerUserId,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
    errorPolicy: "all",
  });

  const rows: UserRow[] = useMemo(() => {
    const arr = (data as any)?.[dataKey];
    return Array.isArray(arr) ? arr : [];
  }, [data, dataKey]);

  const isForbidden = (error?.message ?? "").toLowerCase().includes("forbidden");

  const [removeFollowerMut] = useMutation(REMOVE_FOLLOWER);
  const [unfollowMut] = useMutation(UNFOLLOW);

  const title = mode === "followers" ? t("followlistsheet.followersTitle") : t("followlistsheet.followingTitle");

  const doRemoveFollower = useCallback(
    async (u: UserRow) => {
      Alert.alert(t("followlistsheet.removeTitle", { username: u.username }), t("followlistsheet.removeBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("followlistsheet.remove"),
          style: "destructive",
          onPress: async () => {
            try {
              setBusyId(u.id);
              await removeFollowerMut({ variables: { userId: u.id } });
              await refetch?.();
              onChanged?.();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [removeFollowerMut, refetch, onChanged, t]
  );

  const doUnfollow = useCallback(
    async (u: UserRow) => {
      Alert.alert(t("followlistsheet.unfollowTitle", { username: u.username }), t("followlistsheet.unfollowBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("followlistsheet.unfollow"),
          style: "destructive",
          onPress: async () => {
            try {
              setBusyId(u.id);
              await unfollowMut({ variables: { userId: u.id } });
              await refetch?.();
              onChanged?.();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [unfollowMut, refetch, onChanged, t]
  );

  const renderItem = useCallback(({ item }: { item: UserRow }) => {
    const disabled = busyId === item.id;
    const src = avatarSource(item.avatarThumbUrl, item.avatarUrl);

    return (
      <View style={[styles.row, { backgroundColor: COLORS.bg }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onSelectUser?.(item.username)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 }}
        >
          <Image source={src} style={styles.avatar} cachePolicy="disk" transition={80} />

          <View style={{ flex: 1 }}>
            <Text style={[styles.username, { color: COLORS.text }]} numberOfLines={1}>
              @{item.username}
            </Text>
            {!!item.name && (
              <Text style={[styles.name, { color: COLORS.subtext }]} numberOfLines={1}>
                {item.name}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {showRemoveFollower ? (
          <TouchableOpacity
            onPress={() => doRemoveFollower(item)}
            disabled={disabled}
            activeOpacity={0.85}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[
              styles.actionBtn,
              {
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                opacity: disabled ? 0.6 : 1,
              },
            ]}
          >
            {disabled ? <ActivityIndicator /> : <Text style={[styles.actionText, { color: COLORS.text }]}>{t("followlistsheet.remove")}</Text>}
          </TouchableOpacity>
        ) : (
          <View style={styles.followButtonWrap}>
            <FollowButton
              userId={item.id}
              isFollowing={!!item.isFollowing}
              followRequested={!!item.followRequested}
              isPrivate={!!item.isPrivate}
              me={!!item.isMe}
              compact
              buttonStyle={[
                styles.followButton,
                {
                  backgroundColor: item.isFollowing || item.followRequested ? COLORS.card : COLORS.primary,
                  borderColor: item.isFollowing || item.followRequested ? COLORS.border : COLORS.primary,
                },
              ]}
              textStyle={[styles.followButtonText, { color: COLORS.text }]}
            />
          </View>
        )}
      </View>
    );
  }, [busyId, COLORS.border, COLORS.card, COLORS.primary, COLORS.subtext, COLORS.text, doRemoveFollower, onSelectUser, showRemoveFollower]);


  const ROW_H = 66;
  const getItemLayout = useCallback((_data: any, index: number) => ({
    length: ROW_H,
    offset: ROW_H * index,
    index,
  }), []);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: COLORS.bg, borderColor: COLORS.border }]}>
        <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={[styles.iconButton, { backgroundColor: COLORS.card }]}>
            <Ionicons name="close" size={22} color={COLORS.text} />
          </TouchableOpacity>

          <Text style={[styles.title, { color: COLORS.text }]}>{title}</Text>

          <View style={{ width: 34 }} />
        </View>

        {/* Private/Forbidden Handling */}
        {isForbidden ? (
          <View style={styles.center}>
            <Text style={{ color: COLORS.subtext, textAlign: "center", paddingHorizontal: 18 }}>
              {t("followlistsheet.thisProfileIsPrivateYouCanOnlySeeThe59e432")}</Text>
          </View>
        ) : loading && rows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: COLORS.subtext }}>
              {mode === "followers" ? t("followlistsheet.emptyFollowers") : t("followlistsheet.emptyFollowing")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(u) => u.id}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            initialNumToRender={16}
            windowSize={7}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
  },

   backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 1,
  },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "78%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,

    // ✅ muss über backdrop liegen
    zIndex: 2,
    elevation: 25,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
  },
  header: {
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
  },
  center: {
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingTop: 2,
    paddingBottom: 18,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  username: {
    fontSize: 14,
    fontWeight: "800",
  },
  name: {
    fontSize: 12,
    marginTop: 2,
  },
  actionBtn: {
    width: 96,
    height: 34,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
  followButtonWrap: {
    width: 96,
    alignItems: "flex-end",
  },
  followButton: {
    width: 96,
    height: 34,
    paddingHorizontal: 12,
    paddingVertical: 0,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  followButtonText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
  },
});
