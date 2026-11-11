// =============================================
// File: apps/ciaorelated/src/screens/create/post/components/PublishForm.tsx
// =============================================
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ScrollView,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import ViewShot from "react-native-view-shot";
import { ColorMatrix } from "react-native-color-matrix-image-filters";
import type ViewShotType from "react-native-view-shot";
import {
  concatMatrix,
  type Matrix20,
  IDENTITY,
  concatColorMatrices,
} from "../utils/matrix";
import { gql, useLazyQuery, useQuery } from "@apollo/client";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../../../../theme/ThemeProvider";
import { AlignableSquare, type AlignState } from "./AlignableSquare";

import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");

/* ------------ GraphQL ------------ */
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
  query SearchPlacesForPublish($q: String!, $limit: Int) {
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

export const MY_GROUP_LINKS = gql`
  query MyJoinedGroupLinksForPublish {
    myJoinedGroupLinks {
      id
      title
      type
      visibility
      slug
    }
  }
`;

const MAX_INTERESTS = 12;

/* ------------ Utils ------------ */
function useDebouncedValue<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

  const withOpacity = (color: string, opacity: number) => {
  // erwartet rgb(...) oder hex → wir gehen safe über rgba
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }

  if (color.startsWith("rgba(")) {
    return color;
  }

  // fallback: hex → rgb
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const bigint = parseInt(hex.length === 3
      ? hex.split("").map((x) => x + x).join("")
      : hex, 16);

    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return color;
};

/* ✅ FIX: SectionCard MUSS außerhalb von PublishForm sein (sonst verliert TextInput Fokus) */
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

type CarouselItem = {
  uri: string;
  isVideo: boolean;
  thumbUri?: string;

  filterMatrix?: Matrix20;
  adjustMatrix?: Matrix20;

  // ✅ alignment + original media dimensions (für AlignableSquare)
  align?: AlignState;
  width?: number;
  height?: number;

  // ✅ size of the container where tx/ty were created (Step1/2 = W)
  alignBaseSize?: number;
};

const LocationPickerSection = React.memo(function LocationPickerSection({
  s,
  C,
  title,
  subtitle,
  placeholder,
  value,
  onChange,
  onCoords,
  onFocusChange,
}: {
  s: any;
  C: any;
  title: string;
  subtitle: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
  onCoords?: (lat: number | null, lng: number | null) => void;
  onFocusChange?: (focused: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(value || null);
  const [focused, setFocused] = useState(false);
  const debouncedDraft = useDebouncedValue(draft, 260);
  const [runPlaceSearch, placeSearch] = useLazyQuery(SEARCH_PLACES, {
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (!focused) {
      setDraft(value);
      setSelectedTitle(value || null);
    }
  }, [focused, value]);

  useEffect(() => {
    const q = debouncedDraft.trim();
    if (!focused || !q || q.length < 2 || selectedTitle) return;
    runPlaceSearch({ variables: { q, limit: 6 } }).catch(() => {});
  }, [debouncedDraft, focused, runPlaceSearch, selectedTitle]);

  const commitDraft = useCallback(() => {
    const next = draft.trim();
    onChange(next);
    if (!selectedTitle || next !== selectedTitle) onCoords?.(null, null);
  }, [draft, onChange, onCoords, selectedTitle]);

  const chooseLocation = useCallback((place: any) => {
    const nextTitle = String(place?.title ?? "").trim();
    if (!nextTitle) return;
    Keyboard.dismiss();
    setDraft(nextTitle);
    setSelectedTitle(nextTitle);
    onChange(nextTitle);
    onCoords?.(
      Number.isFinite(Number(place?.lat)) ? Number(place.lat) : null,
      Number.isFinite(Number(place?.lng)) ? Number(place.lng) : null
    );
  }, [onChange, onCoords]);

  const placeResults = placeSearch.data?.searchPlaces ?? [];

  return (
    <SectionCard s={s} title={title} subtitle={subtitle}>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          if (selectedTitle && text.trim() !== selectedTitle) setSelectedTitle(null);
        }}
        placeholder={placeholder}
        placeholderTextColor={C.subtext}
        style={s.input}
        returnKeyType="done"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        onFocus={() => {
          setFocused(true);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          commitDraft();
          setFocused(false);
          onFocusChange?.(false);
        }}
        onSubmitEditing={commitDraft}
      />
      {!!placeResults.length && !selectedTitle && draft.trim().length >= 2 && (
        <View style={s.placeSuggestBox}>
          {placeResults.map((place: any, idx: number) => (
            <TouchableOpacity
              key={place.id ?? `${place.title}-${idx}`}
              onPress={() => chooseLocation(place)}
              activeOpacity={0.84}
              style={s.placeSuggestRow}
            >
              <Ionicons name="location-outline" size={17} color={C.subtext} />
              <View style={{ flex: 1 }}>
                <Text style={s.placeTitle} numberOfLines={1}>{place.title}</Text>
                {!!place.subtitle && <Text style={s.placeSub} numberOfLines={1}>{place.subtitle}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SectionCard>
  );
});

type Props = {
  isVideo: boolean;
  sourceUri: string;
  creating: boolean;
  onShare: () => void;

  viewShotRef?: React.RefObject<ViewShotType | null>;
  filterMatrix?: Matrix20;
  adjustMatrix?: Matrix20;

  caption: string;
  onCaption: (t: string) => void;
  location: string;
  onLocation: (t: string) => void;
  onLocationCoords?: (lat: number | null, lng: number | null) => void;
  posterUri?: string;

  interestSuggestions?: string[];
  selectedInterests?: string[];
  onToggleInterest?: (label: string) => void;

  selectedGroupLinkId?: string | null;
  onSelectGroupLink?: (id: string | null) => void;


  // User (Multi-Select)
  selectedUserIds?: string[];
  onToggleUser?: (id: string) => void;
  meId?: string;

  list?: CarouselItem[];
};

export function PublishForm(props: Props) {
  const {
    isVideo,
    sourceUri,
    creating,
    onShare,
    viewShotRef,
    filterMatrix,
    adjustMatrix,
    caption,
    onCaption,
    location,
    onLocation,
    onLocationCoords,
    posterUri,
    interestSuggestions = [],
    selectedInterests = [],
    onToggleInterest,
    selectedGroupLinkId = null,
    onSelectGroupLink,
    selectedUserIds = [],
    onToggleUser,
    meId,
    list = [],
  } = props;

  const { theme, isDark } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C, isDark), [C, isDark]);
  const { t } = useTranslation();

  // ✅ Limits
  const MAX_USERS = 5;

  // Helpers
  const safeUri = (u?: string | null) => (u ? u : "");
  const single = safeUri(sourceUri);
  const singlePoster = safeUri(posterUri);

  // Combined matrix for single preview (Step3)
  const final =
    filterMatrix && adjustMatrix
      ? concatMatrix(filterMatrix, adjustMatrix)
      : filterMatrix ?? adjustMatrix;

  // Queries
  const { data: myGroupsData } = useQuery(MY_GROUP_LINKS, { fetchPolicy: "cache-and-network" });
  const myGroups = myGroupsData?.myJoinedGroupLinks ?? [];

  const [mode, setMode] = useState<"community" | "people">("community");
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedValue(query, 250);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [locationInputFocused, setLocationInputFocused] = useState(false);

  const [runUserSearch, userSearch] = useLazyQuery(SEARCH_USERS, {
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const Chip = useCallback(
  ({ label }: { label: string }) => {
    const active = selectedInterests.includes(label);
    return (
      <TouchableOpacity
        onPress={() => {
          console.log("TOGGLE_INTEREST", label);
          onToggleInterest?.(label);
        }}

        style={[
          s.interestChip,
          { backgroundColor: active ? withOpacity(C.primary, 0.14): "transparent", borderColor: C.border },
        ]}
        activeOpacity={0.8}
      >
        <Text style={[s.interestChipText, { color: active ? C.text : C.subtext }]}>
          {t(`interests.${label}`, { defaultValue: label })}
        </Text>
      </TouchableOpacity>
    );
  },
  [selectedInterests, onToggleInterest, s, C, t]
);


useEffect(() => {
  const q = debouncedQ.trim();
  if (!q) return;

  if (mode === "people") {
    runUserSearch({ variables: { q, limit: MAX_USERS } });
  }
}, [debouncedQ, mode, runUserSearch]);

  // ✅ Prefetch preview media (reduces initial loading delay)
  useEffect(() => {
    const uris = new Set<string>();
    if (single) uris.add(single);
    if (singlePoster) uris.add(singlePoster);
    for (const it of list ?? []) {
      if (it?.uri) uris.add(it.uri);
      if (it?.thumbUri) uris.add(it.thumbUri);
    }
    const arr = Array.from(uris).filter(Boolean);
    if (arr.length) {
      ExpoImage.prefetch(arr).catch(() => {});
    }
  }, [single, singlePoster, list]);

  const userResults = useMemo(() => {
    const raw = userSearch.data?.searchUsers ?? [];
    return meId ? raw.filter((u: any) => String(u.id) !== String(meId)) : raw;
  }, [userSearch.data, meId]);

  const disabled = !!creating;

  const toggleCommunity = useCallback(
    (id: string | null) => {
      Keyboard.dismiss();
      onSelectGroupLink?.(id);
    },
    [onSelectGroupLink]
  );

  const toggleUser = useCallback(
    (id: string) => {
      Keyboard.dismiss();
      onToggleUser?.(String(id));
    },
    [onToggleUser]
  );

  const showCommunityList = mode === "community";
  const selectedCommunity = useMemo(
    () => (myGroups as any[]).find((g) => String(g.id) === String(selectedGroupLinkId)) ?? null,
    [myGroups, selectedGroupLinkId]
  );
  const filteredGroups = useMemo(() => {
    const q = debouncedQ.trim().toLowerCase();
    const list = Array.isArray(myGroups) ? myGroups : [];
    if (!q) return list;
    return list.filter((g: any) => String(g?.title ?? "").toLowerCase().includes(q));
  }, [myGroups, debouncedQ]);
  const rawListData = showCommunityList ? filteredGroups : userResults;



  // Preview sizing (Step3 uses 0.7 width)
  const PREVIEW_SIZE = width * 0.7;

  // ✅ scale tx/ty from base container size to current preview size
  const scaleAlignToPreview = useCallback(
    (align?: AlignState, baseSize?: number | null): AlignState => {
      const a = align ?? { scale: 1, tx: 0, ty: 0 };
      const base = baseSize ?? PREVIEW_SIZE;
      const factor = base ? PREVIEW_SIZE / base : 1;
      return { scale: a.scale, tx: a.tx * factor, ty: a.ty * factor };
    },
    [PREVIEW_SIZE]
  );

  const renderCarouselCard = (it: CarouselItem, i: number) => {
    const mat =
      it.filterMatrix || it.adjustMatrix
        ? concatColorMatrices(it.adjustMatrix ?? IDENTITY, it.filterMatrix ?? IDENTITY)
        : undefined;

    const uri = safeUri(it.uri);
    if (!uri) return null;

    const scaledAlign = scaleAlignToPreview(it.align, it.alignBaseSize);

    return (
      <View key={i} style={s.previewCard}>
        <AlignableSquare
          enabled={false}
          size={PREVIEW_SIZE}
          mediaW={it.width}
          mediaH={it.height}
          showGrid={false}
          value={scaledAlign}
          fit="cover"
          onChange={() => {}}
        >
          {it.isVideo ? (
            <Video
              source={{ uri }}
              style={s.previewMedia}
              resizeMode={ResizeMode.COVER}
              pointerEvents="none"
              isLooping
              shouldPlay={false}
              usePoster={!!it.thumbUri}
              posterSource={it.thumbUri ? { uri: it.thumbUri } : undefined}
            />
            
            
          ) : mat ? (
            <ColorMatrix matrix={mat}>
              <ExpoImage
                source={{ uri }}
                style={s.previewMedia}
                contentFit="cover"
                cachePolicy="disk"
                transition={0}
              />
            </ColorMatrix>
          ) : (
            <ExpoImage
              source={{ uri }}
              style={s.previewMedia}
              contentFit="cover"
              cachePolicy="none"
              transition={0}
            />
          )}
        </AlignableSquare>
      </View>
    );
  };

  const singleAlignFromList = useMemo(() => {
    const first = list?.[0];
    if (!first) return { scale: 1, tx: 0, ty: 0 };
    return scaleAlignToPreview(first.align, first.alignBaseSize);
  }, [list, scaleAlignToPreview]);

  const singleMediaW = list?.[0]?.width;
  const singleMediaH = list?.[0]?.height;

  return (
    <View style={[s.flex, { backgroundColor: C.bg }]}>
      <ScrollView
        style={s.flex}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={{
          flexGrow: 1,
          padding: 12,
          paddingBottom: keyboardVisible || locationInputFocused ? 18 : 120,
        }}
      >
        {/* ===== PREVIEW CARD ===== */}
        <SectionCard
          s={s}
          title={t("publishform.preview")}
          subtitle={
            Array.isArray(list) && list.length > 1
              ? t("publishform.subtitle.carousel")
              : isVideo
              ? t("publishform.subtitle.video")
              : t("publishform.subtitle.photo")
          }
        >
          <View style={{ paddingBottom: 6 }}>
            {Array.isArray(list) && list.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 0, gap: 10 }}
              >
                {list.map((it, i) => renderCarouselCard(it, i))}
              </ScrollView>
            ) : (
              <View style={{ alignSelf: "center" }}>
                {isVideo ? (
                  <AlignableSquare
                  enabled={false}
                  size={PREVIEW_SIZE}
                  mediaW={singleMediaW}
                  mediaH={singleMediaH}
                  showGrid={false}
                  fit="cover"
                  value={singleAlignFromList}
                  onChange={() => {}}
                >
                  <Video
                    source={{ uri: single }}
                    style={s.previewMedia}
                    resizeMode={ResizeMode.COVER}
                    pointerEvents="none"
                    usePoster={!!singlePoster}
                    posterSource={singlePoster ? { uri: singlePoster } : undefined}
                    shouldPlay={false}
                    isLooping
                  />
                </AlignableSquare>

                ) : (
                  <ViewShot
                    ref={viewShotRef}
                    style={{ alignSelf: "center" }}
                    options={{ format: "jpg", quality: 0.95, result: "tmpfile" }}
                  >
                    <AlignableSquare
                      size={PREVIEW_SIZE}
                      mediaW={singleMediaW}
                      mediaH={singleMediaH}
                      showGrid={false}
                      fit="cover"
                      value={singleAlignFromList}
                      onChange={() => {}}
                    >
                      {single ? (
                        final ? (
                          <ColorMatrix matrix={final}>
                            <ExpoImage
                              source={{ uri: single }}
                              style={s.previewMedia}
                              contentFit="cover"
                              cachePolicy="none"
                              transition={0}
                            />
                          </ColorMatrix>
                        ) : (
                          <ExpoImage
                            source={{ uri: single }}
                            style={s.previewMedia}
                            contentFit="cover"
                            cachePolicy="none"
                            transition={0}
                          />
                        )
                      ) : (
                        <View style={[s.singlePreview, s.center]}>
                          <Text style={{ color: C.subtext }}>Lade…</Text>
                        </View>
                      )}
                    </AlignableSquare>
                  </ViewShot>
                )}
              </View>
            )}
          </View>
        </SectionCard>

        <LocationPickerSection
          s={s}
          C={C}
          title={t("publishform.location")}
          subtitle={t("common.optional")}
          placeholder={t("publishform.addLocation")}
          value={location}
          onChange={onLocation}
          onCoords={onLocationCoords}
          onFocusChange={setLocationInputFocused}
        />

        {/* ===== CAPTION CARD ===== */}
        <SectionCard
            s={s}
            title={t("publishform.caption")}
            subtitle={t("publishform.subtitle.captionHelp")}
          >

          <TextInput
            value={caption}
            onChangeText={onCaption}
            placeholder={t("publishform.addImageCaption")}
            placeholderTextColor={C.subtext}
            style={[s.input, { minHeight: 96 }]}
            multiline
            autoCorrect
          />
        </SectionCard>

        {/* ===== COMMUNITY + PEOPLE CARD ===== */}
        <SectionCard
          s={s}
          title={t("publishform.communityPeople")}
          subtitle={t("publishform.subtitle.communityPeopleHelp")}
        >

          {/* Tabs */}
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, mode === "community" && s.activeTab]}
              onPress={() => setMode("community")}
              hitSlop={12}
            >
              <Ionicons name="people-circle-outline" size={20} color={C.text} />
              <Text style={[s.tabTxt, mode === "community" && s.tabTxtActive]}>
                {t("publishform.community")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.tab, mode === "people" && s.activeTab]}
              onPress={() => setMode("people")}
              hitSlop={12}
            >
              <MaterialCommunityIcons name="tag-outline" size={20} color={C.text} />
              <Text style={[s.tabTxt, mode === "people" && s.tabTxtActive]}>
                {t("publishform.persons")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={C.subtext} style={{ marginRight: 8 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={
                mode === "community"
                  ? t("publishform.searchCommunities")
                  : t("publishform.searchPeople")
              }
              placeholderTextColor={C.subtext}
              style={s.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={C.subtext} />
              </TouchableOpacity>
            )}
          </View>

          {/* Chips */}
          {mode === "community" && selectedCommunity && (
            <View style={{ marginBottom: 10 }}>
              <Text style={s.label}>{t("publishform.selectedCommunity")}</Text>
              <View style={s.chips}>
                <TouchableOpacity
                  onPress={() => toggleCommunity(null)}
                  style={[s.chip, s.chipActive]}
                  hitSlop={10}
                >
                  <Text style={[s.chipTxt, { color: C.text }]} numberOfLines={1}>
                    {selectedCommunity.title}
                  </Text>
                  <Ionicons name="close" size={14} color={C.subtext} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            </View>
          )}


          {mode === "people" && selectedUserIds.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={s.label}>{t("publishform.toMarkANew")}</Text>
              <View style={s.chips}>
                {selectedUserIds.map((uid) => {
                  const u = (userResults as any[]).find((x) => String(x.id) === String(uid));
                  return (
                    <TouchableOpacity
                      key={uid}
                      onPress={() => toggleUser(uid)}
                      style={[s.chip, s.chipActive]}
                      hitSlop={10}
                    >
                      <Text style={[s.chipTxt, { color: C.text }]} numberOfLines={1}>
                        @{u?.username ?? "profil"}
                      </Text>
                      <Ionicons name="close" size={14} color={C.subtext} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Ergebnisliste */}
          <View style={{ marginTop: 4 }}>
            {(!rawListData || rawListData.length === 0) ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={{ color: C.subtext }}>
                  {debouncedQ.trim()
                    ? t("publishform.noHits")
                    : showCommunityList
                    ? t("publishform.chooseCommunityOrProfileOnly")
                    : t("publishform.searchPeopleToTag")}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={s.resultsList}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                onScrollBeginDrag={Keyboard.dismiss}
              >
                {rawListData.map((item: any) =>
                  showCommunityList ? (
                    <TouchableOpacity
                      key={String(item.id)}
                      onPress={() => toggleCommunity(String(item.id))}
                      style={[
                        s.rowCard,
                        String(selectedGroupLinkId ?? "") === String(item.id) && { borderColor: C.text, opacity: 0.95 },
                      ]}
                      activeOpacity={0.85}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTxt} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={{ color: C.subtext, fontSize: 12, marginTop: 2 }}>
                          {item.type === "EVENT" ? t("publishform.eventFeed") : t("publishform.communityFeed")}
                        </Text>
                      </View>
                      {String(selectedGroupLinkId ?? "") === String(item.id) ? (
                        <Ionicons name="checkmark-circle" size={20} color={C.text} />
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color={C.subtext} />
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      key={String(item.id)}
                      onPress={() => toggleUser(String(item.id))}
                      style={[
                        s.rowCard,
                        selectedUserIds.includes(String(item.id)) && { borderColor: C.text, opacity: 0.95 },
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text style={s.rowTxt} numberOfLines={1}>
                        @{item.username}
                      </Text>
                      {selectedUserIds.includes(String(item.id)) ? (
                        <Ionicons name="checkmark-circle" size={20} color={C.text} />
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color={C.subtext} />
                      )}
                    </TouchableOpacity>
                  )
                )}
              </ScrollView>
            )}

            {showCommunityList && (
              <TouchableOpacity
                onPress={() => toggleCommunity(null)}
                activeOpacity={0.85}
                style={[
                  s.rowCard,
                  { marginTop: 8 },
                  !selectedGroupLinkId && { borderColor: C.text, opacity: 0.95 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTxt} numberOfLines={1}>{t("publishform.profileOnly")}</Text>
                  <Text style={{ color: C.subtext, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                    {t("publishform.profileOnlyHelp")}
                  </Text>
                </View>
                {!selectedGroupLinkId ? (
                  <Ionicons name="checkmark-circle" size={20} color={C.text} />
                ) : (
                  <Ionicons name="ellipse-outline" size={20} color={C.subtext} />
                )}
              </TouchableOpacity>
            )}

            {showCommunityList && (
              <View style={s.summaryBox}>
                <Text style={s.summaryTitle}>{t("publishform.communitySummaryTitle")}</Text>
                <Text style={s.summaryText}>
                  {selectedCommunity
                    ? t("publishform.communitySummarySelected", { title: selectedCommunity.title })
                    : t("publishform.communitySummaryProfileOnly")}
                </Text>
                {selectedCommunity ? (
                  <Text style={s.summaryText}>
                    {t(selectedCommunity.visibility === "PUBLIC" ? "communityprivacy.publicPost" : "communityprivacy.privatePost")}
                  </Text>
                ) : null}
              </View>
            )}

          </View>
        </SectionCard>

        {!!interestSuggestions.length && (
          <SectionCard
            s={s}
            title={t("publishform.interests")}
            subtitle={t("publishform.subtitle.interestsHelp")}
          >

            <View style={s.interestChipsWrap}>
              {interestSuggestions.map((x) => (
                <Chip key={x} label={x} />
              ))}
            </View>
          </SectionCard>
        )}

      </ScrollView>

      {/* ===== FOOTER SHARE ===== */}
      <View style={s.footer}>
        <TouchableOpacity
          testID="publish-share"
          activeOpacity={disabled ? 1 : 0.85}
          style={[s.shareBtn, disabled && { opacity: 0.6 }]}
          disabled={disabled}
          onPress={disabled ? undefined : onShare}
        >
          {creating ? <ActivityIndicator /> : <Text style={s.shareText}>{t("publishform.share")}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    interestChipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      // gap kann auf manchen RN-Versionen zicken – wenn’s bei dir ok ist, lassen
      gap: 8,
      marginTop: 8,
    },
    placeSuggestBox: {
      marginTop: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      borderRadius: 14,
      backgroundColor: C.card,
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
      borderBottomColor: C.border,
    },
    placeTitle: { color: C.text, fontWeight: "900", fontSize: 14 },
    placeSub: { color: C.subtext, fontWeight: "700", fontSize: 12, marginTop: 2 },
    interestChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    interestChipText: {
      fontSize: 13,
      fontWeight: "600",
    },

    flex: { flex: 1 },
    center: { alignItems: "center", justifyContent: "center" },

    // Cards / Bereiche
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

    previewCard: {
      width: width * 0.7,
      height: width * 0.7,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    previewMedia: { width: "100%", height: "100%" },
    singlePreview: { width: width * 0.7, height: width * 0.7 },

    label: { color: C.subtext, marginTop: 8, marginBottom: 6, fontSize: 12 },

    input: {
      color: C.text,
      backgroundColor: "rgba(255,255,255,0.03)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      borderRadius: 12,
      padding: 12,
    },

    // Tabs (wie PostEdit)
    tabs: {
      flexDirection: "row",
      backgroundColor: C.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      marginTop: 2,
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
      borderBottomColor: C.text,
      opacity: 1,
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    tabTxt: { color: C.subtext, fontWeight: "800", fontSize: 12 },
    tabTxtActive: { color: C.text },

    // Search
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.03)",
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      marginBottom: 8,
    },
    searchInput: { flex: 1, color: C.text },

    // Rows
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
    rowTxt: { color: C.text, fontWeight: "700", flex: 1, paddingRight: 10 },
    resultsList: {
      maxHeight: 256,
      marginBottom: 4,
    },
    summaryBox: {
      marginTop: 4,
      padding: 12,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    summaryTitle: { color: C.text, fontWeight: "800", marginBottom: 4 },
    summaryText: { color: C.subtext, fontSize: 12, lineHeight: 17 },

    // Chips
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      backgroundColor: "rgba(255,255,255,0.03)",
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: "row",
      alignItems: "center",
      maxWidth: "100%",
    },
    chipActive: { backgroundColor: "rgba(255,255,255,0.06)" },
    chipTxt: { color: C.subtext, fontWeight: "800", fontSize: 12, maxWidth: 220 },

    // Footer fixed
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      borderTopColor: C.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: C.bg,
    },
    shareBtn: {
      backgroundColor: C.text,
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: 14,
    },
    shareText: {
      color: C.bg,
      fontWeight: "900",
      fontSize: 16,
    },
  });
