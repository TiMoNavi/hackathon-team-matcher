// apps/ciaorelated/src/screens/components/CommentInput.tsx
import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

type Props = {
  onSend: (text: string) => void;
  placeholder?: string;
  C?: {
    text?: string;
    subtext?: string;
    primary?: string;
  };
};

export const CommentInput = ({
  onSend,
  placeholder,
  C,
}: Props) => {
  const [text, setText] = useState("");
  const { t } = useTranslation();

  const resolvedPlaceholder = placeholder ?? t("commentsinput.placeholder");

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <View style={s.wrap}>
      <TextInput
        style={[
          s.input,
          {
            color: C?.text ?? "#111",
          },
        ]}
        value={text}
        onChangeText={setText}
        placeholder={resolvedPlaceholder}
        placeholderTextColor={C?.subtext ?? "#9CA3AF"}
        returnKeyType="send"
        onSubmitEditing={send}
      />

      <TouchableOpacity
        onPress={send}
        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
      >
        <Text style={[s.send, { color: C?.primary ?? "#2563EB" }]}>
          {t("commentsinput.send")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  input: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,

    backgroundColor: "transparent", // 🔑 wichtig
    borderWidth: 0,                 // 🔑 wichtig
  },

  send: {
    fontWeight: "700",
    fontSize: 14,
  },
});
