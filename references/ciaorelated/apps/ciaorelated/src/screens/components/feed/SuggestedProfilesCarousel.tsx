import React, { useMemo, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import FollowButton from "../FollowButton";

// ✅ Local placeholder (kein Remote-Fallback)
import { avatarPlaceholder } from "../../../../assets/placeholders";

import { useTranslation } from "react-i18next";
import { brand } from "../../../config/brand";

type SuggestedUser = {
  id: string;
  username: string;
  avatarThumbUrl?: string | null;
  avatarUrl?: string | null;
  isPrivate?: boolean;
  isFollowing?: boolean;
  followRequested?: boolean;
};

// ✅ Einheitliche Avatar-Source-Logik
function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder;
}

export function SuggestedProfilesCarousel({
  title,
  users,
  C,
}: {
  title: string;
  users: SuggestedUser[];
  C: any;
}) {
  const { t } = useTranslation();

  const s = useMemo(() => styles(C), [C]);
  const navigation = useNavigation<any>();

  const goProfile = useCallback(
    (username: string) => {
      navigation.navigate("UserProfile", { username });
    },
    [navigation]
  );

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.title}>{title}</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        initialNumToRender={6}
        windowSize={5}
        removeClippedSubviews
        getItemLayout={(_, i) => ({
          length: 182, // 170 + marginRight 12
          offset: 182 * i,
          index: i,
        })}
        renderItem={({ item }) => {
          const avatarSrc = avatarSource(item.avatarThumbUrl, item.avatarUrl);

          return (
            <View style={s.card}>
              {/* Avatar */}
              <TouchableOpacity activeOpacity={0.85} onPress={() => goProfile(item.username)}>
                <ExpoImage
                  source={avatarSrc}
                  style={s.avatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={`avatar:${item.id}:${item.avatarThumbUrl ?? item.avatarUrl ?? "p"}`}
                />
              </TouchableOpacity>

              {/* Username */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => goProfile(item.username)}
                style={{ marginTop: 10 }}
              >
                <Text style={s.username} numberOfLines={1}>
                  {item.username}
                </Text>
              </TouchableOpacity>

              <Text style={s.subtitle} numberOfLines={2}>
                {t("suggestedprofilescarousel.suggestedByciaorelated", { appName: brand.appName })}</Text>

              <View style={{ marginTop: 10, width: "100%" }}>
                <FollowButton
                  userId={item.id}
                  isPrivate={!!item.isPrivate}
                  isFollowing={!!item.isFollowing}
                  followRequested={!!item.followRequested}
                />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    wrap: {
      paddingVertical: 12,
      backgroundColor: C.bg,
      marginTop: 20,
      marginBottom: 5,
    },
    headerRow: {
      paddingHorizontal: 12,
      paddingBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      color: C.text,
      fontWeight: "800",
      fontSize: 16,
    },
    listContent: {
      paddingHorizontal: 12,
    },
    card: {
      width: 170,
      borderRadius: 18,
      backgroundColor: C.card ?? "#111",
      padding: 14,
      marginRight: 12,
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      overflow: "hidden",
    },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: C.card ?? "#111",
    },
    username: {
      color: C.text,
      fontWeight: "800",
      maxWidth: 140,
      textAlign: "center",
    },
    subtitle: {
      marginTop: 4,
      color: C.subtext ?? C.sub,
      fontSize: 12,
      textAlign: "center",
    },
  });
