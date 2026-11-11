// apps/ciaorelated/src/screens/BannedScreen.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Auth } from "../lib/auth";

import { useTranslation } from "react-i18next";

export default function BannedScreen() {
  const { t } = useTranslation();

  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const untilISO: string | null = route?.params?.untilISO ?? null;
  const reason: string | null = route?.params?.reason ?? null;

  const onLogout = async () => {
    try { await Auth.clear?.(); } catch {}
    nav.reset({ index: 0, routes: [{ name: "Auth" }] });
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{t("banned.accountLocked")}</Text>
      <Text style={s.text}>
        {t("banned.youHaveBeenLoggedOutAndAreLoggedOutUb67cca")}{" "}
        <Text style={s.bold}>{untilISO ? new Date(untilISO).toLocaleString() : "—"}</Text>{" "}
        {t("banned.blocked")}</Text>
      {!!reason && <Text style={[s.text, { marginTop: 8 }]}>Grund: {reason}</Text>}

      <TouchableOpacity onPress={onLogout} style={s.btn}>
        <Text style={s.btnText}>{t("banned.okayLogOut")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0B0B0B", padding: 24, justifyContent: "center" },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", marginBottom: 12 },
  text: { color: "#ddd", fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: "800", color: "#fff" },
  btn: { marginTop: 24, backgroundColor: "#262626", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
