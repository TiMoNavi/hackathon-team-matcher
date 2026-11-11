// apps/ciaorelated/src/screens/components/feed/FeedHeader.tsx
import React, { useMemo } from "react";
import { Animated, Modal, Pressable, Text, TouchableOpacity, View, StyleSheet, Platform } from "react-native";
import { useNavigation, type NavigationProp, useFocusEffect } from "@react-navigation/native";
import { gql, useQuery } from "@apollo/client";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { TopIconButton } from "./TopIconButton";
import { useTheme } from "../../../theme/ThemeProvider";
import { brand } from "../../../config/brand";

type RootStackParamList = {
  Activity: undefined;
  Messages: undefined;
  CreateMedia: { initialMode?: "BEITRAG" | "STORY"; nonce?: number } | undefined;
};

export type HomeFeedMode = "SONGVERWANDT" | "FOLLOWING";

// ✅ FIX: unreadCounts ist ein Objekt → selection set nötig
const UNREAD_COUNTS_Q = gql`
  query UnreadCounts {
    unreadCounts {
      inbox
      activity
    }
  }
`;

export function FeedHeader({
  mode = "SONGVERWANDT",
  onModeChange,
  detailMode = false,
}: {
  mode?: HomeFeedMode;
  onModeChange?: (mode: HomeFeedMode) => void;
  detailMode?: boolean;
}) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [modeOpen, setModeOpen] = React.useState(false);
  const [menuMounted, setMenuMounted] = React.useState(false);
  const menuAnim = React.useRef(new Animated.Value(0)).current;

  const C = theme.colors; // statt "as any"
  const s = React.useMemo(() => styles(C, theme.mode), [C, theme.mode]);

  
  const { data: notifData, refetch: refetchNotifs } = useQuery(UNREAD_COUNTS_Q, {
    fetchPolicy: "cache-and-network",
  });

  const activityBadge = useMemo(() => {
    const a = notifData?.unreadCounts?.activity ?? 0;
    return a > 0 ? a : undefined;
  }, [notifData?.unreadCounts?.activity]);


  // ✅ Wenn Push ankommt → Counts refreshen (auch wenn Screen nicht fokussiert ist)
  const onPush = React.useCallback(() => {
    refetchNotifs().catch(() => {});
  }, [refetchNotifs]);

  React.useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(onPush);
    return () => sub.remove();
  }, [onPush]);


  // ✅ Beim Fokus → Counts refreshen
  useFocusEffect(
    React.useCallback(() => {
      refetchNotifs().catch(() => {});
    }, [refetchNotifs])
  );

  const modeItems = useMemo(
    () => [
      {
        key: "SONGVERWANDT" as const,
        label: t("feed.modes.forYou"),
        icon: "sparkles-outline",
        hiddenInMenu: true,
      },
      {
        key: "FOLLOWING" as const,
        label: t("feed.modes.following"),
        icon: "people-outline",
      },
    ],
    [t]
  );

  const activeMode = modeItems.find((item) => item.key === mode) ?? modeItems[0];

  const selectMode = React.useCallback(
    (nextMode: HomeFeedMode) => {
      setModeOpen(false);
      onModeChange?.(nextMode);
    },
    [onModeChange]
  );

  const openModeMenu = React.useCallback(() => {
    setMenuMounted(true);
    setModeOpen(true);
  }, []);

  const closeModeMenu = React.useCallback(() => {
    setModeOpen(false);
  }, []);

  React.useEffect(() => {
    if (detailMode) {
      setModeOpen(false);
      setMenuMounted(false);
      menuAnim.setValue(0);
      return;
    }

    if (modeOpen) {
      setMenuMounted(true);
      Animated.spring(menuAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 260,
        mass: 0.7,
      }).start();
      return;
    }

    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMenuMounted(false);
    });
  }, [detailMode, menuAnim, modeOpen]);

  
  return (
    <View style={s.topBar}>
      {detailMode ? (
        <>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => onModeChange?.("SONGVERWANDT")}
            hitSlop={12}
            style={s.detailBackButton}
          >
            <Ionicons name="chevron-back" size={28} color={C.text} />
          </TouchableOpacity>

          <View pointerEvents="none" style={s.detailCenterTitle}>
            <Text style={s.detailTitle} numberOfLines={1}>
              {activeMode.label}
            </Text>
          </View>

          <View style={s.detailRightSlot} />
        </>
      ) : (
        <>
          <View style={s.leftSlot}>
            <View style={s.logoWrap}>
              <Text style={s.brandText} numberOfLines={1}>
                {brand.feedHeaderText}
              </Text>
            </View>
          </View>

          <View style={s.headerActions}>
            <TopIconButton
              icon="heart"
              iconLib="ion"
              onPress={() => navigation.navigate("Activity")}
              testID="btn-activity"
              badge={activityBadge}
              color={C.text}
              bgColor="transparent"
              borderColor="transparent"
              badgeBorderColor={C.bg}
              iconSize={22}
            />
          </View>
        </>
      )}

      {!detailMode && (
        <View pointerEvents="box-none" style={s.centerAnchor}>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={openModeMenu}
            style={s.centerModeButton}
          >
            <Text style={s.modeLabel} numberOfLines={1}>
              {activeMode.label}
            </Text>
            <Ionicons name="chevron-down" size={20} color={C.text} style={s.modeChevron} />
          </TouchableOpacity>
        </View>
      )}

      {!detailMode && <Modal
        visible={menuMounted}
        transparent
        animationType="none"
        onRequestClose={closeModeMenu}
      >
        <Pressable style={s.modeOverlay} onPress={closeModeMenu}>
          <Animated.View
            style={[
              s.modeMenu,
              {
                opacity: menuAnim,
                transform: [
                  {
                    translateY: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                  {
                    scale: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.76, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {modeItems.filter((item) => !item.hiddenInMenu).map((item) => {
              const active = item.key === mode;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.86}
                  onPress={() => selectMode(item.key)}
                  style={s.modeMenuItem}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={24}
                    color={active ? C.primary : C.text}
                  />
                  <Text
                    style={[
                      s.modeMenuText,
                      { color: active ? C.primary : C.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </Pressable>
      </Modal>}
    </View>
  );
}

const styles = (C: any, mode?: string) =>
  StyleSheet.create({
    topBar: {
      height: Platform.OS === "android" ? 64 : 52,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.bg,
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    leftSlot: {
      width: 92,
      minWidth: 92,
      alignItems: "flex-start",
      justifyContent: "center",
      zIndex: 2,
    },
    logoWrap: {
      alignSelf: "flex-start",
      minHeight: Platform.OS === "android" ? 52 : 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    centerAnchor: {
      position: "absolute",
      left: 0,
      right: 0,
      top: Platform.OS === "android" ? 11 : 5,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    centerModeButton: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      transform: [{ translateX: 4 }],
    },
    brandText: {
      color: C.text,
      fontFamily: "Pacifico",
      fontSize: 26,
      fontWeight: "400",
      letterSpacing: 0,
      lineHeight: Platform.OS === "android" ? 52 : 42,
      maxWidth: 132,
      marginTop: 0,
    },
    createPlusText: {
      color: C.text,
      fontSize: 30,
      fontWeight: "500",
      letterSpacing: 0,
      lineHeight: 42,
      marginTop: 0,
    },
    modeLabel: {
      color: C.text,
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: 0,
      lineHeight: 27,
      textDecorationLine: "underline",
    },
    modeChevron: {
      marginTop: 3,
    },
    headerActions: {
      width: 92,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 6,
      zIndex: 2,
    },
    detailBackButton: {
      width: 44,
      height: 44,
      alignItems: "flex-start",
      justifyContent: "center",
      zIndex: 2,
    },
    detailCenterTitle: {
      position: "absolute",
      left: 64,
      right: 64,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    detailRightSlot: {
      width: 44,
      height: 44,
      zIndex: 2,
    },
    detailTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: 0,
      maxWidth: 230,
    },
    modeOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.08)",
      paddingTop: 88,
      paddingHorizontal: 18,
      alignItems: "center",
    },
    modeMenu: {
      minWidth: 230,
      borderRadius: 26,
      paddingVertical: 12,
      backgroundColor: mode === "dark" ? "rgba(30,32,38,0.74)" : "rgba(255,255,255,0.72)",
      borderColor: mode === "dark" ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.62)",
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: "#000",
      shadowOpacity: mode === "dark" ? 0.34 : 0.16,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
    modeMenuItem: {
      minHeight: 58,
      paddingHorizontal: 22,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    modeMenuText: {
      fontSize: 21,
      fontWeight: "700",
    },
  });
