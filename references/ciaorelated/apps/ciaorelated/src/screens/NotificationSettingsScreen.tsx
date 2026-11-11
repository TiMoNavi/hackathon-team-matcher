import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  gql,
  useMutation,
  useQuery,
  useApolloClient,
} from "@apollo/client";
import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";
import { useNavigation } from "@react-navigation/native";

import { useTranslation } from "react-i18next";

const SETTINGS_Q = gql`
  query NotificationSettings {
    notificationSettings {
      pushEnabled
      digestEnabled
      follow
      followRequest
      followRequestAccepted
      like
      comment
      storyPosted
      storyMention
      postShareRequest
      postShareApproved
      postShareRejected
      postTagRequest
      vlogTagRequest
      vlogTagApproved
      vlogTagRejected
      vlogNewPost
      vlogDeleted
    }
  }
`;

const UPDATE_SETTINGS_M = gql`
  mutation UpdateNotificationSettings($input: NotificationSettingsInput!) {
    updateNotificationSettings(input: $input) {
      pushEnabled
      digestEnabled
      follow
      followRequest
      followRequestAccepted
      like
      comment
      storyPosted
      storyMention
      postShareRequest
      postShareApproved
      postShareRejected
      postTagRequest
      vlogTagRequest
      vlogTagApproved
      vlogTagRejected
      vlogNewPost
      vlogDeleted
    }
  }
`;

type SettingsKey =
  | "pushEnabled"
  | "digestEnabled"
  | "follow"
  | "followRequest"
  | "followRequestAccepted"
  | "like"
  | "comment"
  | "storyMention"
  | "postShareRequest"
  | "postShareApproved"
  | "postShareRejected"
  | "postTagRequest"
  | "vlogTagRequest"
  | "vlogTagApproved"
  | "vlogTagRejected"
  | "vlogNewPost"
  | "vlogDeleted"
  | "storyPosted";

function SectionHeader({
  title,
  subtitle,
  C,
}: {
  title: string;
  subtitle?: string;
  C: any;
}) {
  const { t } = useTranslation();

  const s = sectionStyles(C);
  return (
    <View style={s.wrap}>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const sectionStyles = (C: any) =>
  StyleSheet.create({
    wrap: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
    title: { color: C.text, fontWeight: "900", fontSize: 15 },
    sub: {
      color: C.subtext,
      marginTop: 4,
      fontWeight: "700",
      fontSize: 12,
      lineHeight: 16,
      opacity: 0.95,
    },
  });

function Card({
  children,
  C,
}: {
  children: React.ReactNode;
  C: any;
}) {
  const s = cardStyles(C);
  return <View style={s.card}>{children}</View>;
}

const cardStyles = (C: any) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      borderRadius: 14,
      backgroundColor: C.card ?? C.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      overflow: "hidden",
    },
  });

function Row({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled,
  C,
  isLast,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  C: any;
  isLast?: boolean;
}) {
  const s = rowStyles(C);
  const opacity = disabled ? 0.45 : 1;

  return (
    <View style={[s.row, !isLast && s.divider, { opacity }]}>
      <View style={s.left}>
        {icon ? (
          <View style={s.iconWrap}>
            <Ionicons name={icon} size={16} color={C.text} />
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
        </View>
      </View>

      <Switch
        value={!!value}
        onValueChange={onChange}
        disabled={!!disabled}
      />
    </View>
  );
}

const rowStyles = (C: any) =>
  StyleSheet.create({
    row: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: C.card ?? C.bg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      paddingRight: 12,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 9,
      marginRight: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: (C.card2 ?? C.bg2 ?? C.bg) as any,
    },
    title: { color: C.text, fontWeight: "900", fontSize: 14 },
    sub: {
      color: C.subtext,
      marginTop: 4,
      fontWeight: "700",
      fontSize: 12,
      lineHeight: 16,
    },
  });

export default function NotificationSettingsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = styles(C);
  const { t } = useTranslation();

  const client = useApolloClient();

  const { data, loading, error } = useQuery(SETTINGS_Q, {
    fetchPolicy: "cache-and-network",
  });
  const [update] = useMutation(UPDATE_SETTINGS_M);

  const settings = data?.notificationSettings ?? null;
  const pushEnabled = settings?.pushEnabled ?? true;

  const setField = React.useCallback(
    async (key: SettingsKey, value: boolean) => {
      const current =
        client.cache.readQuery<any>({ query: SETTINGS_Q })
          ?.notificationSettings ?? settings;

      const pushOn = current?.pushEnabled ?? true;

      // ❌ Digest darf nicht eingeschaltet werden, wenn Push aus ist
      if (key === "digestEnabled" && value === true && !pushOn) return;

      // ❌ Unterpunkte nicht ändern, wenn Push aus ist
      if (key !== "pushEnabled" && current && current.pushEnabled === false) return;

      // 🔥 Cascade: Push AUS => Digest AUS
      const input =
        key === "pushEnabled" && value === false
          ? { pushEnabled: false, digestEnabled: false }
          : { [key]: value };

      await update({
        variables: { input },
        optimisticResponse: {
          updateNotificationSettings: {
            __typename: "NotificationSettings",
            ...(current ?? {}),
            ...input,
          },
        },
        update(cache, res) {
          const next = res.data?.updateNotificationSettings;
          if (!next) return;
          cache.writeQuery({
            query: SETTINGS_Q,
            data: { notificationSettings: next },
          });
        },
      }).catch(() => {});
    },
    [client, update, settings]
  );

  return (
    <Screen scroll={false}>
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => nav.goBack()}
            hitSlop={12}
            style={s.headerBtn}
          >
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>

          <Text style={s.hTitle}>{t("notificationsettings.notifications")}</Text>

          <View style={s.headerBtn} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 28, paddingTop: 6 }}
          showsVerticalScrollIndicator={false}
        >
          <SectionHeader
            title={t("notificationsettings.section.push.title")}
            subtitle={t("notificationsettings.section.push.subtitle")}
            C={C}
          />

          <Card C={C}>
            <Row
              icon="notifications-outline"
              title={t("notificationsettings.pushNotifications")}
              subtitle={t("notificationsettings.pushDisabledHint")}
              value={!!settings?.pushEnabled}
              onChange={(v) => setField("pushEnabled", v)}
              C={C}
            />
            <Row
              icon="sparkles-outline"
              title={t("notificationsettings.highlightsDigest")}
              subtitle={t("notificationsettings.digestHint")}
              value={!!settings?.digestEnabled}
              onChange={(v) => setField("digestEnabled", v)}
              disabled={!pushEnabled}
              C={C}
              isLast
            />
          </Card>

          <SectionHeader
            title={t("notificationsettings.activity")}
            subtitle={t("notificationsettings.activityHint")}
            C={C}
          />

          <Card C={C}>
            <Row
              icon="person-add-outline"
              title={t("notificationsettings.follows")}
              value={!!settings?.follow}
              onChange={(v) => setField("follow", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="mail-unread-outline"
              title={t("notificationsettings.followRequests")}
              value={!!settings?.followRequest}
              onChange={(v) => setField("followRequest", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="checkmark-circle-outline"
              title={t("notificationsettings.followRequestAccepted")}
              value={!!settings?.followRequestAccepted}
              onChange={(v) => setField("followRequestAccepted", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="play-circle-outline"
              title={t("notificationsettings.storyPosted")}
              subtitle={t("notificationsettings.storyPostedHint")}
              value={!!settings?.storyPosted}
              onChange={(v) => setField("storyPosted", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="at-outline"
              title={t("notificationsettings.storyMention")}
              subtitle={t("notificationsettings.storyMentionHint")}
              value={!!settings?.storyMention}
              onChange={(v) => setField("storyMention", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="heart-outline"
              title={t("notificationsettings.likes")}
              value={!!settings?.like}
              onChange={(v) => setField("like", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="chatbubble-ellipses-outline"
              title={t("notificationsettings.comments")}
              value={!!settings?.comment}
              onChange={(v) => setField("comment", v)}
              disabled={!pushEnabled}
              C={C}
              isLast
            />
          </Card>

          <SectionHeader
            title={t("notificationsettings.postsTags")}
            subtitle={t("notificationsettings.postsTagsHint")}
            C={C}
          />

          <Card C={C}>
            <Row
              icon="share-social-outline"
              title={t("notificationsettings.shareThisPostInquiry")}
              value={!!settings?.postShareRequest}
              onChange={(v) => setField("postShareRequest", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="thumbs-up-outline"
              title={t("notificationsettings.shareThisPostAccepted")}
              value={!!settings?.postShareApproved}
              onChange={(v) => setField("postShareApproved", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="close-circle-outline"
              title={t("notificationsettings.shareThisPostRejected")}
              value={!!settings?.postShareRejected}
              onChange={(v) => setField("postShareRejected", v)}
              disabled={!pushEnabled}
              C={C}
            />
            <Row
              icon="pricetag-outline"
              title={t("notificationsettings.taggingRequestPostTag")}
              value={!!settings?.postTagRequest}
              onChange={(v) => setField("postTagRequest", v)}
              disabled={!pushEnabled}
              C={C}
              isLast
            />
          </Card>

          <SectionHeader
            title={t("notificationsettings.section.vlogs.title")}
            subtitle={t("notificationsettings.section.vlogs.subtitle")}
            C={C}
          />

          <Card C={C}>

            <Row
              icon="albums-outline"
              title={t("notificationsettings.newPostsInTheVlog")}
              subtitle={t("notificationsettings.vlogNewPostHint")}
              value={!!settings?.vlogNewPost}
              onChange={(v) => setField("vlogNewPost", v)}
              disabled={!pushEnabled}
              C={C}
            />

            <Row
              icon="trash-outline"
              title={t("notificationsettings.vlogDeleted")}
              value={!!settings?.vlogDeleted}
              onChange={(v) => setField("vlogDeleted", v)}
              disabled={!pushEnabled}
              C={C}
              isLast
            />
          </Card>

          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            {loading ? (
              <View style={s.statusRow}>
                <ActivityIndicator />
                <Text style={s.statusText}>{t("notificationsettings.loadingSettings")}</Text>
              </View>
            ) : error ? (
              <Text style={[s.statusText, { color: C.danger ?? "#ff3b30" }]}>
                {t("notificationsettings.couldNotLoadSettingsPleaseTryAgainLacf3cb7")}</Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
      paddingHorizontal: 12,
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: C.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    headerBtn: { padding: 8, width: 40, alignItems: "center" },
    hTitle: { color: C.text, fontWeight: "900", fontSize: 18 },

    statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    statusText: { marginTop: 2, color: C.subtext, fontWeight: "700", fontSize: 12 },
  });
