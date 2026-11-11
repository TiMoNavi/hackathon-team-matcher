// apps/ciaorelated/src/screens/components/vlog/VlogHeroCard.tsx
import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import { useTranslation } from "react-i18next";

export type VlogHeroCardItem = {
  id?: string;
  slug?: string;
  title?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  coverThumbUrl?: string | null;
  updatedAt?: string | null;
  privacy?: string | null;
  memberCount?: number | null;
  postCount?: number | null;
  owner?: { id: string; username: string; avatarUrl?: string | null } | null;
};

type Props = {
  vlog: VlogHeroCardItem;
  onPress?: () => void;

  /** kompakt für Horizontal-Bar */
  compact?: boolean;

  /** Meta (Chips+Beschreibung) anzeigen */
  showMeta?: boolean;

  /** oben rechts Pill mit PostCount */
  showCountPill?: boolean;

  /** optional: aktiver Rand */
  active?: boolean;

  style?: any;
};

export const VlogHeroCard = memo(function VlogHeroCard({
  vlog,
  onPress,
  compact = false,
  showMeta = !compact,
  showCountPill = true,
  active = false,
  style,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C), [C]);

  const title = (vlog?.title ?? t("vlogherocard.untitled")).trim() || t("vlogherocard.untitled");
  const ownerName = vlog?.owner?.username ?? "—";
  const cover = vlog?.coverUrl ?? null;
  const thumb = vlog?.coverThumbUrl ?? null;

  const privacyLabel = useMemo(() => {
    const p = String(vlog?.privacy ?? "").toUpperCase();
    if (p === "PRIVATE") return t("vlogherocard.private");
    if (p === "PUBLIC") return t("vlogherocard.public");
    return vlog?.privacy ?? "—";
  }, [t, vlog?.privacy]);

  const postCount = vlog?.postCount ?? 0;
  const memberCount = vlog?.memberCount ?? 0;

  const Wrap: any = onPress ? TouchableOpacity : View;

  return (
    <Wrap
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        s.card,
        compact && s.cardCompact,
        active && { borderColor: C.text },
        style,
      ]}
    >
      {/* HERO */}
      <View style={[s.heroWrap, compact && { borderRadius: 16 }]}>
        {cover ? (
          <ExpoImage
            source={{ uri: cover, cacheKey: `vlog:${vlog.slug ?? vlog.id}:${vlog.updatedAt ?? "0"}` }}
            placeholder={thumb ? { uri: thumb } : undefined}
            placeholderContentFit="cover"
            style={s.hero}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority={compact ? "normal" : "high"}
            transition={120}
            allowDownscaling
          />
        ) : (
          <View style={[s.hero, { backgroundColor: "rgba(255,255,255,0.06)" }]} />
        )}

        <View style={s.heroOverlay} />
        <View style={s.heroOverlayBottom} />

        {/* Count-Pill */}
        {showCountPill && (
          <View style={s.countPill}>
            <Ionicons name="document-text-outline" size={14} color="#fff" />
            <Text style={s.countText}>{postCount}</Text>
          </View>
        )}

        {/* Titel + Owner */}
        <View style={s.heroTitleBlock}>
          <Text style={s.title} numberOfLines={compact ? 1 : 2}>
            {title}
          </Text>

          <View style={s.ownerRow}>
            {vlog?.owner?.avatarUrl ? (
              <ExpoImage
                source={{ uri: vlog.owner.avatarUrl, cacheKey: `avatar:${vlog.owner.id}` }}
                style={s.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                allowDownscaling
              />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Ionicons name="person-outline" size={12} color="rgba(255,255,255,0.85)" />
              </View>
            )}
            <Text style={s.ownerName} numberOfLines={1}>
              {ownerName}
            </Text>
          </View>
        </View>
      </View>

      {/* META */}
      {showMeta && (
        <View style={s.metaWrap}>
          <View style={s.chipsRow}>
            <Chip C={C} icon="lock-closed-outline" text={privacyLabel} />
            <Chip C={C} icon="people-outline" text={memberCount} />
            <Chip C={C} icon="document-text-outline" text={postCount} />
          </View>

          {!!vlog?.description && (
            <Text style={s.desc} numberOfLines={2}>
              {vlog.description}
            </Text>
          )}
        </View>
      )}
    </Wrap>
  );
});

function Chip({
  C,
  icon,
  text,
}: {
  C: any;
  icon: keyof typeof Ionicons.glyphMap;
  text: string | number;
}) {
  return (
    <View style={[chip.chip, { backgroundColor: C.card, borderColor: C.border }]}>
      <Ionicons name={icon} size={12} color={C.subtext} />
      <Text style={[chip.text, { color: C.subtext }]}>{String(text)}</Text>
    </View>
  );
}

const chip = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: 12, fontWeight: "800" },
});

const styles = (C: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 18,
      overflow: "hidden",
    },
    cardCompact: { borderRadius: 16 },

    heroWrap: { width: "100%", overflow: "hidden", borderRadius: 18 },
    hero: { width: "100%", aspectRatio: 16 / 9 },

    heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
    heroOverlayBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120, backgroundColor: "rgba(0,0,0,0.55)" },

    countPill: {
      position: "absolute",
      top: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(0,0,0,0.35)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.12)",
    },
    countText: { color: "#fff", fontWeight: "900", marginLeft: 6 },

    heroTitleBlock: { position: "absolute", left: 12, right: 12, bottom: 10 },
    title: { color: "#fff", fontWeight: "900", fontSize: 16, marginBottom: 8 },

    ownerRow: { flexDirection: "row", alignItems: "center" },
    avatar: { width: 22, height: 22, borderRadius: 11, marginRight: 8, backgroundColor: "rgba(255,255,255,0.06)" },
    avatarPlaceholder: {
      width: 22,
      height: 22,
      borderRadius: 11,
      marginRight: 8,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.16)",
      alignItems: "center",
      justifyContent: "center",
    },
    ownerName: { color: "rgba(255,255,255,0.92)", fontWeight: "800", fontSize: 13, maxWidth: "85%" },

    metaWrap: { paddingHorizontal: 12, paddingVertical: 10 },
    chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    desc: { marginTop: 8, color: C.text, opacity: 0.9, fontSize: 13, lineHeight: 18 },
  });
