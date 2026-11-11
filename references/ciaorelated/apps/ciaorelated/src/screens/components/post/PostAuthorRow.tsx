import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from "expo-image";

import TaggedUsersSheet, { type TaggedUser } from "../TaggedUsersSheet";
import { avatarPlaceholder } from "../../../../assets/placeholders";

import { useTranslation } from "react-i18next";

type Props = {
  author: {
    id?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
  };

  location?: string | null;

  // taggedUsers aus deinem Post (wie du es schon nutzt)
  taggedUsers?: any[] | null;

  // Navigation callbacks (du entscheidest in PostCard/DetailScreen was passiert)
  onPressAuthor?: () => void;
  onPressMore?: () => void;

  // Me / Theme
  myId?: string | null;

  // falls du das "…" verstecken willst, wenn null
  showMore?: boolean;

  C?: {
    text?: string;
    subtext?: string;
    border?: string;
  };
   onSelectTaggedUser?: (username: string) => void;
};

export function PostAuthorRow({
  author,
  location,
  taggedUsers,
  onPressAuthor,
  onPressMore,
  myId,
  showMore = true,
  C,
  onSelectTaggedUser,
}: Props) {
  const { t } = useTranslation();

  const COLORS = {
    text: C?.text ?? "#E6ECFF",
    subtext: C?.subtext ?? "#9AA4BF",
    border: C?.border ?? "rgba(255,255,255,0.10)",
  };

  const [showTaggedSheet, setShowTaggedSheet] = useState(false);

  const acceptedTaggedAll: TaggedUser[] = useMemo(() => {
    const list = Array.isArray(taggedUsers) ? taggedUsers : [];
    return list
      .filter((t: any) => (t?.status === "ACCEPTED" || t?.status === "APPROVED") && t?.user?.id && t?.user?.username)
      .map((t: any) => ({
        user: {
          id: t.user.id,
          username: t.user.username,
          avatarThumbUrl: t.user.avatarThumbUrl,
          avatarUrl: t.user.avatarUrl,
        },
        status: t?.status,
        showOnProfile: t?.showOnProfile,
      }));
  }, [taggedUsers]);

  const taggedCount = acceptedTaggedAll.length;

  return (
    <>
      <View style={s.row}>
        <TouchableOpacity onPress={onPressAuthor} style={s.left} activeOpacity={0.85}>
          <ExpoImage
            source={{ uri: author?.avatarUrl || avatarPlaceholder }}
            style={s.avatar}
            contentFit="cover"
            cachePolicy="disk"
          />

          <View style={{ flex: 1 }}>
            <View style={s.nameLine}>
              <Text style={[s.username, { color: COLORS.text }]} numberOfLines={1}>
                {author?.username ?? "user"}
              </Text>

              {taggedCount > 0 && (
                <>
                  <Text style={{ color: COLORS.text, marginHorizontal: 6 }}>{t("postauthorrow.and")}</Text>
                  <Text
                    style={[s.moreUsers, { color: COLORS.text }]}
                    onPress={() => setShowTaggedSheet(true)}
                  >
                    weitere{taggedCount > 1 ? ` (${taggedCount})` : ""}
                  </Text>
                </>
              )}
            </View>

            {!!location && (
              <Text style={[s.location, { color: COLORS.subtext }]} numberOfLines={1}>
                {location}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {showMore ? (
          <TouchableOpacity onPress={onPressMore} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[s.dots, { color: COLORS.text }]}>⋯</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <TaggedUsersSheet
        visible={showTaggedSheet}
        onClose={() => setShowTaggedSheet(false)}
        tags={acceptedTaggedAll}
        myId={myId ?? null}
        onSelectUser={(uname) => {
          setShowTaggedSheet(false);
          onSelectTaggedUser?.(uname);
          // in PostCard/DetailScreen willst du hier navigieren -> wir geben es zurück über onPressAuthor?
          // Für jetzt: fallback: nichts. Du kannst das später leicht erweitern.
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: "#111" },

  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", flex: 1 },
  username: { fontWeight: "800" },
  moreUsers: { fontWeight: "700", textDecorationLine: "underline" },

  location: { fontSize: 12, marginTop: 2 },
  dots: { fontSize: 24, lineHeight: 24 },
});
