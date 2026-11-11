// src/screens/TermsScreen.tsx
import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { gql, useApolloClient } from "@apollo/client";
import Screen from "./components/Screen";
import LanguageQuickSwitch from "./components/LanguageQuickSwitch";
import { openLink } from "../lib/openLink";
import { TERMS_Q } from "../useTermsGate";
import { useTheme } from "../theme/ThemeProvider";
import { useTranslation } from "react-i18next";
import { buildLegalUrls } from "../config/webLinks";

const ACCEPT_TERMS = gql`
  mutation AcceptTerms($version: Int!) {
    acceptTerms(version: $version) {
      id
      termsVersionAccepted
      termsAcceptedAt
    }
  }
`;

export default function TermsScreen() {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigation();
  const client = useApolloClient();
  const { t, i18n } = useTranslation();

  const { theme } = useTheme();
  const COLORS = theme.colors;
  const s = useMemo(() => styles(COLORS), [COLORS]);

  const route = useRoute<any>();
  const version = route.params?.version ?? 1;
  const lang: "de" | "en" = (i18n.language || "").toLowerCase().startsWith("de") ? "de" : "en";

  const links = buildLegalUrls(lang);

  const handle = async () => {
    if (!checked || busy) return;

    try {
      setBusy(true);
      await client.mutate({
        mutation: ACCEPT_TERMS,
        variables: { version },
        update(cache, { data }) {
          if (data?.acceptTerms) {
            cache.writeQuery({
              query: TERMS_Q,
              data: {
                currentTermsVersion: version,
                me: {
                  ...data.acceptTerms,
                  __typename: "Profile",
                },
              },
            });
          }
        },
      });

      nav.goBack();
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("terms.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>{t("terms.title")}</Text>
        </View>
        <LanguageQuickSwitch align="right" style={s.languageSwitch} />

        {/* Content */}
        <Text style={s.intro}>{t("terms.intro", { version })}</Text>
        <Text style={s.body}>{t("terms.body")}</Text>

        {/* Links */}
        <TouchableOpacity onPress={() => openLink(links.terms)} style={s.linkRow}>
          <Text style={s.link}>{t("terms.readTerms")}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => openLink(links.guidelines)} style={s.linkRow}>
          <Text style={s.link}>{t("terms.readGuidelines")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => openLink(links.privacy)}
          style={[s.linkRow, { marginBottom: 14 }]}
        >
          <Text style={s.link}>{t("terms.readPrivacy")}</Text>
        </TouchableOpacity>

        {/* Consent */}
        <TouchableOpacity
          onPress={() => setChecked((v) => !v)}
          activeOpacity={0.8}
          style={s.consentRow}
        >
          <View
            style={[
              s.checkbox,
              checked && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
            ]}
          />
          <Text style={s.consentText}>{t("terms.consent")}</Text>
        </TouchableOpacity>

        {/* Button */}
        <TouchableOpacity
          onPress={handle}
          disabled={!checked || busy}
          activeOpacity={0.85}
          style={[
            s.button,
            { backgroundColor: checked ? COLORS.primary : COLORS.border, opacity: busy ? 0.8 : 1 },
          ]}
        >
          <Text
            style={[s.buttonText, { color: COLORS.bg }]}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.8}
          >
            {busy ? t("terms.buttonSaving") : t("terms.buttonAgree")}
          </Text>
        </TouchableOpacity>

        {Platform.OS === "ios" ? <View style={{ height: 6 }} /> : null}
      </View>
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    page: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 18,
    },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 12,
      flexWrap: "wrap", // ✅ wichtig bei großer Schrift
    },

    title: {
      color: C.text,
      fontSize: 20,
      fontWeight: "800",
      flexGrow: 1,
      flexShrink: 1,
      minWidth: "70%", // ✅ Titel bekommt Platz, Switch kann darunter umbrechen
    },

    languageSwitch: {
      marginBottom: 12,
    },

    intro: { color: C.subtext, marginBottom: 10, fontWeight: "600" },

    body: { color: C.text, lineHeight: 22, marginBottom: 16 },

    linkRow: { marginBottom: 8 },
    link: { color: C.primary, fontWeight: "600" },

    consentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 6,
      marginBottom: 16,
    },

    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: "transparent",
      flexShrink: 0,
      marginTop: 2,
    },

    consentText: { color: C.text, flex: 1 },

    button: {
      paddingVertical: 16,
      paddingHorizontal: 14,
      borderRadius: 12,
      alignItems: "center",
    },

    buttonText: { fontWeight: "800", fontSize: 16 },
  });
