// apps/ciaorelated/src/screens/NewStoryScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");

const COLS = 3;
const GAP = 2;
const SIZE = (width - GAP * (COLS + 1)) / COLS;

type AssetItem = {
  id: string;
  uri: string;
  mediaType: MediaLibrary.MediaTypeValue;
  duration?: number | null;
  filename?: string | null;
};

const toIntSeconds = (x?: number | null) => {
  if (x == null) return undefined;
  const v = Number(x);
  if (!isFinite(v)) return undefined;
  // Heuristik: >30min => ms → s
  const sec = v > 1800 ? Math.round(v / 1000) : Math.round(v);
  return Math.max(0, sec);
};

function formatDuration(sec?: number | null) {
  const s = Math.max(0, Math.floor(toIntSeconds(sec) ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function mergeUnique(prev: AssetItem[], next: AssetItem[]) {
  const map = new Map(prev.map((a) => [a.id, a]));
  for (const n of next) if (!map.has(n.id)) map.set(n.id, n);
  return Array.from(map.values());
}

export default function NewStoryScreen() {
  const { t } = useTranslation();

  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = useMemo(() => styles(COLORS), [COLORS]);

  // statt: const [perm, setPerm] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [perm, setPerm] = useState<MediaLibrary.PermissionResponse | null>(null);

  // helper
  const isGrantedLike = (p: MediaLibrary.PermissionResponse | null) => {
    if (!p) return false;
    // immer safe
    if (p.status === "granted") return true;

    // iOS kann "limited" liefern – aber dein Typ kennt es nicht → daher optional via `any`
    return Platform.OS === "ios" && (p as any).status === "limited";
  };

  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [endReached, setEndReached] = useState(false);

  const hasAccess = isGrantedLike(perm);
  
  const loadMore = useCallback(
    async (first = false) => {
      if (endReached) return;
      setLoading(true);
      try {
        const res = await MediaLibrary.getAssetsAsync({
          first: 60,
          after: first ? undefined : cursor,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        });

        const mapped: AssetItem[] = res.assets.map((a) => ({
          id: a.id,
          uri: a.uri,
          mediaType: a.mediaType,
          duration: a.duration,
          filename: (a as any)?.filename ?? null,
        }));

        setAssets((prev) => (first ? mapped : mergeUnique(prev, mapped)));
        setCursor(res.endCursor ?? undefined);
        setEndReached(!res.hasNextPage);
      } catch (e: any) {
        Alert.alert(t("common.error"), e?.message ?? t("newstory.loadLibraryFailed"));
      } finally {
        setLoading(false);
      }
    },
    [cursor, endReached, t]
  );

  // Permissions + initial fetch
  useEffect(() => {
    (async () => {
      const p = await MediaLibrary.requestPermissionsAsync();
      setPerm(p);

      if (!isGrantedLike(p)) {
        setLoading(false);
        Alert.alert(t("newstory.permissionTitle"), t("newstory.permissionBody"));
        return;
      }

      loadMore(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Kamera-Button → StoryWizard im CreateMedia öffnen
  const openCamera = useCallback(() => {
    nav.navigate("CreateMedia", { initialMode: "STORY" });
  }, [nav]);

  // Antippen eines Assets → StoryCompose
  const goCompose = useCallback(
    (item: {
      id?: string;
      uri: string;
      type: "photo" | "video";
      duration?: number;
      filename?: string | null;
    }) => {
      nav.navigate("StoryCompose", { media: item });
    },
    [nav]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: AssetItem; index: number }) => {
      const isVideo = item.mediaType === MediaLibrary.MediaType.video;
      const dSec = toIntSeconds(item.duration);
      const tooLong = isVideo && (dSec ?? 0) > 30;

      return (
        <TouchableOpacity
          style={{
            width: SIZE,
            height: SIZE,
            marginLeft: index % COLS === 0 ? GAP : GAP / 2,
            marginRight: (index + 1) % COLS === 0 ? GAP : GAP / 2,
            marginBottom: GAP,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: COLORS.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: COLORS.border,
            opacity: tooLong ? 0.45 : 1,
          }}
          activeOpacity={0.9}
          onPress={() => {
            if (tooLong) {
              Alert.alert(t("newstory.videoTooLongTitle"), t("newstory.videoTooLongBody"));
              return;
            }
            goCompose({
              id: item.id,
              uri: item.uri,
              type: isVideo ? "video" : "photo",
              duration: dSec,
              filename: item.filename ?? undefined,
            });
          }}
        >
          <ExpoImage
            source={{ uri: item.uri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
          />

          {isVideo && (
            <View style={s.durationBadge}>
              <Text style={s.durationText} numberOfLines={1}>
                <Ionicons name="play" size={12} color="#fff" /> {formatDuration(dSec)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [COLORS.border, COLORS.card, goCompose, s.durationBadge, s.durationText, t]
  );

  if (!hasAccess) {
    return (
      <Screen scroll={false}>
        <Header COLORS={COLORS} onClose={() => nav.goBack()} onCamera={openCamera} />
        <View style={s.center}>
          <Text style={{ color: COLORS.subtext }}>{t("newstory.noPermissionToViewPhotos")}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <Header COLORS={COLORS} onClose={() => nav.goBack()} onCamera={openCamera} />

      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={COLS}
        onEndReachedThreshold={0.6}
        onEndReached={() => loadMore(false)}
        ListFooterComponent={loading ? <ActivityIndicator style={{ padding: 16 }} /> : null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 12 }}
        removeClippedSubviews={false}
      />
    </Screen>
  );
}

function Header({
  COLORS,
  onClose,
  onCamera,
}: {
  COLORS: any;
  onClose: () => void;
  onCamera: () => void;
}) {
  const { t } = useTranslation();
  const s = useMemo(() => styles(COLORS), [COLORS]);
  return (
    <View style={s.header}>
      <TouchableOpacity
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ padding: 8 }}
      >
        <Ionicons name="close" size={24} color={COLORS.text} />
      </TouchableOpacity>

      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={s.headerTitle} numberOfLines={1}>
          {t("newstory.postInStory")}</Text>
      </View>

      <TouchableOpacity
        onPress={onCamera}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ padding: 8 }}
      >
        <Ionicons name="camera-outline" size={24} color={COLORS.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = (COLORS: any) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: 16,
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: COLORS.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
    },
    headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: "800" },

    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    durationBadge: {
      position: "absolute",
      right: 6,
      bottom: 6,
      backgroundColor: "rgba(0,0,0,0.6)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    durationText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  });
