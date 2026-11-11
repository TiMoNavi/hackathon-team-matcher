// apps/ciaorelated/src/screens/components/ReportComment.tsx
import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { gql, useMutation } from "@apollo/client";

import { useTranslation } from "react-i18next";

const REPORT_CONTENT = gql`
  mutation ReportContent($input: ReportInput!) {
    reportContent(input: $input)
  }
`;

const REASONS = [
  { key: "HATE_SPEECH", labelKey: "reportcomment.reason.hateSpeech" },
  { key: "NUDITY",      labelKey: "reportcomment.reason.nudity" },
  { key: "VIOLENCE",    labelKey: "reportcomment.reason.violence" },
  { key: "SPAM",        labelKey: "reportcomment.reason.spam" },
  { key: "COPYRIGHT",   labelKey: "reportcomment.reason.copyright" },
];

export default function ReportComment({ commentId }: { commentId: string }) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [mutate, { loading }] = useMutation(REPORT_CONTENT);

  const submit = async (reasonKey: string) => {
    try {
      await mutate({ variables: { input: { commentId, reason: reasonKey } } });
      setOpen(false);
    } catch (e) {
      // optional: Toast/Alert
      setOpen(false);
    }
  };

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)}>
        <Text style={{ color: "#F87171", fontWeight: "700" }}>{t("reportcomment.report")}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill as any} onPress={() => setOpen(false)} />
          <View style={styles.menuBox}>
            {REASONS.map(r => (
              <TouchableOpacity key={r.key} style={[styles.menuItem, styles.menuItemBorder]} disabled={loading} onPress={() => submit(r.key)}>
                <Text style={[styles.menuText, { color: "#F87171", fontWeight: "700" }]}>{t(r.labelKey)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.menuItem} onPress={() => setOpen(false)}>
              <Text style={styles.menuText}>{t("reportcomment.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalBg:  { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuBox:  { backgroundColor: "#1F2937", borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingBottom: 24 },
  menuItem: { paddingVertical: 16, alignItems: "center" },
  menuItemBorder: { borderBottomColor: "#23262B", borderBottomWidth: StyleSheet.hairlineWidth },
  menuText: { fontSize: 16, color: "#fff" },
});
