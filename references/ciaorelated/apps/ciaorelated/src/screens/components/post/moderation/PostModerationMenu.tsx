import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, Alert } from "react-native";
import { gql, useMutation } from "@apollo/client";

import { useTranslation } from "react-i18next";

const REPORT_CONTENT = gql`
  mutation ReportContent($input: ReportInput!) {
    reportContent(input: $input)
  }
`;

const BLOCK_USER = gql`
  mutation BlockUser($userId: ID!) {
    blockUser(userId: $userId)
  }
`;

type Props = {
  visible: boolean;
  onClose: () => void;

  postId: string;
  authorId?: string | null;
  authorUsername?: string | null;

  isMine: boolean;
  onAfterModeration?: () => void;

  C?: {
    text?: string;
    border?: string;
    menuBg?: string;
  };
};

export function PostModerationMenu({
  visible,
  onClose,
  postId,
  authorId,
  authorUsername,
  isMine,
  onAfterModeration,
  C,
}: Props) {
  const { t } = useTranslation();

  const COLORS = {
    text: C?.text ?? "#E6ECFF",
    border: C?.border ?? "rgba(255,255,255,0.10)",
    menuBg: C?.menuBg ?? "#1F2937",
  };

  const [reportContent] = useMutation(REPORT_CONTENT);
  const [blockUser] = useMutation(BLOCK_USER);

  const reportWith = async (reason: string) => {
    await reportContent({ variables: { input: { postId, reason } } });
    Alert.alert(t("postmoderationmenu.reportSentTitle"), t("postmoderationmenu.reportSentBody"));
    onAfterModeration?.();
  };

  const openReportPicker = () => {
    onClose();
    Alert.alert(t("postmoderationmenu.reportTitle"), t("postmoderationmenu.pickReason"), [
      { text: t("postmoderationmenu.reason.hateSpeech"), onPress: () => reportWith("HATE_SPEECH") },
      { text: t("postmoderationmenu.reason.nudity"), onPress: () => reportWith("NUDITY") },
      { text: t("postmoderationmenu.reason.violence"), onPress: () => reportWith("VIOLENCE") },
      { text: t("postmoderationmenu.reason.spam"), onPress: () => reportWith("SPAM") },
      { text: t("postmoderationmenu.cancel"), style: "cancel" },
    ]);
  };

  const confirmBlock = () => {
    const uname = authorUsername ?? t("postmoderationmenu.unknownUser");
    onClose();
    Alert.alert(
      t("postmoderationmenu.blockTitle"),
      t("postmoderationmenu.blockBody", { username: uname }),
      [
        { text: t("postmoderationmenu.cancel"), style: "cancel" },
        {
          text: t("postmoderationmenu.blockAction"),
          style: "destructive",
          onPress: async () => {
            try {
              if (!authorId) return;
              await blockUser({ variables: { userId: authorId } });
              Alert.alert(t("postmoderationmenu.blockedTitle"), t("postmoderationmenu.blockedBody", { username: uname }));
              onAfterModeration?.();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("common.actionFailed"));
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBg}>
        <TouchableOpacity style={StyleSheet.absoluteFill as any} onPress={onClose} />
        <View style={[s.menuBox, { backgroundColor: COLORS.menuBg }]}>
          {!isMine && (
            <TouchableOpacity style={[s.menuItem, s.border, { borderBottomColor: COLORS.border }]} onPress={openReportPicker}>
              <Text style={[s.menuText, { color: "#F87171", fontWeight: "700" }]}>{t("postmoderationmenu.reportPost")}</Text>
            </TouchableOpacity>
          )}

          {!isMine && (
            <TouchableOpacity style={[s.menuItem, s.border, { borderBottomColor: COLORS.border }]} onPress={confirmBlock}>
              <Text style={[s.menuText, { color: "#F59E0B", fontWeight: "700" }]}>{t("postmoderationmenu.blockUsers")}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.menuItem} onPress={onClose}>
            <Text style={[s.menuText, { color: COLORS.text }]}>{t("postmoderationmenu.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuBox: { borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingBottom: 24 },
  menuItem: { paddingVertical: 16, alignItems: "center" },
  menuText: { fontSize: 16 },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
