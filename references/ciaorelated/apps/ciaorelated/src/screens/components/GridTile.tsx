// apps/ciaorelated/src/screens/components/GridTile.tsx
import React from "react";
import { View, TouchableOpacity, StyleSheet, Text } from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeProvider";

const GRID_DARK = require("../../../assets/placeholders/grid-placeholder-dark.svg");
const GRID_LIGHT = require("../../../assets/placeholders/grid-placeholder-light.svg");

export type GridTileItem = {
  id: string;
  kind?: "POST" | "REEL" | "VLOG";
  imageUrl?: string | null;
  thumbUrl?: string | null;
  videoUrl?: string | null;
  isCarousel?: boolean | null;
  hasAcceptedVlog?: boolean | null;
  taggedVlogs?: Array<any> | null;
  viewCount?: number | null;
};

type Props = {
  item: GridTileItem;
  index: number;
  size: number;
  cols?: number;
  gap?: number;
  onPress?: (item: GridTileItem) => void;
};

const isPlaceholder = (u?: string | null) =>
  !!u && u.includes("via.placeholder.com") && u.includes("No+Image");

const clean = (u?: string | null) => {
  if (!u) return null;
  if (isPlaceholder(u)) return null;
  return u;
};

const pickFirst = (...cands: Array<string | null | undefined>) =>
  cands.find((u) => !!u) ?? null;

const GridTile = React.memo(function GridTile({
  item,
  index,
  size,
  cols = 3,
  gap = 1,
  onPress,
}: Props) {
  const isReel =
    item.kind === "REEL" ||
    item.kind === "VLOG" ||
    item.hasAcceptedVlog === true ||
    (Array.isArray(item.taggedVlogs) && item.taggedVlogs.length > 0);

  const isCarousel = !!item.isCarousel && !isReel;
  const isVideo = !!item.videoUrl && !isReel && !isCarousel;

  const { theme } = useTheme();
  const placeholder = theme.mode === "dark" ? GRID_DARK : GRID_LIGHT;

  

  

  // ✅ Für VLOG/Carousel/Video: thumb bevorzugen, sonst imageUrl
  // ✅ Für Foto: imageUrl bevorzugen, sonst thumb
  const uri = pickFirst(clean(item.thumbUrl), clean(item.imageUrl));
  const views = Number.isFinite(item.viewCount as number) ? Math.max(0, Number(item.viewCount)) : 0;

  const compact = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(".0", "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(".0", "")}K`;
    return String(n);
  };




  const renderBadge = () => {
    if (isReel) return <MaterialCommunityIcons name="movie-open-outline" size={13} color="#fff" />;
    if (isCarousel) return <Ionicons name="copy-outline" size={12} color="#fff" />;
    if (isVideo) return <Ionicons name="play" size={11} color="#fff" />;
    return null;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onPress?.(item)}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          marginRight: (index + 1) % cols ? gap : 0,
          marginBottom: gap,
          backgroundColor: theme.colors.bg,
        },
      ]}
    >
      <Image
        source={uri ? { uri } : undefined}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        placeholder={placeholder}
        transition={150}
        cachePolicy="memory-disk"
        onError={(e) => {
          console.log("GRID_IMG_ERR", item.id, {
            err: String((e as any)?.error ?? (e as any)?.message ?? e),
            uri,
            isCarousel,
            isReel,
            isVideo,
            thumbUrl: item.thumbUrl ?? null,
            imageUrl: item.imageUrl ?? null,
          });
        }}
      />

      {(isReel || isCarousel || isVideo) && (
        <View pointerEvents="none" style={styles.badge}>
          {renderBadge()}
        </View>
      )}
      <View pointerEvents="none" style={styles.viewsBadge}>
        <Ionicons name="eye-outline" size={13} color="#fff" />
        <Text style={styles.viewsText}>{compact(views)}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default GridTile;

const styles = StyleSheet.create({
  tile: { backgroundColor: "#000", overflow: "hidden" },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  viewsBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewsText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
