import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Easing, Image, KeyboardAvoidingView, Modal,
  Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useIsFocused, useNavigation } from "@react-navigation/native";
import { useApolloClient, useQuery } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeProvider";
import { Auth } from "../lib/auth";
import { formatInfluence, type InfluenceOverview, type InfluencePosition, type InfluenceProfile } from "../lib/communityInfluence";
import { INFLUENCE_RECIPIENTS, MY_COMMUNITY_INFLUENCE, SET_INFLUENCE_RECIPIENT } from "../graphql/queries/influence";

function Avatar({ uri, size = 48, color }: { uri: string | null; size?: number; color: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: color, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
    {uri && !failed ? <Image source={{ uri }} style={{ width: size, height: size }} onError={() => setFailed(true)} /> : <Ionicons name="person-outline" size={size / 2} color={color} />}
  </View>;
}

export function InfluenceCircuit({ enabled, color }: { enabled: boolean; color: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(60), [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduceMotion(v); });
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const app = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (!enabled || reduceMotion || !active) { progress.setValue(0); return; }
    const animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }));
    animation.start(); return () => animation.stop();
  }, [enabled, reduceMotion, active, progress]);
  return <View accessible={false} style={s.circuit} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    <Svg width="100%" height={64} viewBox="0 0 100 64" preserveAspectRatio="none">
      <Path d="M0 16 H28 L44 32 H100 M0 32 H100 M0 48 H28 L44 32 M62 32 L78 16 H100 M62 32 L78 48 H100" stroke={color} opacity={0.35} strokeWidth={1.2} fill="none" />
    </Svg>
    {enabled && !reduceMotion && active ? <Animated.View testID="influence-pulse" style={{ position: "absolute", left: 0, top: 31, width: 12, height: 2, backgroundColor: color,
      opacity: progress.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] }),
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, width - 12)] }) }] }} /> : null}
  </View>;
}

function RecipientResults({ query, onSelect, selected }: { query: string; onSelect: (p: InfluenceProfile) => void; selected?: string }) {
  const { theme: { colors: C } } = useTheme(), { t } = useTranslation();
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 300); return () => clearTimeout(timer); }, []);
  const { data, loading, error, refetch } = useQuery(INFLUENCE_RECIPIENTS, { variables: { q: query }, skip: !ready, fetchPolicy: "no-cache" });
  if (!ready || loading) return <ActivityIndicator style={s.status} color={C.text} accessibilityLabel={t("influence.loading")} />;
  if (error) return <TouchableOpacity style={s.status} onPress={() => void refetch().catch(() => {})} accessibilityRole="button" accessibilityLabel={t("influence.retry")}><Ionicons name="refresh-outline" size={22} color={C.text} /><Text style={{ color: C.subtext }}>{t("influence.failed")}</Text></TouchableOpacity>;
  const profiles: InfluenceProfile[] = data?.communityInfluenceRecipients ?? [];
  return profiles.length ? <>{profiles.map(p => <TouchableOpacity key={p.id} onPress={() => onSelect(p)} style={[s.personRow, { borderColor: C.border }]}
    accessibilityRole="button" accessibilityState={{ selected: selected === p.id }} accessibilityLabel={`@${p.username}`}>
    <Avatar uri={p.avatarUrl} size={40} color={C.subtext} /><View style={s.flex}><Text numberOfLines={1} style={[s.label, { color: C.text }]}>{p.name || p.username}</Text><Text numberOfLines={1} style={{ color: C.subtext }}>@{p.username}</Text></View>
    {selected === p.id ? <Ionicons name="checkmark-circle" size={22} color={C.primary} /> : null}
  </TouchableOpacity>)}</> : <Text style={[s.statusText, { color: C.subtext }]}>{t("influence.noPeople")}</Text>;
}

export function CommunityInfluenceContent({ profileId }: { profileId: string }) {
  const { theme: { colors: C }, isDark } = useTheme(), { t, i18n } = useTranslation();
  const nav = useNavigation<any>(), focused = useIsFocused(), client = useApolloClient();
  const accent = isDark ? "#71E3C1" : "#087D66";
  const [overview, setOverview] = useState<InfluenceOverview | null>(null), [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false), [query, setQuery] = useState(""), [candidate, setCandidate] = useState<InfluenceProfile | null>(null);
  const [info, setInfo] = useState(false), [error, setError] = useState("");
  const sequence = useRef(0), count = useRef(0), busy = useRef(false), savingRef = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  const fmt = (v: string) => formatInfluence(v, i18n.language);
  const load = useCallback(async (more = false) => {
    if (busy.current && more) return;
    const request = ++sequence.current;
    busy.current = true; setLoading(true); setFailed(false);
    try {
      const size = 20, pages = more ? 1 : Math.max(1, Math.ceil(count.current / size));
      let latest: InfluenceOverview | null = null, positions: InfluencePosition[] = [];
      for (let n = 0; n < pages; n++) {
        const response = await client.query<{ myCommunityInfluence: InfluenceOverview }>({ query: MY_COMMUNITY_INFLUENCE,
          variables: { offset: more ? count.current : n * size, limit: size }, fetchPolicy: "no-cache" });
        if (request !== sequence.current || !mounted.current) return;
        latest = response.data.myCommunityInfluence;
        if (latest.profile.id !== profileId) throw new Error("profile changed");
        positions.push(...latest.positions);
        if (!latest.hasMore) break;
      }
      if (latest) {
        const snapshot = latest;
        setOverview(previous => {
          const rows = [...new Map([...(more ? previous?.positions ?? [] : []), ...positions].map(p => [p.communityId, p])).values()];
          count.current = rows.length;
          return { ...snapshot, positions: rows };
        });
      }
    } catch { if (request === sequence.current && mounted.current) setFailed(true); }
    finally { if (request === sequence.current && mounted.current) { busy.current = false; setLoading(false); } }
  }, [client, profileId]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; busy.current = false; }; }, [load]));
  const selected = useMemo(() => overview?.positions.find(p => p.communityId === selectedId) ?? overview?.positions[0], [overview, selectedId]);
  const change = async (recipientId: string | null) => {
    if (!selected || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      await client.mutate({ mutation: SET_INFLUENCE_RECIPIENT, variables: { communityId: selected.communityId, recipientId, expectedProfileId: profileId } });
      if (!mounted.current) return;
      setPicker(false); setCandidate(null); setQuery("");
      await load();
    } catch { if (mounted.current) setError(t("influence.saveFailed")); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  const closePicker = () => { if (!savingRef.current) { setPicker(false); setCandidate(null); setQuery(""); setError(""); } };
  const dateText = (value: string) => new Date(value).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });
  return <SafeAreaView style={[s.page, { backgroundColor: C.bg }]} edges={["top", "bottom"]}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => nav.goBack()} style={s.icon} accessibilityRole="button" accessibilityLabel={t("influence.back")}><Ionicons name="arrow-back" size={24} color={C.text} /></TouchableOpacity>
      <Text style={[s.heading, { color: C.text }]}>{t("influence.title")}</Text>
      <TouchableOpacity onPress={() => setInfo(true)} style={s.icon} accessibilityRole="button" accessibilityLabel={t("influence.info")}><Ionicons name="information-circle-outline" size={24} color={C.subtext} /></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading && !!overview} onRefresh={() => { if (!savingRef.current) void load(); }} tintColor={C.text} />}>
      {!overview && loading ? <ActivityIndicator style={s.status} color={C.text} accessibilityLabel={t("influence.loading")} /> : null}
      {failed ? <TouchableOpacity onPress={() => void load()} style={s.status} accessibilityRole="button" accessibilityLabel={t("influence.retry")}><Ionicons name="refresh-outline" size={24} color={C.text} /><Text style={[s.statusText, { color: C.subtext }]}>{t("influence.failed")}</Text></TouchableOpacity> : null}
      {overview ? <>
        <View style={s.summary}>
          {([["earned", overview.earnedUnits], ["received", overview.receivedUnits], ["assigned", overview.assignedUnits]] as const).map(([label, amount]) => <View key={label} style={label === "earned" ? s.summaryPrimary : s.summaryCell}>
            <Text style={[s.caption, { color: C.subtext }]}>{t(`influence.${label}`)}</Text><Text style={[s.number, { color: C.text, fontSize: fmt(amount).length > 12 ? 14 : 22 }]}>{fmt(amount)}</Text>
          </View>)}
        </View>
        <Text style={[s.statusTag, { color: C.subtext }]}>{t(overview.rankingEnabled ? "influence.rankingActive" : "influence.rankingPending")}</Text>
        {!overview.earningStartsAt ? <Text style={[s.statusTag, { color: C.subtext }]}>{t("influence.inactive")}</Text> : new Date(overview.earningStartsAt) > new Date() ? <Text style={[s.statusTag, { color: C.subtext }]}>{t("influence.starts", { date: dateText(overview.earningStartsAt) })}</Text> : null}
        {selected ? <View style={[s.detail, { borderColor: C.border }]}>
          <Text style={[s.sectionTitle, { color: C.text }]}>{selected.title || t("influence.unavailableCommunity")}</Text>
          <View style={s.metaRow}><Text style={[s.caption, { color: C.subtext }]}>{t(`influence.state.${selected.earnState.toLowerCase()}`)}</Text>
            {selected.earnState === "PRIVATE" ? <TouchableOpacity onPress={() => setInfo(true)} style={s.smallIcon} accessibilityRole="button" accessibilityLabel={t("influence.privateInfo")}><Ionicons name="information-circle-outline" size={18} color={C.subtext} /></TouchableOpacity> : null}
          </View>
          <View style={s.flow}>
            <View style={s.node}>
              <View style={[s.source, { borderColor: accent }]}><Ionicons name="flash-outline" size={27} color={accent} /></View>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[s.score, { color: C.text }]}>{fmt(selected.earnedUnits)}</Text>
              <Text style={[s.caption, { color: C.subtext }]}>{t("influence.own")}</Text>
            </View>
            <InfluenceCircuit enabled={focused && selected.canAssign && selected.supportState !== "UNAVAILABLE" && selected.earnedUnits !== "0"} color={accent} />
            <View style={s.node}>
              <Avatar uri={selected.recipient?.avatarUrl ?? null} size={56} color={selected.supportState === "UNAVAILABLE" ? C.subtext : accent} />
              <Text style={[s.recipientName, { color: C.text }]} numberOfLines={1}>{selected.recipient ? `@${selected.recipient.username}` : t("influence.unavailablePerson")}</Text>
              <Text style={[s.caption, { color: C.subtext }]}>{t(selected.supportState === "SELF" ? "influence.you" : "influence.recipient")}</Text>
            </View>
          </View>
          {selected.canAssign ? <TouchableOpacity disabled={saving || loading || failed} onPress={() => { setPicker(true); setCandidate(null); setError(""); }} style={[s.command, { borderColor: C.border, opacity: saving || loading || failed ? 0.4 : 1 }]}
            accessibilityRole="button" accessibilityLabel={t("influence.choose")}><Ionicons name="person-add-outline" size={19} color={C.text} /><Text style={[s.label, { color: C.text }]}>{t("influence.choose")}</Text></TouchableOpacity> : null}
          {selected.supportState !== "SELF" ? <TouchableOpacity disabled={saving || loading || failed} onPress={() => void change(null)} style={s.command} accessibilityRole="button" accessibilityLabel={t("influence.revoke")}>
            {saving ? <ActivityIndicator color={C.text} /> : <Ionicons name="return-down-back-outline" size={19} color={C.text} />}<Text style={[s.label, { color: C.text }]}>{t("influence.revoke")}</Text></TouchableOpacity> : null}
          {!!error && !picker ? <Text accessibilityRole="alert" style={[s.statusText, { color: C.danger }]}>{error}</Text> : null}
          <View style={s.breakdown}>
            {([["community", selected.communityUnits], ["participation", selected.participationUnits], ["resonance", selected.resonanceUnits]] as const).map(([label, units]) => <View style={s.valueRow} key={label}><Text style={[s.flex, s.caption, { color: C.subtext }]}>{t(`influence.${label}`)}</Text><Text style={[s.label, { color: C.text }]}>{fmt(units)}</Text></View>)}
          </View>
          <Text style={[s.caption, { color: C.subtext }]}>{t("influence.joined", { date: dateText(selected.joinedAt) })}{selected.entryPosition ? ` · #${selected.entryPosition}` : ""}</Text>
          <Text style={[s.caption, { color: C.subtext }]}>{selected.settledThrough ? t("influence.settled", { date: dateText(selected.settledThrough) }) : t("influence.unsettled")}</Text>
        </View> : <View style={s.status}><Ionicons name="people-outline" size={32} color={C.subtext} /><Text style={[s.statusText, { color: C.subtext }]}>{t("influence.empty")}</Text><TouchableOpacity onPress={() => nav.navigate("Groups")} style={s.command}><Text style={{ color: C.primary }}>{t("influence.communities")}</Text></TouchableOpacity></View>}
        {overview.positions.length ? <Text style={[s.sectionTitle, { color: C.text, marginTop: 22 }]}>{t("influence.communities")}</Text> : null}
        {overview.positions.map(p => <TouchableOpacity key={p.communityId} disabled={saving} style={[s.communityRow, { borderColor: C.border }]} onPress={() => { setSelectedId(p.communityId); setError(""); }}
          accessibilityRole="button" accessibilityState={{ selected: p.communityId === selected?.communityId }} accessibilityLabel={p.title || t("influence.unavailableCommunity")}>
          <Avatar uri={p.imageUrl} size={38} color={C.subtext} /><View style={s.flex}><Text numberOfLines={1} style={[s.label, { color: C.text }]}>{p.title || t("influence.unavailableCommunity")}</Text><Text style={[s.caption, { color: C.subtext }]}>{t(`influence.state.${p.earnState.toLowerCase()}`)}</Text></View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[s.rowScore, { color: C.text }]}>{fmt(p.earnedUnits)}</Text><Ionicons name={selected?.communityId === p.communityId ? "checkmark-circle" : "chevron-forward"} size={18} color={selected?.communityId === p.communityId ? accent : C.subtext} />
        </TouchableOpacity>)}
        {overview.hasMore ? <TouchableOpacity disabled={loading} style={s.command} onPress={() => void load(true)} accessibilityRole="button" accessibilityLabel={t("influence.more")}>{loading ? <ActivityIndicator color={C.text} /> : <Ionicons name="chevron-down" size={22} color={C.text} />}<Text style={{ color: C.text }}>{t("influence.more")}</Text></TouchableOpacity> : null}
      </> : null}
    </ScrollView>
    <Modal visible={picker} animationType="slide" onRequestClose={closePicker} presentationStyle="pageSheet">
      <SafeAreaView style={[s.page, { backgroundColor: C.bg }]}><KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}><Text style={[s.heading, { color: C.text }]}>{t("influence.choose")}</Text><TouchableOpacity onPress={closePicker} disabled={saving} style={s.icon} accessibilityRole="button" accessibilityLabel={t("influence.close")}><Ionicons name="close" size={24} color={C.text} /></TouchableOpacity></View>
        <View style={[s.search, { borderColor: C.border }]}><Ionicons name="search-outline" size={20} color={C.subtext} /><TextInput style={[s.input, { color: C.text }]} value={query} onChangeText={v => { setQuery(v); setCandidate(null); }} editable={!saving} placeholder={t("influence.search")} accessibilityLabel={t("influence.search")} placeholderTextColor={C.subtext} autoCapitalize="none" autoCorrect={false} maxLength={80} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pickerContent}>
          {query.trim() ? <RecipientResults key={query.trim()} query={query.trim()} selected={candidate?.id} onSelect={p => { if (!savingRef.current) setCandidate(p); }} /> : null}
        </ScrollView>
        {candidate ? <View style={[s.confirm, { borderColor: C.border }]}><Text style={[s.label, { color: C.text }]} numberOfLines={1}>@{candidate.username}</Text><Text style={[s.caption, { color: C.subtext }]}>{t("influence.confirm", { points: fmt(selected?.earnedUnits ?? "0") })}</Text>
          {!!error ? <Text accessibilityRole="alert" style={{ color: C.danger }}>{error}</Text> : null}
          <TouchableOpacity disabled={saving} onPress={() => void change(candidate.id)} style={[s.command, { backgroundColor: C.text, borderRadius: 6 }]} accessibilityRole="button" accessibilityLabel={t("influence.support")}>
            {saving ? <ActivityIndicator color={C.bg} /> : <Ionicons name="flash-outline" size={18} color={C.bg} />}<Text style={[s.label, { color: C.bg }]}>{t("influence.support")}</Text>
          </TouchableOpacity></View> : null}
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>
    <Modal visible={info} transparent animationType="fade" onRequestClose={() => setInfo(false)}>
      <View style={s.scrim}><View style={[s.info, { backgroundColor: C.bg }]}><View style={s.header}><Text style={[s.heading, { color: C.text }]}>{t("influence.title")}</Text><TouchableOpacity onPress={() => setInfo(false)} style={s.icon} accessibilityRole="button" accessibilityLabel={t("influence.close")}><Ionicons name="close" size={24} color={C.text} /></TouchableOpacity></View>
        <ScrollView><Text style={[s.infoText, { color: C.text }]}>{selected?.earnState === "PRIVATE"
          ? t("influence.privateExplanation")
          : `${t("influence.explanation")}\n\n${t(overview?.rankingEnabled ? "influence.rankingExplanation" : "influence.rankingPending")}`}</Text></ScrollView>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

export default function CommunityInfluenceScreen() {
  const [profileId, setProfileId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true, version = 0;
    const refresh = () => { const current = ++version; setProfileId(null); void Auth.getProfileId().then(id => { if (alive && current === version) setProfileId(id); }); };
    refresh(); const off = Auth.onChange(refresh);
    return () => { alive = false; off(); };
  }, []);
  return profileId ? <CommunityInfluenceContent key={profileId} profileId={profileId} /> : <SafeAreaView style={s.page}><ActivityIndicator /></SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1 }, flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, minHeight: 60, gap: 8 },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, fontSize: 20, fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingBottom: 28, width: "100%", maxWidth: 620, alignSelf: "center" },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 18, paddingBottom: 12 }, summaryCell: { flex: 1, minWidth: 0 }, summaryPrimary: { width: "100%" },
  number: { fontSize: 22, fontWeight: "700", lineHeight: 30, marginTop: 5, fontVariant: ["tabular-nums"] },
  caption: { fontSize: 12, lineHeight: 18 }, label: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  statusTag: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 22, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
  metaRow: { flexDirection: "row", alignItems: "center", minHeight: 36 }, smallIcon: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  flow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 18 }, node: { width: 104, alignItems: "center", gap: 6 },
  source: { width: 56, height: 56, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  circuit: { flex: 1, minWidth: 32, height: 64 }, score: { fontSize: 22, fontWeight: "700", width: "100%", textAlign: "center", lineHeight: 28 },
  recipientName: { fontSize: 13, fontWeight: "600", lineHeight: 28, width: "100%", textAlign: "center" },
  command: { minHeight: 46, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 0 },
  breakdown: { gap: 9, paddingVertical: 22 }, valueRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  communityRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  rowScore: { maxWidth: 86, fontSize: 14, fontWeight: "600" },
  status: { alignItems: "center", justifyContent: "center", minHeight: 110, gap: 12 }, statusText: { fontSize: 14, lineHeight: 21, textAlign: "center", paddingVertical: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20, borderBottomWidth: 1, paddingVertical: 10 }, input: { flex: 1, minWidth: 0, fontSize: 16, minHeight: 40 },
  pickerContent: { paddingHorizontal: 20 }, personRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  confirm: { padding: 20, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 }, info: { width: "100%", maxWidth: 500, maxHeight: "80%", alignSelf: "center", borderRadius: 8, paddingBottom: 20 }, infoText: { paddingHorizontal: 20, fontSize: 15, lineHeight: 24 },
});
