import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { avatarPlaceholder } from "../../../assets/placeholders";
import { brand } from "../../config/brand";

import { useTranslation } from "react-i18next";

type Colors = {
  bg: string;
  text: string;
  subtext: string;
  border: string;
  card: string;
  primary: string;
  danger?: string;
};

type Profile = { id: string; username: string; avatarThumbUrl?: string | null; avatarUrl?: string | null };

type Session = {
  sessionId: string;
  username?: string | null;
  avatarThumbUrl?: string | null;
  avatarUrl?: string | null;
};

function norm(s?: string | null) {
  const x = (s ?? "").trim();
  return x.length ? x : null;
}

const isHttp = (s?: string | null) => {
  const x = (s ?? "").trim();
  return x.startsWith("http://") || x.startsWith("https://");
};

function avatarSource(thumb?: string | null, full?: string | null) {
  const t = (thumb ?? "").trim();
  const f = (full ?? "").trim();
  if (isHttp(t)) return { uri: t };
  if (isHttp(f)) return { uri: f };
  return avatarPlaceholder;
}
// verhindert “popp”, wenn signed URL bei jedem Open neu ist
function stableUri(next?: string | null) {
  return (next ?? "").trim() || null;
}


export default function ProfileSwitcherModal({
  visible,
  onClose,

  COLORS,

  activeProfile,
  otherProfiles,

  sessions,

  isRemoving,
  isRemovingId,

  onActivateProfile,
  onActivateSession,
  onRemoveSession,

  onAddAccount,
}: {
  visible: boolean;
  onClose: () => void;

  COLORS: Colors;

  activeProfile: Profile | null;
  otherProfiles: Profile[];

  sessions: Session[];

  isRemoving: boolean;
  isRemovingId: (sessionId: string) => boolean;

  onActivateProfile: (profileId: string) => void;
  onActivateSession: (sessionId: string) => void;
  onRemoveSession: (sessionId: string) => void;

  onAddAccount: () => void;
}) {
  const { t } = useTranslation();

  const s = styles(COLORS);
  


  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose} />

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={s.sheet}>
          <View style={s.grabber} />

          <Text style={s.sectionTitle}>{t("profileswitchermodal.thisAccount")}</Text>

          {activeProfile && (
            <View style={[s.row, s.activeRow]}>
              <Image
                source={avatarSource(activeProfile.avatarThumbUrl, activeProfile.avatarUrl)}
                style={s.avatar}
                cachePolicy="disk"
                transition={80}
              />
              <View style={s.rowBody}>
                <Text style={s.name} numberOfLines={1}>
                  {activeProfile.username}
                </Text>
                <Text style={s.badge}>{t("profileswitchermodal.active")}</Text>
              </View>
              <View style={s.iconSlot}>
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              </View>
            </View>
          )}

          {otherProfiles.map((p) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [s.row, s.pressableRow, pressed && { opacity: 0.75 }]}
              onPress={() => onActivateProfile(p.id)}
            >
              <Image
                source={avatarSource(p.avatarThumbUrl, p.avatarUrl)}
                style={s.avatar}
                cachePolicy="disk"
                transition={80}
              />
              <View style={s.rowBody}>
                <Text style={s.name} numberOfLines={1}>
                  {p.username}
                </Text>
              </View>
              <View style={s.iconSlot}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
              </View>
            </Pressable>
          ))}

          <View style={s.divider} />

          <Text style={s.sectionTitle}>{t("profileswitchermodal.otherAccountsOnThisDevice")}</Text>

          <ScrollView style={s.sessionsList} contentContainerStyle={{ paddingBottom: 4 }}>
            {sessions.length === 0 ? (
              <Text style={s.emptyText}>
                {t("profileswitchermodal.noOtherAccountsSaved")}</Text>
            ) : (
              sessions.map((sess) => (
                <View key={sess.sessionId} style={[s.row, s.pressableRow]}>
                  <Pressable
                    style={s.sessionPressable}
                    onPress={() => {
                      if (isRemoving) return;
                      onActivateSession(sess.sessionId);
                    }}
                  >
                    <Image
                      source={avatarSource(sess.avatarThumbUrl, sess.avatarUrl)}
                      style={s.avatar}
                      cachePolicy="disk"
                      transition={80}
                    />
                    <View style={s.rowBody}>
                      <Text style={s.name} numberOfLines={1}>
                        {sess.username ?? t("profileswitchermodal.unnamed")}
                      </Text>
                    </View>
                    <View style={s.iconSlot}>
                      <Ionicons name="chevron-forward" size={18} color={COLORS.subtext} />
                    </View>
                  </Pressable>

                  <TouchableOpacity
                    onPress={() => onRemoveSession(sess.sessionId)}
                    hitSlop={8}
                    disabled={isRemovingId(sess.sessionId)}
                    style={s.removeButton}
                  >
                    <Text style={s.removeText}>
                      {isRemovingId(sess.sessionId) ? "…" : t("profileswitchermodal.remove")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          {/* CTA: Add account */}
          <TouchableOpacity
            style={s.addAccountRow}
            activeOpacity={0.8}
            onPress={onAddAccount}
            accessibilityRole="button"
            accessibilityLabel={t("profileswitchermodal.addciaorelatedAccount", { appName: brand.appName })}
          >
            <Ionicons name="add" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
            <Text style={s.addAccountText}>{t("profileswitchermodal.addciaorelatedAccount", { appName: brand.appName })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = (C: Colors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },

    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: C.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      maxHeight: "85%",
      elevation: 20,
      shadowColor: "#000",
      shadowOpacity: 0.32,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -4 },
    },

    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginTop: 0,
      marginBottom: 14,
    },

    sectionTitle: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 8,
      paddingHorizontal: 2,
      textTransform: "uppercase",
    },

    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 14,
      backgroundColor: C.bg,
    },

    activeRow: {
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 6,
    },

    pressableRow: {
      marginBottom: 2,
    },

    avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: C.card },

    rowBody: {
      flex: 1,
      minWidth: 0,
    },

    iconSlot: {
      width: 28,
      alignItems: "flex-end",
      justifyContent: "center",
      flexShrink: 0,
    },

    name: { color: C.text, fontSize: 16, fontWeight: "700" },
    badge: { color: C.primary, fontSize: 12, fontWeight: "800", marginTop: 1 },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 12 },

    sessionsList: { maxHeight: 5 * 58 },
    emptyText: { color: C.subtext, paddingHorizontal: 2, marginBottom: 6 },
    sessionPressable: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
    },
    removeButton: {
      minWidth: 82,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      flexShrink: 0,
    },
    removeText: {
      color: C.danger ?? "#ef4444",
      fontSize: 13,
      fontWeight: "800",
      lineHeight: 15,
    },

    addAccountRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 46,
      paddingVertical: 0,
      paddingHorizontal: 12,
      marginTop: 12,
      marginBottom: 0,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    addAccountText: {
      fontSize: 16,
      fontWeight: "800",
      color: C.primary,
      lineHeight: 18,
    },
  });
