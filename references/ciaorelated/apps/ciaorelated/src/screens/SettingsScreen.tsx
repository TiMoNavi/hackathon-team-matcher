// src/screens/SettingsScreen.tsx
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
  Switch
} from "react-native";
import { useNavigation, type NavigationProp, useFocusEffect } from "@react-navigation/native";
import Screen from "./components/Screen";
import { Auth } from "../lib/auth";
import { AuthVault } from "../lib/auth-vault";
import { apollo } from "../apollo";
import { gql, useMutation, useQuery } from "@apollo/client";
import type { RootStackParamList } from "../../App";
import { useTheme } from "../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getLanguageMode, type AppLanguageMode } from "../i18n";
import { buildLegalUrls } from "../config/webLinks";

/* ---------- Row ---------- */
type RowProps = {
  title: string;
  subtitle?: string;
  right?: string;
  onPress?: () => void;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
};

const Row = ({
  title,
  subtitle,
  right = "›",
  onPress,
  icon = "•",
  danger,
  disabled,
  s,
  COLORS,
}: RowProps & { s: any; COLORS: any }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[s.row, disabled && { opacity: 0.5 }]}
    disabled={disabled}
  >
    <View style={s.rowLeft}>
      <Text style={s.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text
          style={[s.rowTitle, danger && { color: COLORS.danger }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
    <Text style={[s.rowRight, danger && { color: COLORS.danger }]}>
      {right}
    </Text>
  </TouchableOpacity>
);



/* ---------- GraphQL ---------- */
const DELETE_ACCOUNT = gql`
  mutation DeleteAccount {
    deleteAccount
  }
`;

const SET_PRIVATE = gql`
  mutation SetProfilePrivate($isPrivate: Boolean!) {
    setProfilePrivate(isPrivate: $isPrivate)
  }
`;
const ME_PRIVACY = gql`
  query MePrivacy {
    me {
      id
      username
      isPrivate
      isAdmin
      __typename
    }
  }
`;

export default function SettingsScreen() {

  const { data } = useQuery(ME_PRIVACY, { fetchPolicy: "cache-and-network" });
  const isPrivate = !!data?.me?.isPrivate;
  const canOpenAdminDashboard = !!data?.me?.isAdmin;

  const [setPrivate, { loading }] = useMutation(SET_PRIVATE);
  const { t, i18n } = useTranslation();
  const [langMode, setLangMode] = useState<AppLanguageMode>("auto");

  /* ---------- URLs ---------- */
  const legalLang = langMode === "de" || langMode === "en"
    ? langMode
    : i18n.language.toLowerCase().startsWith("de")
      ? "de"
      : "en";
  const legalUrls = buildLegalUrls(legalLang);
  const POLICY_URL = legalUrls.privacy;
  const TERMS_WEB_URL = legalUrls.terms;

  const onTogglePrivate = useCallback(async (next: boolean) => {
    // optional confirmation when turning private on
    if (next) {
      const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
          t("settings.privateConfirmTitle"),
          t("settings.privateConfirmBody"),
          [
            { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: t("common.enable"), style: "default", onPress: () => resolve(true) },
          ]
        );
      });
      if (!ok) return;
    }

    await setPrivate({
      variables: { isPrivate: next },
      optimisticResponse: { setProfilePrivate: true },
      update(cache) {
        const prev = cache.readQuery<any>({ query: ME_PRIVACY });
        if (!prev?.me) return;
        cache.writeQuery({
          query: ME_PRIVACY,
          data: { me: { ...prev.me, isPrivate: next, __typename: "User" } },
        });
      },
    }).catch((e) => {
      Alert.alert(t("common.error"), e?.message ?? t("settings.saveFailed"));
    });
  }, [setPrivate]);
  
  const { theme, isDark, toggleTheme } = useTheme();
  const COLORS = theme.colors;
  const s = styles(COLORS);

  const nav = useNavigation<NavigationProp<RootStackParamList>>();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getLanguageMode().then((m) => alive && setLangMode(m));
      return () => {
        alive = false;
      };
    }, [])
  );

  const langLabel =
    langMode === "auto" ? t("settings.language_auto") : langMode === "de" ? t("settings.language_de") : t("settings.language_en");

  const [deleteAccount, { loading: deleting }] = useMutation(DELETE_ACCOUNT, {
    onError: () => {
      Alert.alert(t("common.error"), t("settings.deleteFailed"));
    },
    onCompleted: async (res) => {
      if (res?.deleteAccount) {
        try {
          const active = await AuthVault.active();
          if (active) await AuthVault.remove(active.sessionId);
        } catch {}
        try {
          await Auth.clear();
        } catch {}
        try {
          await apollo.clearStore();
        } catch {}
        nav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
        Alert.alert(t("settings.accountDeletedTitle"), t("settings.accountDeletedBody"));
      }
    },
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      t("settings.deleteConfirmTitle"),
      t("settings.deleteConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("settings.deleteConfirmCta"), style: "destructive", onPress: () => deleteAccount() },
      ]
    );
  };

  const handleLogout = async () => {
    try {
      const active = await AuthVault.active();
      if (active) await AuthVault.remove(active.sessionId);
      await apollo.clearStore();
      nav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
    } catch {
      Alert.alert(t("common.error"), t("settings.logoutFailed"));
    }
  };

  const addAccount = () => {
    nav.navigate("Auth", { asAddAccount: true, start: "login" });
  };

  const openUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
    } catch {
      Alert.alert(t("common.note"), t("settings.openLinkFailed"));
    }
  };

  return (
    <Screen scroll>
      {/* Header */}
      <View style={[s.header, { backgroundColor: COLORS.bg }]}>
        {/* LEFT */}
        <TouchableOpacity
          onPress={() => nav.goBack()}
          hitSlop={12}
          style={s.headerBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        {/* CENTER (absolute, always centered) */}
        <View pointerEvents="none" style={s.titleWrap}>
          <Text style={s.title} numberOfLines={1}>
            {t("settings.settings")}</Text>
        </View>

        {/* RIGHT (same width as left) */}
        <View style={s.headerBtn}>
          {deleting ? <ActivityIndicator color={COLORS.text} /> : null}
        </View>
      </View>


      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <Text style={s.sectionLabel}>{t("settings.registration")}</Text>
        <View style={s.card}>
          <Row
            icon="➕"
            title={t("settings.addAccount")}
            onPress={addAccount}
            right=""
            s={s}
            COLORS={COLORS}
          />
          <Row
            icon="🚪"
            title={t("settings.logOut")}
            onPress={handleLogout}
            right=""
            danger
            s={s}
            COLORS={COLORS}
          />
        </View>

        {canOpenAdminDashboard && (
          <>
            <Text style={s.sectionLabel}>{t("settings.admin")}</Text>
            <View style={s.card}>
              <Row
                icon="🛡️"
                title={t("settings.adminDashboard")}
                subtitle={t("settings.adminDashboardSubtitle")}
                onPress={() => nav.navigate("AdminDashboard" as never)}
                s={s}
                COLORS={COLORS}
              />
            </View>
          </>
        )}

        <Text style={s.sectionLabel}>{t("settings.privacy")}</Text>
        <View style={s.card}>
          <Row
            icon="🚫"
            title={t("settings.blockedProfiles")}
            subtitle={t("settings.manageBlockedUsers")}
            onPress={() => nav.navigate("BlockedUsers")}
            s={s}
            COLORS={COLORS}
          />
        </View>
        <View style={s.card}>
        <View style={s.switchRow}>
            <Text style={s.switchLabel}>{t("settings.privateProfile")}</Text>

            <Switch
              value={isPrivate}
              onValueChange={onTogglePrivate}
              disabled={loading}
            />
          </View>
          </View>

        {/* Anzeige */}
        <Text style={s.sectionLabel}>{t("settings.display")}</Text>
        <View style={s.card}>
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>{t("settings.darkMode")}</Text>

            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{
                false: COLORS.border,
                true: COLORS.primary,
              }}
              thumbColor={isDark ? "#ffffff" : "#f4f3f4"}
            />
          </View>
        </View>

        <Text style={s.sectionLabel}>{t("settings.language")}</Text>
        <View style={s.card}>
          <Row
            icon="🌐"
            title={t("settings.language")}
            right={langLabel}
            onPress={() => nav.navigate("LanguageSettings" as never)}
            s={s}
            COLORS={COLORS}
          />
        </View>

        <Text style={s.sectionLabel}>{t("settings.legal")}</Text>
        <View style={s.card}>
          <Row
            icon="🔒"
            title={t("settings.privacyPolicy")}
            subtitle={POLICY_URL}
            right="↗"
            onPress={() => openUrl(POLICY_URL)}
            s={s}
            COLORS={COLORS}
          />
          <Row
            icon="🌐"
            title={t("settings.termsOfUse")}
            subtitle={TERMS_WEB_URL}
            right="↗"
            onPress={() => openUrl(TERMS_WEB_URL)}
            s={s}
            COLORS={COLORS}
          />
        </View>

        <Text style={s.sectionLabel}>{t("settings.account")}</Text>
        <View style={s.card}>
          <Row
            icon="🗑️"
            title={t("settings.deleteAccount")}
            subtitle={t("settings.deleteAccountSubtitle")}
            onPress={handleDeleteAccount}
            danger
            disabled={deleting}
            s={s}
            COLORS={COLORS}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/* ---------- Styles (theme-aware) ---------- */
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

    headerBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },

    titleWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },

    title: { color: C.text, fontSize: 16, fontWeight: "700" },

    sub: { color: "#9CA3AF", marginTop: 4, fontSize: 12, lineHeight: 16 },
  
    back: { color: C.text, fontSize: 26 },
    
    meta: { color: C.text, opacity: 0.6 },

    sectionLabel: {
      color: C.subtext,
      marginTop: 12,
      marginBottom: 6,
      paddingHorizontal: 12,
      fontWeight: "700",
    },

    card: {
      backgroundColor: C.card,
      borderRadius: 12,
      marginHorizontal: 12,
      marginBottom: 10,
      overflow: "hidden",
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
    },

    row: {
      paddingHorizontal: 12,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    rowIcon: { color: C.text, width: 22, textAlign: "center" },
    rowTitle: { color: C.text, fontWeight: "600" },
    rowSub: { color: C.subtext, fontSize: 12, marginTop: 2 },
    rowRight: { color: C.subtext, fontSize: 18 },
    switchRow: {
      paddingHorizontal: 12,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    switchLabel: {
      color: C.text,
      fontSize: 15,
      fontWeight: "600",
    },

  });
