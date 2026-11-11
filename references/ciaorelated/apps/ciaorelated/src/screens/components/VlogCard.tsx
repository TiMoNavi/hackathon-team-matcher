// apps/ciaorelated/src/screens/components/VlogCard.tsx
import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeProvider";
import { useTranslation } from "react-i18next";

import {
  avatarPlaceholder,
  gridPlaceholderDark,
  gridPlaceholderLight,
} from "../../../assets/placeholders";


type Owner = { id: string; username: string; avatarThumbUrl?: string | null; avatarUrl?: string | null };
export type VlogCardItem = {
  id: string;
  slug: string;
  title?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  coverThumbUrl?: string | null;
  updatedAt?: string | null;
  privacy?: string | null;
  memberCount?: number | null;
  postCount?: number | null;
  owner?: Owner | null;
};

type Props = {
  vlog: VlogCardItem;
  onPress?: (v: VlogCardItem) => void;
  compact?: boolean;        // für horizontale Rail
  showMeta?: boolean;       // Chips/Infos
  showDescription?: boolean;
  style?: any;
};

function Chip({
  icon,
  text,
  COLORS,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string | number;
  COLORS: any;
}) {
  return (
    <View style={[s.chip, { backgroundColor: "rgba(255,255,255,0.06)", borderColor: COLORS.border }]}>
      <Ionicons name={icon} size={12} color={COLORS.subtext} />
      <Text style={[s.chipText, { color: COLORS.subtext }]}>{String(text)}</Text>
    </View>
  );
}

export const VlogCard = memo(function VlogCard({
  vlog,
  onPress,
  compact = false,
  showMeta = true,
  showDescription = true,
  style,
}: Props) {
  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const gridPlaceholder =
    theme.mode === "dark" ? gridPlaceholderDark : gridPlaceholderLight;

  const { t } = useTranslation();


  const title =
  (vlog?.title ?? "").trim() || t("vlogcard.untitledVlog");

  const ownerName = vlog?.owner?.username ?? t("common.dash");

  const cover = (vlog?.coverUrl ?? "").trim() || null;
  const coverThumb = (vlog?.coverThumbUrl ?? "").trim() || null;

  const ownerAvatar =
    (vlog?.owner?.avatarThumbUrl ?? "").trim() ||
    (vlog?.owner?.avatarUrl ?? "").trim() ||
    "";


  const postCount = vlog?.postCount ?? 0;
  const memberCount = vlog?.memberCount ?? 0;
  const privacyLabel = useMemo(() => {
    const p = String(vlog?.privacy ?? "").toUpperCase();
    if (p === "PRIVATE") return t("vlogcard.privacy.private");
    if (p === "PUBLIC") return t("vlogcard.privacy.public");
    return vlog?.privacy ?? t("common.dash");
  }, [vlog?.privacy, t]);


  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress?.(vlog)}
      style={[
        s.card,
        {
          backgroundColor: COLORS.card,
          borderColor: COLORS.border,
          borderRadius: compact ? 16 : 18,
        },
        style,
      ]}
    >
      {/* Hero (wie VlogDetailScreen) */}
      <View style={[s.heroWrap, { borderRadius: compact ? 16 : 18 }]}>
        {cover ? (
          <ExpoImage
            source={{ uri: cover }}
            placeholder={coverThumb ? { uri: coverThumb } : gridPlaceholder}
            placeholderContentFit="cover"
            style={s.hero}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            transition={100}
            allowDownscaling
            recyclingKey={`vlogcover:${vlog.id}:${vlog.updatedAt ?? "0"}`}
          />
        ) : (
          <ExpoImage source={gridPlaceholder} style={s.hero} contentFit="cover" />
        )}


        {/* Overlays */}
        <View style={s.heroOverlay} />
        <View style={s.heroOverlayBottom} />

        {/* Count-Pill (oben rechts) */}
        <View style={[s.countPill, { borderColor: "rgba(255,255,255,0.12)" }]}>
          <Ionicons name="document-text-outline" size={14} color="#fff" />
          <Text style={s.countText}>{postCount}</Text>
        </View>

        {/* Title + Owner (unten links) */}
        <View style={s.heroTitleBlock}>
          <Text style={s.title} numberOfLines={compact ? 1 : 2}>
            {title}
          </Text>

          <View style={s.ownerRow}>
            <ExpoImage
              source={ownerAvatar ? { uri: ownerAvatar } : avatarPlaceholder}
              placeholder={avatarPlaceholder}
              style={s.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={80}
              allowDownscaling
              recyclingKey={`vlogowner:${vlog?.owner?.id ?? "none"}:${ownerAvatar}`}
            />

            <Text style={s.ownerName} numberOfLines={1}>
              {ownerName}
            </Text>
          </View>
        </View>
      </View>

      {/* Meta */}
      {showMeta && (
        <View style={s.metaWrap}>
          <View style={s.chipsRow}>
            <Chip icon="lock-closed-outline" text={privacyLabel} COLORS={COLORS} />
            <Chip icon="people-outline" text={memberCount} COLORS={COLORS} />
            <Chip icon="document-text-outline" text={postCount} COLORS={COLORS} />
          </View>

          {!!vlog?.description && showDescription && !compact && (
            <Text style={[s.desc, { color: COLORS.text, opacity: 0.9 }]} numberOfLines={2}>
              {vlog.description}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
});

const s = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  heroWrap: {
    width: "100%",
    overflow: "hidden",
  },
  hero: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  heroOverlayBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

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
  },
  countText: {
    color: "#fff",
    fontWeight: "900",
    marginLeft: 6,
  },

  heroTitleBlock: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
  },
  title: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 8,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ownerName: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "700",
    fontSize: 13,
    maxWidth: "85%",
  },

  metaWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
  },

  desc: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
});
