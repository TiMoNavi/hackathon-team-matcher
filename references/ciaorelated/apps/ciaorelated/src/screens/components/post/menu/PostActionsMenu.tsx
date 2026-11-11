import React from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert } from "react-native";

import { useTranslation } from "react-i18next";

type ColorsLike = {
  bg?: string;
  text?: string;
  subtext?: string;
  border?: string;
};

export type PostMenuActionHandlers = {
  // Owner
  onEdit?: () => void;
  onDelete?: () => void;

  // Everyone (non-owner)
  onReport?: () => void;
  onBlockUser?: () => void;

  // Shared/extra
  onRemoveTag?: () => void;

  // ✅ unify toggle
  onToggleGridVisibility?: () => void;

  onShareToStory?: () => void;
};

export type PostActionsMenuProps = {
  visible: boolean;
  onClose: () => void;

  showEdit?: boolean;
  showDelete?: boolean;

  showRemoveTag?: boolean;

  // ✅ show one unified toggle row
  showToggleGridVisibility?: boolean;

  // ✅ dynamic label for that row
  gridToggleLabel?: string;

  showReport?: boolean;
  showBlock?: boolean;

  showShareToStory?: boolean;

  C: ColorsLike;
  handlers: PostMenuActionHandlers;
};

export function PostActionsMenu({
  visible,
  onClose,
  C,
  handlers,
  showEdit,
  showDelete,
  showRemoveTag,
  showToggleGridVisibility,
  gridToggleLabel,
  showReport,
  showBlock,
  showShareToStory,
}: PostActionsMenuProps) {
  const { t } = useTranslation();

  const onPress = (fn?: () => void) => {
    onClose();
    requestAnimationFrame(() => fn?.());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill as any} onPress={onClose} />
        <View
          style={[
            s.sheet,
            {
              backgroundColor: C?.bg ?? "#1F2937",
              borderColor: C?.border ?? "rgba(255,255,255,0.12)",
            },
          ]}
        >
          {showEdit && (
            <TouchableOpacity style={[s.item, s.divider]} onPress={() => onPress(handlers.onEdit)}>
              <Text style={[s.txt, { color: C?.text ?? "#fff", fontWeight: "700" }]}>
                {t("postactionsmenu.editPost")}</Text>
            </TouchableOpacity>
          )}

          {showDelete && (
            <TouchableOpacity
              style={[s.item, s.divider]}
              onPress={() => {
                onClose();
                Alert.alert(
                  t("postactionsmenu.alert.deleteTitle"),
                  t("postactionsmenu.alert.deleteBody"),
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("postactionsmenu.delete"),
                      style: "destructive",
                      onPress: () => handlers.onDelete?.(),
                    },
                  ]
                );
              }}
            >
              <Text style={[s.txt, { color: "#EF4444", fontWeight: "800" }]}>
                {t("postactionsmenu.delete")}
              </Text>
            </TouchableOpacity>
          )}

          {showRemoveTag && (
            <TouchableOpacity style={[s.item, s.divider]} onPress={() => onPress(handlers.onRemoveTag)}>
              <Text style={[s.txt, { color: "#F59E0B", fontWeight: "800" }]}>
                {t("postactionsmenu.removeMarker")}</Text>
            </TouchableOpacity>
          )}

          {/* ✅ unified toggle row with dynamic label */}
          {showToggleGridVisibility && (
            <TouchableOpacity
              style={[s.item, s.divider]}
              onPress={() => onPress(handlers.onToggleGridVisibility)}
            >
              <Text style={[s.txt, { color: C?.text ?? "#fff", fontWeight: "800" }]}>
                {gridToggleLabel ?? t("postactionsmenu.toggleGridVisibility")}
              </Text>
            </TouchableOpacity>
          )}


          {showReport && (
            <TouchableOpacity style={[s.item, s.divider]} onPress={() => onPress(handlers.onReport)}>
              <Text style={[s.txt, { color: "#F87171", fontWeight: "800" }]}>{t("postactionsmenu.reportPost")}</Text>
            </TouchableOpacity>
          )}

          {showBlock && (
            <TouchableOpacity style={[s.item, s.divider]} onPress={() => onPress(handlers.onBlockUser)}>
              <Text style={[s.txt, { color: "#F87171", fontWeight: "800" }]}>{t("postactionsmenu.blockUsers")}</Text>
            </TouchableOpacity>
          )}
          {showShareToStory && (
            <TouchableOpacity style={[s.item, s.divider]} onPress={() => onPress(handlers.onShareToStory)}>
              <Text style={[s.txt, { color: C?.text ?? "#fff", fontWeight: "800" }]}>
                {t("postactionsmenu.shareAsStory")}</Text>
            </TouchableOpacity>
          )}


          <TouchableOpacity style={s.item} onPress={onClose}>
            <Text style={[s.txt, { color: C?.text ?? "#fff" }]}>{t("postactionsmenu.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { paddingVertical: 16, alignItems: "center" },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.10)" },
  txt: { fontSize: 16 },
});
