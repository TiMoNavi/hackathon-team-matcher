import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Share,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Switch,
} from "react-native";
import { useMutation } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../theme/ThemeProvider";
import { buildJoinUrl } from "../config/webLinks";

import { gql } from "@apollo/client";

import { useTranslation } from "react-i18next";

export const CREATE_GROUP_LINK = gql`
  mutation CreateGroupLink($title: String!, $type: GroupLinkType!, $visibility: GroupLinkVisibility!) {
    createGroupLink(title: $title, type: $type, visibility: $visibility) {
      id
      slug
      title
      type
      visibility
    }
  }
`;
const JOIN_GROUP = gql`
  mutation JoinGroup($slug: String!) {
    joinGroupLink(slug: $slug) {
      id
      title
    }
  }
`;


const TYPES = [
  { key: "COMMUNITY" },
  { key: "EVENT" },
  { key: "DROP" },
  { key: "UNI" },
  { key: "BUSINESS" },
  { key: "FAMILY" },
] as const;

function iconForType(type: string) {
  switch (type) {
    case "DROP":
      return "shirt-outline";
    case "EVENT":
      return "flash";
    case "COMMUNITY":
      return "people";
    case "UNI":
      return "school";
    case "BUSINESS":
      return "briefcase";
    case "FAMILY":
      return "home";
    default:
      return "albums-outline";
  }
}


export default function GroupLinkSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("COMMUNITY");
  const [isPublic, setIsPublic] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => makeStyles(C), [C]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  const [createGroupLink, { loading }] = useMutation(CREATE_GROUP_LINK);
  const [joinGroup] = useMutation(JOIN_GROUP);

  React.useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setKeyboardHeight(event.endCoordinates?.height ?? 0)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);


  const handleCreate = async () => {
    const res = await createGroupLink({
      variables: {
        title: title || t("grouplinksheet.invitationLinkFallbackTitle"),
        type,
        visibility: isPublic ? "PUBLIC" : "PRIVATE",
      },
    });


    const slug = res.data.createGroupLink.slug;
    await joinGroup({ variables: { slug } });
    const link = buildJoinUrl(slug);

    setCreatedLink(link);
    onCreated?.();

  };

  const shareLink = async () => {
    if (!createdLink) return;
    await Share.share({ message: createdLink });
  };

  const copyLink = async () => {
    if (!createdLink) return;
    await Clipboard.setStringAsync(createdLink);
    Alert.alert(t("common.copied"), t("grouplinksheet.linkCopied"));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        {keyboardHeight > 0 ? (
          <View pointerEvents="none" style={[styles.keyboardFill, { height: keyboardHeight }]} />
        ) : null}

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{t("grouplinksheet.liveAccess")}</Text>
              <Text style={styles.title}>{t("grouplinksheet.createAnInvitationLink")}</Text>
              <Text style={styles.subtitle}>{t("grouplinksheet.subtitle")}</Text>
            </View>
          </View>

          {!createdLink ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.types}
              >
                {TYPES.map((it) => {
                  const active = type === it.key;
                  return (
                    <TouchableOpacity
                      key={it.key}
                      onPress={() => setType(it.key as any)}
                      activeOpacity={0.85}
                      style={[
                        styles.typeButton,
                        { borderColor: active ? C.text : C.border, backgroundColor: active ? C.text : C.card },
                      ]}
                    >
                      <Ionicons
                        name={iconForType(it.key) as any}
                        size={15}
                        color={active ? C.bg : C.text}
                      />
                      <Text
                        style={[
                          styles.typeText,
                          { color: active ? C.bg : C.text },
                        ]}
                      >
                        {t(`grouplinksheet.type.${it.key.toLowerCase()}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TextInput
                maxLength={80}
                placeholder={t("grouplinksheet.titleEGUniversityComputerScience2026")}
                value={title}
                onChangeText={setTitle}
                style={styles.input}
                placeholderTextColor={C.subtext}
                returnKeyType="done"
              />

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <Ionicons name={isPublic ? "globe-outline" : "lock-closed-outline"} size={20} color={C.text} />
                <Text style={{ flex: 1, color: C.text, fontWeight: "600" }}>{t("communityprivacy.public")}</Text>
                <Switch value={isPublic} onValueChange={setIsPublic} disabled={loading} accessibilityLabel={t("communityprivacy.public")} />
              </View>
              <Text style={{ color: C.subtext, fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
                {t(isPublic ? "communityprivacy.publicDescription" : "communityprivacy.privateDescription")}
                {" "}{t("communityprivacy.fixed")}
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleCreate}
                disabled={loading}
              >
                <Ionicons name="link-outline" size={18} color={C.bg} />
                <Text style={styles.primaryText}>
                  {loading ? t("grouplinksheet.creating") : t("grouplinksheet.create")}
                </Text>

              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.successBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#36D399" />
                <Text style={styles.success}>{t("grouplinksheet.linkCreated")}</Text>
              </View>

              <View style={styles.linkBox}>
                <Text selectable numberOfLines={2} style={styles.linkText}>
                  {createdLink}
                </Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={shareLink}>
                  <Ionicons name="share-outline" size={18} color={C.text} />
                  <Text style={styles.actionText}>{t("grouplinksheet.share")}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtn} onPress={copyLink}>
                  <Ionicons name="copy-outline" size={18} color={C.text} />
                  <Text style={styles.actionText}>{t("grouplinksheet.copy")}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );

}

const makeStyles = (C: any) => StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  keyboardFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
  },
  sheetScroll: {
    width: "100%",
    flexGrow: 0,
    alignSelf: "stretch",
    maxHeight: "88%",
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 16,
  },
  eyebrow: { color: C.primary ?? C.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  title: { color: C.text, fontSize: 22, lineHeight: 27, fontWeight: "900", marginTop: 4 },
  subtitle: { color: C.subtext, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 5 },
  types: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    paddingRight: 4,
    marginBottom: 14,
  },
  typeButton: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeText: {
    fontWeight: "900",
    fontSize: 13,
  },
  input: {
    height: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 14,
    color: C.text,
    backgroundColor: C.card,
    fontWeight: "800",
  },
  primaryButton: {
    height: 50,
    backgroundColor: C.text,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryText: { color: C.bg, fontWeight: "900" },
  successBadge: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 },
  success: {
    color: C.text,
    fontWeight: "900",
  },
  linkBox: {
    padding: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    marginBottom: 14,
  },
  linkText: { color: C.text, fontWeight: "700" },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionText: { color: C.text, fontWeight: "900" },
});
