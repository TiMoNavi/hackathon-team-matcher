import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { gql, useMutation, useLazyQuery } from "@apollo/client";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import { StepHeader } from "../post/components/StepHeader";

import { useTranslation } from "react-i18next";

/** ---------- GraphQL ---------- */
const GET_SIGNED_POST_UPLOAD = gql`
  mutation GetSignedPostUpload($mime: String!, $size: Int!) {
    getSignedPostUpload(mime: $mime, size: $size) {
      key
      putUrl
      __typename
    }
  }
`;

export const MY_VLOGS = gql`
  query MyVlogs {
    myVlogs {
      id
      slug
      title
      description
      coverUrl
      coverThumbUrl
      updatedAt
      privacy
      memberCount
      postCount
      owner { id username avatarUrl }
      __typename
    }
  }
`;

const CREATE_VLOG = gql`
  mutation CreateVlog($input: CreateVlogInput!) {
    createVlog(input: $input) {
      id
      slug
      title
      coverUrl
      privacy
      memberCount
      postCount
      owner { id username avatarUrl }
      __typename
    }
  }
`;

// ✅ Dein Backend hat PlaceSuggestion mit: title/subtitle/lat/lng/provider (NICHT "name")
const SEARCH_PLACES = gql`
  query SearchPlaces($q: String!, $limit: Int) {
    searchPlaces(q: $q, limit: $limit) {
      id
      title
      subtitle
      lat
      lng
      __typename
    }
  }
`;


/** ---------- Utils ---------- */
function slugify(s: string) {
  return (
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036F]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "vlog"
  );
}

async function getSize(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info && Number.isFinite((info as any).size)) {
      return (info as any).size as number;
    }
  } catch {}
  try {
    const r = await fetch(uri);
    const b = await r.blob();
    return b.size ?? 0;
  } catch {}
  return 0;
}

async function uploadBinary(putUrl: string, uri: string, mime: string) {
  try {
    const res = await FileSystem.uploadAsync(putUrl, uri, {
      httpMethod: "PUT",
      headers: { "Content-Type": mime },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const put = await fetch(putUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
      return put.ok;
    } catch {
      return false;
    }
  }
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ✅ PublishForm-like SectionCard */
function SectionCard({
  s,
  title,
  subtitle,
  children,
}: {
  s: any;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <View style={s.sectionCard}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
      </View>
      <View>{children}</View>
    </View>
  );
}

/** ---------- Wizard ---------- */
type SearchResult = {
  id?: string;
  title: string;
  subtitle?: string | null;
  lat: number;
  lng: number;
};

export function VlogWizard({
  onDone,
  onToggleBottomBar,
}: {
  onDone: () => void;
  onToggleBottomBar: (v: boolean) => void;
}) {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C, isDark), [C, isDark]);
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [slugText, setSlugText] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const autoSlug = useMemo(() => slugify(title), [title]);

  useEffect(() => {
    // nur vorschlagen, solange user nicht manuell editiert
    if (slugTouched) return;
    setSlugText(autoSlug);
  }, [autoSlug, slugTouched]);

  const normalizedSlug = useMemo(() => slugify(slugText), [slugText]);

  const [description, setDescription] = useState("");
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeLabel, setPlaceLabel] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedValue(query, 300);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [locBusy, setLocBusy] = useState(false);
  const [fallbackGeocodeUsed, setFallbackGeocodeUsed] = useState(false);

  const [getSigned] = useMutation(GET_SIGNED_POST_UPLOAD);

  const [createVlog] = useMutation(CREATE_VLOG, {
    refetchQueries: [{ query: MY_VLOGS }],
    awaitRefetchQueries: true,
  });

  // ✅ Backend Places
  const [runPlaceSearch, placeSearch] = useLazyQuery(SEARCH_PLACES, {
    fetchPolicy: "network-only",
  });

  const searching = placeSearch.loading;

  async function reverseGeocodeLabel(lat: number, lng: number) {
    try {
      const arr = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const a = arr?.[0];
      if (!a) return "";
      const parts = [a.name, a.street, a.city, a.region, a.country].filter(Boolean);
      return parts.join(", ");
    } catch {
      return "";
    }
  }

  const chooseResult = useCallback(async (r: SearchResult) => {
    setCoords({ lat: r.lat, lng: r.lng });
    const label = r.subtitle ? `${r.title} — ${r.subtitle}` : r.title;
    setPlaceLabel(label);
    setResults([]);
    setQuery("");
    Keyboard.dismiss();
  }, []);

  const useCurrentLocation = useCallback(async () => {
    try {
      setLocBusy(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(t("vlogwizard.errors.locationPermissionTitle"), t("vlogwizard.errors.locationPermissionBody"));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setCoords({ lat, lng });
      const label = await reverseGeocodeLabel(lat, lng);
      setPlaceLabel(label);
    } finally {
      setLocBusy(false);
    }
  }, [t]);

  useEffect(() => {
    onToggleBottomBar(true);
  }, [onToggleBottomBar]);

  const pickCover = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("vlogwizard.errors.mediaPermissionTitle"), t("vlogwizard.errors.mediaPermissionBody"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setCoverUri(res.assets[0].uri);
  }, [t]);

  // ✅ Suche: zuerst Backend (searchPlaces). Wenn Backend Schema fehlt -> Fallback expo geocode
  useEffect(() => {
    const q = debouncedQ.trim();
    if (!q) {
      setResults([]);
      setFallbackGeocodeUsed(false);
      return;
    }
    if (q.length < 2) {
      setResults([]);
      return;
    }

    // backend search
    runPlaceSearch({ variables: { q, limit: 8 } })
      .then((res) => {
        const arr: SearchResult[] = (res?.data?.searchPlaces ?? []).map((p: any) => ({
          id: p.id,
          title: p.title,
          subtitle: p.subtitle,
          lat: p.lat,
          lng: p.lng,
        }));
        setResults(arr);
        setFallbackGeocodeUsed(false);
      })
      .catch(async () => {
        // ❗ backend hat searchPlaces nicht -> fallback
        try {
          setFallbackGeocodeUsed(true);
          const list = await Location.geocodeAsync(q);
          const out: SearchResult[] = (list || []).slice(0, 8).map((it: any) => ({
            title: q,
            subtitle: `${it.latitude.toFixed(4)}, ${it.longitude.toFixed(4)}`,
            lat: it.latitude,
            lng: it.longitude,
            provider: "expo",
          }));
          setResults(out);
        } catch {
          setResults([]);
        }
      });
  }, [debouncedQ, runPlaceSearch]);

  const submit = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert(t("vlogwizard.errors.titleMissingTitle"), t("vlogwizard.errors.titleMissingBody"));
      return;
    }

    if (!normalizedSlug || normalizedSlug === "vlog") {
      Alert.alert(t("vlogwizard.errors.slugTitle"), t("vlogwizard.errors.slugBody"));
      return;
    }

    if (!coords) {
      Alert.alert(t("vlogwizard.errors.locationRequiredTitle"), t("vlogwizard.errors.locationRequiredBody"));
      return;
    }

    setCreating(true);
    try {
      let coverKey: string | undefined;

      if (coverUri) {
        const size = await getSize(coverUri);
        if (!size) throw new Error(t("vlogwizard.errors.unknownCoverSize"));

        const { data } = await getSigned({ variables: { mime: "image/jpeg", size } });
        const { key, putUrl } = data.getSignedPostUpload;

        const ok = await uploadBinary(putUrl, coverUri, "image/jpeg");
        if (!ok) throw new Error(t("vlogwizard.errors.coverUploadFailed"));

        coverKey = key;
      }

      const { data } = await createVlog({
        variables: {
          input: {
            title: title.trim(),
            slug: normalizedSlug,
            description: description.trim() || null,
            coverKey: coverKey ?? null,
            lat: coords.lat,
            lng: coords.lng,
          },
        },
      });

      const created = data?.createVlog;
      onDone();
      if (created?.slug) nav.navigate("VlogDetail", { slug: created.slug });
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("vlogwizard.errors.createFailed"));
    } finally {
      setCreating(false);
    }
  }, [title, coords, coverUri, description, normalizedSlug, getSigned, createVlog, nav, onDone, t]);

  const bottomPad = 120 + insets.bottom;

  return (
    <SafeAreaView style={[s.container, { paddingTop: insets.top }]}>
      {/* ✅ Header exakt wie gewünscht */}
      <View style={s.headerHost}>
        <StepHeader
          variant="default"
          title={t("vlogwizard.createANewVlog")}
          canContinue={false}
          onLeft={() => nav.goBack()}
          showContinue={false}
        />
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.select({ ios: "padding", android: undefined })}
        keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
      >
        <ScrollView
          style={s.flex}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 12, paddingBottom: bottomPad }}
        >
          {/* Cover */}
          <SectionCard s={s} title="Cover" subtitle="Optional">
            <TouchableOpacity style={s.cover} onPress={pickCover} activeOpacity={0.9}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={s.coverImg} />
              ) : (
                <View style={s.coverPhWrap}>
                  <View style={s.coverIcon}>
                    <Ionicons name="image-outline" size={18} color={C.bg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.coverPhTitle}>{t("vlogwizard.chooseCover")}</Text>
                    <Text style={s.coverPhSub}>{t("vlogwizard.giveYourVlogACleanLook")}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.subtext} />
                </View>
              )}
            </TouchableOpacity>
          </SectionCard>

          <View style={s.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={C.subtext} />
            <Text style={s.infoText}>
              {t("vlogwizard.vlogsArePrivateCollectionsAndCanBeSh6ed840")}</Text>
          </View>




          {/* Basics */}
          <SectionCard s={s} title="Details" subtitle="Titel & Beschreibung">
            <Text style={s.label}>Titel</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("vlogwizard.eGSummerInSicily")}
              placeholderTextColor={C.subtext}
              style={s.input}
              returnKeyType="next"
            />

            <Text style={s.label}>Slug</Text>

              <View style={s.slugRow}>
                <TextInput
                  value={slugText}
                  onChangeText={(t) => {
                    setSlugTouched(true);
                    setSlugText(t);
                  }}
                  placeholder={t("vlogwizard.eGSummerInSicily")}
                  placeholderTextColor={C.subtext}
                  style={[s.input, { flex: 1 }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  onPress={() => {
                    setSlugTouched(false);
                    setSlugText(autoSlug);
                  }}
                  style={s.slugHintBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons name="sparkles-outline" size={16} color={C.subtext} />
                  <Text style={s.slugHintBtnTxt}>{t("vlogwizard.fromTitle")}</Text>
                </TouchableOpacity>
              </View>



            <Text style={s.label}>{t("vlogwizard.description")}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("vlogwizard.optionalWhatIsThisVlogAbout")}
              placeholderTextColor={C.subtext}
              style={[s.input, { minHeight: 92 }]}
              multiline
            />
          </SectionCard>

          {/* Location */}
          <SectionCard
            s={s}
            title={t("vlogwizard.location")}
            subtitle="Pflicht"
          >
            <View style={s.locTopRow}>
              <TouchableOpacity
                onPress={useCurrentLocation}
                style={[s.locBtn, locBusy && { opacity: 0.6 }]}
                activeOpacity={0.9}
                disabled={locBusy}
              >
                {locBusy ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Ionicons name="location-outline" size={16} color={C.text} />
                    <Text style={s.locBtnTxt}>{t("vlogwizard.currentLocation")}</Text>
                  </>
                )}
              </TouchableOpacity>

              {!!coords && (
                <TouchableOpacity
                  onPress={() => {
                    setCoords(null);
                    setPlaceLabel("");
                  }}
                  style={s.locClearBtn}
                  activeOpacity={0.9}
                >
                  <Ionicons name="close" size={16} color={C.subtext} />
                  <Text style={s.locClearTxt}>{t("vlogwizard.remove")}</Text>
                </TouchableOpacity>
              )}
            </View>

            {!!coords && (
              <View style={s.locPill}>
                <Ionicons name="pin" size={14} color={C.subtext} />
                <Text style={s.locPillTxt} numberOfLines={2}>
                  {placeLabel || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`}
                </Text>
              </View>
            )}

            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={C.subtext} style={{ marginRight: 8 }} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("vlogwizard.searchForALocationAddressCityLandmare46174")}
                placeholderTextColor={C.subtext}
                style={s.searchInput}
                returnKeyType="search"
              />
              {!!query && (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={C.subtext} />
                </TouchableOpacity>
              )}
            </View>

            {!!searching && <Text style={s.helperTxt}>{t("vlogwizard.errors.searching")}</Text>}

            {fallbackGeocodeUsed && (
              <Text style={s.helperTxt}>
                {t("vlogwizard.noteBackendPlacesAreNotAvailableFall3e5b7c")}</Text>
            )}

            {results.length > 0 && (
              <View style={s.searchList}>
                {results.map((r, i) => (
                  <TouchableOpacity
                    key={`${r.lat}-${r.lng}-${i}`}
                    onPress={() => chooseResult(r)}
                    style={s.rowCard}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={s.rowTxt} numberOfLines={1}>
                        {r.title}
                      </Text>
                      {!!r.subtitle && (
                        <Text style={s.rowSub} numberOfLines={1}>
                          {r.subtitle}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.subtext} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <Text style={s.helperTxt}>{t("vlogwizard.noMatchesFound")}</Text>
            )}
          </SectionCard>

          {/* Primary */}
          <TouchableOpacity
            style={[s.primaryBtn, (creating || !coords) && { opacity: 0.6 }]}
            onPress={submit}
            disabled={creating || !coords}
            activeOpacity={0.9}
          >
            {creating ? <ActivityIndicator /> : <Text style={s.primaryTxt}>{t("vlogwizard.createAVlog")}</Text>}
          </TouchableOpacity>

          {!coords && (
            <Text style={[s.helperTxt, { textAlign: "center", marginTop: 10 }]}>
              {t("vlogwizard.pleaseSelectALocationFirst")}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = (C: any, isDark: boolean) =>
  StyleSheet.create({

    infoBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginTop: 8,
      marginBottom: 13,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },

    infoText: {
      flex: 1,
      color: C.subtext,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 16,
    },

    slugRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    slugHintBtn: {
      height: 44,
      paddingHorizontal: 12,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },

    slugHintBtnTxt: {
      color: C.subtext,
      fontWeight: "900",
      fontSize: 12,
    },

    headerHost: { zIndex: 50, backgroundColor: C.bg },
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: C.bg },

    sectionCard: {
      backgroundColor: C.card,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      padding: 12,
      marginBottom: 12,
    },
    sectionHead: { marginBottom: 10 },
    sectionTitle: { color: C.text, fontWeight: "900", fontSize: 14 },
    sectionSub: { marginTop: 4, color: C.subtext, fontWeight: "700", fontSize: 12 },

    label: { color: C.subtext, marginTop: 8, marginBottom: 6, fontSize: 12, fontWeight: "800" },
    input: {
      color: C.text,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      borderRadius: 12,
      padding: 12,
    },

    cover: {
      width: "100%",
      aspectRatio: 16 / 9,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    coverImg: { width: "100%", height: "100%" },
    coverPhWrap: { flex: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
    coverIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.primary,
    },
    coverPhTitle: { color: C.text, fontWeight: "900", fontSize: 13 },
    coverPhSub: { marginTop: 2, color: C.subtext, fontWeight: "700", fontSize: 12, lineHeight: 16 },

    locTopRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    locBtn: {
      flex: 1,
      height: 44,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    locBtnTxt: { color: C.text, fontWeight: "900", fontSize: 12 },

    locClearBtn: {
      height: 44,
      paddingHorizontal: 12,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    locClearTxt: { color: C.subtext, fontWeight: "800", fontSize: 12 },

    locPill: {
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    locPillTxt: { color: C.text, fontWeight: "800", flex: 1, fontSize: 12 },

    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.03)",
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      marginTop: 10,
    },
    searchInput: { flex: 1, color: C.text },

    helperTxt: { color: C.subtext, marginTop: 8, fontSize: 12, fontWeight: "700" },
    searchList: { marginTop: 8 },

    rowCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      marginBottom: 8,
    },
    rowTxt: { color: C.text, fontWeight: "800", flex: 1 },
    rowSub: { marginTop: 2, color: C.subtext, fontWeight: "700", fontSize: 12 },

    primaryBtn: {
      marginTop: 6,
      backgroundColor: C.text,
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: 14,
    },
    primaryTxt: { color: C.bg, fontWeight: "900", fontSize: 16 },
  });

export default VlogWizard;
