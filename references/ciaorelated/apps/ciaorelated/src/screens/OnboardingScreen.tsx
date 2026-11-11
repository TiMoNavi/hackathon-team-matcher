import  React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useMutation , useLazyQuery} from "@apollo/client";
import { useNavigation, CommonActions } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import * as Location from "expo-location";

import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";

import type { RootStackParamList } from "../../App";
import { apollo } from "../apollo";
import { gql } from "@apollo/client";

import { useTranslation } from "react-i18next";

const COMPLETE_ONBOARDING_MUT = gql`
  mutation CompleteOnboarding($input: OnboardingInput!) {
    completeOnboarding(input: $input) {
      id
      onboardingCompletedAt
    }
  }
`;


const INTEREST_SUGGESTIONS = [
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
type InterestKey = typeof INTEREST_SUGGESTIONS[number];


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
type SearchResult = {
  id?: string;
  title: string;          // z.B. "Abtenau"
  subtitle?: string | null; // z.B. "Salzburg, Österreich"
  lat: number;
  lng: number;
};

function useDebouncedValue<T>(value: T, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}


export default function OnboardingScreen() {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors;
  const s = useMemo(() => styles(C), [C]);

  const rootNav = useNavigation<NavigationProp<RootStackParamList>>();

  const [cityInput, setCityInput] = useState("");
  const [selectedCity, setSelectedCity] = useState<SearchResult | null>(null);

  const [cityResults, setCityResults] = useState<SearchResult[]>([]);
  const debouncedCity = useDebouncedValue(cityInput, 300);
  const [fallbackGeocodeUsed, setFallbackGeocodeUsed] = useState(false);

  const [runPlaceSearch, placeSearch] = useLazyQuery(SEARCH_PLACES, {
    fetchPolicy: "network-only",
  });

  const [educationLevel, setEducationLevel] = useState("");
  const [educationOrg, setEducationOrg] = useState("");
  const [educationField, setEducationField] = useState("");
  const [educationGradYear, setEducationGradYear] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const chooseCity = useCallback((r: SearchResult) => {
    setSelectedCity(r);
    setCityInput(r.title);     // Identität bleibt "Abtenau" (nicht "Abtenau — Salzburg")
    setCityResults([]);
  }, []);


  const [complete, { loading }] = useMutation(COMPLETE_ONBOARDING_MUT, {
    errorPolicy: "all",
    onError: () => {},
  });

 
  const toggleInterest = (label: string) => {
    setInterests((prev) => {
      if (prev.includes(label)) return prev.filter((x) => x !== label);
      return [...prev, label].slice(0, 12);
    });
  };

  const onSubmit = async () => {
    try {
      if (!selectedCity) {
        Alert.alert(t("common.error"), t("onboarding.errors.pickCityFromSuggestions"));
        return;
      }

      const c = selectedCity.title.trim();

      const gradYearInt = educationGradYear.trim()
        ? Number(educationGradYear.trim())
        : null;

      if (gradYearInt !== null) {
        const y = gradYearInt;
        if (!Number.isFinite(y) || y < 1950 || y > 2100) {
            Alert.alert(t("common.error"), t("onboarding.errors.invalidGraduationYear"));
          return;
        }
      }

      const input: any = {
        city: c,
        lat: selectedCity.lat,
        lng: selectedCity.lng,
        educationLevel: educationLevel.trim() || null,
        educationOrg: educationOrg.trim() || null,
        educationField: educationField.trim() || null,
        educationGradYear: gradYearInt,
        interests,
      };

      const { data, errors } = await complete({ variables: { input } });

      if (errors?.length) {
        throw new Error(errors[0]?.message ?? t("onboarding.errors.failed"));
      }

      if (!data?.completeOnboarding?.id) {
        throw new Error(t("common.invalidServerResponse"));
      }

      // Cache refresh
      await apollo.resetStore();

      // ✅ Zurück in Gate (entscheidet dann AppTabs)
      rootNav.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Gate" as never }],
        })
      );
    } catch (e: any) {
      const msg =
        e?.networkError?.result?.errors?.[0]?.message ||
        e?.message ||
        t("onboarding.errors.failed");
      Alert.alert(t("common.error"), String(msg));
    }
  };


  const canSubmit = !!selectedCity && !loading;

  useEffect(() => {
  const q = debouncedCity.trim();

  // wenn user tippt nach selection -> selection invalidieren
  if (selectedCity && q !== selectedCity.title) {
    setSelectedCity(null);
  }

  if (!q) {
    setCityResults([]);
    setFallbackGeocodeUsed(false);
    return;
  }
  if (q.length < 2) {
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
      setFallbackGeocodeUsed(false);
    })
    .catch(async () => {
      // fallback: expo-location geocode (wie VlogWizard)
      try {
        setFallbackGeocodeUsed(true);
        const list = await Location.geocodeAsync(q);
        const out: SearchResult[] = (list || []).slice(0, 8).map((it: any) => ({
          title: q,
          subtitle: `${it.latitude.toFixed(4)}, ${it.longitude.toFixed(4)}`,
          lat: it.latitude,
          lng: it.longitude,
        }));
        setCityResults(out);
      } catch {
        setCityResults([]);
      }
    });
}, [debouncedCity, runPlaceSearch]);


  return (
    <Screen
      backgroundColor={C.bg}
      barStyle="light-content"
      headerTitle={t("onboarding.yourStart")}
      showBack={false}
    >
      <ScrollView contentContainerStyle={s.box} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{t("onboarding.welcome")}</Text>
        <Text style={s.subtitle}>
          {t("onboarding.cityHint")}</Text>

        <Text style={s.label}>{t("onboarding.cityLabelRequired")}</Text>
        <TextInput
          placeholder={t("onboarding.eGVienna")}
          placeholderTextColor={C.subtext}
          style={s.input}
          value={cityInput}
          onChangeText={setCityInput}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {/* Suggestions */}
        {!!cityResults.length && !selectedCity && (
          <View style={s.suggestBox}>
            {cityResults.map((r, idx) => (
              <TouchableOpacity
                key={r.id ?? `${r.title}-${idx}`}
                onPress={() => chooseCity(r)}
                activeOpacity={0.85}
                style={s.suggestRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.suggestTitle} numberOfLines={1}>{r.title}</Text>
                  {!!r.subtitle && (
                    <Text style={s.suggestSub} numberOfLines={1}>{r.subtitle}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {!!fallbackGeocodeUsed && (
              <Text style={s.suggestHint}>
                {t("onboarding.fallbackHint")}</Text>
            )}
          </View>
        )}

        {/* Selected badge */}
        {!!selectedCity && (
          <View style={s.selectedPill}>
            <Text style={s.selectedTxt}>
              ✓ {selectedCity.title}{selectedCity.subtitle ? ` · ${selectedCity.subtitle}` : ""}
            </Text>
          </View>
        )}


        <View style={{ height: 16 }} />

        <Text style={s.sectionTitle}>{t("onboarding.trainingOptional")}</Text>

        <TextInput
          placeholder={t("onboarding.placeholders.educationLevel")}
          placeholderTextColor={C.subtext}
          style={s.input}
          value={educationLevel}
          onChangeText={setEducationLevel}
        />

        <TextInput
          placeholder={t("onboarding.organizationEGTuVienna")}
          placeholderTextColor={C.subtext}
          style={s.input}
          value={educationOrg}
          onChangeText={setEducationOrg}
        />

        <TextInput
          placeholder={t("onboarding.specializationEGComputerScience")}
          placeholderTextColor={C.subtext}
          style={s.input}
          value={educationField}
          onChangeText={setEducationField}
        />

        <TextInput
          placeholder={t("onboarding.yearOfCompletionEG2027")}
          placeholderTextColor={C.subtext}
          style={s.input}
          keyboardType="number-pad"
          value={educationGradYear}
          onChangeText={setEducationGradYear}
        />

        <View style={{ height: 16 }} />

        <Text style={s.sectionTitle}>{t("onboarding.interestsOptional")}</Text>
        <Text style={s.subsubtitle}>
          {t("onboarding.interestsHint")}</Text>

        <View style={s.chipsWrap}>
          {INTEREST_SUGGESTIONS.map((k) => {
            const active = interests.includes(k);
            return (
              <TouchableOpacity
                key={k}
                onPress={() => toggleInterest(k)}
                activeOpacity={0.85}
                style={[
                  s.chip,
                  active && { borderColor: C.primary, backgroundColor: C.card },
                ]}
              >
                <Text style={[s.chipText, active && { color: C.primary, fontWeight: "800" }]}>
                  {t(`interests.${k}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[s.btn, !canSubmit && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator /> : <Text style={s.btnText}>{t("onboarding.further")}</Text>}
        </TouchableOpacity>

        <Text style={s.footerHint}>
          {t("onboarding.youCanAdjustThisLaterInYourProfile")}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = (C: any) =>
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
    suggestHint: { color: C.subtext, padding: 10, fontSize: 12, fontWeight: "700" },

    selectedPill: {
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.primary,
      backgroundColor: C.card,
    },
    selectedTxt: { color: C.primary, fontWeight: "900" },

    box: {
      padding: 16,
      paddingBottom: 32,
      gap: 10,
    },

    title: { color: C.text, fontSize: 26, fontWeight: "900" },
    subtitle: { color: C.subtext, marginBottom: 8, lineHeight: 20 },

    label: { color: C.text, fontWeight: "800", marginTop: 6 },

    sectionTitle: { color: C.text, fontSize: 16, fontWeight: "900", marginTop: 4 },
    subsubtitle: { color: C.subtext, marginBottom: 6 },

    input: {
      backgroundColor: C.card,
      color: C.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      marginTop: 6,
    },

    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 4,
      marginBottom: 12,
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
      backgroundColor: C.primary,
      borderRadius: 10,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.primaryBorder ?? C.border,
    },

    btnText: { color: C.bg, fontWeight: "900" },

    footerHint: {
      marginTop: 12,
      color: C.subtext,
      textAlign: "center",
    },
  });
