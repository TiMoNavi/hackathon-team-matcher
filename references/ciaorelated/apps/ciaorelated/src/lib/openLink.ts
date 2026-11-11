// src/lib/openLink.ts
import { Linking, Alert } from "react-native";
import i18n from "../i18n";

export async function openLink(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert(i18n.t("common.error"), i18n.t("openLink.cannotOpen", { url }));
    }
  } catch (err) {
    console.error("openLink error", err);
    Alert.alert(i18n.t("common.error"), i18n.t("openLink.failed"));
  }
}
