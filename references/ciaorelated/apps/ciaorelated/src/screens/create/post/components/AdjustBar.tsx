import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  FlatList,
  Animated,
  PanResponder,
  Dimensions,
  Pressable
} from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../../theme/ThemeProvider";
import type { AdjustState } from "../utils/matrix";
import { useTranslation } from "react-i18next";

type ToolKey = keyof AdjustState;

type Props = {
  open: boolean;
  values: AdjustState;
  onChange: (next: AdjustState) => void; // live preview
  onClose: () => void; // Parent setzt open=false
};

const EPS = 0.0001;

const TOOLS: Array<{
  key: ToolKey;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}> = [
  { key: "bright", labelKey: "adjustbar.tool.bright", icon: "sunny-outline", min: -1, max: 1, step: 0.01 },
  { key: "contr",  labelKey: "adjustbar.tool.contr",  icon: "contrast-outline", min: -1, max: 1, step: 0.01 },
  { key: "sat",    labelKey: "adjustbar.tool.sat",    icon: "water-outline", min: -1, max: 1, step: 0.01 },
  { key: "temp",   labelKey: "adjustbar.tool.temp",   icon: "thermometer-outline", min: -1, max: 1, step: 0.01 },
  {
    key: "hue",
    labelKey: "adjustbar.tool.hue",
    icon: "color-palette-outline",
    min: -180,
    max: 180,
    step: 1,
    format: (v) => `${Math.round(v)}`,
  },
  { key: "fade", labelKey: "adjustbar.tool.fade", icon: "cloud-outline", min: 0, max: 1, step: 0.01 },
];

export function AdjustBar({ open, values, onChange, onClose }: Props) {
  const { theme, isDark } = useTheme();
  const C = theme.colors as any;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => styles(C, isDark), [C, isDark]);
  const { t } = useTranslation();

  const [active, setActive] = useState<ToolKey | null>(null);

  // ✅ wichtig: sheet bleibt intern gemounted bis close-animation fertig ist
  const [mounted, setMounted] = useState(open);

  const translateY = useRef(new Animated.Value(0)).current;

  const initialRef = useRef<AdjustState>(values);


  const SHEET_HIDE_Y = Math.round(Dimensions.get("window").height * 0.65);

  // ---------- animate in/out driven by `open` ----------
  useEffect(() => {
    translateY.stopAnimation();

    if (open) {
      setMounted(true);

      initialRef.current = values;

      // starte "unten" und slide hoch
      translateY.setValue(SHEET_HIDE_Y);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return;
    }

    // open=false => raus animieren, dann unmount
    if (mounted) {
      Animated.timing(translateY, {
        toValue: SHEET_HIDE_Y,
        duration: 170,
        useNativeDriver: true,
      }).start(() => {
        setMounted(false);
        setActive(null);
        // KEIN translateY.reset nötig, wird beim nächsten open gesetzt
      });
    }
  }, [open, mounted, translateY, SHEET_HIDE_Y]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        // nur nach unten ziehen
        translateY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        const shouldDismiss = g.dy > 120 || g.vy > 1.2;
        if (shouldDismiss) {
          // ✅ Schließen exakt wie Button "Fertig" => Parent soll open=false setzen
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const activeTool = useMemo(
    () => (active ? TOOLS.find((x) => x.key === active) ?? null : null),
    [active]
  );

  const sliderValue = useMemo(() => {
    if (!active) return 0;
    return (values as any)[active] ?? 0;
  }, [active, values]);

  if (!mounted) return null;

  const setVal = (v: number) => {
    if (!active) return;
    onChange({ ...values, [active]: v }); // live
  };

  return (
    <View pointerEvents="box-none" style={[s.overlay, ]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />

      <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
        {/* Drag nur am Handle */}
        <View {...pan.panHandlers} style={s.dragHandleArea}>
          <View style={s.handle} />
        </View>

        {activeTool ? (
          <>
            <View style={s.sliderHeader}>
              <TouchableOpacity onPress={() => setActive(null)} style={s.iconBtn}>
                <Ionicons name="chevron-back" size={22} color={C.text} />
              </TouchableOpacity>

              <Text style={s.title} numberOfLines={1}>
                {t(activeTool.labelKey)}
              </Text>

              {/* Optional, falls du wieder "Done" einbaust:
              <TouchableOpacity onPress={onClose} style={s.doneBtn}>
                <Text style={s.done}>{t("adjustbar.done")}</Text>
              </TouchableOpacity>
              */}
            </View>

            <View style={s.sliderRow}>
              <Slider
                style={{ flex: 1, height: 36 }}
                minimumValue={activeTool.min}
                maximumValue={activeTool.max}
                step={activeTool.step}
                value={sliderValue}
                onValueChange={setVal}
                minimumTrackTintColor={C.text}
                maximumTrackTintColor={C.border}
                thumbTintColor={C.text}
              />
              <Text style={s.val}>
                {activeTool.format?.(sliderValue) ?? sliderValue.toFixed(2)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <FlatList
              horizontal
              data={TOOLS}
              keyExtractor={(it) => it.key}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.toolsBar}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              renderItem={({ item }) => {
                const modified = Math.abs((values as any)[item.key] ?? 0) > EPS;
                return (
                  <TouchableOpacity
                    style={s.tool}
                    onPress={() => setActive(item.key)}
                    activeOpacity={0.85}
                  >
                    <View style={[s.toolIconCircle, modified && s.toolIconCircleModified]}>
                      <Ionicons name={item.icon} size={22} color={C.text} />
                    </View>

                    <Text style={s.toolLabel} numberOfLines={1}>
                      {t(item.labelKey)}
                    </Text>

                    {modified && <View style={s.dot} />}
                  </TouchableOpacity>
                );
              }}
            />
            <View style={{ height: 50 }} />

            
          </>
        )}


      </Animated.View>
    </View>
  );
}

const styles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    // overlay transparent (ok)
        bottomBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: 12,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.bg, // ✅ NICHT transparent
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

    // sheet NICHT transparent
    sheet: {
      width: "100%",
      backgroundColor: C.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      paddingBottom: Platform.select({ ios: 10, android: 8 }),
      
      
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

    toolsBar: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, marginTop: 30,},

    tool: { alignItems: "center", width: 96, marginRight: 8 },

    toolIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.card,
      marginBottom: 6,
    },

    toolIconCircleModified: { borderColor: C.primary },

    toolLabel: { color: C.text, fontSize: 12, fontWeight: "800" },

    dot: {
      marginTop: 4,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: C.primary,
    },

    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      marginTop: 6,
      paddingHorizontal: 16,
      paddingBottom: 6,
    },

    sliderHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingTop: 2,
    },

    iconBtn: {
      width: 40,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },

    title: {
      color: C.text,
      fontWeight: "900",
      fontSize: 16,
      flex: 1,
      textAlign: "center",
      paddingHorizontal: 8,
    },

    doneBtn: {
      width: 64,
      height: 36,
      alignItems: "flex-end",
      justifyContent: "center",
    },

    done: { color: C.primary, fontWeight: "900" },

    sliderRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 10,
      gap: 10,
    },

    val: {
      width: 56,
      textAlign: "right",
      color: C.subtext,
      fontVariant: ["tabular-nums"],
      fontWeight: "700",
    },
  });
