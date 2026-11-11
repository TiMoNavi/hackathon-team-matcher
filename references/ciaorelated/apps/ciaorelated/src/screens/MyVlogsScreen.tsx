// apps/ciaorelated/src/screens/MyVlogsScreen.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { gql, useQuery } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../theme/ThemeProvider";
import { VlogCard, type VlogCardItem } from "./components/VlogCard";

import { useTranslation } from "react-i18next";

export const MY_VLOGS = gql`
  query MyVlogs {
    myVlogs {
      id
      slug
      title
      description
      coverUrl
      coverThumbUrl
      updatedAt
      privacy
      memberCount
      postCount
      owner { id username avatarThumbUrl avatarUrl }
      __typename
    }
  }
`;

export default function MyVlogsScreen() {
  const { t } = useTranslation();

  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const COLORS = theme.colors as any;
  const s = styles(COLORS);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerStyle: { backgroundColor: COLORS.bg },
      headerTintColor: COLORS.text,
      title: t("myvlogs.title"),
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("CreateMedia", { initialMode: "VLOG" })}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          accessibilityLabel={t("myvlogs.createANewVlog")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="add-circle-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, COLORS.bg, COLORS.text, t ]);

  const { data, loading, error, refetch, networkStatus } = useQuery(MY_VLOGS, {
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  useEffect(() => {
    if (!error) return;
    const unauth = error?.graphQLErrors?.some(
      (e) => (e.extensions as any)?.code === "UNAUTHENTICATED"
    );
    if (unauth) navigation.navigate("Auth", { start: "login" } as any);
  }, [error, navigation]);

  const refreshing = networkStatus === 4;
  const onRefresh = useCallback(() => refetch?.(), [refetch]);

  const vlogs: VlogCardItem[] = useMemo(() => {
    const list = data?.myVlogs ?? [];
    return Array.isArray(list) ? list : [];
  }, [data?.myVlogs]);

  if (loading && !data) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator />
       <Text style={s.sub}>{t("myvlogs.loading")}</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.error}>
          {t("common.error")}: {error.message}
        </Text>
        <TouchableOpacity onPress={() => refetch?.()} style={s.retryBtn}>
          <Text style={s.retryText}>{t("myvlogs.tryAgain")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={vlogs}
        keyExtractor={(item) => item.id}
        initialNumToRender={6}
        windowSize={7}
        maxToRenderPerBatch={6}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            tintColor={COLORS.text}
            refreshing={!!refreshing}
            onRefresh={onRefresh}
          />
        }
        contentContainerStyle={
          vlogs.length === 0
            ? { flex: 1, justifyContent: "center", padding: 16 }
            : { padding: 12 }
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <EmptyState
            COLORS={COLORS}
            onCreate={() => navigation.navigate("CreateMedia", { initialMode: "VLOG" })}
          />
        }
        renderItem={({ item }) => (
          <VlogCard
            vlog={item}
            onPress={(v) => navigation.navigate("VlogDetail", { id: v.id, slug: v.slug })}
          />
        )}
      />
    </View>
  );
}

function EmptyState({ onCreate, COLORS }: { onCreate: () => void; COLORS: any }) {
  const { t } = useTranslation();
  return (
    <View style={{ alignItems: "center", paddingHorizontal: 28 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: COLORS.card,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: COLORS.border,
        }}
      >
        <Ionicons name="albums-outline" size={28} color={COLORS.text} />
      </View>

      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900", marginBottom: 6, textAlign: "center" }}>
        {t("myvlogs.noVlogsYet")}</Text>

      <Text style={{ color: COLORS.subtext, textAlign: "center", marginBottom: 16 }}>
        {t("myvlogs.createYourFirstVlogAndCollectAllYourec5517")}</Text>

      <TouchableOpacity
        onPress={onCreate}
        activeOpacity={0.85}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: COLORS.card,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 12,
          borderColor: COLORS.border,
          borderWidth: StyleSheet.hairlineWidth,
        }}
      >
        <Ionicons name="add" size={16} color={COLORS.text} />
        <Text style={{ color: COLORS.text, fontWeight: "900" }}>{t("myvlogs.startVlogWizard")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = (COLORS: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    center: { justifyContent: "center", alignItems: "center" },

    sub: { color: COLORS.subtext, marginTop: 8 },

    error: { color: "tomato", textAlign: "center", marginBottom: 12, fontWeight: "800" },
    retryBtn: {
      borderColor: COLORS.border,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: COLORS.card,
    },
    retryText: { color: COLORS.text, fontWeight: "800" },
  });
