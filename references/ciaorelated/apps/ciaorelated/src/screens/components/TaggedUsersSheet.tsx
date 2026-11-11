// apps/ciaorelated/src/screens/components/TaggedUsersSheet.tsx
import React, { memo, useCallback, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeProvider";
import { avatarPlaceholder } from "../../../assets/placeholders";

import { useTranslation } from "react-i18next";

export type TaggedUser = {
  user: {
    id: string;
    username: string;
    avatarThumbUrl?: string | null;
    avatarUrl?: string | null;
    __typename?: string;
  };
  status?: string; // "ACCEPTED" | "APPROVED" | ...
  showOnProfile?: boolean;
  __typename?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  tags: TaggedUser[]; // (bereits gefiltert oder nicht – egal)
  myId?: string | null;
  onSelectUser?: (username: string) => void;
  title?: string;
};

// ✅ shared avatar resolver
function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder; // local require()
}

const Row = memo(function Row({
  item,
  meId,
  onOpen,
  C,
}: {
  item: TaggedUser;
  meId?: string | null;
  onOpen: (username: string) => void;
  C: any;
}) {
  const { t } = useTranslation();

  const isMe = !!meId && item.user.id === meId;
  const src = avatarSource(item.user.avatarThumbUrl, item.user.avatarUrl);

  return (
    <Pressable style={rowStyles(C).row} onPress={() => onOpen(item.user.username)}>
      <ExpoImage
        source={src}
        style={rowStyles(C).avatar}
        contentFit="cover"
        cachePolicy="disk"
        onError={(e) =>
          console.log("TAGGED AVATAR LOAD FAIL", item.user.username, src, e?.error)
        }
      />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={rowStyles(C).username} numberOfLines={1}>
            @{item.user.username}
          </Text>

          {isMe && (
            <View style={rowStyles(C).mePill}>
              <Text style={rowStyles(C).mePillText}>{t("taggeduserssheet.me")}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={rowStyles(C).chevronWrap}>
        <Ionicons name="chevron-forward" size={18} color={C.subtext ?? "#9CA3AF"} />
      </View>
    </Pressable>
  );
});

export default function TaggedUsersSheet({
  visible,
  onClose,
  tags,
  myId,
  onSelectUser,
  title,
}: Props) {
  const { theme } = useTheme();
  const C = theme.colors;

  const { t } = useTranslation();
  const s = useMemo(() => styles(C), [C]);

  const onOpenUser = useCallback(
    (username: string) => {
      onClose();
      onSelectUser?.(username);
    },
    [onClose, onSelectUser]
  );

  const keyExtractor = useCallback((t: TaggedUser) => t.user.id, []);

  const renderItem = useCallback(
    ({ item }: { item: TaggedUser }) => (
      <Row item={item} meId={myId} onOpen={onOpenUser} C={C} />
    ),
    [myId, onOpenUser, C]
  );

  const getItemLayout = useCallback((_data: any, index: number) => {
    const ROW_H = 56;
    return { length: ROW_H, offset: ROW_H * index, index };
  }, []);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.modalRoot} pointerEvents="box-none">
        <Pressable style={s.backdrop} onPress={onClose} />

        <View style={s.sheet}>
          <View style={s.handle} />
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerSpacer} />

            <Text style={s.title}>{title ?? t("taggeduserssheet.title")}</Text>

            {/* Spacer / optional action */}
            <View style={s.headerSpacer} />
          </View>

          {/* Content */}
          {!tags ? (
            <View style={s.center}>
              <ActivityIndicator />
            </View>
          ) : tags.length === 0 ? (
            <View style={s.center}>
              <Text style={{ color: C.subtext ?? "#9CA3AF" }}>{t("taggeduserssheet.noAcceptedTags")}</Text>
            </View>
          ) : (
            <FlatList
              data={tags}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              contentContainerStyle={s.listContent}
              initialNumToRender={14}
              maxToRenderPerBatch={18}
              windowSize={8}
              removeClippedSubviews
              keyboardShouldPersistTaps="handled"
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
    headerSpacer: {
      width: 34,
      height: 34,
    },
    title: { color: C.text, fontWeight: "900", fontSize: 18 },
    center: { paddingVertical: 28, alignItems: "center", justifyContent: "center" },
    listContent: { paddingTop: 2, paddingBottom: 12, gap: 6 },
  });

const rowStyles = (C: any) =>
  StyleSheet.create({
    row: {
      paddingHorizontal: 8,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      borderRadius: 14,
      backgroundColor: C.bg,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    username: { color: C.text, fontWeight: "800" },
    chevronWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.card,
    },
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
  });
