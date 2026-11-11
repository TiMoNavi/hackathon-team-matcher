import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import { AvatarImage } from "../AvatarImage";

import { useTranslation } from "react-i18next";

export type HeaderUser = {
  username: string;
  avatarUrl?: string | null;
  avatarFallbackUrl?: string | null;
};

export function PostHeaderRow({
  user,
  subtitle,
  location,
  taggedCount,
  onPressUser,
  onPressSubtitle,
  onPressTagged,
  onPressMenu,
  rightAccessory,

  C,
}: {
  user: HeaderUser;
  subtitle?: string | React.ReactNode;
  location?: string | null;
  taggedCount?: number;
  onPressUser: () => void;
  onPressSubtitle?: () => void;
  onPressTagged?: () => void;
  onPressMenu?: () => void;
  rightAccessory?: ReactNode;
  C: any;
}) {
  const { t } = useTranslation();

  const s = React.useMemo(() => styles(C), [C]);
  const hasSecondLine = !!subtitle || !!location;

const avatarRecycleKey = React.useMemo(() => {
  // NICHT von URL abhängig machen (presigned URLs ändern sich)
  return `avatar:${user.username}`;
}, [user.username]);



  return (
    <View style={s.row}>
      <View style={s.left}>
        <TouchableOpacity onPress={onPressUser} activeOpacity={0.85}>
          <AvatarImage
            thumb={user.avatarUrl}
            full={user.avatarFallbackUrl}
            recyclingKey={avatarRecycleKey}
            style={s.avatar}
          />
        </TouchableOpacity>
        <View style={[s.textBlock, !hasSecondLine && s.textBlockCentered]}>
          <TouchableOpacity onPress={onPressUser} activeOpacity={0.85} style={s.nameRow}>
            <Text style={s.username} numberOfLines={1}>
              {user.username}
            </Text>

            {!!taggedCount && taggedCount > 0 && (
              <>
                <Text style={s.andText}>{t("postheaderrow.and")}</Text>
                <Text style={s.morePeople} onPress={onPressTagged}>
                  {t("postheaderrow.more")}
                  {taggedCount > 1 ? ` (${taggedCount})` : ""}
                </Text>

              </>
            )}
          </TouchableOpacity>

          {hasSecondLine && (
            <TouchableOpacity
              disabled={!onPressSubtitle}
              onPress={onPressSubtitle}
              activeOpacity={0.75}
              style={s.subtitleSlot}
            >
              {!!subtitle
                ? typeof subtitle === "string"
                  ? <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>
                  : subtitle
                : !!location
                  ? <Text style={s.location} numberOfLines={1}>{location}</Text>
                  : null}
            </TouchableOpacity>
          )}

        </View>
      </View>

      <View style={s.right}>
        {!!rightAccessory ? <View style={s.accessory}>{rightAccessory}</View> : null}
        <TouchableOpacity onPress={onPressMenu} style={s.menuHit} activeOpacity={0.7}>
          <Text style={s.menu}>⋯</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    subtitle: { color: C.subtext ?? C.sub, fontSize: 12, marginTop: 0 },
    row: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.bg,
    },
    left: { flexDirection: "row", alignItems: "center", flex: 1 },
    right: { flexDirection: "row", alignItems: "center" },
    accessory: { marginRight: 8 },
    menuHit: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    subtitleSlot: {
      marginTop: 0,
      minHeight: 16, // ✅ stabilisiert vertical layout, verhindert "springen/versetzen"
      justifyContent: "center",
    },
    textBlock: { flex: 1, justifyContent: "flex-start" },
    textBlockCentered: {
      justifyContent: "center",
    },

    avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: "#111", borderWidth: 1, borderColor: C.border ?? "rgba(255,255,255,0.25)", },
    nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
    username: { fontWeight: "800", color: C.text, maxWidth: 180,},
    andText: { color: C.text, marginHorizontal: 6 },
    morePeople: {
      color: C.text,
      fontWeight: "700",
      textDecorationLine: "underline",
    },
    location: { color: C.subtext ?? C.sub, fontSize: 12, marginTop: 0,  },
    menu: { fontSize: 24, color: C.text },
  });
