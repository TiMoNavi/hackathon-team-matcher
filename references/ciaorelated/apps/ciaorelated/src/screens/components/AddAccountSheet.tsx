import React from "react";
import { Modal, Pressable, View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { useTranslation } from "react-i18next";

type Colors = {
  bg: string;
  text: string;
  subtext: string;
  border: string;
  card: string;
  primary: string;
};

export default function AddAccountSheet({
  visible,
  onClose,
  COLORS,
  onLogin,
  onRegister,
}: {
  visible: boolean;
  onClose: () => void;
  COLORS: Colors;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const { t } = useTranslation();

  const s = styles(COLORS);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />

      <View style={s.sheet}>
        <View style={s.grabber} />

        <Text style={s.title}>{t("addaccountsheet.addAccount")}</Text>

        <TouchableOpacity style={s.button} onPress={onLogin} activeOpacity={0.82}>
          <Text style={s.buttonText}>{t("addaccountsheet.logInToAnExistingAccount")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.button} onPress={onRegister} activeOpacity={0.82}>
          <Text style={s.buttonText}>{t("addaccountsheet.createNewAccount")}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = (C: Colors) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },

    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
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
      marginBottom: 14,
    },

    title: {
      fontSize: 18,
      fontWeight: "900",
      color: C.text,
      marginBottom: 14,
    },

    button: {
      minHeight: 46,
      backgroundColor: C.card,
      paddingVertical: 0,
      paddingHorizontal: 12,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 8,
    },
    buttonText: {
      color: C.text,
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 16,
    },
  });
