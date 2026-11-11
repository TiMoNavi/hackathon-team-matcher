import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { brand } from "../../../config/brand";

type Label =
  | string
  | { text: string; icon?: React.ReactNode };

export function RotatingSuggestionLabel({
  C,
  labels,
}: {
  C: any;
  labels?: Label[];
}) {
  const [index, setIndex] = useState(0);

  const { t } = useTranslation();

  const LABELS =
  labels && labels.length
    ? labels
    : [
        t("rotatingsuggestionlabel.suggestedForYou"),
        t("rotatingsuggestionlabel.byciaorelated", { appName: brand.appName }),
      ];


  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const tick = () => {
      // 1) aktueller Text: nach unten raus + ausblenden
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 8, duration: 180, useNativeDriver: true }),
      ]).start(() => {
        // 2) Text wechseln + neuen Text oben "parken"
        setIndex((i) => (i + 1) % LABELS.length);
        translateY.setValue(-8);
        opacity.setValue(0);

        // 3) neuer Text: von oben nach unten rein + einblenden
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
      });
    };

    const interval = setInterval(tick, 4000);
    return () => clearInterval(interval);
  }, [opacity, translateY, LABELS.length]);

  const current = LABELS[index];

  return (
    <Animated.View style={{
        opacity,
        transform: [{ translateY }],
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
>
      {typeof current !== "string" && current.icon}
      <Text style={styles(C).text} numberOfLines={1}>
        {typeof current === "string" ? current : current.text}
      </Text>
    </Animated.View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    text: {
      fontSize: 12,
      lineHeight: 16,
      color: C.subtext ?? C.sub,
      textAlign: "left",
    },
  });
