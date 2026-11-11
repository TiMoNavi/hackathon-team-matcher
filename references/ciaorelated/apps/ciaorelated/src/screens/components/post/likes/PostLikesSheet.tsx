// apps/ciaorelated/src/screens/components/post/likes/PostLikesSheet.tsx
import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { gql, useQuery } from "@apollo/client";
import { useTheme } from "../../../../theme/ThemeProvider";
import FollowButton from "../../../components/FollowButton";
import { useNavigation } from "@react-navigation/native";

// ✅ local placeholder
import { avatarPlaceholder } from "../../../../../assets/placeholders";

import { useTranslation } from "react-i18next";

const POST_LIKERS_Q = gql`
  query PostLikers($postId: ID!, $offset: Int, $limit: Int) {
    postLikers(postId: $postId, offset: $offset, limit: $limit) {
      id
      username
      name
      avatarThumbUrl
      avatarUrl
      isFollowing
      isPrivate
      followRequested
      __typename
    }
  }
`;

const ME_MINI_Q = gql`
  query MeMiniForLikesSheet {
    me {
      id
      __typename
    }
  }
`;

type Row = {
  id: string;
  username: string;
  name?: string | null;
  avatarThumbUrl?: string | null;
  avatarUrl?: string | null;
  isFollowing?: boolean;
  isPrivate?: boolean;
  followRequested?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  postId: string;
};

// ✅ shared avatar resolver
function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder;
}

export function PostLikesSheet({ visible, onClose, postId }: Props) {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const C = theme.colors;

 

  const { data, loading, refetch, error } = useQuery(POST_LIKERS_Q, {
    variables: { postId, offset: 0, limit: 50 },
    skip: !visible,
    fetchPolicy: visible ? "network-only" : "cache-first",
  });



  const { data: meData } = useQuery(ME_MINI_Q, {
    skip: !visible,
    fetchPolicy: "cache-first",
  });
 

  const meId: string | undefined = meData?.me?.id;

  const rowsRaw: Row[] = data?.postLikers ?? [];

  // ✅ “Du” immer oben
  const rows: Row[] = useMemo(() => {
    if (!meId || rowsRaw.length === 0) return rowsRaw;

    const idx = rowsRaw.findIndex((r) => r.id === meId);
    if (idx === -1) return rowsRaw;

    const meRow = rowsRaw[idx];
    const rest = rowsRaw.filter((r) => r.id !== meId);
    return [meRow, ...rest];
  }, [rowsRaw, meId]);

  const s = useMemo(() => styles(C), [C]);

  const onOpenUser = useCallback(
    (u: Row) => {
      onClose();
      nav.navigate("UserProfile", { username: u.username });
    },
    [nav, onClose]
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.modalRoot} pointerEvents="box-none">
        <Pressable style={s.backdrop} onPress={onClose} />

        <View style={s.sheet}>
          <View style={s.handle} />
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={s.iconButton}>
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>

            <Text style={s.title}>Likes</Text>

            <TouchableOpacity
              onPress={() => refetch()}
              hitSlop={12}
              style={[s.iconButton, { opacity: loading ? 0.6 : 1 }]}
              disabled={loading}
            >
              <Ionicons name="refresh" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {error ? (
            <View style={s.center}>
              <Text style={{ color: C.subtext, textAlign: "center", paddingHorizontal: 18 }}>
                {t("postlikessheet.couldNotLoadLikes")}</Text>
            </View>
          ) : loading && rows.length === 0 ? (
            <View style={s.center}>
              <ActivityIndicator />
            </View>
          ) : rows.length === 0 ? (
            <View style={s.center}>
              <Text style={{ color: C.subtext }}>{t("postlikessheet.noLikesYet")}</Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(it) => it.id}
              contentContainerStyle={s.listContent}
              renderItem={({ item }) => {
                const isMe = !!meId && item.id === meId;
                const src = avatarSource(item.avatarThumbUrl, item.avatarUrl);

                return (
                  <View style={s.row}>
                    <Pressable style={s.left} onPress={() => onOpenUser(item)}>
                      <ExpoImage
                        source={src}
                        style={s.avatar}
                        contentFit="cover"
                        cachePolicy="none"
                        onError={(e) => console.log("AVATAR LOAD FAIL", item.username, src, e?.error)}
                      />

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={s.username} numberOfLines={1}>
                            {item.username}
                          </Text>

                          {isMe && (
                            <View style={s.mePill}>
                              <Text style={s.mePillText}>Du</Text>
                            </View>
                          )}
                        </View>

                        {!!item.name && (
                          <Text style={s.name} numberOfLines={1}>
                            {item.name}
                          </Text>
                        )}
                      </View>
                    </Pressable>

                    <View style={s.followButtonWrap}>
                      <FollowButton
                        userId={item.id}
                        isFollowing={!!item.isFollowing}
                        followRequested={!!item.followRequested}
                        isPrivate={!!item.isPrivate}
                        compact
                        me={isMe} // ✅ blendet Button aus
                        buttonStyle={[
                          s.followButton,
                          {
                            backgroundColor: item.isFollowing || item.followRequested ? C.card : C.primary,
                            borderColor: item.isFollowing || item.followRequested ? C.border : C.primary,
                          },
                        ]}
                        textStyle={s.followButtonText}
                      />
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
    sheet: {
      backgroundColor: C.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      maxHeight: "82%",
      overflow: "hidden",
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    handle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 999,
      backgroundColor: C.border,
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
      backgroundColor: C.card,
    },
    title: { color: C.text, fontWeight: "900", fontSize: 18 },
    center: { paddingVertical: 28, alignItems: "center", justifyContent: "center" },
    listContent: { paddingTop: 2, paddingBottom: 12, gap: 6 },
    row: {
      paddingHorizontal: 8,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      borderRadius: 14,
    },
    left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 8 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    username: { color: C.text, fontWeight: "800" },
    name: { color: C.subtext, fontSize: 12, marginTop: 2 },
    mePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: "rgba(79,140,255,0.18)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(79,140,255,0.35)",
    },
    mePillText: {
      color: C.primary,
      fontWeight: "900",
      fontSize: 12,
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
    followButtonWrap: {
      width: 96,
      alignItems: "flex-end",
    },
    followButtonText: {
      color: C.text,
      fontSize: 12,
      lineHeight: 14,
      fontWeight: "900",
    },
  });
