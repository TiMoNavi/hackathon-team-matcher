// apps/ciaorelated/src/screens/PostEditScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  Platform,
  ScrollView,
} from "react-native";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import Screen from "./components/Screen";

import { useTranslation } from "react-i18next";

/* ───────────────── GraphQL ───────────────── */

const POST_Q = gql`
  query PostEdit($id: ID!) {
    post(id: $id) {
      id
      caption
      location
      locationLat
      locationLng
      interests
      communityContext { groupId title type slug visibility __typename }
      taggedUsers {
        status
        user { id username avatarUrl }
      }
    }
  }
`;

const UPDATE_POST = gql`
  mutation UpdatePost($input: UpdatePostInput!) {
    updatePost(input: $input) { id caption location locationLat locationLng interests communityContext { groupId title type slug visibility __typename } }
  }
`;

const REQUEST_USER_TAG = gql`
  mutation RequestUserTag($postId: ID!, $userId: ID!) {
    requestUserTag(postId: $postId, userId: $userId)
  }
`;

const MY_GROUP_LINKS = gql`
  query MyJoinedGroupLinksForPostEdit {
    myJoinedGroupLinks {
      id
      title
      type
      visibility
      slug
      __typename
    }
  }
`;

export const SEARCH_USERS = gql`
  query SearchUsers($q: String!, $limit: Int) {
    searchUsers(q: $q, limit: $limit) {
      id
      username
      avatarUrl
    }
  }
`;

const SEARCH_PLACES = gql`
  query SearchPlacesForPostEdit($q: String!, $limit: Int) {
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

const INTEREST_KEYS = [
  "photography",
  "music",
  "film",
  "design",
  "architecture",
  "fashion",
  "art",
  "sports",
  "fitness",
  "cooking",
  "travel",
  "gaming",
  "tech",
  "startups",
  "nature",
  "books",
] as const;

type InterestKey = (typeof INTEREST_KEYS)[number];



/* ───────────────── Utils ───────────────── */
function useDebouncedValue<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ───────────────── Screen ───────────────── */
type PostStackParamList = { PostEdit: { id: string } };

export default function PostEditScreen() {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<PostStackParamList, "PostEdit">>();
  const { id } = route.params;

  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = styles(COLORS);

  // Basisdaten
  const { data: postQ } = useQuery(POST_Q, { variables: { id } });
  const { data: myGroupsQ } = useQuery(MY_GROUP_LINKS, { fetchPolicy: "cache-and-network" });

  const p = postQ?.post;

  const initialGroupLinkId = p?.communityContext?.groupId ? String(p.communityContext.groupId) : null;
  const communityLocked = !!initialGroupLinkId && p?.communityContext?.visibility !== "PUBLIC";

  // Caption
  const [caption, setCaption] = useState<string>(p?.caption ?? "");
  useEffect(() => setCaption(p?.caption ?? ""), [p?.caption]);

  // Location
  const [location, setLocation] = useState<string>(p?.location ?? "");
  useEffect(() => setLocation(p?.location ?? ""), [p?.location]);
  const [locationLat, setLocationLat] = useState<number | null>(p?.locationLat ?? null);
  const [locationLng, setLocationLng] = useState<number | null>(p?.locationLng ?? null);
  const [selectedLocationTitle, setSelectedLocationTitle] = useState<string | null>(null);
  useEffect(() => {
    setLocationLat(Number.isFinite(Number(p?.locationLat)) ? Number(p.locationLat) : null);
    setLocationLng(Number.isFinite(Number(p?.locationLng)) ? Number(p.locationLng) : null);
    setSelectedLocationTitle(p?.location ?? null);
  }, [p?.location, p?.locationLat, p?.locationLng]);

  // Interests
  const [selectedInterests, setSelectedInterests] = useState<InterestKey[]>([]);

  useEffect(() => {
    const raw = Array.isArray(p?.interests) ? p!.interests : [];
    // nur gültige keys übernehmen (falls alte Daten drin sind → werden ignoriert)
    setSelectedInterests(raw.filter((x: any) => INTEREST_KEYS.includes(x)) as InterestKey[]);
  }, [p?.interests]);

const MAX_INTERESTS = 12;

const toggleInterestLimited = (key: InterestKey) =>
  setSelectedInterests((prev) => {
    const has = prev.includes(key);
    if (has) return prev.filter((x) => x !== key);

    if (prev.length >= MAX_INTERESTS) {
      Alert.alert(
        t("postedit.alert.interestLimitTitle"),
        t("postedit.alert.interestLimitBody", { count: MAX_INTERESTS })
      );
      return prev;
    }
    return [...prev, key];
  });




    
  const [selectedGroupLinkId, setSelectedGroupLinkId] = useState<string | null>(initialGroupLinkId);
  useEffect(() => setSelectedGroupLinkId(initialGroupLinkId), [initialGroupLinkId]);

  // Bereits akzeptierte Personen (nur Anzeige)
  const acceptedPeople = useMemo(
    () =>
      (p?.taggedUsers ?? [])
        .filter((t: any) => t.status === "ACCEPTED")
        .map((t: any) => t.user),
    [p?.taggedUsers]
  );

  // Personen, die ich NEU markieren möchte
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const toggleUser = (uid: string) =>
    setSelectedUserIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));

  // Suche
  const [mode, setMode] = useState<"community" | "people">("community");
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedValue(query, 300);

  const [runUserSearch, userSearch] = useLazyQuery(SEARCH_USERS, { fetchPolicy: "network-only" });
  const [runPlaceSearch, placeSearch] = useLazyQuery(SEARCH_PLACES, { fetchPolicy: "network-only" });
  const debouncedLocation = useDebouncedValue(location, 300);

  useEffect(() => {
    const q = debouncedQ.trim();
    if (!q) return;
    if (mode === "people") runUserSearch({ variables: { q, limit: 7 } }); // max 7 user
  }, [debouncedQ, mode, runUserSearch]);

  useEffect(() => {
    const q = debouncedLocation.trim();
    if (selectedLocationTitle && q !== selectedLocationTitle) {
      setSelectedLocationTitle(null);
      setLocationLat(null);
      setLocationLng(null);
    }
    if (!q || q.length < 2 || selectedLocationTitle) return;
    runPlaceSearch({ variables: { q, limit: 6 } }).catch(() => {});
  }, [debouncedLocation, selectedLocationTitle, runPlaceSearch]);

  const chooseLocation = (place: any) => {
    const title = String(place?.title ?? "").trim();
    if (!title) return;
    Keyboard.dismiss();
    setSelectedLocationTitle(title);
    setLocation(title);
    setLocationLat(Number.isFinite(Number(place?.lat)) ? Number(place.lat) : null);
    setLocationLng(Number.isFinite(Number(place?.lng)) ? Number(place.lng) : null);
  };

  // Mutations
  const [updatePost, { loading: saving }] = useMutation(UPDATE_POST  );
  const [requestUserTag] = useMutation(REQUEST_USER_TAG);

  // Save-Handler
  const onSave = async () => {
    try {
      const interestsForSave = Array.from(new Set(selectedInterests)).slice(0, MAX_INTERESTS);


      await updatePost({
        variables: {
          input: {
            id,
            caption,
            location,
            locationLat,
            locationLng,
            groupLinkId: selectedGroupLinkId,
            interests: interestsForSave,
          },
        },
      });

      if (selectedUserIds.length) {
        await Promise.all(
          selectedUserIds.map((uid) => requestUserTag({ variables: { postId: id, userId: uid } }))
        );
      }

      nav.goBack();
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("postedit.saveFailed"));
    }
  };

  // Datenquellen für Liste
  const myGroups = myGroupsQ?.myJoinedGroupLinks ?? [];
  const userResults = userSearch.data?.searchUsers ?? [];
  const filteredGroups = useMemo(() => {
    const q = debouncedQ.trim().toLowerCase();
    const list = Array.isArray(myGroups) ? myGroups : [];
    if (!q) return list;
    return list.filter((group: any) => String(group?.title ?? "").toLowerCase().includes(q));
  }, [myGroups, debouncedQ]);

  const showCommunityList = mode === "community";
  const listData = showCommunityList ? filteredGroups : userResults;

  return (
    <Screen scroll={false}>
      <View style={s.container}>
        {/* Header (wie ProfileUnified) */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {t("postedit.editPost")}</Text>
          </View>

          <TouchableOpacity
            disabled={saving}
            onPress={onSave}
            hitSlop={12}
            style={[s.headerBtn, saving && { opacity: 0.6 }]}
          >
            <Ionicons name="checkmark" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.contentScroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <Text style={s.label}>{t("postedit.location")}</Text>
          <TextInput
            value={location}
            onChangeText={(text) => {
              setLocation(text);
              if (selectedLocationTitle && text.trim() !== selectedLocationTitle) {
                setSelectedLocationTitle(null);
                setLocationLat(null);
                setLocationLng(null);
              }
            }}
            placeholder={t("postedit.addLocation")}
            placeholderTextColor={COLORS.subtext}
            style={s.input}
          />
          {!!placeSearch.data?.searchPlaces?.length && !selectedLocationTitle && location.trim().length >= 2 && (
            <View style={s.placeSuggestBox}>
              {placeSearch.data.searchPlaces.map((place: any, idx: number) => (
                <TouchableOpacity
                  key={place.id ?? `${place.title}-${idx}`}
                  onPress={() => chooseLocation(place)}
                  activeOpacity={0.84}
                  style={s.placeSuggestRow}
                >
                  <Ionicons name="location-outline" size={17} color={COLORS.subtext} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.placeTitle} numberOfLines={1}>{place.title}</Text>
                    {!!place.subtitle && <Text style={s.placeSub} numberOfLines={1}>{place.subtitle}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Caption */}
          <Text style={s.label}>{t("postedit.caption")}</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder={t("postedit.writeACaption")}
            placeholderTextColor={COLORS.subtext}
            style={[s.input, { height: 96 }]}
            multiline
          />

          {/* Modus Toggle (tabs-style) */}
          <View style={{ marginTop: 20 }}>
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, mode === "community" && s.activeTab]}
              onPress={() => setMode("community")}
              hitSlop={12}
            >
              <Ionicons name="people-circle-outline" size={20} color={COLORS.text} />
              <Text style={[s.tabTxt, mode === "community" && s.tabTxtActive]}>Community</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.tab, mode === "people" && s.activeTab]}
              onPress={() => setMode("people")}
              hitSlop={12}
            >
              <MaterialCommunityIcons name="tag-outline" size={20} color={COLORS.text} />
              <Text style={[s.tabTxt, mode === "people" && s.tabTxtActive]}>{t("postedit.persons")}</Text>
            </TouchableOpacity>
          </View>
          </View>

          {/* Suche */}
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={COLORS.subtext} style={{ marginRight: 8 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={mode === "community" ? t("publishform.searchCommunities") : t("postedit.searchPeople")}
              placeholderTextColor={COLORS.subtext}
              style={s.searchInput}
              autoCapitalize="none"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={COLORS.subtext} />
              </TouchableOpacity>
            )}
          </View>

          {/* Chips: akzeptierte Personen */}
          {mode === "people" && acceptedPeople.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={s.label}>{t("postedit.alreadyMarkedAccepted")}</Text>
              <View style={s.chips}>
                {acceptedPeople.map((u: any) => (
                  <View key={u.id} style={s.chip}>
                    <Text style={s.chipTxt}>@{u.username}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {mode === "community" && selectedGroupLinkId && (
            <View style={{ marginBottom: 10 }}>
              <Text style={s.label}>{t("publishform.selectedCommunity")}</Text>
              <View style={s.chips}>
                <TouchableOpacity
                  disabled={communityLocked}
                  onPress={() => setSelectedGroupLinkId(null)}
                  style={[s.chip, s.chipActive]}
                >
                  <Text style={[s.chipTxt, { color: COLORS.text }]} numberOfLines={1}>
                    {(myGroups as any[]).find((x) => String(x.id) === String(selectedGroupLinkId))?.title ?? p?.communityContext?.title ?? "Community"}
                  </Text>
                  <Ionicons name={communityLocked ? "lock-closed-outline" : "close"} size={14} color={COLORS.subtext} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
              {communityLocked ? <Text style={{ color: COLORS.subtext, fontSize: 13 }}>{t("communityprivacy.privatePostLocked")}</Text> : null}
              <Text style={{ color: COLORS.subtext, fontSize: 13, marginTop: 4 }}>
                {t(((myGroups as any[]).find(x => String(x.id) === String(selectedGroupLinkId))?.visibility ?? p?.communityContext?.visibility) === "PUBLIC" ? "communityprivacy.publicPost" : "communityprivacy.privatePost")}
              </Text>
            </View>
          )}

          {mode === "people" && selectedUserIds.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={s.label}>{t("postedit.toMarkANew")}</Text>
              <View style={s.chips}>
                {selectedUserIds.map((uid) => {
                  const u = (userResults as any[]).find((x) => x.id === uid);
                  return (
                    <TouchableOpacity
                      key={uid}
                      onPress={() => toggleUser(uid)}
                      style={[s.chip, s.chipActive]}
                    >
                      <Text style={[s.chipTxt, { color: COLORS.text }]} numberOfLines={1}>
                        @{u?.username ?? "profil"}
                      </Text>
                      <Ionicons name="close" size={14} color={COLORS.subtext} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Ergebnisliste */}
          <ScrollView
            style={s.resultsList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onScrollBeginDrag={Keyboard.dismiss}
          >
            {listData.length ? (
              listData.map((item: any) =>
                showCommunityList ? (
                  <TouchableOpacity
                    key={String(item.id)}
                    disabled={communityLocked}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSelectedGroupLinkId(String(item.id));
                    }}
                    style={[
                      s.row,
                      String(selectedGroupLinkId ?? "") === String(item.id) && { borderColor: COLORS.text, opacity: 0.9 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTxt} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={{ color: COLORS.subtext, fontSize: 12, marginTop: 2 }}>
                        {item.type === "EVENT" ? t("publishform.eventFeed") : t("publishform.communityFeed")}
                      </Text>
                    </View>
                    {String(selectedGroupLinkId ?? "") === String(item.id) ? (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.text} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={20} color={COLORS.subtext} />
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    key={String(item.id)}
                    onPress={() => {
                      Keyboard.dismiss();
                      toggleUser(item.id);
                    }}
                    style={[
                      s.row,
                      selectedUserIds.includes(item.id) && { borderColor: COLORS.text, opacity: 0.9 },
                    ]}
                  >
                    <Text style={s.rowTxt} numberOfLines={1}>
                      @{item.username}
                    </Text>
                    {selectedUserIds.includes(item.id) ? (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.text} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={20} color={COLORS.subtext} />
                    )}
                  </TouchableOpacity>
                )
              )
            ) : (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: COLORS.subtext }}>
                  {debouncedQ
                    ? t("postedit.noHits")
                    : showCommunityList
                    ? t("publishform.chooseCommunityOrProfileOnly")
                    : t("postedit.searchPeopleHint")}

                </Text>
              </View>
            )}
          </ScrollView>

          <View style={{ marginTop: 12 }}>
            <Text style={s.label}>{t("postedit.interests")}</Text>
            <View style={s.interestChipsWrap}>
              {INTEREST_KEYS.map((k) => {
                const active = selectedInterests.includes(k);
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => toggleInterestLimited(k)}
                    style={[s.interestChip, active && s.interestChipActive]}
                  >
                    <Text style={[s.interestChipText, { color: active ? COLORS.text : COLORS.subtext }]}>
                      {t(`interests.${k}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}

            </View>
          </View>

          {/* Save bottom (optional, bleibt) */}
          <View style={{ paddingTop: 10, paddingBottom: 20 }}>
            <TouchableOpacity
              disabled={saving}
              onPress={onSave}
              style={[s.primaryBtn, saving && { opacity: 0.6 }]}
            >
              <Text style={s.primaryBtnTxt}>
                {saving ? t("postedit.saving") : t("common.save")}
              </Text>

            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

/* ───────────────── Styles ───────────────── */
const styles = (COLORS: any) =>
  StyleSheet.create({
    interestChipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 6,
    },

    interestChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      backgroundColor: "transparent",
    },

    interestChipActive: {
      backgroundColor: "rgba(79,140,255,0.14)", // an primary angelehnt
      borderColor: "rgba(79,140,255,0.35)",
    },

    interestChipText: {
      fontSize: 13,
      fontWeight: "800",
    },

    container: { flex: 1, backgroundColor: COLORS.bg },
    header: {
      paddingHorizontal: 16,
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
    },
    headerBtn: { padding: 8 },
    headerTitle: { color: COLORS.text, fontWeight: "800", fontSize: 16, maxWidth: "90%" },

    contentScroll: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },

    label: { color: COLORS.subtext, marginTop: 8, marginBottom: 6, fontSize: 12 },

    input: {
      color: COLORS.text,
      backgroundColor: COLORS.card,
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 12,
      padding: 12,
    },
    placeSuggestBox: {
      marginTop: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      borderRadius: 14,
      backgroundColor: COLORS.card,
      overflow: "hidden",
    },
    placeSuggestRow: {
      minHeight: 46,
      paddingHorizontal: 12,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
    },
    placeTitle: { color: COLORS.text, fontWeight: "900", fontSize: 14 },
    placeSub: { color: COLORS.subtext, fontWeight: "700", fontSize: 12, marginTop: 2 },

    tabs: {
      flexDirection: "row",
      backgroundColor: COLORS.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: COLORS.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
      marginTop: 12,
      marginBottom: 12,
      borderRadius: 12,
      overflow: "hidden",
    },
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      flexDirection: "row",
      gap: 8,
      opacity: 0.85,
    },
    activeTab: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.text,
      opacity: 1,
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    tabTxt: { color: COLORS.subtext, fontWeight: "800", fontSize: 12 },
    tabTxtActive: { color: COLORS.text },

    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.card,
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      marginBottom: 8,
    },
    searchInput: { flex: 1, color: COLORS.text },

    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: COLORS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COLORS.border,
      marginBottom: 8,
    },
    rowTxt: { color: COLORS.text, fontWeight: "700", flex: 1, paddingRight: 10 },
    resultsList: {
      maxHeight: 240,
      marginBottom: 8,
    },

    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      backgroundColor: COLORS.card,
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      maxWidth: "100%",
    },
    chipActive: { backgroundColor: "rgba(255,255,255,0.06)" },
    chipTxt: { color: COLORS.subtext, fontWeight: "800", fontSize: 12, maxWidth: 220 },

    primaryBtn: {
      backgroundColor: COLORS.text,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 20,
    },
    primaryBtnTxt: { color: COLORS.bg, fontWeight: "900" },
  });
