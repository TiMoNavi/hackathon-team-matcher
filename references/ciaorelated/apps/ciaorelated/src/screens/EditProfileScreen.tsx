// apps/ciaorelated/src/screens/EditProfileScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { ScrollView } from "react-native";


import Screen from "./components/Screen";

import { useTheme } from "../theme/ThemeProvider";

import { CHECK_USERNAME, ME_QUERY } from "../graphql/queries/profile";
import { UPDATE_ME, GET_SIGNED_AVATAR_UPLOAD } from "../graphql/mutations/profile";
import { AuthVault } from "../lib/auth-vault";
import { avatarPlaceholder } from "../../assets/placeholders";

import { useTranslation } from "react-i18next";

const BIO_MAX_CHARS = 120;
const BIO_MAX_LINES = 5;

function clampBio(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, BIO_MAX_LINES)
    .join("\n")
    .slice(0, BIO_MAX_CHARS);
}

function isLocalUri(u?: string) {
  return !!u && /^(file|ph|content|assets):\/\//i.test(u);
}

function mimeFromUri(uri: string) {
  const u = uri.toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
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

const UPDATE_ONBOARDING_MUT = gql`
  mutation UpdateOnboarding($input: OnboardingInput!) {
    updateOnboarding(input: $input) {
      id
      city
      educationLevel
      educationOrg
      educationField
      educationGradYear
      interests
    }
  }
`;


function useDebouncedValue<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}


type SearchResult = {
  id?: string;
  title: string;          // z.B. "Abtenau"
  subtitle?: string | null; // z.B. "Salzburg, Österreich"
  lat: number;
  lng: number;
};
export default function EditProfileScreen() {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const C = theme.colors;

  const { data, loading } = useQuery(ME_QUERY, { fetchPolicy: "cache-first" });

  const [runCheck, { data: checkData, loading: checking }] = useLazyQuery(CHECK_USERNAME, {
    fetchPolicy: "network-only",
  });

 

  const [updateOnboarding] = useMutation(UPDATE_ONBOARDING_MUT, {
    refetchQueries: [{ query: ME_QUERY }],
    awaitRefetchQueries: true,
  });



  const [updateMe,{ loading: saving }] = useMutation(UPDATE_ME, {
  update(cache, { data }) {
    const u = data?.updateMe;
    if (!u?.id) return;

    cache.modify({
      fields: {
        me(existingRef, { readField }) {
          // falls me schon im Cache ist und dieselbe Person ist → Werte ersetzen
          if (existingRef && readField("id", existingRef) === u.id) {
            return { ...existingRef, ...u };
          }
          return existingRef;
        },
      },
    });

    // zusätzlich: die User/Profile-Entity direkt schreiben
    cache.writeFragment({
      id: cache.identify({ __typename: "User", id: u.id }),
      fragment: gql`
        fragment _AvatarPatch on User {
          id
          avatarUrl
          avatarThumbUrl
          username
          name
        }
      `,
      data: u,
    });
  },
});


  const [getSignedAvatar] = useMutation(GET_SIGNED_AVATAR_UPLOAD);

  // form state
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [avatarThumbUrl, setAvatarThumbUrl] = useState<string | undefined>(undefined);
  const pickedLocalAvatarRef = useRef(false);
  const loadedProfileIdRef = useRef<string | null>(null);

  const originalUsername = data?.me?.username ?? "";

  const [cityInput, setCityInput] = useState("");
  const [selectedCity, setSelectedCity] = useState<SearchResult | null>(null);
  const [cityResults, setCityResults] = useState<SearchResult[]>([]);
  const [educationLevel, setEducationLevel] = useState("");
  const [educationOrg, setEducationOrg] = useState("");
  const [educationField, setEducationField] = useState("");
  const [educationGradYear, setEducationGradYear] = useState("");
  const [interests, setInterests] = useState<InterestKey[]>([]);




  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const debouncedCity = useDebouncedValue(cityInput, 300);

const [runPlaceSearch, placeSearch] = useLazyQuery(SEARCH_PLACES, {
  fetchPolicy: "network-only",
});

const chooseCity = useCallback((r: SearchResult) => {
  setSelectedCity(r);
  setCityInput(r.title);
  setCityResults([]);
}, []);


  const CHANGE_PASSWORD = gql`
    mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
      changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
    }
  `;

  const [changePassword, { loading: changingPw }] = useMutation(CHANGE_PASSWORD);

  const toggleInterest = useCallback((key: InterestKey) => {
    setInterests((prev) => {
      if (prev.includes(key)) return prev.filter((x) => x !== key);
      return [...prev, key].slice(0, 12);
    });
  }, []);

useEffect(() => {
  // ✅ WENN ausgewählt → nichts mehr tun
  if (selectedCity) return;

  const q = debouncedCity.trim();

  if (!q || q.length < 2) {
    setCityResults([]);
    return;
  }

  runPlaceSearch({ variables: { q, limit: 8 } })
    .then((res) => {
      const arr: SearchResult[] = (res?.data?.searchPlaces ?? []).map((p: any) => ({
        id: p.id,
        title: p.title,
        subtitle: p.subtitle,
        lat: p.lat,
        lng: p.lng,
      }));
      setCityResults(arr);
    })
    .catch(() => {
      setCityResults([]);
    });
}, [debouncedCity, runPlaceSearch, selectedCity]);


  // init form once per user change
  useEffect(() => {
    const me = data?.me;
    if (!me) return;
    if (loadedProfileIdRef.current === me.id) return;
    loadedProfileIdRef.current = me.id;
    pickedLocalAvatarRef.current = false;

    setName(me.name ?? "");
    setUsername(me.username ?? "");
    setBio(clampBio(me.bio ?? ""));
    setAvatarUrl(me.avatarUrl ?? undefined);
    setAvatarThumbUrl(me.avatarThumbUrl ?? undefined);

    setCityInput(me.city ?? "");
    setSelectedCity(null);

    setEducationLevel(me.educationLevel ?? "");
    setEducationOrg(me.educationOrg ?? "");
    setEducationField(me.educationField ?? "");
    setEducationGradYear(me.educationGradYear ? String(me.educationGradYear) : "");
    setInterests(
      Array.isArray(me.interests)
        ? (me.interests.filter((x: any) => INTEREST_KEYS.includes(x)) as InterestKey[])
        : []
    );
  }, [data?.me?.id]);

  useEffect(() => {
    const me = data?.me;
    if (!me || pickedLocalAvatarRef.current) return;
    setAvatarUrl(me.avatarUrl ?? undefined);
    setAvatarThumbUrl(me.avatarThumbUrl ?? undefined);
  }, [data?.me?.id, data?.me?.avatarUrl, data?.me?.avatarThumbUrl]);


  const normalizedUsername = useMemo(() => username.trim(), [username]);

  // username check debounce (only if changed & meaningful)
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debTimer.current) {
      clearTimeout(debTimer.current);
      debTimer.current = null;
    }

    // only check if: different from original + at least 3 chars (optional)
    if (!normalizedUsername) return;
    if (normalizedUsername === originalUsername) return;
    if (normalizedUsername.length < 3) return;

    debTimer.current = setTimeout(() => {
      runCheck({ variables: { username: normalizedUsername } });
    }, 350);

    return () => {
      if (debTimer.current) {
        clearTimeout(debTimer.current);
        debTimer.current = null;
      }
    };
  }, [normalizedUsername, originalUsername, runCheck]);

  const usernameChanged = normalizedUsername !== originalUsername;
  const showStatus = normalizedUsername && usernameChanged;

  const usernameOk = useMemo(() => {
    if (!normalizedUsername) return false;
    if (!usernameChanged) return true;
    return checkData?.checkUsernameAvailable === true;
  }, [normalizedUsername, usernameChanged, checkData?.checkUsernameAvailable]);


  const canSave = useMemo(() => {
    // du kannst hier noch "name required" etc. ergänzen
    if (!normalizedUsername) return false;
    if (!usernameOk) return false;
    if (saving) return false;
    return true;
  }, [normalizedUsername, usernameOk, saving]);

  const onPickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("editprofile.permissionNeeded"), t("editprofile.allowPhotosAccess"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!res.canceled && res.assets?.length) {
      pickedLocalAvatarRef.current = true;
      setAvatarUrl(res.assets[0].uri);
      setAvatarThumbUrl(undefined);
    }
  }, []);

  const onSave = useCallback(async () => {
    if (!usernameOk) {
      Alert.alert(t("editprofile.usernameTitle"), t("editprofile.usernameTaken"));
      return;
    }
    if (!normalizedUsername) {
      Alert.alert(t("editprofile.usernameTitle"), t("editprofile.usernamePleaseEnter"));
      return;
    }

    try {
      let avatarField: string | undefined;

      // local image -> upload -> save key
      if (isLocalUri(avatarUrl)) {
        const info = await FileSystem.getInfoAsync(avatarUrl!);
        if (!info.exists) throw new Error(t("editprofile.fileNotFound"));

        const mime = mimeFromUri(avatarUrl!);
        const signed = await getSignedAvatar({ variables: { mime, size: info.size ?? 0 } });

        const { key, putUrl } = signed.data.getSignedAvatarUpload;

        const upRes = await FileSystem.uploadAsync(putUrl, avatarUrl!, {
          httpMethod: "PUT",
          headers: { "Content-Type": mime },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });

        if (upRes.status !== 200 && upRes.status !== 204) {
          throw new Error(t("editprofile.uploadFailedStatus", { status: upRes.status }));
        }

        avatarField = key;
      }

      const input: { name: string; username: string; bio: string; avatarUrl?: string } = {
        name,
        username: normalizedUsername,
        bio,
      };
      if (avatarField) input.avatarUrl = avatarField;

      const res = await updateMe({
        variables: { input },
      });

      const gradYearInt = educationGradYear.trim()
        ? Number(educationGradYear.trim())
        : null;

      if (gradYearInt !== null) {
        if (!Number.isFinite(gradYearInt) || gradYearInt < 1950 || gradYearInt > 2100) {
          Alert.alert(t("common.error"), t("editprofile.graduationYearInvalid"));
          return;
        }
      }

      await updateOnboarding({
        variables: {
          input: {
            city:
              selectedCity?.title ??
              (cityInput.trim() ? cityInput.trim() : null),
            lat: selectedCity?.lat,
            lng: selectedCity?.lng,
            educationLevel: educationLevel.trim() || null,
            educationOrg: educationOrg.trim() || null,
            educationField: educationField.trim() || null,
            educationGradYear: gradYearInt,
            interests,
          },
        },
      });



      const updated = res?.data?.updateMe;
      const nextAvatarUrl = updated?.avatarUrl ?? null;
      const nextAvatarThumb = updated?.avatarThumbUrl ?? null;
      pickedLocalAvatarRef.current = false;
      setAvatarUrl(nextAvatarUrl ?? undefined);
      setAvatarThumbUrl(nextAvatarThumb ?? undefined);

      const active = await AuthVault.active();
      if (active) {
        await AuthVault.update(active.sessionId, {
          username: updated?.username ?? normalizedUsername,
          avatarUrl: nextAvatarUrl,
          avatarThumbUrl: nextAvatarThumb,
          profileId: updated?.id ?? active.profileId,
        });
      }

      nav.goBack();
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("editprofile.saveFailed"));
    }
  }, [usernameOk,
  normalizedUsername,
  avatarUrl,
  name,
  bio,
  updateMe,
  getSignedAvatar,
  nav,
  educationGradYear,
  educationLevel,
  educationOrg,
  educationField,
  interests,
  selectedCity,
  cityInput,
  updateOnboarding,
  ]);

  if (loading) {
    return (
      <Screen backgroundColor={C.bg}>
        <ActivityIndicator style={{ marginTop: 24 }} />
      </Screen>
    );
  }

  const keyboardAppearance = "dark"; // ✅ ohne theme.dark TS error (wenn du hell/dunkel willst: mach’s über C.bg)
  const displayAvatarSource =
  isLocalUri(avatarUrl)
    ? { uri: avatarUrl! }
    : (avatarThumbUrl
        ? { uri: avatarThumbUrl }
        : (avatarUrl ? { uri: avatarUrl } : avatarPlaceholder));

  return (
    <Screen backgroundColor={C.bg}>
      <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    keyboardVerticalOffset={52} // Höhe deines Headers
  >
      <View style={[s(C).header, { backgroundColor: C.bg }]}>
        {/* LEFT */}
        <TouchableOpacity
          onPress={() => nav.goBack()}
          hitSlop={12}
          style={s(C).leftBtn}
        >
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>

        {/* CENTER (ABSOLUTE) */}
        <View pointerEvents="none" style={s(C).titleWrap}>
          <Text style={s(C).title} numberOfLines={1}>
            {t("editprofile.editProfile")}</Text>
        </View>

        {/* RIGHT */}
        <TouchableOpacity
          onPress={onSave}
          disabled={!canSave}
          hitSlop={12}
          style={s(C).rightBtn}
        >
          <Text
            style={[s(C).save, (saving || !usernameOk) && { opacity: 0.5 }]}
            numberOfLines={1}
          >
            {saving ? "…" : t("common.save")}
          </Text>
        </TouchableOpacity>
      </View>



 <ScrollView
  keyboardShouldPersistTaps="handled"
  contentContainerStyle={{ paddingBottom: 40 }}
>
      {/* Avatar */}
      <View style={s(C).avatarRow}>
        <TouchableOpacity onPress={onPickImage} activeOpacity={0.85}>
          <ExpoImage
            source={displayAvatarSource}
            placeholder={avatarPlaceholder}
            style={s(C).avatar}
            contentFit="cover"
            transition={120}
            cachePolicy="disk"
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={onPickImage} activeOpacity={0.85}>
          <Text style={s(C).link}>{t("editprofile.editImageOrAvatar")}</Text>
        </TouchableOpacity>
      </View>

      <Field label={t("editprofile.name")} C={C}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("editprofile.yourName")}
          placeholderTextColor={C.subtext ?? "#7c7c7c"}
          style={s(C).input}
          keyboardAppearance={keyboardAppearance}
        />
      </Field>

      <Field label={t("editprofile.userName")} C={C}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t("editprofile.username")}
            placeholderTextColor={C.subtext ?? "#7c7c7c"}
            style={[
              s(C).input,
              { flex: 1, borderColor: !usernameChanged
                ? C.border
                : usernameOk
                  ? (C.primary ?? "#2dd4bf")
                  : "#ef4444" },
            ]}
            keyboardAppearance={keyboardAppearance}
          />

          {checking && showStatus ? (
              <ActivityIndicator style={{ marginLeft: 8 }} />
            ) : showStatus ? (
              <Text
                style={{
                  marginLeft: 8,
                  color: usernameOk ? "#34d399" : "#ef4444",
                  fontWeight: "600",
                }}
              >
                {usernameOk ? t("editprofile.usernameAvailable") : t("editprofile.usernameUnavailable")}

              </Text>
            ) : null}
        </View>
      </Field>

      <Field label={t("editprofile.bio")} C={C}>
        <TextInput
          value={bio}
          onChangeText={(value) => setBio(clampBio(value))}
          placeholder={t("editprofile.aboutYou")}
          placeholderTextColor={C.subtext ?? "#7c7c7c"}
          style={[s(C).input, { height: 132, textAlignVertical: "top" }]}
          multiline
          numberOfLines={BIO_MAX_LINES}
          maxLength={BIO_MAX_CHARS}
          keyboardAppearance={keyboardAppearance}
        />
        <Text style={{ color: C.subtext, fontSize: 12, marginTop: 6, textAlign: "right" }}>
          {bio.length}/{BIO_MAX_CHARS}
        </Text>
      </Field>


      {/* --- ONBOARDING-FELDER --- */}
      <View style={{ paddingHorizontal: 16, marginTop: 10, marginBottom: 6 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: "900" }}>
          {t("editprofile.contextEducation")}</Text>
        <Text style={{ color: C.subtext, marginTop: 4 }}>
          {t("editprofile.youCanChangeTheseFieldsAtAnyTime")}</Text>
      </View>

      {/* Stadt */}
      <Field label={t("editprofile.city")} C={C}>
        <TextInput
          value={cityInput}
          onChangeText={(t) => {
            setCityInput(t);
            if (selectedCity && t.trim() !== selectedCity.title) setSelectedCity(null);
          }}


          placeholder={t("editprofile.eGVienna")}
          placeholderTextColor={C.subtext ?? "#7c7c7c"}
          style={s(C).input}
          autoCapitalize="words"
          autoCorrect={false}
          keyboardAppearance={keyboardAppearance}
        />

        {/* Suggestions nur anzeigen, wenn nichts selected ist */}
        {!!cityResults.length && !selectedCity && (
          <View style={s(C).suggestBox}>
            {cityResults.map((r, idx) => (
              <TouchableOpacity
                key={r.id ?? `${r.title}-${idx}`}
                onPress={() => chooseCity(r)}
                activeOpacity={0.85}
                style={s(C).suggestRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s(C).suggestTitle} numberOfLines={1}>{r.title}</Text>
                  {!!r.subtitle && (
                    <Text style={s(C).suggestSub} numberOfLines={1}>{r.subtitle}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected badge */}
        {!!selectedCity && (
          <View style={[s(C).pill, { marginTop: 8 }]}>
            <Text style={s(C).pillText}>
              ✓ {selectedCity.title}
            </Text>
          </View>
        )}
      </Field>


      {/* Ausbildung */}
      <Field label={t("editprofile.trainingLevel")} C={C}>
        <TextInput
          value={educationLevel}
          onChangeText={setEducationLevel}
          placeholder={t("editprofile.eGStudiesTechnicalCollegeVocationalTb8cfdf")}
          placeholderTextColor={C.subtext ?? "#7c7c7c"}
          style={s(C).input}
          keyboardAppearance={keyboardAppearance}
        />
      </Field>

      <Field label={t("editprofile.organization")} C={C}>
        <TextInput
          value={educationOrg}
          onChangeText={setEducationOrg}
          placeholder={t("editprofile.eGTuVienna")}
          placeholderTextColor={C.subtext ?? "#7c7c7c"}
          style={s(C).input}
          keyboardAppearance={keyboardAppearance}
        />
      </Field>

      <Field label={t("editprofile.specialization")} C={C}>
        <TextInput
          value={educationField}
          onChangeText={setEducationField}
          placeholder={t("editprofile.eGComputerScience")}
          placeholderTextColor={C.subtext ?? "#7c7c7c"}
          style={s(C).input}
          keyboardAppearance={keyboardAppearance}
        />
      </Field>

      <Field label={t("editprofile.graduationYear")} C={C}>
        <TextInput
          value={educationGradYear}
          onChangeText={setEducationGradYear}
          placeholder={t("editprofile.eG2027")}
          placeholderTextColor={C.subtext ?? "#7c7c7c"}
          style={s(C).input}
          keyboardType="number-pad"
          keyboardAppearance={keyboardAppearance}
        />
      </Field>

      {/* Interessen */}
      <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: "900" }}>
          {t("editprofile.interests")}</Text>
        <Text style={{ color: C.subtext, marginTop: 4 }}>
          {t("editprofile.chooseUpTo12")}</Text>
      </View>

      <View style={s(C).chipsWrap}>
        {INTEREST_KEYS.map((k) => {
          const active = interests.includes(k);
          return (
            <TouchableOpacity
              key={k}
              onPress={() => toggleInterest(k)}
              activeOpacity={0.85}
              style={[
                s(C).chip,
                active && { borderColor: C.primary, backgroundColor: C.card },
              ]}
            >
              <Text style={[s(C).chipText, active && { color: C.primary, fontWeight: "800" }]}>
                {t(`interests.${k}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* --- PASSWORT ÄNDERN --- */}
      <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: "900" }}>
          {t("editprofile.security")}</Text>
      </View>

      <Field label={t("editprofile.changePassword")} C={C}>
        <View style={{ gap: 10 }}>
          <TextInput
            value={currentPw}
            onChangeText={setCurrentPw}
            placeholder={t("editprofile.currentPassword")}
            placeholderTextColor={C.subtext ?? "#7c7c7c"}
            style={s(C).input}
            secureTextEntry={!showPw}
            keyboardAppearance={keyboardAppearance}
          />

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              value={newPw}
              onChangeText={setNewPw}
              placeholder={t("editprofile.newPassword")}
              placeholderTextColor={C.subtext ?? "#7c7c7c"}
              style={[s(C).input, { flex: 1 }]}
              secureTextEntry={!showPw}
              keyboardAppearance={keyboardAppearance}
            />
            <TouchableOpacity
              onPress={() => setShowPw((v) => !v)}
              style={{ marginLeft: 10, padding: 6 }}
              hitSlop={8}
            >
              <Ionicons name={showPw ? "eye-off" : "eye"} size={22} color={C.subtext} />
            </TouchableOpacity>
          </View>

          <TextInput
            value={newPw2}
            onChangeText={setNewPw2}
            placeholder={t("editprofile.repeatNewPassword")}
            placeholderTextColor={C.subtext ?? "#7c7c7c"}
            style={s(C).input}
            secureTextEntry={!showPw}
            keyboardAppearance={keyboardAppearance}
          />

          <TouchableOpacity
            onPress={async () => {
              if (!currentPw || !newPw || !newPw2) {
                Alert.alert(t("common.error"), t("editprofile.passwordFillAll"));
                return;
              }
              if (newPw.length < 6) {
                Alert.alert(t("common.error"), t("editprofile.passwordTooShort"));
                return;
              }
              if (newPw !== newPw2) {
                Alert.alert(t("common.error"), t("editprofile.passwordsDontMatch"));
                return;
              }

              try {
                await changePassword({
                  variables: { currentPassword: currentPw, newPassword: newPw },
                });
                setCurrentPw("");
                setNewPw("");
                setNewPw2("");
                Alert.alert(t("editprofile.successTitle"), t("editprofile.passwordChanged"));
              } catch (e: any) {
                Alert.alert(t("common.error"), e?.message ?? t("editprofile.changePasswordFailed"));
              }
            }}
            activeOpacity={0.85}
            style={[s(C).btn, changingPw && { opacity: 0.6 }]}
            disabled={changingPw}
          >
            {changingPw ? (
              <ActivityIndicator />
            ) : (
              <Text style={s(C).btnText}>{t("editprofile.changePassword")}</Text>
            )}
          </TouchableOpacity>

          <Text style={{ color: C.subtext, fontSize: 12, marginTop: 6 }}>
            {t("editprofile.noteChangesOnlyAffectThisProfile")}</Text>
        </View>
      </Field>
    </ScrollView>

    </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  children,
  C,
}: {
  label: string;
  children: React.ReactNode;
  C: any;
}) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      <Text style={{ color: C.subtext ?? "#a1a1aa", marginBottom: 6, fontSize: 13 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const s = (C: any) =>
  StyleSheet.create({
    suggestBox: {
      marginTop: 8,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
      overflow: "hidden",
    },
    suggestRow: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    suggestTitle: { color: C.text, fontWeight: "900" },
    suggestSub: { color: C.subtext, marginTop: 2, fontWeight: "700", fontSize: 12 },

    pill: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.primary,
      backgroundColor: C.card,
    },
    pillText: { color: C.primary, fontWeight: "900" },

    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 16,
      marginTop: 10,
      marginBottom: 8,
    },
    chip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.bg,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
    },
    chipText: { color: C.text },

    btn: {
      marginTop: 8,
      backgroundColor: C.primary,
      borderRadius: 10,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.primaryBorder ?? C.border,
    },
    btnText: { color: C.bg, fontWeight: "900" },

    header: {
      height: 52,
      paddingHorizontal: 12,
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    leftBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },

    rightBtn: {
      minWidth: 110,          // genug Platz für "Speichern"
      height: 40,
      paddingHorizontal: 12,
      alignItems: "flex-end",
      justifyContent: "center",
      zIndex: 2,
    },

    // 🔑 ABSOLUT zentrierter Titel
    titleWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
      justifyContent: "center",
      height: 52,
      zIndex: 1,
    },

    title: {
      color: C.text,
      fontSize: 16,
      fontWeight: "700",
    },

    save: {
      color: C.primary,
      fontSize: 16,           // gleiche Größe wie Titel
      fontWeight: "700",
    },

    // Mitte: echter Center-Bereich
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },

    
    headerBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
   
    avatarRow: { alignItems: "center", paddingVertical: 18, gap: 8 },
    avatar: { width: 92, height: 92, borderRadius: 46 },
    link: { color: C.primary, fontSize: 14, fontWeight: "600" },

    fieldLabel: { color: C.subtext, marginBottom: 6, fontSize: 13 },
    input: {
      backgroundColor: C.card,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
    },
 

    headerSide: {
      width: 88,               // ✅ fixes wrapping
      alignItems: "center",
      justifyContent: "center",
    },

    headerCenter: {
      flex: 1,
      alignItems: "center",
    },

    back: {
      color: C.text,
      fontSize: 22,
    },

    
  });
