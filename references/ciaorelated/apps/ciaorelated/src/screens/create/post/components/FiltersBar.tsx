// apps/ciaorelated/src/screens/create/post/components/FiltersBar.tsx
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
  Pressable,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ColorMatrix } from "react-native-color-matrix-image-filters";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../../theme/ThemeProvider";
import * as ImageManipulator from "expo-image-manipulator";
import { useTranslation } from "react-i18next";

import {
  filterToMatrix,
  concatColorMatrices,
  isVignette,
  type FilterKey,
  type Matrix20,
} from "../utils/matrix";

type Props = {
  open: boolean;
  sourceUri: string;
  active: FilterKey;
  onChange: (k: FilterKey) => void;

  /** optional: Thumbs sollen aktuelle Adjusts zeigen */
  adjustMatrix?: Matrix20 | null;

  /** Parent setzt open=false */
  onClose: () => void;
};

const FILTERS: { key: FilterKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "none", icon: "image-outline" },
  { key: "sepia", icon: "color-filter-outline" },
  { key: "mono", icon: "contrast-outline" },
  { key: "warm", icon: "sunny-outline" },
  { key: "cool", icon: "snow-outline" },
  { key: "noir", icon: "moon-outline" },
  { key: "dramatic", icon: "flash-outline" },
  { key: "lomo", icon: "aperture-outline" },
  { key: "instant", icon: "sparkles-outline" },
  { key: "fade", icon: "cloud-outline" },
  { key: "vignette", icon: "ellipse-outline" },
];


const FilterThumb = memo(function FilterThumb({
  uri,
  matrix,
  vignette,
  styleThumb,
  styleVignette,
}: {
  uri: string;
  matrix: Matrix20;
  vignette: boolean;
  styleThumb: any;
  styleVignette: any;
}) {
  return (
    <ColorMatrix matrix={matrix}>
      <ExpoImage
        source={{ uri }}
        style={styleThumb}
        cachePolicy="memory-disk"
      />
      {vignette && <View pointerEvents="none" style={styleVignette} />}
    </ColorMatrix>
  );
});


function FiltersBarSheetBase({ open, sourceUri, active, onChange, adjustMatrix, onClose }: Props) {
  const { theme, isDark } = useTheme();
  const C = theme.colors as any;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => styles(C, isDark), [C, isDark]);
  const { t } = useTranslation();

  // intern gemounted lassen bis close-animation fertig ist
  const [mounted, setMounted] = useState(open);

  const [showFilters, setShowFilters] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const SHEET_HIDE_Y = Math.round(Dimensions.get("window").height * 0.65);
  
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function makeThumb() {
      try {
        // nur wenn offen – sonst unnötige Arbeit
        if (!open || !sourceUri) return;

        // klein halten -> schneller
        const res = await ImageManipulator.manipulateAsync(
          sourceUri,
          [{ resize: { width: 220 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );

        if (alive) setThumbUri(res.uri);
      } catch {
        if (alive) setThumbUri(sourceUri); // fallback
      }
    }

    // reset, damit man sofort öffnen kann
    setThumbUri(null);
    makeThumb();

    return () => {
      alive = false;
    };
  }, [open, sourceUri]);


  useEffect(() => {
  translateY.stopAnimation();

  if (open) {
    setMounted(true);

    // ✅ Liste erstmal NICHT rendern -> Animation bleibt butterweich
    setShowFilters(false);

    translateY.setValue(SHEET_HIDE_Y);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        // ✅ erst JETZT die schweren Filter-Thumbs mounten
        setShowFilters(true);
      }
    });

    return;
  }

  // ✅ beim Schließen sofort Liste raus (damit close auch leicht bleibt)
  setShowFilters(false);

  if (mounted) {
    Animated.timing(translateY, {
      toValue: SHEET_HIDE_Y,
      duration: 170,
      useNativeDriver: true,
    }).start(() => {
      setMounted(false);
    });
  }
}, [open, mounted, translateY, SHEET_HIDE_Y]);


  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => translateY.stopAnimation(),
      onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        const shouldDismiss = g.dy > 120 || g.vy > 1.2;
        if (shouldDismiss) onClose();
        else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (!mounted) return null;

  return (
    <View pointerEvents="box-none" style={s.overlay}>
      {/* Overlay ist transparent – Tap außerhalb schließt */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
        {/* Drag nur am Handle */}
        <View {...pan.panHandlers} style={s.dragHandleArea}>
          <View style={s.handle} />
        </View>

        {/* ===== Filter Row ===== */}
        {showFilters ? (
          <FlatList
            horizontal
            data={FILTERS}
            keyExtractor={(it) => it.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filtersRow}
            renderItem={({ item }) => {
              const isActive = active === item.key;

              const matrix = adjustMatrix
                ? concatColorMatrices(filterToMatrix(item.key), adjustMatrix)
                : filterToMatrix(item.key);

              return (
                <TouchableOpacity
                  onPress={() => onChange(item.key)}
                  activeOpacity={0.85}
                  style={[s.filterItem, isActive && s.filterItemActive]}
                >
                  <Text
                    style={[s.filterLabel, isActive && { color: C.text }]}
                    numberOfLines={1}
                  >
                    {t(`filtersbar.filter.${item.key}`)}
                  </Text>

                  <View style={[s.thumbWrap, isActive && s.thumbWrapActive]}>
                    <ColorMatrix matrix={matrix}>
                      <ExpoImage source={{ uri: sourceUri }} style={s.thumb} />
                    </ColorMatrix>
                    {isVignette(item.key) && <View pointerEvents="none" style={s.vignette} />}
                  </View>

                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={isActive ? C.primary : C.subtext}
                    style={{ marginTop: 6, opacity: isActive ? 1 : 0.9 }}
                  />
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          // ✅ Platzhalter mit gleicher Höhe, damit Layout nicht springt
          <View style={s.filtersRowPlaceholder} />
        )}


        {/* ✅ Abstand zwischen Row und BottomBar (NICHT zum Rand) */}
        <View style={s.gapBetweenRowAndBar} />

      </Animated.View>
    </View>
  );
}

export const FiltersBarSheet = memo(FiltersBarSheetBase);

const styles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    filtersRowPlaceholder: {
      height: 30 + 10 + 72 + 6 + 16 + 6 + 6, // grob: label + padding + thumb + icon etc.
      marginTop: 30,
    },

    overlay: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      zIndex: 9999,
      elevation: 9999,
      justifyContent: "flex-end",
    },

    sheet: {
      width: "100%",
      backgroundColor: C.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      paddingBottom: 0, // ✅ bottom kommt nur aus bottomBar/insets
    },

    dragHandleArea: {
      paddingTop: 6,
      paddingBottom: 6,
      alignItems: "center",
      justifyContent: "center",
    },

    handle: {
      width: 48,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)",
    },

    filtersRow: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
      marginTop: 30
    },

    filterItem: {
      width: 96,
      marginRight: 10,
      alignItems: "center",
    },

    filterItemActive: {
      transform: [{ scale: 1.02 }],
    },

    // ✅ Label oben (wie du wolltest)
    filterLabel: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 6,
    },

    thumbWrap: {
      width: 72,
      height: 72,
      overflow: "hidden",
      borderRadius: 12,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      
    },

    thumbWrapActive: {
      borderColor: C.primary,
    },

    thumb: {
      width: "100%",
      height: "100%",
    },

    vignette: {
      ...StyleSheet.absoluteFillObject,
      borderColor: "rgba(0,0,0,0.22)",
      borderWidth: 1,
    },

    // ✅ der Abstand soll zwischen Row und BottomBar sein
    gapBetweenRowAndBar: {
      height: 50,
    },

    bottomBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: 12,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.bg,
      
    },

    bottomLink: {
      color: C.text,
      fontWeight: "800",
      textDecorationLine: "underline",
      opacity: 0.95,
    },

    bottomCenter: {
      color: C.text,
      fontWeight: "900",
      fontSize: 16,
      opacity: 0.95,
    },
  });
