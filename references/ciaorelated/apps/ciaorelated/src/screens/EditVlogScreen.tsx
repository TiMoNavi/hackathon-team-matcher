// apps/ciaorelated/src/screens/EditVlogScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

/* ---------- GraphQL ---------- */
const VLOG_DETAIL = gql`
  query VlogDetail($slug: String!) {
    vlogBySlug(slug: $slug) {
      id
      slug
      title
      description
      coverUrl
      privacy
      lat
      lng
      owner {
        id
        username
        avatarUrl
      }
      __typename
    }
  }
`;

const UPDATE_VLOG = gql`
  mutation UpdateVlog($id: ID!, $input: UpdateVlogInput!) {
    updateVlog(id: $id, input: $input) {
      id
      slug
      title
      description
      coverUrl
      privacy
      lat
      lng
      owner {
        id
        username
        avatarUrl
      }
      __typename
    }
  }
`;

const GET_SIGNED_POST_UPLOAD = gql`
  mutation GetSignedPostUpload($mime: String!, $size: Int!) {
    getSignedPostUpload(mime: $mime, size: $size) {
      key
      putUrl
      __typename
    }
  }
`;

/* ---------- Utils ---------- */
function slugify(s: string) {
  return (
    (s ?? "")
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
      const put = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: blob,
      });
      return put.ok;
    } catch {
      return false;
    }
  }
}

/* ---------- Screen ---------- */
export default function EditVlogScreen() {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const routeSlug = route.params?.slug as string;

  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C), [C]);

  const { data, loading, error, refetch } = useQuery(VLOG_DETAIL, {
    variables: { slug: routeSlug },
    fetchPolicy: "cache-and-network",
  });

  const [updateVlog] = useMutation(UPDATE_VLOG, {
    refetchQueries: ["VlogDetail", "MyVlogs", "VlogsFeed"],
  });
  const [getSigned] = useMutation(GET_SIGNED_POST_UPLOAD);

  // Form
  const [title, setTitle] = useState("");

  const [slugText, setSlugText] = useState("");

  const [description, setDescription] = useState("");
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Standort
  type SearchResult = { name: string; lat: number; lng: number; subtitle?: string };
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeLabel, setPlaceLabel] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  // Initial befüllen
  useEffect(() => {
    const v = data?.vlogBySlug;
    if (!v) return;

    setTitle(v.title ?? "");
    setDescription(v.description ?? "");
    setSlugText(v.slug ?? "");


    if (typeof v.lat === "number" && typeof v.lng === "number") {
      setCoords({ lat: v.lat, lng: v.lng });
      reverseGeocodeLabel(v.lat, v.lng).then(setPlaceLabel).catch(() => {});
    } else {
      setCoords(null);
      setPlaceLabel("");
    }
  }, [data?.vlogBySlug?.id]);



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

  const runSearch = async (q: string) => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const list = await Location.geocodeAsync(term);
      const mapped: SearchResult[] = (list || []).slice(0, 8).map((it: any) => {
        const title = [it.name, it.street, it.city].filter(Boolean).join(", ") || term;
        const sub = [it.district, it.region, it.country].filter(Boolean).join(", ");
        return {
          name: title,
          subtitle: sub || undefined,
          lat: it.latitude,
          lng: it.longitude,
        };
      });
      setResults(mapped);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(t);
  }, [query]);

  const chooseResult = (r: SearchResult) => {
    setCoords({ lat: r.lat, lng: r.lng });
    setPlaceLabel(r.name + (r.subtitle ? ` — ${r.subtitle}` : ""));
    setResults([]);
    setQuery("");
  };

  const useCurrentLocation = async () => {
    try {
      setLocBusy(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          t("editvlog.locationPermission.title"),
          t("editvlog.locationPermission.body")
        );
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
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert(
        t("editvlog.mediaPermission.title"),
        t("editvlog.mediaPermission.body")
      );

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setCoverUri(res.assets[0].uri);
  };

  const coverPreview = coverUri || data?.vlogBySlug?.coverUrl || null;

  const normalizedSlug = slugify(slugText);
  const canSave = !!title.trim() && !!coords && !!normalizedSlug && !saving;

  const onSave = async () => {
    const v = data?.vlogBySlug;
    if (!v?.id) return;

    if (!title.trim())
      return Alert.alert(t("editvlog.validation.titleMissingTitle"), t("editvlog.validation.titleMissingBody"));

    if (!coords)
      return Alert.alert(t("editvlog.validation.locationRequiredTitle"), t("editvlog.validation.locationRequiredBody"));

    setSaving(true);
    try {
      let coverKey: string | null | undefined = undefined;

      if (coverUri) {
        const size = await getSize(coverUri);
        if (!size) throw new Error(t("editvlog.errors.coverSizeUnknown"));
        const { data: signed } = await getSigned({ variables: { mime: "image/jpeg", size } });
        const { key, putUrl } = signed.getSignedPostUpload;
        const ok = await uploadBinary(putUrl, coverUri, "image/jpeg");
        if (!ok) throw new Error(t("editvlog.errors.coverUploadFailed"));
        coverKey = key;
      }

      const variables = {
        id: v.id,
        input: {
          title: title.trim(),
          slug: normalizedSlug, // ✅ editierbar, aber sicher normalisiert
          description: description.trim() || null,
          coverKey, // undefined => nicht ändern
          lat: coords.lat,
          lng: coords.lng,
        } as any,
      };

      const res = await updateVlog({ variables });
      const newSlug = res.data?.updateVlog?.slug ?? normalizedSlug;

      nav.replace("VlogDetail", { slug: newSlug });
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("editvlog.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data?.vlogBySlug) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerPad}>
          <ActivityIndicator color={C.text} />
          <Text style={s.sub}>{t("editvlog.loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ padding: 16 }}>
          <Text style={s.err}>{t("common.error")}: {error.message}</Text>
          <TouchableOpacity onPress={() => refetch()} style={s.primaryBtn} activeOpacity={0.85}>
            <Text style={s.primaryTxt}>{t("editvlog.tryAgain")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Topbar */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.iconCircle} activeOpacity={0.85}>
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>

        <Text style={s.topbarTitle} numberOfLines={1}>
          {t("editvlog.editVlog")}</Text>

        <TouchableOpacity
          onPress={onSave}
          disabled={!canSave}
          style={[s.saveBtn, !canSave && { opacity: 0.5 }]}
          activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator color={C.text} /> : <Text style={s.saveTxt}>{t("editvlog.save")}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Cover */}
        <Text style={s.sectionTitle}>{t("editvlog.sections.cover")}</Text>
        <TouchableOpacity style={s.coverCard} onPress={pickCover} activeOpacity={0.9}>
          {coverPreview ? (
            <Image source={{ uri: coverPreview }} style={s.coverImg} />
          ) : (
            <View style={s.coverEmpty}>
              <Ionicons name="image-outline" size={26} color={C.subtext} />
              <Text style={s.coverEmptyTxt}>{t("editvlog.chooseCover")}</Text>
            </View>
          )}
          <View style={s.coverEditBadge}>
            <Ionicons name="create-outline" size={16} color={C.text} />
          </View>
        </TouchableOpacity>

        {/* Details */}
        <Text style={s.sectionTitle}>{t("editvlog.sections.details")}</Text>
        <View style={s.card}>
          <Text style={s.label}>{t("editvlog.fields.title")}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("editvlog.eGSummerInSicily")}
            placeholderTextColor={C.subtext}
            style={s.input}
          />

          <View style={{ height: 12 }} />

          <Text style={s.label}>{t("editvlog.fields.slug")}</Text>
          <TextInput
            value={slugText}
            onChangeText={(t) => {
              setSlugText(t);
            }}
            placeholder={t("editvlog.eGSummerInSicily")}
            placeholderTextColor={C.subtext}
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="information-circle-outline" size={16} color={C.subtext} />
            <Text style={s.hint}>
              {t("editvlog.allowedLettersNumbersHyphensCleanupOe78f35")}{normalizedSlug}
            </Text>
          </View>

          <View style={{ height: 12 }} />

          <Text style={s.label}>{t("editvlog.description")}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("editvlog.optionalDescription")}
            placeholderTextColor={C.subtext}
            style={[s.input, { height: 92 }]}
            multiline
          />
        </View>

        {/* Standort */}
        <Text style={[s.sectionTitle, { marginTop: 14 }]}>{t("editvlog.location")}</Text>
        <View style={s.card}>
          <View style={s.locTopRow}>
            <TouchableOpacity
              onPress={useCurrentLocation}
              style={[s.locBtn, locBusy && { opacity: 0.7 }]}
              disabled={locBusy}
              activeOpacity={0.85}
            >
              {locBusy ? (
                <ActivityIndicator color={C.text} />
              ) : (
                <>
                  <Ionicons name="navigate-outline" size={16} color={C.text} />
                  <Text style={s.locBtnTxt}>{t("editvlog.currentLocation")}</Text>
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
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={16} color={C.text} />
              </TouchableOpacity>
            )}
          </View>

          {!!coords && (
            <View style={s.coordsPill}>
              <Ionicons name="location-outline" size={16} color={C.text} />
              <Text style={s.coordsTxt} numberOfLines={2}>
                {placeLabel || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`}
              </Text>
            </View>
          )}

          <View style={{ height: 10 }} />

          <View style={s.searchInputWrap}>
            <Ionicons name="search-outline" size={18} color={C.subtext} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("editvlog.searchForALocationAddressCityLandmare46174")}
              placeholderTextColor={C.subtext}
              style={s.searchInput}
              returnKeyType="search"
              onSubmitEditing={() => query.trim() && runSearch(query)}
            />
          </View>

          {searching && <Text style={s.sub}>{t("editvlog.searching")}</Text>}


          {results.length > 0 && (
            <View style={s.searchList}>
              {results.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => chooseResult(r)}
                  style={s.searchRow}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.searchTitle} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {!!r.subtitle && (
                      <Text style={s.searchSub} numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.subtext} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Bottom Save */}
        <TouchableOpacity
          style={[s.primaryBtn, !canSave && { opacity: 0.5 }]}
          onPress={onSave}
          disabled={!canSave}
          activeOpacity={0.85}
        >
          <Text style={s.primaryTxt}>
            {saving ? t("editvlog.saving") : t("editvlog.saveChanges")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },

    topbar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },

    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },

    topbarTitle: {
      flex: 1,
      textAlign: "center",
      color: C.text,
      fontSize: 18,
      fontWeight: "900",
      paddingHorizontal: 10,
    },

    saveBtn: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
      alignItems: "center",
      justifyContent: "center",
    },
    saveTxt: { color: C.text, fontWeight: "900", fontSize: 13 },

    sectionTitle: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 14,
      marginBottom: 8,
    },

    card: {
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 14,
      padding: 12,
    },

    label: { color: C.text, marginBottom: 6, fontWeight: "900" },

    input: {
      color: C.text,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.select({ ios: 12, android: 10 }),
    },

    hint: { color: C.subtext, fontWeight: "700", fontSize: 12, flex: 1 },

    coverCard: {
      width: "100%",
      aspectRatio: 16 / 9,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: C.border,
    },
    coverImg: { width: "100%", height: "100%" },
    coverEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    coverEmptyTxt: { color: C.subtext, fontWeight: "800" },
    coverEditBadge: {
      position: "absolute",
      right: 10,
      bottom: 10,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },

    locTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

    locBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "rgba(255,255,255,0.10)",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    locBtnTxt: { color: C.text, fontWeight: "900" },

    locClearBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
    },

    coordsPill: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(255,255,255,0.06)",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    coordsTxt: { color: C.text, fontWeight: "800", flex: 1 },

    searchInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchInput: { flex: 1, color: C.text, fontSize: 16 },

    searchList: {
      marginTop: 10,
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "rgba(255,255,255,0.03)",
    },

    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    searchTitle: { color: C.text, fontWeight: "900" },
    searchSub: { color: C.subtext, marginTop: 2, fontWeight: "700" },

    primaryBtn: {
      backgroundColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: 24,
      marginTop: 18,
    },
    primaryTxt: { color: C.text, fontWeight: "900", fontSize: 16 },

    centerPad: { padding: 16, alignItems: "center" },
    sub: { color: C.subtext, marginTop: 8 },
    err: { color: "#ff6b6b" },
  });
