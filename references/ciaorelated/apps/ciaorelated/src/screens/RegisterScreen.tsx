// apps/ciaorelated/src/screens/RegisterScreen.tsx
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
import { useMutation } from "@apollo/client";
import { REGISTER_MUT } from "../graphql/mutations/auth";
import { Auth } from "../lib/auth";
import Screen from "./components/Screen";
import LanguageQuickSwitch from "./components/LanguageQuickSwitch";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { AuthStackParamList, RootStackParamList } from "../../App";
import { apollo } from "../apollo";
import { useTheme } from "../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import PhoneAuthForm from "./auth/PhoneAuthForm";


import { useTranslation } from "react-i18next";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export default function RegisterScreen({ route, navigation }: Props) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors;

  const isDark = useMemo(() => C.bg !== "#FFFFFF", [C.bg]);

  const asAddAccount = route.params?.asAddAccount ?? false;
  const [showPw, setShowPw] = useState(false);
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");

  // ✨ Root-Navigation getrennt vom Auth-Stack
  const rootNav = useNavigation<NavigationProp<RootStackParamList>>();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPw] = useState("");

  const [register, { loading }] = useMutation(REGISTER_MUT, {
    errorPolicy: "all",
    onError: () => {},
  });

  const safeClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Wenn kein Back möglich (selten), geh in Gate (statt AppTabs),
      // damit Verify/Onboarding sauber entschieden wird.
      rootNav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
    }
  };

  const onSubmit = async () => {
    try {
      const e = email.trim();
      const u = username.trim();
      const n = name.trim();

      if (!e || !u || password.length < 1) {
        Alert.alert(t("common.error"), t("register.errors.fillEmailUsernamePassword"));
        return;
      }

      const { data, errors } = await register({
        variables: { email: e, password, username: u, name: n || null },
        context: {
          headers: {
            authorization: undefined as any,
            "x-profile-id": undefined as any,
          },
        },
      });

      if (errors?.length) throw new Error(errors[0]?.message ?? t("register.errors.failed"));


      const token = data?.register?.token;
      const user = data?.register?.user;
      const accountId = user?.account?.id;

      if (!token || !user?.id || !accountId) {
        throw new Error(t("register.errors.invalidResponse"));

      }

    

      const session = await Auth.upsertSession({
        token,
        accountId,
        profileId: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        avatarThumbUrl: user.avatarThumbUrl ?? null,
      });

      await Auth.setActiveSession?.(session.sessionId); // oder AuthVault.setActive(sessionId)
      await Auth.set(token);
      await Auth.setProfileId(user.id);

      await apollo.resetStore().catch(() => {});

      rootNav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
      return;

      
    } catch (e: any) {
      const msg =
        e?.networkError?.result?.errors?.[0]?.message ||
        e?.message ||
        t("register.errors.failed");
      Alert.alert(t("common.error"), String(msg));

    }
  };

  const completeAuth = async ({ token, user }: { token: string; user: any }) => {
    const accountId = user?.account?.id;
    if (!token || !user?.id || !accountId) {
      throw new Error(t("register.errors.invalidResponse"));
    }

    const session = await Auth.upsertSession({
      token,
      accountId,
      profileId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      avatarThumbUrl: user.avatarThumbUrl ?? null,
    });

    await Auth.setActiveSession?.(session.sessionId);
    await Auth.set(token);
    await Auth.setProfileId(user.id);
    await apollo.resetStore().catch(() => {});
    rootNav.reset({ index: 0, routes: [{ name: "Gate" as never }] });
  };

  const canSubmit =
    email.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length >= 1 &&
    !loading;

  const s = useMemo(() => styles(C), [C]);

  return (
    <Screen
      backgroundColor={C.bg}
      barStyle={isDark ? "light-content" : "dark-content"}
      headerTitle={asAddAccount ? t("register.newAccount") : t("register.register")}
      showBack={asAddAccount}
      onBack={safeClose}
    >
      <View style={s.box}>
        <LanguageQuickSwitch align="right" style={s.languageSwitch} />
        <Text style={s.title}>{t("register.register")}</Text>

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
          <PhoneAuthForm mode="register" colors={C} onAuthenticated={completeAuth} />
        ) : (
          <>
            <TextInput
              placeholder={t("register.email")}
              placeholderTextColor={C.subtext}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <TextInput
              placeholder={t("register.userName")}
              placeholderTextColor={C.subtext}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />

            <TextInput
              placeholder={t("register.nameOptional")}
              placeholderTextColor={C.subtext}
              style={s.input}
              autoCorrect={false}
              value={name}
              onChangeText={setName}
            />

            <View style={s.pwWrap}>
              <TextInput
                placeholder={t("register.password")}
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
              style={[s.btn, !canSubmit && { opacity: 0.6 }]}
              onPress={onSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator /> : <Text style={s.btnText}>{t("register.createAccount")}</Text>}
            </TouchableOpacity>
          </>
        )}

        {!asAddAccount && (
          <TouchableOpacity
            onPress={() => navigation.replace("Login", { asAddAccount: false })}
            style={{ marginTop: 16 }}
          >
            <Text style={{ color: C.subtext }}>
              {t("register.alreadyHaveAnAccount")}{" "}
              <Text style={{ color: C.primary, fontWeight: "700" }}>
                {t("register.signIn")}
              </Text>
            </Text>

          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
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

    box: { padding: 16, gap: 12 },

    languageSwitch: {
      marginBottom: 2,
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
