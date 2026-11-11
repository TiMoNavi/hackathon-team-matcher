// apps/ciaorelated/src/lib/safeHaptics.ts
import { Platform } from "react-native";
let Haptics: typeof import("expo-haptics") | null = null;

try {
  Haptics = require("expo-haptics");
} catch {
  Haptics = null;
}

const canUse = Platform.OS !== "web" && !!Haptics;

export function hapticImpact() {
  if (!canUse) return;
  try {
    Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Medium);
  } catch (e) {
    console.warn("haptics impact failed", e);
  }
}

export function hapticSelection() {
  if (!canUse) return;
  try {
    Haptics!.selectionAsync();
  } catch (e) {
    console.warn("haptics selection failed", e);
  }
}

export function hapticSuccess() {
  if (!canUse) return;
  try {
    Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Success);
  } catch (e) {
    console.warn("haptics success failed", e);
  }
}
