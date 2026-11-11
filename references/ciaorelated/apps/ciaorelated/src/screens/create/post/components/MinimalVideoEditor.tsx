import React, { memo, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../../theme/ThemeProvider";
import { useTranslation } from "react-i18next";

/* ============================================================
   TYPES
============================================================ */
type Props = {
  /** Gesamtdauer des Videos in Sekunden */
  durationSec: number;

  /** Aktuelle Cover-Position (Playhead) in Millisekunden */
  coverMs: number;

  /** Scrub: seek / state update – DARF NICHT playen */
  onChangeCover: (ms: number) => void;

  /** Start Scrub → Parent pausiert Video */
  onScrubStart?: () => void;

  /** Ende Scrub → KEIN Autoplay */
  onScrubComplete?: (ms: number) => void;

  /** Play / Pause */
  playing: boolean;
  onTogglePlay: () => void;

  /** Playback Rate */
  rate: number;
  onCycleRate: () => void;

  /** ✅ EXPLIZIT: Cover setzen (Frame wird im Parent gecaptured) */
  onConfirmCover: (ms: number) => void;
  confirmedCoverMs?: number;
};

/* ============================================================
   HELPERS
============================================================ */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/* ============================================================
   UI ATOMS
============================================================ */
const PillButton = memo(function PillButton({
  onPress,
  children,
}: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={10}
      style={s.pillBtn}
    >
      {children}
    </TouchableOpacity>
  );
});

const SmallNudge = memo(function SmallNudge({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={10}
      style={s.nudgeBtn}
    >
      <Text style={s.nudgeTxt}>{title}</Text>
    </TouchableOpacity>
  );
});

/* ============================================================
   COMPONENT
============================================================ */
export default function MinimalVideoEditor({
  durationSec,
  coverMs,
  onScrubStart,
  onChangeCover,
  onScrubComplete,
  playing,
  onTogglePlay,
  rate,
  onCycleRate,
  onConfirmCover,
  confirmedCoverMs
}: Props) {
  const { theme, isDark } = useTheme();
  const C = theme.colors;
  const { t } = useTranslation();
  

  const totalMs = (durationSec || 0) * 1000;
  const sliderMax = Math.max(1, totalMs);
  const safeCover = useMemo(
    () => clamp(coverMs, 0, sliderMax),
    [coverMs, sliderMax]
  );
  const isConfirmed = confirmedCoverMs != null;

  // optional “dirty” wenn du anzeigen willst, dass der Slider NICHT mehr am bestätigten Cover steht
  const dirtyThresholdMs = 120; // oder 250
  const isDirty =
    isConfirmed && Math.abs((confirmedCoverMs ?? 0) - safeCover) > dirtyThresholdMs;



  const solidCard = isDark ? "#0F1424" : "#FFFFFF";
  const solidPill = isDark ? "#151B2E" : "#F2F3F5";
  const hair = isDark ? "rgba(255,255,255,0.10)" : C.border;

  const playIcon = playing ? "pause" : "play";
  const playLabel = playing ? t("minimalvideoeditor.pause") : t("minimalvideoeditor.play"); 

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <View style={[s.card, { backgroundColor: solidCard, borderColor: hair }]}>
        {/* ================= TOP ROW ================= */}
        <View style={s.topRow}>
          <View style={[s.pill, { backgroundColor: solidPill, borderColor: hair }]}>
            <PillButton onPress={onTogglePlay}>
              <Ionicons
                name={playIcon as any}
                size={16}
                color={C.text}
                style={{ marginRight: 6 }}
              />
              <Text style={[s.pillTxt, { color: C.text }]}>{playLabel}</Text>
            </PillButton>

            <View style={[s.sep, { backgroundColor: hair }]} />

            <PillButton onPress={onCycleRate}>
              <Ionicons
                name="speedometer-outline"
                size={16}
                color={C.text}
                style={{ marginRight: 6 }}
              />
              <Text style={[s.pillTxt, { color: C.text }]}>
                {rate.toFixed(1)}×
              </Text>
            </PillButton>
          </View>

          {/* ================= COVER CONFIRM ================= */}
         <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onConfirmCover(safeCover)}
          style={[
            s.badge,
            {
              backgroundColor: !isConfirmed ? C.primary : solidPill,
              borderColor: isDirty ? C.primary : hair,  // ✅ optional: highlight wenn “dirty”
            },
          ]}
        >
          <Ionicons
            name="image-outline"
            size={14}
            color={!isConfirmed ? "#fff" : (isDirty ? C.primary : "#22C55E")}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              s.badgeTxt,
              { color: !isConfirmed ? "#fff" : (isDirty ? C.primary : C.subtext) },
            ]}
          >
            {!isConfirmed
              ? t("minimalvideoeditor.chooseCover")
              : isDirty
                ? t("minimalvideoeditor.updateCover")
                : t("minimalvideoeditor.coverSet")}
          </Text>
        </TouchableOpacity>


        </View>

        {/* ================= TIME ================= */}
        <View style={s.timeRow}>
          <Text style={[s.timeText, { color: C.text }]}>
            {fmtTime(safeCover / 1000)}
          </Text>
          <Text style={[s.timeCaption, { color: C.subtext }]}>
            {t("minimalvideoeditor.time")}
          </Text>
          <Text style={[s.timeText, { color: C.text }]}>
            {fmtTime(durationSec || 0)}
          </Text>
        </View>

        {/* ================= SLIDER ================= */}
        <Slider
          style={{ width: "100%", height: 36 }}
          minimumValue={0}
          maximumValue={sliderMax}
          value={safeCover}
          step={1}
          onSlidingStart={() => onScrubStart?.()}
          onValueChange={(v: number) =>
            onChangeCover(clamp(Math.round(v), 0, sliderMax))
          }
          onSlidingComplete={(v: number) =>
            onScrubComplete?.(clamp(Math.round(v), 0, sliderMax))
          }
          minimumTrackTintColor={C.primary}
          maximumTrackTintColor={hair}
          thumbTintColor={C.text}
        />

        {/* ================= NUDGES ================= */}
        <View style={s.nudgeRow}>
          <SmallNudge
            title={t("minimalvideoeditor.nudgeBack")}
            onPress={() => onChangeCover(clamp(safeCover - 500, 0, sliderMax))}
          />
          <SmallNudge
            title={t("minimalvideoeditor.nudgeForward")}
            onPress={() => onChangeCover(clamp(safeCover + 500, 0, sliderMax))}
          />

        </View>
      </View>
    </View>
  );
}

/* ============================================================
   STYLES
============================================================ */
const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.select({ ios: 18, android: 14 }),
    paddingHorizontal: 12,
  },

  card: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
  },

  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  pillTxt: {
    fontSize: 12,
    fontWeight: "900",
  },

  sep: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    marginHorizontal: 4,
    opacity: 0.9,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },

  badgeTxt: {
    fontSize: 12,
    fontWeight: "800",
  },

  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  timeText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
  },

  timeCaption: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  nudgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },

  nudgeBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#1B1B1B",
  },

  nudgeTxt: {
    color: "#E5E7EB",
    fontWeight: "900",
    fontSize: 12,
  },
});
