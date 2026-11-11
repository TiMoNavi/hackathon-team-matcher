// src/screens/InsightsScreen.tsx
import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useTranslation } from "react-i18next";

type KPI = { label: string; value: string; trend?: "up" | "down" };

const HIGHLIGHTS = new Array(6).fill(0).map((_, i) => ({
  id: String(i),
  cover:
    i % 2
      ? "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=600&auto=format&fit=crop"
      : "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=600&auto=format&fit=crop",
}));

export default function InsightsScreen() {
  const { t } = useTranslation();

  const nav = useNavigation();
  const kpis: KPI[] = [
    { label: t("insights.kpis.views"), value: "1.855", trend: "up" },
    { label: t("insights.kpis.interactions"), value: "1" },
    { label: t("insights.kpis.newFollowers"), value: "4" },
    { label: t("insights.kpis.adInsights"), value: "›" },
    { label: t("insights.kpis.sharedContent"), value: "17" },
  ];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>{t("insights.professionalDashboard")}</Text>
        <Text style={s.gear}>⚙️</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Zeitraum-Zeile */}
        <View style={s.rangeRow}>
          <Text style={s.sectionTitle}>{t("insights.insights")}</Text>
          <Text style={s.range}>{t("insights.july16August14")}</Text>
        </View>

        {/* KPIs */}
        <View style={s.card}>
          {kpis.map((k, idx) => (
            <TouchableOpacity key={k.label} style={[s.kpiRow, idx < kpis.length - 1 && s.kpiDivider]}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {!!k.trend && (
                  <Text style={[s.trend, k.trend === "up" ? s.trendUp : s.trendDown]}>
                    {k.trend === "up" ? "↗" : "↘"}
                  </Text>
                )}
                <Text style={s.kpiValue}>{k.value}</Text>
                <Text style={s.chev}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Highlights-Leiste */}
        <View style={s.sectionPad}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {HIGHLIGHTS.map((h) => (
              <View key={h.id} style={s.highlight}>
                <Image source={{ uri: h.cover }} style={s.highlightImg} />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Deine Tools */}
        <View style={s.sectionPad}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t("insights.yourTools")}</Text>
            <TouchableOpacity onPress={() => nav.navigate("ProTools" as never)}>
              <Text style={s.link}>{t("insights.viewAll")}</Text>
            </TouchableOpacity>
          </View>

          <View style={s.card}>
            <ToolRow icon="↺" title={t("insights.monthlyReview")} subtitle={t("insights.monthlyReviewSubtitle")} badge={t("insights.newBadge")} />
            <ToolRow icon="🎓" title={t("insights.bestPractices")} />
            <ToolRow icon="💡" title={t("insights.inspiration")} />
            <ToolRow icon="👥" title={t("insights.partnershipAds")} />
            <ToolRow icon="📈" title={t("insights.advertisingTools")} />
            <ToolRow icon="🎞" title={t("insights.testReels")} badge={t("insights.newBadge")} />
            <ToolRow icon="⦿⦿⦿" title={t("insights.yourAis")} />
            <ToolRow icon="🧾" title={t("insights.brandedContent")} subtitle={t("insights.brandedContentSubtitle")} dimSubtitle />
          </View>
        </View>

        {/* Tipps & Ressourcen */}
        <View style={s.sectionPad}>
          <Text style={s.sectionTitle}>{t("insights.tipsAndResources")}</Text>
          <View style={s.card}>
            <ToolRow icon="↗" title={t("insights.latestAudio")} badge={t("insights.newBadge")} />
            <ToolRow icon="🔗" title={t("insights.otherHelpfulResources")} />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ToolRow({
  icon,
  title,
  subtitle,
  badge,
  dimSubtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  badge?: string;
  dimSubtitle?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.toolRow, s.kpiDivider]}>
      <View style={s.toolLeft}>
        <Text style={s.toolIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.toolTitle}>{title}</Text>
          {subtitle ? (
            <Text style={[s.toolSubtitle, dimSubtitle && { color: "#7D828A" }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {badge ? <Text style={s.badge}>{badge}</Text> : null}
        <Text style={s.chev}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0B0B" },
  header: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: "#fff", fontSize: 24 },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  gear: { color: "#fff", fontSize: 18 },

  // ➕ fehlende Styles:
  rangeRow: {
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: { color: "#60A5FA", fontWeight: "600" },

  sectionPad: { paddingHorizontal: 12, marginTop: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  range: { color: "#9CA3AF" },

  card: {
    backgroundColor: "#111214",
    borderRadius: 12,
    marginHorizontal: 12,
    overflow: "hidden",
  },

  // KPI rows
  kpiRow: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kpiDivider: { borderBottomColor: "#23262B", borderBottomWidth: StyleSheet.hairlineWidth },
  kpiLabel: { color: "#F3F4F6" },
  kpiValue: { color: "#F3F4F6", fontWeight: "700" },
  trend: { fontWeight: "700" },
  trendUp: { color: "#5EEAD4" },
  trendDown: { color: "#F87171" },
  chev: { color: "#9CA3AF", fontSize: 18 },

  // tools
  toolRow: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolLeft: { flexDirection: "row", gap: 12, alignItems: "center", flex: 1 },
  toolIcon: { color: "#E5E7EB", fontSize: 18, width: 24, textAlign: "center" },
  toolTitle: { color: "#fff", fontWeight: "600" },
  toolSubtitle: { color: "#9CA3AF", marginTop: 2, fontSize: 12 },
  badge: {
    backgroundColor: "#3B82F6",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
  },

  // highlights
  highlight: {
    width: 68,
    height: 98,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1C1D21",
  },
  highlightImg: { width: "100%", height: "100%" },
});
