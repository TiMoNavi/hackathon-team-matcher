import React from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useTranslation } from "react-i18next";

function Row({
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
    <TouchableOpacity style={[s.row, s.divider]}>
      <View style={s.left}>
        <Text style={s.icon}>{icon}</Text>
        <View>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={[s.subtitle, dimSubtitle && { color: "#7D828A" }]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {badge ? <Text style={s.badge}>{badge}</Text> : null}
        <Text style={s.chev}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ProToolsScreen() {
  const nav = useNavigation();
  const { t } = useTranslation();
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t("protools.professionalDashboard")}</Text>
        <Text style={s.gear}>⚙️</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[s.sectionTitle, { paddingHorizontal: 12, marginTop: 10 }]}>{t("protools.yourTools")}</Text>

        <View style={s.card}>
          <Row icon="↺" title={t("protools.monthlyReview")} subtitle={t("protools.monthlyReviewSubtitle")} badge={t("protools.newBadge")} />
          <Row icon="🎓" title={t("protools.bestPractices")} />
          <Row icon="💡" title={t("protools.inspiration")} />
          <Row icon="👥" title={t("protools.partnershipAds")} />
          <Row icon="📈" title={t("protools.advertisingTools")} />
          <Row icon="🎞" title={t("protools.testReels")} badge={t("protools.newBadge")} />
          <Row icon="⦿⦿⦿" title={t("protools.yourAis")} />
          <Row icon="🧾" title={t("protools.brandedContent")} subtitle={t("protools.brandedContentSubtitle")} dimSubtitle />
        </View>

        <Text style={[s.sectionTitle, { paddingHorizontal: 12, marginTop: 16 }]}>{t("protools.tipsAndResources")}</Text>
        <View style={s.card}>
          <Row icon="↗" title={t("protools.latestAudio")} badge={t("protools.newBadge")} />
          <Row icon="🔗" title={t("protools.otherHelpfulResources")} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  gear: { color: "#fff", fontSize: 18 },

  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  card: {
    backgroundColor: "#111214",
    borderRadius: 12,
    marginHorizontal: 12,
    overflow: "hidden",
    marginTop: 8,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  divider: { borderBottomColor: "#23262B", borderBottomWidth: StyleSheet.hairlineWidth },
  left: { flexDirection: "row", gap: 12, alignItems: "center", flex: 1 },
  icon: { color: "#E5E7EB", fontSize: 18, width: 24, textAlign: "center" },
  title: { color: "#fff", fontWeight: "600" },
  subtitle: { color: "#9CA3AF", marginTop: 2, fontSize: 12, maxWidth: 260 },
  chev: { color: "#9CA3AF", fontSize: 18 },
  badge: {
    backgroundColor: "#3B82F6",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
  },
});
