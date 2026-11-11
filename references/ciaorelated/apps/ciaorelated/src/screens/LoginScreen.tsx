// apps/ciaorelated/src/screens/LoginScreen.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useMutation, gql } from "@apollo/client";

import { apollo } from "../apollo";
import { Auth } from "../lib/auth";
import Screen from "./components/Screen";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList, RootStackParamList } from "../../App";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { AuthVault } from "../lib/auth-vault";
import type { NavigationProp } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import PhoneAuthForm from "./auth/PhoneAuthForm";


import { useTranslation } from "react-i18next";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

const LOGIN_MUT = gql`
  mutation Login($emailOrUsername: String!, $password: String!) {
    login(emailOrUsername: $emailOrUsername, password: $password) {
      token
      user {
        id
        username
        avatarUrl
        account { id }
      }
    }
  }
`;

export default function LoginScreen({ route, navigation }: Props) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors;
  const s = useMemo(() => styles(C), [C]);

  const asAddAccount = route.params?.asAddAccount ?? false;
  const [showPw, setShowPw] = useState(false);
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");


  // 👉 Root-Navigation (für Gate-Reset)
  const rootNav = useNavigation<NavigationProp<RootStackParamList>>();

  const [emailOrUsername, setId] = useState("");
  const [password, setPw] = useState("");

  const [login, { loading }] = useMutation(LOGIN_MUT, {
    errorPolicy: "all",
    onError: () => {},
  });

  const safeClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // NIE direkt AppTabs – Gate entscheidet
      rootNav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
    }
  };

  const onSubmit = async () => {
    try {
      const { data, errors } = await login({
        variables: {
          emailOrUsername: emailOrUsername.trim(),
          password,
        },
        context: { headers: {} },
      });

      if (errors?.length) {
        throw new Error(errors[0]?.message ?? t("common.unknownError"));
      }

      const token = data?.login?.token;
      const user = data?.login?.user;
      const accountId = user?.account?.id;

      if (!token || !user?.id || !accountId) {
        throw new Error(t("login.errors.invalidResponse"));
      }

      await Auth.upsertSession({
        token,
        accountId,
        profileId: user.id,
        username: user.username ?? undefined,
        avatarUrl: user.avatarUrl ?? undefined,
        avatarThumbUrl: user.avatarThumbUrl ?? null,
      });

      // Multiaccount: aktives Profil korrekt setzen
      try {
        const active = await AuthVault.active();
        if (active?.profileId !== user.id) {
          const all = await AuthVault.all();
          const match = all.find((s) => s.profileId === user.id);
          if (match) await AuthVault.setActive(match.sessionId);
        }
      } catch {}

      try {
        await apollo.resetStore();
      } catch (e) {
        console.warn("login resetStore warning:", e);
        await apollo.clearStore().catch(() => {});
      }
      Auth.emitChange?.();

      if (asAddAccount) {
        // zurück zum Switcher
        safeClose();
      } else {
        // ✅ Gate entscheidet: VerifyEmail → Onboarding → AppTabs
        rootNav.reset({
          index: 0,
          routes: [{ name: "Gate" as never }],
        });
      }
    } catch (e: any) {
      console.log("Login exception:", e);
      Alert.alert(
        t("login.errors.title"),
        String(e?.message ?? t("login.errors.tryAgain"))
      );
    }
  };

  const completeAuth = async ({ token, user }: { token: string; user: any }) => {
    const accountId = user?.account?.id;
    if (!token || !user?.id || !accountId) {
      throw new Error(t("login.errors.invalidResponse"));
    }

    const session = await Auth.upsertSession({
      token,
      accountId,
      profileId: user.id,
      username: user.username ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      avatarThumbUrl: user.avatarThumbUrl ?? null,
    });

    await Auth.setActiveSession?.(session.sessionId);
    await Auth.set(token);
    await Auth.setProfileId(user.id);

    try {
      await apollo.resetStore();
    } catch (e) {
      console.warn("phone login resetStore warning:", e);
      await apollo.clearStore().catch(() => {});
    }
    Auth.emitChange?.();

    if (asAddAccount) {
      safeClose();
    } else {
      rootNav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
    }
  };

  const canSubmit =
    emailOrUsername.trim().length > 0 &&
    password.length > 0 &&
    !loading;

    
  return (
    <Screen
      backgroundColor={C.bg}
      barStyle="light-content"
      edges={["top", "right", "bottom", "left"]}
      headerTitle={
        asAddAccount
          ? t("login.addAccount")
          : t("login.signIn")
      }
      showBack={asAddAccount}
      onBack={safeClose}
    >
      <View style={s.box}>
        <Text style={s.title}>
          {asAddAccount
            ? t("login.addAccount")
            : t("login.signIn")}

        </Text>

        <View style={s.segment}>
          <TouchableOpacity
            onPress={() => setAuthMethod("phone")}
            style={[s.segmentBtn, authMethod === "phone" && s.segmentBtnActive]}
          >
            <Text style={[s.segmentText, authMethod === "phone" && s.segmentTextActive]}>{t("phoneAuth.phone")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAuthMethod("email")}
            style={[s.segmentBtn, authMethod === "email" && s.segmentBtnActive]}
          >
            <Text style={[s.segmentText, authMethod === "email" && s.segmentTextActive]}>{t("phoneAuth.email")}</Text>
          </TouchableOpacity>
        </View>

        {authMethod === "phone" ? (
          <PhoneAuthForm mode="login" colors={C} onAuthenticated={completeAuth} />
        ) : (
          <>
            <TextInput
              placeholder={t("login.emailOrUsername")}
              placeholderTextColor={C.subtext}
              value={emailOrUsername}
              onChangeText={setId}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <View style={s.pwWrap}>
              <TextInput
                placeholder={t("login.password")}
                placeholderTextColor={C.subtext}
                value={password}
                onChangeText={setPw}
                style={s.pwInput}
                secureTextEntry={!showPw}
              />

              <TouchableOpacity
                onPress={() => setShowPw((v) => !v)}
                activeOpacity={0.7}
                style={s.pwIcon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate("ResetPasswordRequest", { asAddAccount })}
              style={{ alignSelf: "flex-end", marginTop: 4 }}
            >
              <Text style={{ color: C.primary, fontWeight: "700" }}>
                {t("login.forgotYourPassword")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, !canSubmit && { opacity: 0.6 }]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              {loading ? (
                <ActivityIndicator color={C.text} />
              ) : (
                <Text style={s.btnText}>
                  {asAddAccount
                    ? t("login.addAccount")
                    : t("login.login")}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {!asAddAccount && (
          <TouchableOpacity
            onPress={() => navigation.navigate("Register" as never)}
            style={{ marginTop: 16 }}
          >
            <Text style={{ color: C.subtext }}>
              {t("login.noAccount")}{" "}
              <Text style={{ color: C.primary, fontWeight: "700" }}>
                {t("login.register")}</Text>
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    box: { padding: 16, gap: 12 },

    pwWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },

    pwInput: {
      flex: 1,
      color: C.text,
      height: 44,
      paddingVertical: 0,
    },

    pwIcon: {
      height: 44,
      justifyContent: "center",
      alignItems: "center",
      paddingLeft: 10,
    },


    title: {
      color: C.text,
      fontSize: 24,
      fontWeight: "800",
      marginBottom: 8,
    },

    input: {
      backgroundColor: C.card,
      color: C.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },

    btn: {
      backgroundColor: C.primary,
      borderRadius: 10,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.primaryBorder ?? C.border,
    },

    btnText: {
      color: C.bg,
      fontWeight: "800",
    },
    segment: {
      flexDirection: "row",
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    segmentBtn: {
      flex: 1,
      height: 36,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentBtnActive: {
      backgroundColor: C.primary,
    },
    segmentText: {
      color: C.subtext,
      fontWeight: "800",
    },
    segmentTextActive: {
      color: C.bg,
    },
  });
