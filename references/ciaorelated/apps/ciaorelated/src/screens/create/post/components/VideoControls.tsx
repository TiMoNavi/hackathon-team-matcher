// screens/create/post/components/VideoControls.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { useTranslation } from "react-i18next";

export function VideoControls({
  durationSec,
  muted,
  onToggleMute,
  coverMs,
  onChangeCover,
  onNudgeCover,
  rate,
  onRateChange,
  loop,
  onToggleLoop,
  onTrimRangeChange,
}: {
  durationSec: number;
  muted: boolean;
  onToggleMute: () => void;
  coverMs: number;
  onChangeCover: (ms: number) => void;
  onNudgeCover: (deltaMs: number) => void;  // 👈 neu
  rate: number;                              // 👈 neu
  onRateChange: (r: number) => void;         // 👈 neu
  loop: boolean;                             // 👈 neu
  onToggleLoop: () => void;                  // 👈 neu
  onTrimRangeChange: (range: { startMs: number; endMs: number }) => void;
}) {
  const { t } = useTranslation();

  const speedSteps = [0.5, 1, 1.5, 2];

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <TouchableOpacity style={s.btn} onPress={onToggleMute}><Text style={s.btnText}>{muted ? `🔇 ${t("videocontrols.muted")}` : `🔊 ${t("videocontrols.soundOn")}`}</Text></TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={onToggleLoop}><Text style={s.btnText}>{loop ? `⟲ ${t("videocontrols.loopOn")}` : `⟲ ${t("videocontrols.loopOff")}`}</Text></TouchableOpacity>

        <TouchableOpacity style={s.btn} onPress={() => onNudgeCover(-500)}><Text style={s.btnText}>◀︎ 0.5s</Text></TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={() => onNudgeCover(+500)}><Text style={s.btnText}>0.5s ▶︎</Text></TouchableOpacity>

        <TouchableOpacity style={s.btn} onPress={() => onChangeCover(Math.min(coverMs + 1000, durationSec * 1000))}>
          <Text style={s.btnText}>{t("videocontrols.cover1s")}</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.row, { marginTop: 6 }]}>
        {speedSteps.map((sVal) => {
          const active = rate === sVal;
          return (
            <TouchableOpacity key={sVal} style={[s.btn, active && s.active]} onPress={() => onRateChange(sVal)}>
              <Text style={s.btnText}>{sVal}x</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={s.btn} onPress={() => onTrimRangeChange({ startMs: 0, endMs: durationSec * 1000 })}>
          <Text style={s.btnText}>{t("videocontrols.trim")}</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.hint}>
        {t("videocontrols.length")}{Math.floor(durationSec / 60)}:{String(durationSec % 60).padStart(2, "0")} {t("videocontrols.cover")}{Math.round(coverMs / 1000)}s
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { backgroundColor: "#1E1E1E", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  active: { backgroundColor: "#2C2C2C", borderWidth: StyleSheet.hairlineWidth, borderColor: "#3A3A3A" },
  btnText: { color: "#E5E7EB", fontWeight: "700" },
  hint: { color: "#9CA3AF", marginTop: 6 },
});
