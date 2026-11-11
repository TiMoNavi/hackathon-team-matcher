import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";

import {
  CHECK_PHONE_AVAILABILITY,
  REQUEST_PHONE_LOGIN_CODE,
  VERIFY_PHONE_LOGIN_CODE,
} from "../../graphql/mutations/auth";

type AuthUser = {
  id: string;
  username?: string | null;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
  account?: { id?: string | null };
};

function friendlyPhoneError(message: unknown, t: (key: string) => string, fallback: string) {
  const raw = String(message ?? "");
  if (raw.includes("PHONE_ACCOUNT_NOT_FOUND")) return t("phoneAuth.noAccountBody");
  if (raw.includes("INVALID_PHONE_NUMBER")) return t("phoneAuth.errors.invalidPhoneNumber");
  if (raw.includes("INVALID_CODE_OR_EXPIRED")) return t("phoneAuth.errors.invalidCode");
  if (raw.includes("TOO_MANY_ATTEMPTS")) return t("phoneAuth.errors.tooManyAttempts");
  return raw || fallback;
}

export default function PhoneAuthForm({
  mode,
  colors,
  onAuthenticated,
}: {
  mode: "login" | "register";
  colors: any;
  onAuthenticated: (payload: { token: string; user: AuthUser }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const [phoneMissing, setPhoneMissing] = useState(false);
  const [availabilityCheckedFor, setAvailabilityCheckedFor] = useState("");

  const [requestCode, requestState] = useMutation(REQUEST_PHONE_LOGIN_CODE, {
    errorPolicy: "all",
    onError: () => {},
  });
  const [checkPhone, checkState] = useMutation(CHECK_PHONE_AVAILABILITY, {
    errorPolicy: "all",
    onError: () => {},
  });
  const [verifyCode, verifyState] = useMutation(VERIFY_PHONE_LOGIN_CODE, {
    errorPolicy: "all",
    onError: () => {},
  });

  const s = useMemo(() => styles(colors), [colors]);
  const busy = requestState.loading || verifyState.loading || checkState.loading;
  const cleanPhone = phoneNumber.trim();
  const cleanCode = code.trim();
  const cleanUsername = username.trim();
  const cleanName = name.trim();

  const canRequest = cleanPhone.length >= 8 && !phoneTaken && !phoneMissing && !busy;
  const canVerify =
    cleanPhone.length >= 8 &&
    /^\d{6}$/.test(cleanCode) &&
    (mode === "login" || cleanUsername.length > 0) &&
    !busy;

  async function handleRequestCode() {
    try {
      if (availabilityCheckedFor !== cleanPhone) {
        const { data, errors } = await checkPhone({ variables: { phoneNumber: cleanPhone } });
        if (errors?.length) throw new Error(errors[0]?.message ?? t("phoneAuth.errors.availabilityFailed"));
        const available = data?.checkPhoneAvailability === true;
        setAvailabilityCheckedFor(cleanPhone);

        if (mode === "login" && available) {
          setPhoneMissing(true);
          Alert.alert(t("phoneAuth.noAccountTitle"), t("phoneAuth.noAccountBody"));
          return;
        }

        if (mode === "register" && !available) {
          setPhoneTaken(true);
          Alert.alert(t("phoneAuth.phoneTakenTitle"), t("phoneAuth.phoneTakenBody"));
          return;
        }
      }

      const { errors } = await requestCode({ variables: { phoneNumber: cleanPhone } });
      if (errors?.length) throw new Error(errors[0]?.message ?? t("phoneAuth.errors.requestFailed"));
      setCodeRequested(true);
      Alert.alert(t("phoneAuth.codeSentTitle"), t("phoneAuth.codeSentBody"));
    } catch (error: any) {
      Alert.alert(t("common.error"), friendlyPhoneError(error?.message, t, t("phoneAuth.errors.requestFailed")));
    }
  }

  async function handleVerifyCode() {
    try {
      const { data, errors } = await verifyCode({
        variables: {
          phoneNumber: cleanPhone,
          code: cleanCode,
          username: mode === "register" ? cleanUsername : null,
          name: mode === "register" ? cleanName || null : null,
        },
        context: {
          headers: {
            authorization: undefined as any,
            "x-profile-id": undefined as any,
          },
        },
      });
      if (errors?.length) throw new Error(errors[0]?.message ?? t("phoneAuth.errors.verifyFailed"));

      const token = data?.verifyPhoneLoginCode?.token;
      const user = data?.verifyPhoneLoginCode?.user;
      if (!token || !user?.id || !user?.account?.id) {
        throw new Error(t("phoneAuth.errors.invalidResponse"));
      }

      await onAuthenticated({ token, user });
    } catch (error: any) {
      Alert.alert(t("common.error"), friendlyPhoneError(error?.message, t, t("phoneAuth.errors.verifyFailed")));
    }
  }

  return (
    <View style={s.wrap}>
      <TextInput
        placeholder={t("phoneAuth.phonePlaceholder")}
        placeholderTextColor={colors.subtext}
        value={phoneNumber}
        onChangeText={(value) => {
          setPhoneNumber(value);
          setPhoneTaken(false);
          setPhoneMissing(false);
          setAvailabilityCheckedFor("");
          setCodeRequested(false);
          setCode("");
        }}
        style={s.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <Text style={s.hint}>{t("phoneAuth.internationalHint")}</Text>
      {phoneTaken ? <Text style={s.errorText}>{t("phoneAuth.phoneTakenInline")}</Text> : null}
      {phoneMissing ? <Text style={s.errorText}>{t("phoneAuth.noAccountInline")}</Text> : null}

      {mode === "register" ? (
        <>
          <TextInput
            placeholder={t("register.userName")}
            placeholderTextColor={colors.subtext}
            value={username}
            onChangeText={setUsername}
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            placeholder={t("register.nameOptional")}
            placeholderTextColor={colors.subtext}
            value={name}
            onChangeText={setName}
            style={s.input}
            autoCorrect={false}
          />
        </>
      ) : (
        <Text style={s.hint}>{t("phoneAuth.loginHint")}</Text>
      )}

      {codeRequested ? (
        <TextInput
          placeholder={t("phoneAuth.codePlaceholder")}
          placeholderTextColor={colors.subtext}
          value={code}
          onChangeText={setCode}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
        />
      ) : null}

      <TouchableOpacity
        style={[s.btn, !(codeRequested ? canVerify : canRequest) && { opacity: 0.6 }]}
        onPress={codeRequested ? handleVerifyCode : handleRequestCode}
        disabled={!(codeRequested ? canVerify : canRequest)}
        activeOpacity={0.85}
      >
        {busy ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={s.btnText}>
            {codeRequested ? t("phoneAuth.verifyCode") : t("phoneAuth.sendCode")}
          </Text>
        )}
      </TouchableOpacity>

      {codeRequested ? (
        <TouchableOpacity onPress={handleRequestCode} disabled={!canRequest} style={s.resend}>
          <Text style={s.resendText}>{t("phoneAuth.resendCode")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    wrap: {
      gap: 12,
    },
    input: {
      backgroundColor: C.card,
      color: C.text,
      letterSpacing: 0,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    hint: {
      color: C.subtext,
      fontSize: 13,
      lineHeight: 18,
    },
    errorText: {
      color: C.danger,
      fontSize: 13,
      fontWeight: "800",
      marginTop: -6,
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
    resend: {
      alignSelf: "center",
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    resendText: {
      color: C.primary,
      fontWeight: "800",
    },
  });
