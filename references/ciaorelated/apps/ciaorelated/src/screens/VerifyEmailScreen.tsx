// apps/ciaorelated/src/screens/VerifyEmailScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { gql, useMutation,useApolloClient } from "@apollo/client";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";

import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../../App";
import { apollo } from "../apollo";
import { Auth } from "../lib/auth";



import { useTranslation } from "react-i18next";

const REQUEST_EMAIL_VERIFICATION = gql`
  mutation RequestEmailVerification {
    requestEmailVerification {
      isVerified
      expiresAt
    }
  }
`;
const VERIFY_EMAIL = gql`
  mutation VerifyEmail($code: String!) {
    verifyEmail(code: $code)
  }
`;
const CHANGE_ACCOUNT_EMAIL = gql`
  mutation ChangeAccountEmail($email: String!) {
    changeAccountEmail(email: $email) {
      isVerified
      expiresAt
    }
  }
`;

const AUTH_STATE_Q = gql`
  query AuthStateGate {
    me {
      id
      onboardingCompletedAt
      account { emailVerifiedAt phoneVerifiedAt }
    }
  }
`;


export default function VerifyEmailScreen() {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors;
  const s = useMemo(() => styles(C), [C]);
  const navigation = useNavigation<any>();

  const rootNav = useNavigation<NavigationProp<RootStackParamList>>();

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const inputRef = useRef<TextInput>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const client = useApolloClient();



  const [requestCode, { loading: requesting }] = useMutation(REQUEST_EMAIL_VERIFICATION, {
    errorPolicy: "all",
    onError: () => {},
  });

  const [verifyEmail, { loading: verifying }] = useMutation(VERIFY_EMAIL, {
    errorPolicy: "all",
    onError: () => {},
  });

  const [changeEmail, { loading: changing }] = useMutation(CHANGE_ACCOUNT_EMAIL, {
    errorPolicy: "all",
    onError: () => {},
    });

  // Autofocus
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, []);

  // Countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    let cancelled = false;

    const leaveIfAlreadyVerified = async () => {
      try {
        const r = await client.query({
          query: AUTH_STATE_Q,
          fetchPolicy: "network-only",
        });
        if (cancelled) return;

        const me = r.data?.me;
        const emailVerifiedAt = me?.account?.emailVerifiedAt ?? null;
        const phoneVerifiedAt = me?.account?.phoneVerifiedAt ?? null;
        const accountVerified = !!emailVerifiedAt || !!phoneVerifiedAt;
        const onboardingCompletedAt = me?.onboardingCompletedAt ?? null;

        if (!accountVerified) return;

        if (!onboardingCompletedAt) {
          navigation.reset({ index: 0, routes: [{ name: "Onboarding" as never }] });
          return;
        }

        navigation.reset({ index: 0, routes: [{ name: "AppTabs" as never }] });
      } catch (e) {
        console.log("VerifyEmail auto-exit check failed:", e);
      }
    };

    leaveIfAlreadyVerified();
    return () => {
      cancelled = true;
    };
  }, [client, navigation]);

  const sanitize = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  const resend = async () => {
    try {
      if (cooldown > 0) return;

      const { data, errors } = await requestCode();
      if (errors?.length) throw new Error(errors[0]?.message ?? t("verifyemail.codeCouldNotBeSent"));

      // Server kann boolean/string zurückgeben – wir brauchen nur "ok"
      if (!data) {
        // trotzdem ok – je nach schema
      }

      setCooldown(30);
      Alert.alert(t("verifyemail.sentTitle"), t("verifyemail.sentBody"));
    } catch (e: any) {
      const msg =
        e?.networkError?.result?.errors?.[0]?.message ||
        e?.message ||
        t("verifyemail.codeCouldNotBeSent");
      Alert.alert(t("common.errorTitle"), String(msg));
    }
  };

  const submit = async () => {
    try {
      const c = sanitize(code);
      if (c.length !== 6) {
        Alert.alert(t("common.errorTitle"), t("verifyemail.enter6DigitCode"));
        return;
      }

      console.log("VERIFY submit code:", code);
      const { data, errors } = await verifyEmail({
        variables: { code: c },
      });
      console.log("VERIFY result:", data, errors);

      if (errors?.length) throw new Error(errors[0]?.message ?? t("verifyemail.verificationFailed"));

      const ok = data?.verifyEmail;

      if (ok) {
        // Cache sauber leeren
        await apollo.resetStore().catch(() => {});

        // 🔥 DIREKT prüfen wohin
        const r = await client.query({
            query: AUTH_STATE_Q,
            fetchPolicy: "network-only",
        });

        const me = r.data?.me;
        const emailVerifiedAt = me?.account?.emailVerifiedAt ?? null;
        const phoneVerifiedAt = me?.account?.phoneVerifiedAt ?? null;
        const accountVerified = !!emailVerifiedAt || !!phoneVerifiedAt;
        const onboardingCompletedAt = me?.onboardingCompletedAt ?? null;

        // Falls aus irgendeinem Grund doch nicht verified → zurück bleiben
        if (!accountVerified) {
            Alert.alert(t("verifyemail.notVerifiedYetTitle"), t("verifyemail.notVerifiedYetBody"));
            return;
        }

        // ✅ Onboarding fehlt → dahin
        if (!onboardingCompletedAt) {
            navigation.reset({ index: 0, routes: [{ name: "Onboarding" as never }] });
            return;
        }

        // ✅ Alles erledigt → App
        navigation.reset({ index: 0, routes: [{ name: "AppTabs" as never }] });
        return;
       }

       if (!ok) {
          throw new Error(t("verifyemail.verificationFailed"));
        }

    } catch (e: any) {
      const msg =
        e?.networkError?.result?.errors?.[0]?.message ||
        e?.message ||
        t("verifyemail.verificationFailed");
      Alert.alert(t("common.errorTitle"), String(msg));
    }
  };

  const busy = verifying || requesting;
  const canSubmit = sanitize(code).length === 6 && !busy;

  const switchToPhoneAuth = async () => {
    try {
      await Auth.logout();
      await apollo.clearStore().catch(() => {});
      rootNav.reset({
        index: 0,
        routes: [{ name: "Auth" as never, params: { start: "login", asAddAccount: false } as never }],
      });
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), String(e?.message ?? t("common.unknownError")));
    }
  };

  return (
    <Screen
      backgroundColor={C.bg}
      barStyle="light-content"
      headerTitle={t("verifyemail.confirmEmailAddress")}
      showBack={false}
    >
      <View style={s.box}>
        <Text style={s.title}>{t("verifyemail.checkYourEmail")}</Text>
        <Text style={s.subtitle}>
          {t("verifyemail.weveSentYouA6DigitCodeEnterItHereToA9a87c4")}</Text>

        <TextInput
          ref={inputRef}
          placeholder={t("verifyemail.codePlaceholder")}
          placeholderTextColor={C.subtext}
          value={sanitize(code)}
          onChangeText={(t) => setCode(sanitize(t))}
          style={s.codeInput}
          keyboardType="number-pad"
          maxLength={6}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        <TouchableOpacity
          style={[s.btn, !canSubmit && { opacity: 0.6 }]}
          onPress={submit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {verifying ? <ActivityIndicator /> : <Text style={s.btnText}>{t("verifyemail.confirm")}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.linkBtn, (cooldown > 0 || requesting) && { opacity: 0.6 }]}
          onPress={resend}
          disabled={cooldown > 0 || requesting}
        >
          {requesting ? (
            <ActivityIndicator />
          ) : (
            <Text style={s.linkText}>
              {cooldown > 0
                ? t("verifyemail.resendInSeconds", { count: cooldown })
                : t("verifyemail.resendCode")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
        style={[s.linkBtn, (busy || changing) && { opacity: 0.6 }]}
        onPress={() => {
            setNewEmail("");
            setEditOpen(true);
        }}
        disabled={busy || changing}
        >
        <Text style={s.linkText}>{t("verifyemail.changeEmailAddress")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={switchToPhoneAuth}
          disabled={busy || changing}
        >
          <Text style={s.secondaryBtnText}>{t("phoneAuth.usePhoneInstead")}</Text>
        </TouchableOpacity>

        <Text style={s.hint}>
          {t("verifyemail.tipAlsoCheckYourSpamFolder")}</Text>
      </View>
      {editOpen && (
        <View style={s.modalWrap}>
            <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t("verifyemail.changeEmailAddress")}</Text>
            <Text style={s.modalSub}>{t("verifyemail.weWillThenAutomaticallySendYouANewCo7097b7")}</Text>

            <TextInput
                placeholder={t("verifyemail.newEmailCom")}
                placeholderTextColor={C.subtext}
                value={newEmail}
                onChangeText={setNewEmail}
                style={s.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
            />

            <View style={s.modalRow}>
                <TouchableOpacity
                style={[s.modalBtn, { opacity: changing ? 0.6 : 1 }]}
                onPress={async () => {
                    try {
                        const e = newEmail.trim();
                        if (!e) return Alert.alert(t("common.errorTitle"), t("verifyemail.pleaseEnterEmail"));

                        const { data, errors } = await changeEmail({ variables: { email: e } });

                        if (errors?.length) throw new Error(errors[0]?.message ?? t("verifyemail.couldNotChangeEmail"));

                        setEditOpen(false);
                        setCode("");
                        setCooldown(30);

                        await apollo.resetStore();

                        Alert.alert(t("verifyemail.sentTitle"), t("verifyemail.newCodeSentBody"));
                        setTimeout(() => inputRef.current?.focus(), 250);
                    } catch (err: any) {
                        // ✅ HIER
                        const msg =
                        err?.networkError?.result?.errors?.[0]?.message ||
                        err?.message ||
                        t("verifyemail.couldNotChangeEmail");

                        if (msg === "EMAIL_ALREADY_IN_USE" || msg === "EMAIL_TAKEN") {
                        Alert.alert(t("verifyemail.emailAlreadyUsedTitle"), t("verifyemail.emailAlreadyUsedBody"));
                        return;
                        }

                        if (msg === "INVALID_EMAIL") {
                        Alert.alert(t("verifyemail.invalidEmailTitle"), t("verifyemail.invalidEmailBody"));
                        return;
                        }

                        Alert.alert(t("common.errorTitle"), String(msg));
                    }
                    }}

                disabled={changing}
                >
                {changing ? <ActivityIndicator /> : <Text style={s.modalBtnText}>{t("verifyemail.save")}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                style={[s.modalBtnGhost, { opacity: changing ? 0.6 : 1 }]}
                onPress={() => setEditOpen(false)}
                disabled={changing}
                >
                <Text style={s.modalBtnGhostText}>{t("verifyemail.cancel")}</Text>
                </TouchableOpacity>
            </View>
            </View>
        </View>
        )}

    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    box: { padding: 16, gap: 12 },

    title: {
      color: C.text,
      fontSize: 26,
      fontWeight: "900",
      marginBottom: 4,
    },

    subtitle: {
      color: C.subtext,
      lineHeight: 20,
      marginBottom: 10,
    },

    codeInput: {
      backgroundColor: C.card,
      color: C.text,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 54,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 6,
      textAlign: "center",
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

    btnText: { color: C.bg, fontWeight: "900" },

    linkBtn: {
      marginTop: 6,
      alignItems: "center",
      paddingVertical: 10,
    },

    linkText: {
      color: C.primary,
      fontWeight: "800",
    },

    hint: {
      color: C.subtext,
      textAlign: "center",
      marginTop: 6,
    },
    secondaryBtn: {
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    secondaryBtnText: {
      color: C.text,
      fontWeight: "800",
    },
    modalWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    },
    modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    },
    modalTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
    modalSub: { color: C.subtext, marginTop: 4, marginBottom: 10, lineHeight: 18 },
    modalRow: { flexDirection: "row", gap: 10, marginTop: 10 },
    modalBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.primaryBorder ?? C.border,
    },
    modalBtnText: { color: C.bg, fontWeight: "900" },
    modalBtnGhost: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    },
    modalBtnGhostText: { color: C.text, fontWeight: "800" },
    input: {
    backgroundColor: C.card,
    color: C.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    },


  });
