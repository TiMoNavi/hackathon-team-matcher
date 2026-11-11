// =============================================
// File: apps/ciaorelated/src/screens/create/post/components/MediaGrid.tsx
// NOTE:
// - Fix für dein Problem:
//   ✅ Toolbar ("Neueste / Mehrfach/Einfach") bleibt sticky
//   ✅ Grid-Zeilen scrollen normal weg (keine erste Zeile sticky mehr)
//   ✅ kein weißer Overscroll (bg überall)
//   ✅ Kamera-Tile bleibt im Grid
//
// WICHTIG:
// - Toolbar wird als "pseudo item" (plus 2 filler) in data eingefügt,
//   damit stickyHeaderIndices sauber funktioniert obwohl numColumns=3.
// =============================================
import React, { useMemo, useRef, forwardRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ListRenderItemInfo,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  Platform,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

const COLS = 3;
const GAP = 2;
const W = Dimensions.get("window").width;
const SIZE = (W - GAP * (COLS + 1)) / COLS;

export type GridAsset = {
  height?: number;
  width?: number;
  id: string;
  uri: string;
  thumbUri?: string;
  mediaType: "photo" | "video";
  duration?: number | null;
  durationLabel?: string;
  playableUri?: string;

  coverMs?: number;

};

/** internes Item: echtes Asset ODER Kamera-Tile ODER Toolbar */
type ToolbarItem = { __type: "toolbar"; id: "__toolbar__" };
type FillerItem = { __type: "filler"; id: "__filler1__" | "__filler2__" };
type CameraItem = { __type: "camera"; id: "__camera__" };
type AssetItem = { __type: "asset" } & GridAsset;
type GridItem = ToolbarItem | FillerItem | CameraItem | AssetItem;

type Props = {
  assets: GridAsset[];
  permissionGranted: boolean | null;
  onTapAsset: (asset: GridAsset) => void;
  onOpenCamera?: () => void;
  onScrollChange?: (dir: "up" | "down") => void;
  selectedIds?: string[];
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  

  /**
   * ✅ Preview oder irgendwas, das VOR dem Grid sein soll (scrollt weg)
   * (bei dir: Preview ist separat absolut – kannst trotzdem nutzen wenn du willst)
   */
  headerComponent?: React.ReactElement | null;

  /**
   * ✅ Sticky Leiste (Neueste / Album / Mehrfach)
   */
  stickyHeader?: React.ReactElement | null;

  /**
   * ✅ sorgt für genug Scroll-Content, auch wenn wenige Assets vorhanden sind.
   */
  bottomSpacer?: number;

  /**
   * ✅ falls du noch padding oben brauchst
   */
  topInset?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
};

export const MediaGrid = forwardRef<any, Props>(function MediaGrid(
  {
    assets,
    permissionGranted,
    onTapAsset,
    onOpenCamera,
    onScrollChange,
    onScroll,
    selectedIds = [],
    headerComponent,
    stickyHeader,
    bottomSpacer = 0,
    topInset = 0,
    onEndReached,
    onEndReachedThreshold
  },
  ref
) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors as any;

  const isLoadingPerms = permissionGranted == null;
  const isDenied = permissionGranted === false;

  // optional: 18 placeholders => 6 Reihen
  const placeholderAssets: AssetItem[] = useMemo(() => {
    return new Array(18).fill(0).map((_, i) => ({
      __type: "asset" as const,
      id: `__ph_${i}`,
      uri: "",                 // leer
      thumbUri: "",            // leer
      mediaType: "photo" as const,
    }));
  }, []);


  // Toolbar muss bei numColumns=3 eine "volle Row" bekommen → 1 toolbar + 2 filler
  const data: GridItem[] = useMemo(() => {
    const tb: ToolbarItem = { __type: "toolbar", id: "__toolbar__" };
    const f1: FillerItem = { __type: "filler", id: "__filler1__" };
    const f2: FillerItem = { __type: "filler", id: "__filler2__" };

    const cam: CameraItem = { __type: "camera", id: "__camera__" };
    const mapped: AssetItem[] = (isLoadingPerms ? placeholderAssets : (assets ?? []).map((a) => ({ __type: "asset" as const, ...a })));

    // Reihenfolge:
    // - 1. Zeile: sticky toolbar (plus filler)
    // - dann Kamera
    // - dann Assets
    return [tb, f1, f2, cam, ...mapped];
  }, [assets, isLoadingPerms, placeholderAssets]);

  const lastYRef = useRef(0);
  const fallbackScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;

    if (onScrollChange) {
      const lastY = lastYRef.current;
      if (y > lastY + 6) onScrollChange("down");
      else if (y < lastY - 6) onScrollChange("up");
    }

    lastYRef.current = y;
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<GridItem>) => {
    // Toolbar / filler / camera / asset
    if (item.__type === "toolbar") {
      return (
        <View
          style={{
            width: W, // "optisch full width"
            backgroundColor: C.bg,
            paddingTop: 0,
          }}
        >
          {stickyHeader}
        </View>
      );
    }
    

    if (item.__type === "filler") {
      // füllt die restlichen 2 Spalten der Toolbar-Zeile, damit keine Asset-Zelle daneben auftaucht
      return <View style={{ width: SIZE, height: 0 }} />;
    }

    const ml = index % COLS === 0 ? GAP : GAP / 2;
    const mr = (index + 1) % COLS === 0 ? GAP : GAP / 2;
    const cameraDisabled = isLoadingPerms || isDenied || !onOpenCamera;

    if (item.__type === "camera") {
      return (
        <TouchableOpacity
          disabled={cameraDisabled}
          activeOpacity={0.85}
          onPress={onOpenCamera}
          style={[
            s.gridItem,
            s.cameraItem,
            {
              marginLeft: ml,
              marginRight: mr,
              borderColor: C.border,
              backgroundColor: C.card,
              opacity: cameraDisabled ? 0.4 : 1,
            },
          ]}
        >
          <Ionicons name="camera" size={28} color={C.text} />
          <Text style={[s.cameraText, { color: C.subtext }]}>{t("mediagrid.camera")}</Text>
        </TouchableOpacity>
      );
    }

    if (item.id.startsWith("__ph_")) {
      return (
        <View
          style={[
            s.gridItem,
            {
              marginLeft: ml,
              marginRight: mr,
              backgroundColor: C.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: C.border,
              opacity: 0.6,
            },
          ]}
        />
      );
    }

    const isVid = item.mediaType === "video";
    const key = `${item.id}:${item.mediaType}`;

    // ✅ kompatibel: selectedIds kann "id" oder "id:mediaType" enthalten
    const selIdxKey = selectedIds.indexOf(key);
    const selIdxIdOnly = selectedIds.indexOf(item.id);
    const selIdx = selIdxKey !== -1 ? selIdxKey : selIdxIdOnly;
    const isSelected = selIdx !== -1;
    

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onTapAsset(item)}
        style={[
          s.gridItem,
          {
            marginLeft: ml,
            marginRight: mr,
            borderWidth: isSelected ? 2 : 0,
            borderColor: isSelected ? C.primary : "transparent",
          },
        ]}
      >
        <ExpoImage
          source={{ uri: item.thumbUri ?? item.uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />

        {isVid && !!item.durationLabel && (
          <View style={s.gridBadge}>
            <Text style={s.gridBadgeText}>{item.durationLabel}</Text>
          </View>
        )}

        {isSelected && (
          <View style={[s.selBadge, { backgroundColor: C.primary }]}>
            <Text style={s.selBadgeText}>{selIdx + 1}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

 

  const listHeader = (
    <View style={{ backgroundColor: C.bg }}>
      {headerComponent}

      {isDenied && (
        <View style={{ padding: 12 }}>
          <Text style={{ color: C.subtext }}>
            {t("mediagrid.noPermissionToViewPhotosVideosPlease6e591d")}</Text>
        </View>
      )}
    </View>
  );

  const listFooter =
    bottomSpacer && bottomSpacer > 0 ? (
      <View style={{ height: bottomSpacer, backgroundColor: C.bg }} />
    ) : null;

  return (
    <Animated.FlatList
      ref={ref}
      data={data}
      keyExtractor={(it, idx) => {
        // include __type + mediaType to guarantee uniqueness
        const mt = (it as any).mediaType ? `:${(it as any).mediaType}` : "";
        return `${(it as any).__type ?? "item"}:${it.id}${mt}`;
      }}

      numColumns={COLS}
      showsVerticalScrollIndicator={false}
      renderItem={renderItem}
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{
        paddingTop: topInset,
        paddingBottom: 16,
        backgroundColor: C.bg,
      }}
      ListHeaderComponent={listHeader}
      // ✅ Sticky: Index 0 ist ListHeaderComponent, Index 1 ist unser Toolbar-Item
      stickyHeaderIndices={stickyHeader ? [1] : undefined}
      ListFooterComponent={listFooter}
      // ✅ kein "weiß" beim overscroll
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      // ✅ Scroll handler
      onScroll={(onScroll as any) ?? fallbackScroll}
      scrollEventThrottle={16}

      initialNumToRender={24}
      maxToRenderPerBatch={24}
      windowSize={7}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
  
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold ?? 0.7}
    />
  );
});

const s = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },

  gridItem: {
    width: SIZE,
    height: SIZE,
    marginBottom: GAP,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },

  cameraItem: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  cameraText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
  },

  gridBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gridBadgeText: { color: "#fff", fontWeight: "700", fontSize: 11 },

  selBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  selBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
