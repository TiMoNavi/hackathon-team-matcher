import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { gql, useMutation } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";
import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

const RESET = gql`
  mutation ResetPasswordWithCode($emailOrUsername: String!, $code: String!, $newPassword: String!) {
    resetPasswordWithCode(emailOrUsername: $emailOrUsername, code: $code, newPassword: $newPassword)
  }
`;

export default function ResetPasswordScreen({ route, navigation }: any) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C), [C]);

  const asAddAccount = route.params?.asAddAccount ?? false;
  const preset = route.params?.emailOrUsername ?? "";

  const [emailOrUsername, setId] = useState(preset);
  const [code, setCode] = useState("");
  const [newPassword, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [mut, { loading }] = useMutation(RESET, { errorPolicy: "all" });

  const onSubmit = async () => {
    const id = emailOrUsername.trim();
    const c = code.trim();
    if (!id || !c || newPassword.length < 8) {
      Alert.alert(t("common.error"), t("resetpassword.validation"));
      return;
    }

    try {
      const { errors } = await mut({ variables: { emailOrUsername: id, code: c, newPassword } });
      if (errors?.length) throw new Error(errors[0]?.message ?? t("common.error"));

      Alert.alert(t("resetpassword.successTitle"), t("resetpassword.successBody"));

      // zurück zu Login (im selben AuthStack)
      navigation.reset({
        index: 0,
        routes: [{ name: "Login", params: { asAddAccount } }],
        });

    } catch (e: any) {
      Alert.alert(t("common.error"), String(e?.message ?? t("resetpassword.errors.fallback")));
    }
  };

  const can = emailOrUsername.trim() && code.trim() && newPassword.length >= 8 && !loading;

  return (
    <Screen
      backgroundColor={C.bg}
      barStyle="light-content"
      headerTitle={t("resetpassword.newPassword")}
      showBack
      onBack={() => navigation.goBack()}
    >
      <View style={s.box}>
        <Text style={s.title}>{t("resetpassword.changePassword")}</Text>

        <TextInput
          placeholder={t("resetpassword.emailOrUsername")}
          placeholderTextColor={C.subtext}
          value={emailOrUsername}
          onChangeText={setId}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          placeholder={t("resetpassword.n6DigitCode")}
          placeholderTextColor={C.subtext}
          value={code}
          onChangeText={setCode}
          style={s.input}
          keyboardType="number-pad"
        />

        <View style={s.pwWrap}>
          <TextInput
            placeholder={t("resetpassword.newPasswordMin8Characters")}
            placeholderTextColor={C.subtext}
            value={newPassword}
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

        <TouchableOpacity style={[s.btn, !can && { opacity: 0.6 }]} disabled={!can} onPress={onSubmit}>
          {loading ? <ActivityIndicator color={C.text} /> : <Text style={s.btnText}>{t("resetpassword.savePassword")}</Text>}
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    box: { padding: 16, gap: 12 },
    title: { color: C.text, fontSize: 22, fontWeight: "800", marginBottom: 8 },

    input: {
      backgroundColor: C.card,
      color: C.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },

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
    pwInput: { flex: 1, color: C.text, height: 44, paddingVertical: 0 },
    pwIcon: { height: 44, justifyContent: "center", alignItems: "center", paddingLeft: 10 },

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
    btnText: { color: C.bg, fontWeight: "800" },
  });
