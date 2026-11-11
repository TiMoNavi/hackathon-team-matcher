import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";

import { UPLOAD_QUEUE } from "../../../graphql/queries/uploadQueue";

import { useTranslation } from "react-i18next";

export function UploadOverlay({ C }: { C: any }) {
  const { t } = useTranslation();

  const { data } = useQuery(UPLOAD_QUEUE, { fetchPolicy: "cache-only" });
  const queue = data?.uploadQueue ?? [];
  if (!queue.length) return null;

  const top = queue[0];

  return (
    <View style={styles(C).wrap}>
      <View style={styles(C).row}>
        {/* ✅ ICON statt Preview */}
        <View style={styles(C).iconWrap}>
          <Ionicons name="cloud-upload-outline" size={18} color={C.text} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles(C).title}>
            {t("uploadoverlay.yourPostIsCurrentlyBeingUploaded")}</Text>
          <Text style={styles(C).sub}>
            {top.text ?? t("uploadoverlay.keepAppOpen")}
          </Text>
        </View>

        <ActivityIndicator />
      </View>
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    wrap: {
      paddingHorizontal: 12,
      paddingBottom: 10,
      backgroundColor: C.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderRadius: 12,
      backgroundColor: C.card ?? C.bg2 ?? C.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.border,
    },
    title: {
      color: C.text,
      fontWeight: "700",
      fontSize: 13,
    },
    sub: {
      color: C.subtext,
      marginTop: 2,
      fontSize: 12,
    },
  });
