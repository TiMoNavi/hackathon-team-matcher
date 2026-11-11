import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { gql, useMutation } from "@apollo/client";
import { useTheme } from "../theme/ThemeProvider";
import { StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTranslation } from "react-i18next";

const JOIN_GROUP = gql`
  mutation JoinGroup($slug: String!) {
    joinGroupLink(slug: $slug) {
      id
      title
    }
  }
`;

export default function JoinGroupScreen() {
  const { t } = useTranslation();

  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const slug = route.params?.slug;

  const { theme } = useTheme();
    const COLORS = theme.colors;
    const s = styles(COLORS);


  const [joinGroup] = useMutation(JOIN_GROUP);
  const ran = useRef(false);

  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "success"; groupId: string; title: string }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    if (!slug) {
      setState({ status: "error", message: t("joingroup.invalidLink") });
      return;
    }
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const res = await joinGroup({ variables: { slug } });
        const g = res?.data?.joinGroupLink;

        if (!g?.id || !g?.title) {
          setState({ status: "error", message: t("joingroup.loadFailed") });
          return;
        }

        setState({ status: "success", groupId: g.id, title: g.title });
      } catch (e: any) {
        setState({ status: "error", message: e?.message ?? t("joingroup.joinFailed") });
      }
    })();
  }, [slug, joinGroup, t]);

  if (state.status === "loading") {
    return (
        <View style={s.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={s.sub}>{t("joingroup.groupAdded")}</Text>
        </View>
    );
    }


  if (state.status === "error") {
    return (
        <View style={s.center}>
        <Text style={s.title}>{t("joingroup.oops")}</Text>
        <Text style={s.sub}>{state.message}</Text>

        <TouchableOpacity
            onPress={() =>
            navigation.reset({ index: 0, routes: [{ name: "AppTabs" }] })
            }
        >
            <Text style={s.link}>{t("joingroup.toApp")}</Text>
        </TouchableOpacity>
        </View>
    );
    }


  // success
  return (

    <View style={s.center}>
        <View style={s.pullHint}>
        <Ionicons
            name="chevron-down"
            size={26}
            color={COLORS.subtext}
        />
        <Text style={s.pullText}>{t("joingroup.pullDownToContinue")}</Text>
        </View>
        <Ionicons
        name="happy-outline"
        size={72}
        color={COLORS.primary}
        style={{ marginBottom: 16 }}
        />

        <Text style={s.title}>
        {t("joingroup.youWereAddedToTheGroup")}{state.title}{t("joingroup.added")}</Text>

        <TouchableOpacity
        onPress={() =>
            navigation.reset({
            index: 1,
            routes: [
                { name: "AppTabs" },
                { name: "CommunitySpace", params: { id: state.groupId, title: state.title, slug } },
            ],
            })
        }
        >
        <Text style={s.link}>{t("joingroup.openLiveFeed")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
        onPress={() =>
            navigation.reset({ index: 0, routes: [{ name: "AppTabs" }] })
        }
        >
        <Text style={s.subtle}>{t("joingroup.later")}</Text>
        </TouchableOpacity>
    </View>

    );


}
const styles = (C: any) =>
  StyleSheet.create({
    pullHint: {
        position: "absolute",
        top: 16,
        left: 0,
        right: 0,
        alignItems: "center",
        opacity: 0.6,
        },

        pullText: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: "600",
        color: C.subtext,
        },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      backgroundColor: C.bg,
    },

    title: {
      color: C.text,
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },

    sub: {
      color: C.subtext,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 16,
    },

    link: {
      color: C.primary,
      fontWeight: "700",
      marginTop: 12,
    },

    subtle: {
      color: C.subtext,
      marginTop: 10,
    },
  });
