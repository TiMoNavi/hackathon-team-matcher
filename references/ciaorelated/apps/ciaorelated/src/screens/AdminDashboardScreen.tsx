import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { gql, useMutation, useQuery } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";

const ADMIN_REPORTS_Q = gql`
  query AdminDashboardReports {
    openReports(offset: 0, limit: 80) {
      id
      reason
      details
      status
      createdAt
      reporterId
      postId
      commentId
      targetUserId
      contentPostId
      offenderId
      offenderUsername
    }
    resolvedReports: reports(filter: { status: RESOLVED }, offset: 0, limit: 40) {
      id
      reason
      details
      status
      createdAt
      resolvedAt
      reporterId
      postId
      commentId
      targetUserId
      contentPostId
      offenderId
      offenderUsername
    }
    reportsOverdue24h {
      total
      nodes {
        id
        reason
        status
        createdAt
      }
    }
    adminSuspendedUsers(offset: 0, limit: 50) {
      id
      username
      avatarUrl
      avatarThumbUrl
      bannedUntil
      bannedReason
    }
  }
`;

const RESOLVE_REPORT = gql`
  mutation ResolveReport($reportId: ID!, $action: ResolveAction = NONE, $notes: String) {
    resolveReport(reportId: $reportId, action: $action, notes: $notes)
  }
`;

const UNSUSPEND_USER = gql`
  mutation AdminUnsuspendUser($userId: ID!) {
    adminUnsuspendUser(userId: $userId)
  }
`;

type AdminReport = {
  id: string;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
  reporterId: string;
  postId?: string | null;
  commentId?: string | null;
  targetUserId?: string | null;
  contentPostId?: string | null;
  offenderId?: string | null;
  offenderUsername?: string | null;
  resolvedAt?: string | null;
};

type SuspendedUser = {
  id: string;
  username: string;
  bannedUntil?: string | null;
  bannedReason?: string | null;
};

const isCopyrightReport = (report: AdminReport) => {
  const text = `${report.reason ?? ""} ${report.details ?? ""}`.toLowerCase();
  return text.includes("copyright") || text.includes("urheber") || text.includes("music") || text.includes("musik");
};

export default function AdminDashboardScreen() {
  const nav = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const C = theme.colors;
  const s = useMemo(() => styles(C), [C]);

  const { data, loading, error, refetch } = useQuery(ADMIN_REPORTS_Q, {
    fetchPolicy: "cache-and-network",
  });
  const [resolveReport, { loading: resolving }] = useMutation(RESOLVE_REPORT);
  const [unsuspendUser] = useMutation(UNSUSPEND_USER);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [section, setSection] = useState<"OPEN" | "RESOLVED" | "SUSPENDED">("OPEN");

  const reports: AdminReport[] = Array.isArray(data?.openReports) ? data.openReports : [];
  const resolvedReports: AdminReport[] = Array.isArray(data?.resolvedReports) ? data.resolvedReports : [];
  const suspendedUsers: SuspendedUser[] = Array.isArray(data?.adminSuspendedUsers) ? data.adminSuspendedUsers : [];
  const copyrightReports = reports.filter(isCopyrightReport);
  const overdueTotal = Number(data?.reportsOverdue24h?.total ?? 0);
  const visibleReports = section === "RESOLVED" ? resolvedReports : reports;

  const runAction = useCallback(
    (report: AdminReport, action: "NONE" | "DELETE_CONTENT" | "SUSPEND_USER") => {
      const title =
        action === "DELETE_CONTENT"
          ? t("admindashboard.deleteContent")
          : action === "SUSPEND_USER"
            ? t("admindashboard.suspendUser")
            : t("admindashboard.closeReport");
      const message =
        action === "DELETE_CONTENT"
          ? t("admindashboard.confirmDeleteContent")
          : action === "SUSPEND_USER"
            ? t("admindashboard.confirmSuspendUser")
            : t("admindashboard.confirmCloseReport");
      Alert.alert(title, message, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: title,
          style: action === "NONE" ? "default" : "destructive",
          onPress: async () => {
            try {
              setBusyId(report.id);
              await resolveReport({
                variables: {
                  reportId: report.id,
                  action,
                  notes: `Admin dashboard action: ${action}`,
                },
              });
              await refetch();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [refetch, resolveReport, t]
  );

  const rootNav = useMemo(() => nav.getParent?.()?.getParent?.() ?? nav.getParent?.() ?? nav, [nav]);

  const openReportTarget = useCallback(
    (report: AdminReport) => {
      if (report.contentPostId) {
        rootNav.navigate("PostDetail", {
          id: report.contentPostId,
          postIds: [report.contentPostId],
          startIndex: 0,
        });
        return;
      }
      const userId = report.targetUserId ?? report.offenderId;
      if (userId) rootNav.navigate("UserProfile", { userId });
    },
    [rootNav]
  );

  const confirmUnsuspend = useCallback(
    (user: SuspendedUser) => {
      Alert.alert(t("admindashboard.unsuspendUser"), t("admindashboard.confirmUnsuspendUser"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admindashboard.unsuspend"),
          onPress: async () => {
            try {
              setBusyId(user.id);
              await unsuspendUser({ variables: { userId: user.id } });
              await refetch();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [refetch, t, unsuspendUser]
  );

  const renderReport = useCallback(
    ({ item }: { item: AdminReport }) => {
      const target = item.contentPostId
        ? `post ${item.contentPostId}`
        : item.commentId
          ? `comment ${item.commentId}`
          : item.offenderUsername
            ? `@${item.offenderUsername}`
            : item.targetUserId
              ? `user ${item.targetUserId}`
            : "unknown";
      const date = item.createdAt ? new Date(item.createdAt).toLocaleString(i18n.language) : "";
      const busy = busyId === item.id;

      return (
        <TouchableOpacity style={s.reportCard} activeOpacity={0.86} onPress={() => openReportTarget(item)}>
          <View style={s.reportTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.reportReason} numberOfLines={1}>
                {item.reason}
              </Text>
              <Text style={s.reportMeta} numberOfLines={2}>
                {target} · {date}
              </Text>
            </View>
            {isCopyrightReport(item) ? (
              <View style={s.copyrightBadge}>
                <Ionicons name="musical-notes-outline" size={13} color={C.text} />
                <Text style={s.copyrightText}>{t("admindashboard.copyright")}</Text>
              </View>
            ) : null}
          </View>

          {!!item.details && <Text style={s.details}>{item.details}</Text>}
          <Text style={s.reportMeta} numberOfLines={1}>
            reporter {item.reporterId}
            {item.offenderUsername ? ` · offender @${item.offenderUsername}` : ""}
          </Text>

          {section === "OPEN" && (
            <View style={s.actionsRow}>
              <TouchableOpacity style={s.actionBtn} onPress={() => runAction(item, "NONE")} disabled={busy || resolving}>
                <Text style={s.actionText}>{t("admindashboard.close")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, s.warnBtn]} onPress={() => runAction(item, "DELETE_CONTENT")} disabled={busy || resolving}>
                <Text style={s.warnText}>{t("admindashboard.deleteContentShort")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, s.dangerBtn]} onPress={() => runAction(item, "SUSPEND_USER")} disabled={busy || resolving}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.dangerText}>{t("admindashboard.suspend7d")}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [C.text, busyId, i18n.language, openReportTarget, resolving, runAction, s, section, t]
  );

  const renderSuspendedUser = useCallback(
    ({ item }: { item: SuspendedUser }) => (
      <TouchableOpacity style={s.reportCard} activeOpacity={0.86} onPress={() => rootNav.navigate("UserProfile", { userId: item.id })}>
        <Text style={s.reportReason}>@{item.username}</Text>
        <Text style={s.reportMeta}>
          {t("admindashboard.suspendedUntil")} {item.bannedUntil ? new Date(item.bannedUntil).toLocaleString(i18n.language) : "-"}
        </Text>
        {!!item.bannedReason && <Text style={s.details}>{item.bannedReason}</Text>}
        <TouchableOpacity style={[s.actionBtn, s.unsuspendBtn]} onPress={() => confirmUnsuspend(item)} disabled={busyId === item.id}>
          {busyId === item.id ? <ActivityIndicator size="small" /> : <Text style={s.actionText}>{t("admindashboard.unsuspend")}</Text>}
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    [busyId, confirmUnsuspend, i18n.language, rootNav, s, t]
  );

  return (
    <Screen scroll={false}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View pointerEvents="none" style={s.titleWrap}>
          <Text style={s.title}>{t("admindashboard.title")}</Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} hitSlop={12} style={s.headerBtn}>
          {loading ? <ActivityIndicator color={C.text} /> : <Ionicons name="refresh" size={21} color={C.text} />}
        </TouchableOpacity>
      </View>

      <FlatList<any>
        data={section === "SUSPENDED" ? suspendedUsers : visibleReports}
        keyExtractor={(item) => item.id}
        renderItem={(section === "SUSPENDED" ? renderSuspendedUser : renderReport) as any}
        ListHeaderComponent={
          <View>
            <View style={s.heroCard}>
              <Text style={s.heroTitle}>{t("admindashboard.reviewQueue")}</Text>
              <Text style={s.heroSub}>{t("admindashboard.reviewQueueSub")}</Text>
              <View style={s.metricRow}>
                <View style={s.metricBox}>
                  <Text style={s.metricValue}>{reports.length}</Text>
                  <Text style={s.metricLabel}>{t("admindashboard.openReports")}</Text>
                </View>
                <View style={s.metricBox}>
                  <Text style={[s.metricValue, overdueTotal > 0 && { color: C.danger }]}>{overdueTotal}</Text>
                  <Text style={s.metricLabel}>{t("admindashboard.overdue24h")}</Text>
                </View>
                <View style={s.metricBox}>
                  <Text style={s.metricValue}>{copyrightReports.length}</Text>
                  <Text style={s.metricLabel}>{t("admindashboard.copyrightReports")}</Text>
                </View>
              </View>
            </View>

            <View style={s.processCard}>
              <Text style={s.processTitle}>{t("admindashboard.processTitle")}</Text>
              <Text style={s.processText}>{t("admindashboard.processText")}</Text>
            </View>

            {error ? <Text style={s.errorText}>{error.message}</Text> : null}
            <View style={s.segmentRow}>
              {(["OPEN", "RESOLVED", "SUSPENDED"] as const).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[s.segmentBtn, section === key && s.segmentBtnActive]}
                  onPress={() => setSection(key)}
                >
                  <Text style={[s.segmentText, section === key && s.segmentTextActive]}>
                    {key === "OPEN"
                      ? t("admindashboard.openReports")
                      : key === "RESOLVED"
                        ? t("admindashboard.resolvedReports")
                        : t("admindashboard.suspendedUsers")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.sectionLabel}>
              {section === "OPEN"
                ? t("admindashboard.openReports")
                : section === "RESOLVED"
                  ? t("admindashboard.resolvedReports")
                  : t("admindashboard.suspendedUsers")}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={s.emptyWrap}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Ionicons name="shield-checkmark-outline" size={34} color={C.subtext} />
              <Text style={s.emptyText}>
                {section === "SUSPENDED" ? t("admindashboard.noSuspendedUsers") : t("admindashboard.noReports")}
              </Text>
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refetch()} tintColor={C.text} />}
        contentContainerStyle={s.listContent}
      />
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    header: {
      height: 52,
      paddingHorizontal: 12,
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.bg,
    },
    headerBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
    titleWrap: { position: "absolute", left: 60, right: 60, alignItems: "center" },
    title: { color: C.text, fontSize: 17, fontWeight: "900" },
    listContent: { padding: 14, paddingBottom: 32 },
    heroCard: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
      padding: 14,
      marginBottom: 12,
    },
    heroTitle: { color: C.text, fontSize: 19, fontWeight: "900" },
    heroSub: { color: C.subtext, marginTop: 4, lineHeight: 18 },
    metricRow: { flexDirection: "row", gap: 8, marginTop: 14 },
    metricBox: {
      flex: 1,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      padding: 10,
      backgroundColor: C.bg,
    },
    metricValue: { color: C.text, fontSize: 22, fontWeight: "900" },
    metricLabel: { color: C.subtext, fontSize: 11, marginTop: 2 },
    processCard: {
      borderRadius: 16,
      padding: 12,
      backgroundColor: C.accentSoft ?? C.card,
      marginBottom: 12,
    },
    processTitle: { color: C.accentSoftText ?? C.text, fontWeight: "900" },
    processText: { color: C.accentSoftText ?? C.text, opacity: 0.82, marginTop: 4, lineHeight: 18 },
    sectionLabel: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "900",
      textTransform: "uppercase",
      marginTop: 4,
      marginBottom: 8,
    },
    segmentRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 10,
    },
    segmentBtn: {
      flex: 1,
      minHeight: 34,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      paddingHorizontal: 8,
    },
    segmentBtnActive: {
      backgroundColor: C.text,
      borderColor: C.text,
    },
    segmentText: {
      color: C.subtext,
      fontSize: 11,
      fontWeight: "800",
    },
    segmentTextActive: {
      color: C.bg,
    },
    reportCard: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
      padding: 12,
      marginBottom: 10,
    },
    reportTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    reportReason: { color: C.text, fontSize: 15, fontWeight: "900" },
    reportMeta: { color: C.subtext, fontSize: 12, marginTop: 3 },
    details: { color: C.text, marginTop: 8, lineHeight: 18 },
    copyrightBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: C.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    copyrightText: { color: C.text, fontSize: 11, fontWeight: "800" },
    actionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    actionBtn: {
      flex: 1,
      minHeight: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      paddingHorizontal: 8,
    },
    warnBtn: { borderColor: "#F59E0B66" },
    dangerBtn: { backgroundColor: C.danger ?? "#EF4444", borderColor: C.danger ?? "#EF4444" },
    unsuspendBtn: { marginTop: 12, flex: 0 },
    actionText: { color: C.text, fontWeight: "800", fontSize: 12 },
    warnText: { color: "#F59E0B", fontWeight: "900", fontSize: 12 },
    dangerText: { color: "#fff", fontWeight: "900", fontSize: 12 },
    emptyWrap: { alignItems: "center", paddingVertical: 42, gap: 8 },
    emptyText: { color: C.subtext, fontWeight: "700" },
    errorText: { color: C.danger, marginBottom: 10 },
  });
