import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { gql, useMutation } from "@apollo/client";
import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

const REQ_RESET = gql`
  mutation RequestPasswordResetCode($emailOrUsername: String!) {
    requestPasswordResetCode(emailOrUsername: $emailOrUsername)
  }
`;

export default function ResetPasswordRequestScreen({ route, navigation }: any) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C), [C]);

  const asAddAccount = route.params?.asAddAccount ?? false;

  const [value, setValue] = useState("");
  const [req, { loading }] = useMutation(REQ_RESET, { errorPolicy: "all" });

  const onSubmit = async () => {
    const v = value.trim();
    if (!v) return Alert.alert(t("common.error"), t("resetpasswordrequest.validation"));

    try {
      const { errors } = await req({ variables: { emailOrUsername: v } });
      if (errors?.length) throw new Error(errors[0]?.message ?? t("common.error"));

      
      Alert.alert(
        t("resetpasswordrequest.codeSentTitle"),
        t("resetpasswordrequest.codeSentMessage")
      );


      navigation.replace("ResetPassword", { asAddAccount, emailOrUsername: v });

    } catch (e: any) {
      Alert.alert(t("common.error"), String(e?.message ?? t("resetpasswordrequest.errors.fallback")));
    }
  };

  const can = value.trim().length > 0 && !loading;

  return (
    <Screen
      backgroundColor={C.bg}
      barStyle="light-content"
      headerTitle={t("resetpasswordrequest.resetPassword")}
      showBack
      onBack={() => navigation.goBack()}
    >
      <View style={s.box}>
        <Text style={s.title}>{t("resetpasswordrequest.requestCode")}</Text>

        <TextInput
          placeholder={t("resetpasswordrequest.emailOrUsername")}
          placeholderTextColor={C.subtext}
          value={value}
          onChangeText={setValue}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity style={[s.btn, !can && { opacity: 0.6 }]} disabled={!can} onPress={onSubmit}>
          {loading ? <ActivityIndicator color={C.text} /> : <Text style={s.btnText}>{t("resetpasswordrequest.sendCode")}</Text>}
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
