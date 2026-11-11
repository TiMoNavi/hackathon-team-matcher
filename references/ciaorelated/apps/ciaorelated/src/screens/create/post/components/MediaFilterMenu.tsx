import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  Text as RNText,
  FlatList,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTranslation } from "react-i18next";

export type MediaFilterMode = "recent" | "videos" | "favorites" | "albums";

export type MediaAlbum = {
  id: string;
  title: string;
  assetCount?: number;
};

function labelFor(mode: MediaFilterMode) {
  switch (mode) {
    case "recent":
      return "Neuste";
    case "videos":
      return "Videos";
    case "favorites":
      return "Favoriten";
    case "albums":
      return "Alle Alben";
  }
}

export function MediaFilterMenu({
  C,
  isDark,
  mode,
  selectedAlbum,
  albums,
  onSelectMode,
  onSelectAlbum,
}: {
  C: any;
  isDark: boolean;
  mode: MediaFilterMode;
  selectedAlbum?: MediaAlbum | null;
  albums: MediaAlbum[];
  onSelectMode: (m: MediaFilterMode) => void;
  onSelectAlbum: (a: MediaAlbum) => void;
}) {
  const { t } = useTranslation();

  const s = useMemo(() => styles(C, isDark), [C, isDark]);

  const [open, setOpen] = useState(false);
  const [openAlbums, setOpenAlbums] = useState(false);

  const title =
  mode === "albums"
    ? (selectedAlbum?.title ?? t("mediafiltermenu.allAlbums"))
    : t(`mediafiltermenu.mode.${mode}`);

  function closeAll() {
    setOpen(false);
    setOpenAlbums(false);
  }

  function pickMode(next: MediaFilterMode) {
    if (next === "albums") {
      setOpen(false);
      setOpenAlbums(true);
      onSelectMode("albums"); // mode setzen, album kommt dann danach
      return;
    }
    onSelectMode(next);
    closeAll();
  }

  function pickAlbum(a: MediaAlbum) {
    onSelectAlbum(a);
    closeAll();
  }

  const Row = ({
    icon,
    label,
    active,
    onPress,
  }: {
    icon: any;
    label: string;
    active?: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.row}>
      <View style={s.rowLeft}>
        <Ionicons name={icon} size={18} color={C.text} />
        <RNText style={s.rowText}>{label}</RNText>
      </View>
      {active ? <Ionicons name="checkmark" size={18} color={C.text} /> : <View style={{ width: 18 }} />}
    </TouchableOpacity>
  );

  return (
    <>
      {/* Trigger */}
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.85} style={s.trigger}>
        <RNText style={s.triggerText} numberOfLines={1}>
          {title}
        </RNText>
        <Ionicons name="chevron-down" size={16} color={C.text} />
      </TouchableOpacity>

      {/* Main menu */}
      <Modal transparent visible={open} animationType="fade" onRequestClose={closeAll}>
        <Pressable style={s.backdrop} onPress={closeAll}>
          <Pressable style={s.card} onPress={() => {}}>
            <Row
              icon="copy-outline"
              label={t("mediafiltermenu.mode.recent")}
              active={mode === "recent"}
              onPress={() => pickMode("recent")}
            />
            <Row
              icon="play-circle-outline"
              label={t("mediafiltermenu.mode.videos")}
              active={mode === "videos"}
              onPress={() => pickMode("videos")}
            />
            <Row
              icon="heart-outline"
              label={t("mediafiltermenu.favorites")}
              active={mode === "favorites"}
              onPress={() => pickMode("favorites")}
            />
            <Row
              icon="grid-outline"
              label={t("mediafiltermenu.allAlbums")}
              active={mode === "albums"}
              onPress={() => pickMode("albums")}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Albums menu */}
      <Modal
        transparent
        visible={openAlbums}
        animationType="fade"
        onRequestClose={closeAll}
      >
        <Pressable style={s.backdrop} onPress={closeAll}>
          <Pressable style={[s.card, { maxHeight: "65%" }]} onPress={() => {}}>
            <View style={s.albumsHeader}>
              <RNText style={s.albumsTitle}>{t("mediafiltermenu.allAlbums")}</RNText>
              <TouchableOpacity onPress={closeAll} activeOpacity={0.8} style={s.albumsClose}>
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={albums}
              keyExtractor={(a) => a.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = selectedAlbum?.id === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => pickAlbum(item)}
                    activeOpacity={0.85}
                    style={[s.albumRow, active && s.albumRowActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <RNText style={s.albumTitle} numberOfLines={1}>
                        {item.title}
                      </RNText>
                      {typeof item.assetCount === "number" && (
                        <RNText style={s.albumMeta}>{item.assetCount} {t("mediafiltermenu.elements")}</RNText>
                      )}
                    </View>
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={C.text} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={C.subtext} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
      maxWidth: 170,
    },
    triggerText: { color: C.text, fontWeight: "800" },

    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16,
    },
    card: {
      width: "82%",
      borderRadius: 18,
      paddingVertical: 10,
      overflow: "hidden",
      backgroundColor: isDark ? "rgba(25,25,25,0.92)" : "rgba(245,245,245,0.92)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
      ...Platform.select({
        ios: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
        android: { elevation: 10 },
      }),
    },
    row: {
      height: 54,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    rowText: { color: C.text, fontWeight: "800", fontSize: 16 },

    albumsHeader: {
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    albumsTitle: { color: C.text, fontWeight: "900", fontSize: 16 },
    albumsClose: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
    },

    albumRow: {
      height: 56,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    albumRowActive: {
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    },
    albumTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
    albumMeta: { color: C.subtext, fontSize: 12, marginTop: 2 },
  });
