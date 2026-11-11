// apps/ciaorelated/src/screens/ChatScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, TextInput, View, StyleSheet, TouchableOpacity, Text, Alert, Dimensions, Linking, Platform } from "react-native";
import {
  GiftedChat,
  IMessage,
  Message,
  MessageText,
  Composer,
  Bubble,
  Time,
} from "react-native-gifted-chat";
import "dayjs/locale/de";
import { Ionicons } from "@expo/vector-icons";
import { gql, useMutation, useQuery, useSubscription } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";

import { uploadToS3 } from "../lib/uploadToS3";
import { apollo } from "../apollo";
import { useTheme } from "../theme/ThemeProvider";

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import "react-native-gifted-chat";

import { useFocusEffect } from "@react-navigation/native";
import { setActiveChatThreadId } from "../lib/chatPresence";
import { avatarPlaceholder } from "../../assets/placeholders";
import { brand } from "../config/brand";


import { useTranslation } from "react-i18next";

const expoConfig = (Constants.expoConfig ?? {}) as any;
const iosAppStoreId = String((expoConfig.extra as any)?.iosAppStoreId ?? "").trim();
const androidPackageName = String((expoConfig.android as any)?.package ?? "").trim();
const appStoreReviewUrl = iosAppStoreId
  ? `https://apps.apple.com/app/id${iosAppStoreId}?action=write-review`
  : "https://apps.apple.com";
const playStoreUrl = androidPackageName
  ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidPackageName)}`
  : "https://play.google.com/store";

/* ───────────────── GiftedChat types ───────────────── */
declare module "react-native-gifted-chat" {
  interface IMessage {
    kind?: "text" | "image" | "video" | "file";
    pending?: boolean;

    serverId?: string;

    story?: {
      id: string;
      mediaUrl?: string | null;
      thumbUrl?: string | null;
      isVideo?: boolean | null;
      createdAt?: string | null;
      author?: { id: string; username: string; avatarThumbUrl?: string | null; avatarUrl?: string | null } | null;
    } | null;

    // ✅ NEU: Story expired / gelöscht
    storyExpired?: boolean;
    systemWelcome?: boolean;
  }
}

/* ───────────────── GraphQL ───────────────── */
const MESSAGES = gql`
  query Messages($threadId: ID!, $cursor: ID, $take: Int) {
    messages(threadId: $threadId, cursor: $cursor, take: $take) {
      edges {
        node {
          storyExpired
          story {
            id
            mediaUrl
            thumbUrl
            isVideo
            createdAt
            author { id username avatarThumbUrl avatarUrl  }
          }

          id
          clientId
          createdAt
          kind
          text
          sender {
            id
            username
            avatarThumbUrl
            avatarUrl
          }
          media {
            url
            mime
          }
        }
      }
      nextCursor
    }
  }
`;

const THREAD_INFO = gql`
  query ThreadInfo($threadId: ID!) {
    thread(threadId: $threadId) {
      id
      title
      imageUrl
      kind
      isGroupChat
      viewerIsOwner
      members {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
      community {
        id
        title
        type
        slug
        owner {
          id
        }
      }
    }
  }
`;

const UPDATE_THREAD_SETTINGS = gql`
  mutation UpdateThreadSettings($threadId: ID!, $title: String!, $imageKey: String) {
    updateThreadSettings(threadId: $threadId, title: $title, imageKey: $imageKey) {
      id
      title
      imageUrl
    }
  }
`;

const REMOVE_THREAD_MEMBER = gql`
  mutation RemoveThreadMember($threadId: ID!, $userId: ID!) {
    removeThreadMember(threadId: $threadId, userId: $userId)
  }
`;

const SEND_MESSAGE = gql`
  mutation Send($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
      clientId
      createdAt
      kind
      text
      sender {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
      storyExpired
      story {
        id
        mediaUrl
        thumbUrl
        isVideo
        createdAt
        author { id username avatarThumbUrl avatarUrl }
      }

      media {
        url
        mime
      }
    }
  }
`;

const SUB_MESSAGE_ADDED = gql`
  subscription OnAdded($threadId: ID!) {
    messageAdded(threadId: $threadId) {
      id
      clientId
      createdAt
      kind
      text
      sender {
        id
        username
        avatarThumbUrl
        avatarUrl
      }
      media {
        url
        mime
      }
      storyExpired
      story {
        id
        mediaUrl
        thumbUrl
        isVideo
        createdAt
        author { id username avatarThumbUrl avatarUrl }
      }

    }
  }
`;

const ME_Q = gql`
  query {
    me {
      id
      username
      avatarThumbUrl
      avatarUrl
    }
  }
`;

const DELETE_MESSAGE = gql`
  mutation DeleteMessage($messageId: ID!) {
    deleteMessage(messageId: $messageId)
  }
`;

const MARK_THREAD_READ = gql`
  mutation MarkThreadRead($threadId: ID!) {
    markThreadRead(threadId: $threadId)
  }
`;

const NAME_COLORS = ["#2563eb", "#0891b2", "#059669", "#7c3aed", "#db2777", "#ea580c", "#0f766e", "#4f46e5"];
const WELCOME_MESSAGE_I18N_TOKEN = "system:welcome";

function nameColorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return NAME_COLORS[hash % NAME_COLORS.length];
}

type MsgNode = {
  id: string;
  clientId?: string | null;
  createdAt: string;
  kind: "text" | "image" | "video" | "file";
  text?: string;
  sender: { id: string; username: string; avatarThumbUrl?: string | null; avatarUrl?: string | null };
  media?: { url: string; mime: string };
  storyExpired?: boolean | null;
  story?: {
    id: string;
    mediaUrl?: string | null;
    thumbUrl?: string | null;
    isVideo?: boolean | null;
    createdAt?: string | null;
    author?: { id: string; username: string; avatarThumbUrl?: string | null; avatarUrl?: string | null } | null;
  } | null;

};

export default function ChatScreen({ route, navigation }: any) {
  const { t, i18n } = useTranslation();

  const { theme } = useTheme();
  const C = useMemo(() => {
    const x: any = theme?.colors ?? {};
    return {
      bg: x.bg ?? "#0B0B0B",
      card: x.card ?? "#111214",
      text: x.text ?? "#F3F4F6",
      sub: x.subtext ?? "#9CA3AF",
      border: x.border ?? "#23262B",
      accent: x.primary ?? "#4f46e5",
      danger: x.danger ?? "#ef4444",
    };
  }, [theme]);

  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const chatLanguage = useMemo(() => {
    const language = String(i18n.resolvedLanguage ?? i18n.language ?? "en").toLowerCase();
    return language.startsWith("de") ? "de" : "en";
  }, [i18n.language, i18n.resolvedLanguage]);
  const chatTimeFormat = chatLanguage === "de" ? "HH:mm" : "h:mm A";
  const chatDateFormat = chatLanguage === "de" ? "D. MMMM YYYY" : "MMMM D, YYYY";
  const chatDateFormatCalendar = useMemo(
    () =>
      chatLanguage === "de"
        ? { sameDay: "[Heute]", lastDay: "[Gestern]", sameElse: chatDateFormat }
        : { sameDay: "[Today]", lastDay: "[Yesterday]", sameElse: chatDateFormat },
    [chatDateFormat, chatLanguage]
  );
  const storyCardWidth = useMemo(() => {
    const w = Dimensions.get("window")?.width ?? 375;
    return Math.min(300, Math.max(220, Math.floor(w * 0.72)));
  }, []);

  const threadId = route.params?.threadId as string;
  const title = (route.params?.title as string) ?? "Chat";
  const initialDraft = (route.params?.initialDraft as string | undefined) ?? "";

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const hasText = inputText.trim().length > 0;

  useEffect(() => {
    const draft = String(initialDraft || "").trim();
    if (!draft) return;
    setInputText((prev) => (prev.trim() ? prev : draft));
  }, [initialDraft, threadId]);

  const { data: meQ } = useQuery(ME_Q, { fetchPolicy: "cache-first" });
  const myId = meQ?.me?.id ?? "me";
  const myAvatar = meQ?.me?.avatarThumbUrl ?? meQ?.me?.avatarUrl ?? undefined;

  const seenIds = useRef(new Set<string>());

  const { data } = useQuery(MESSAGES, {
    variables: { threadId, take: 30 },
    skip: !threadId,
    fetchPolicy: "cache-and-network",
  });
  const { data: threadInfo, refetch: refetchThreadInfo } = useQuery(THREAD_INFO, {
    variables: { threadId },
    skip: !threadId,
    fetchPolicy: "cache-and-network",
  });
  const isGroupChat = Boolean(threadInfo?.thread?.isGroupChat);
  const threadCommunity = threadInfo?.thread?.community;
  const isPlainGroupChat = isGroupChat && !threadCommunity?.id;
  const groupMembers = threadInfo?.thread?.members ?? [];
  const viewerIsThreadOwner = Boolean(threadInfo?.thread?.viewerIsOwner);
  const headerTitle = threadInfo?.thread?.title || title;
  const isBroadcastOnly = threadInfo?.thread?.kind === "BROADCAST";
  const isChatDisabled = threadInfo?.thread?.kind === "DISABLED";
  const canSendChatMessages =
    !isChatDisabled && (!isBroadcastOnly || (!!threadCommunity?.owner?.id && String(threadCommunity.owner.id) === String(myId)));

  useEffect(() => {
    if (!canSendChatMessages) setInputText("");
  }, [canSendChatMessages]);

  const openCommunityLiveFeed = useCallback(() => {
    if (!threadCommunity?.id) return;
    navigation.navigate("CommunitySpace", {
      id: threadCommunity.id,
      title: threadCommunity.title,
      slug: threadCommunity.slug,
      type: threadCommunity.type,
    });
  }, [navigation, threadCommunity?.id, threadCommunity?.slug, threadCommunity?.title, threadCommunity?.type]);

  const [deleteMessageMut] = useMutation(DELETE_MESSAGE);
  const [markThreadRead] = useMutation(MARK_THREAD_READ);
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [updateThreadSettings, { loading: groupSettingsSaving }] = useMutation(UPDATE_THREAD_SETTINGS);
  const [removeThreadMember, { loading: memberRemoving }] = useMutation(REMOVE_THREAD_MEMBER);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [editGroupTitle, setEditGroupTitle] = useState("");
  const [editGroupImageUri, setEditGroupImageUri] = useState<string | null>(null);
  const [editGroupImageMime, setEditGroupImageMime] = useState("image/jpeg");
  const [editGroupImageName, setEditGroupImageName] = useState("group-chat.jpg");

  const openGroupSettings = useCallback(() => {
    setEditGroupTitle(String(threadInfo?.thread?.title ?? ""));
    setEditGroupImageUri(threadInfo?.thread?.imageUrl ?? null);
    setEditGroupImageMime("image/jpeg");
    setEditGroupImageName("group-chat.jpg");
    setGroupSettingsOpen(true);
  }, [threadInfo?.thread?.imageUrl, threadInfo?.thread?.title]);

  const lastReadPing = useRef(0);
  const markRead = useCallback(() => {
    if (!threadId) return;
    const now = Date.now();
    if (now - lastReadPing.current < 800) return;
    lastReadPing.current = now;
    markThreadRead({ variables: { threadId } }).catch(() => {});
  }, [markThreadRead, threadId]);

  useFocusEffect(
    React.useCallback(() => {
      setActiveChatThreadId(threadId);
      markRead();
      return () => setActiveChatThreadId(null);
    }, [threadId, markRead])
  );

  useEffect(() => {
    setMessages([]);
    seenIds.current = new Set<string>();
  }, [threadId]);

  useEffect(() => {
    if (!data?.messages) return;
    const nodes = data.messages.edges.map((e: any) => e.node);

    for (const n of nodes) if (n?.id) seenIds.current.add(String(n.id));

    const mapped = mapMessages(nodes, t);
    setMessages((prev) => mergeById(prev, mapped));
    markRead();
  }, [data, markRead, t]);

  useSubscription(SUB_MESSAGE_ADDED, {
    variables: { threadId },
    skip: !threadId,
    onError: (e) => console.warn("[Chat] messageAdded sub error", e),
    onData: ({ data }) => {
      const msg = data.data?.messageAdded as MsgNode | undefined;
      if (!msg) return;

      const id = String(msg.id);
      if (seenIds.current.has(id)) return;
      seenIds.current.add(id);

      const incoming = mapMessages([msg], t);
      setMessages((prev) => {
        if (hasMessage(prev, id)) return prev;
        return mergeById(prev, incoming);
      });

      if (String(msg.sender?.id) !== String(myId)) markRead();
    },
  });

  useEffect(() => {
    const urls = Array.from(
      new Set(
        messages
          .map((m) => (m.user as any)?.avatar as string | undefined)
          .filter(Boolean)
          .map((u) => String(u).split("?")[0])
      )
    );
    if (urls.length) ExpoImage.prefetch(urls).catch(() => {});

  }, [messages]);

  /* ───────────────── KEY warning fix ───────────────── */
  const renderMessage = useCallback((props: any) => {
    const { key: _ignore, ...rest } = props ?? {};
    return <Message {...rest} />;
  }, []);

  const openStoreListing = useCallback(() => {
    const url = Platform.OS === "android" ? playStoreUrl : appStoreReviewUrl;
    Linking.openURL(url).catch(() => {});
  }, []);

  const renderMessageText = useCallback(
    (props: any) => {
      const m = props?.currentMessage as any;
      if (!m?.systemWelcome) return <MessageText {...props} />;

      const isMine = String(m?.user?._id ?? "") === String(myId);
      const textColor = isMine ? "#fff" : C.text;
      const linkColor = isMine ? "#fff" : C.accent;
      const linkStyle = [styles.welcomeInlineLink, { color: linkColor }];

      return (
        <Text style={[styles.welcomeInlineText, { color: textColor }]}>
          {t("chat.welcomeTitle", { appName: brand.appName })}
          {"\n\n"}
          {t("chat.welcomeMessage")}
          {"\n\n"}
          <Text style={linkStyle} onPress={() => navigation.navigate("AppTabs", { screen: "Home" })}>
            {t("chat.welcomeActions.feed")}
          </Text>
          {" · "}
          <Text style={linkStyle} onPress={() => navigation.navigate("AppTabs", { screen: "MessagesTab" })}>
            {t("chat.welcomeActions.chats")}
          </Text>
          {" · "}
          <Text style={linkStyle} onPress={() => navigation.navigate("Groups")}>
            {t("chat.welcomeActions.communities")}
          </Text>
          {" · "}
          <Text style={linkStyle} onPress={() => navigation.navigate("AppTabs", { screen: "Vlogs" })}>
            {t("chat.welcomeActions.events")}
          </Text>
          {" · "}
          <Text style={linkStyle} onPress={() => navigation.navigate("AppTabs", { screen: "Profile" })}>
            {t("chat.welcomeActions.profile")}
          </Text>
          {" · "}
          <Text style={linkStyle} onPress={() => navigation.navigate("Activity")}>
            {t("chat.welcomeActions.activity")}
          </Text>
          {" · "}
          <Text style={linkStyle} onPress={() => navigation.navigate("NotificationSettings")}>
            {t("chat.welcomeActions.activitySettings")}
          </Text>
          {"\n\n"}
          {t("chat.welcomeReviewPrefix")}
          <Text style={linkStyle} onPress={openStoreListing}>
            {t("chat.welcomeReviewLink")}
          </Text>
          {t("chat.welcomeReviewSuffix")}
          {"\n\n"}
          {t("chat.welcomeLanguagePrefix")}
          <Text
            style={linkStyle}
            onPress={() => navigation.navigate("LanguageSettings")}
          >
            {t("chat.welcomeLanguageLink")}
          </Text>
          {t("chat.welcomeLanguageSuffix")}
        </Text>
      );
    },
    [C.accent, C.text, myId, navigation, openStoreListing, styles.welcomeInlineLink, styles.welcomeInlineText, t]
  );

  /* ───────────────── Avatar fix (wirklich anzeigen) ───────────────── */
  const openUserProfile = useCallback(
    (userId: string) => {
      if (!userId) return;
      navigation.navigate("UserProfile", { userId });
    },
    [navigation]
  );

  const renderAvatar = useCallback(
    (props: any) => {
      const msg = props?.currentMessage as any;
      const uid = String(msg?.user?._id ?? "");
      if (!uid) return null;

      // Nur Gegenüber links
      if (uid === String(myId)) return <View  />;

      const uri = msg?.user?.avatar as string | undefined;
      const cacheKey = uri ? String(uri).split("?")[0] : undefined;


      return (
        <TouchableOpacity
          onPress={() => openUserProfile(uid)}
          activeOpacity={0.9}
          style={{ marginLeft: 6, marginRight: 6 }}
        >
          <ExpoImage
            source={uri ? { uri, cacheKey } : avatarPlaceholder}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="disk"
            transition={80}
          />
        </TouchableOpacity>
      );
    },
    [openUserProfile, myId, styles.avatar]
  );


  const renderBubble = useCallback(
    (props: any) => {
      const m = props?.currentMessage as any;
      const isStoryMsg = !!m?.story || !!m?.storyExpired;
      const hasText = typeof m?.text === "string" && m.text.trim().length > 0;
      const storyOnly = isStoryMsg && !hasText;
      return (
        <Bubble
          {...props}
          wrapperStyle={{
            left: storyOnly
              ? { backgroundColor: "transparent", borderWidth: 0, padding: 0, maxWidth: storyCardWidth }
              : { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
            right: storyOnly
              ? { backgroundColor: "transparent", borderWidth: 0, padding: 0, maxWidth: storyCardWidth }
              : { backgroundColor: C.accent },
          }}
          textStyle={{
            left: { color: C.text },
            right: { color: "#fff" },
          }}
        />
      );
    },
    [C.accent, C.border, C.card, C.text, storyCardWidth]
  );

  /* ───────────────── ActionSheet / Delete ───────────────── */
  const [actionMsg, setActionMsg] = useState<IMessage | null>(null);
  const closeSheet = () => setActionMsg(null);

  const doDeleteMessage = useCallback(
    async (msg: IMessage) => {
      const id = String(msg?._id ?? "");
      if (!id || id.startsWith("tmp-")) return;

      const snapshot = messages;
      setMessages((prev) => prev.filter((m) => String(m._id) !== id));
      closeSheet();

      try {
        await deleteMessageMut({ variables: { messageId: id } });
      } catch (e: any) {
        setMessages(snapshot);
        Alert.alert(t("chat.deleteFailedTitle"), e?.message || t("common.tryAgain"));
      }
    },
    [deleteMessageMut, messages, t]
  );

  const ActionSheet = () => {
    if (!actionMsg) return null;

    const isMine = String((actionMsg as any)?.user?._id) === String(myId);
    const imageUrl = (actionMsg as any)?.image as string | undefined;

    return (
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: C.bg,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTopWidth: 1,
          borderColor: C.border,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <View
          style={{
            height: 4,
            width: 44,
            alignSelf: "center",
            borderRadius: 2,
            backgroundColor: C.border,
            marginBottom: 8,
          }}
        />

        {imageUrl ? (
          <TouchableOpacity
            onPress={async () => {
              await downloadAndShare(imageUrl, "image.jpg");
              closeSheet();
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Text style={{ color: C.text, fontSize: 16 }}>{t("chat.downloadShareImage")}</Text>
          </TouchableOpacity>
        ) : null}

        {isMine ? (
          <TouchableOpacity
            onPress={() => doDeleteMessage(actionMsg)}
            style={{ paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Text style={{ color: "#ef4444", fontSize: 16, fontWeight: "800" }}>{t("chat.deleteMessage")}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={closeSheet} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ color: C.sub, fontSize: 16 }}>{t("chat.cancel")}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  /* ───────────────── SEND TEXT ───────────────── */
  const onSend = useCallback(
    async (out: IMessage[] = []) => {
      if (!threadId) return;
      if (!canSendChatMessages) return;

      for (const m of out) {
        const text = m.text?.trim();
        if (!text) continue;

        const tempId = "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2);

        setMessages((prev) =>
          mergeById(prev, [
            {
              _id: tempId,
              text,
              createdAt: new Date(),
              user: { _id: myId, avatar: myAvatar },
              pending: true,
              kind: "text",
            } as any,
          ])
        );

        try {
          const res = await sendMessage({
            variables: { input: { threadId, clientId: tempId, kind: "text", text } },
          });

          const serverMsg = res.data?.sendMessage as MsgNode | undefined;

          if (serverMsg?.id) {
            const sid = String(serverMsg.id);
            seenIds.current.add(sid);

            setMessages((prev) => mergeById(prev, mapMessages([serverMsg], t)));
          } else {
            setMessages((prev) =>
              prev.map((x) => (String(x._id) === String(tempId) ? ({ ...x, pending: false } as any) : x))
            );
          }
        } catch (e: any) {
          setMessages((prev) => prev.filter((x) => String(x._id) !== String(tempId)));
          Alert.alert(t("chat.sendFailedTitle"), e?.message || t("common.tryAgain"));
        }
      }

      setInputText("");
      markRead();
    },
    [threadId, canSendChatMessages, sendMessage, myId, myAvatar, markRead, t]
  );

  async function downloadAndShare(url: string, suggestedName?: string) {
    try {
      const raw = url.split("?")[0];
      const filename = suggestedName || decodeURIComponent(raw.split("/").pop() || "download");

      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
      const target = baseDir + filename;

      const { uri, status } = await FileSystem.downloadAsync(url, target);
      if (status !== 200) throw new Error(t("chat.downloadFailedStatus", { status }));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert(t("chat.savedTitle"), t("chat.fileSaved", { uri }));
      }
    } catch (e: any) {
      Alert.alert(t("chat.downloadFailedTitle"), e?.message || String(e));
    }
  }

  /* ───────────────── IMAGE ───────────────── */
  const pickImage = useCallback(async () => {
    try {
      if (!threadId) return;
      if (!canSendChatMessages) return;

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(t("chat.permissionMissingTitle"), t("chat.photosPermissionBody"));
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;

      const tempId = "tmp-img-" + Date.now() + "-" + Math.random().toString(36).slice(2);

      setMessages((prev) =>
        mergeById(prev, [
          {
            _id: tempId,
            text: "",
            createdAt: new Date(),
            user: { _id: myId, avatar: myAvatar },
            image: a.uri,
            pending: true,
            kind: "image",
          } as any,
        ])
      );

      const uploaded = await uploadToS3(apollo, {
        uri: a.uri,
        name: a.fileName ?? "image.jpg",
        type: a.mimeType ?? "image/jpeg",
      });

      const res2 = await sendMessage({
        variables: {
          input: {
            threadId,
            clientId: tempId,
            kind: "image",
            media: { key: uploaded.key, mime: uploaded.mime },
          },
        },
      });

      const serverMsg = res2.data?.sendMessage as MsgNode | undefined;

      if (serverMsg?.id) {
        const sid = String(serverMsg.id);
        seenIds.current.add(sid);

        setMessages((prev) => mergeById(prev, mapMessages([serverMsg], t)));
      } else {
        setMessages((prev) =>
          prev.map((x) => (String(x._id) === String(tempId) ? ({ ...x, pending: false } as any) : x))
        );
      }
    } catch (e: any) {
      console.warn("[Chat] pickImage failed:", e?.message || e);
      Alert.alert(t("chat.imageSendFailedTitle"), e?.message || t("chat.imageSendFailedBody"));
    }
  }, [apollo, threadId, canSendChatMessages, sendMessage, myId, myAvatar, t]);

  const pickGroupImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert(t("chat.permissionMissingTitle"), t("chat.photosPermissionBody"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    const asset = res.assets?.[0];
    if (!res.canceled && asset?.uri) {
      setEditGroupImageUri(asset.uri);
      setEditGroupImageMime(asset.mimeType ?? "image/jpeg");
      setEditGroupImageName(asset.fileName ?? "group-chat.jpg");
    }
  }, [t]);

  const saveGroupSettings = useCallback(async () => {
    const nextTitle = editGroupTitle.trim();
    if (!nextTitle) {
      Alert.alert(t("common.error"), t("messages.groupNameRequired"));
      return;
    }

    try {
      let imageKey: string | undefined;
      if (editGroupImageUri && !/^https?:\/\//i.test(editGroupImageUri)) {
        const uploaded = await uploadToS3(apollo, {
          uri: editGroupImageUri,
          name: editGroupImageName,
          type: editGroupImageMime,
        });
        imageKey = uploaded.key;
      }

      await updateThreadSettings({
        variables: {
          threadId,
          title: nextTitle,
          imageKey,
        },
      });
      await refetchThreadInfo();
      setGroupSettingsOpen(false);
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("common.tryAgain"));
    }
  }, [editGroupImageMime, editGroupImageName, editGroupImageUri, editGroupTitle, refetchThreadInfo, t, threadId, updateThreadSettings]);

  const confirmRemoveMember = useCallback(
    (member: any) => {
      if (!viewerIsThreadOwner || !member?.id || member.id === myId) return;
      Alert.alert(
        t("chat.removeMemberTitle"),
        t("chat.removeMemberBody", { username: member.username ?? t("chat.thisMember") }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("chat.removeMemberCta"),
            style: "destructive",
            onPress: async () => {
              try {
                await removeThreadMember({ variables: { threadId, userId: member.id } });
                await refetchThreadInfo();
              } catch (e: any) {
                Alert.alert(t("common.error"), e?.message ?? t("common.tryAgain"));
              }
            },
          },
        ]
      );
    },
    [myId, refetchThreadInfo, removeThreadMember, t, threadId, viewerIsThreadOwner]
  );

  const renderMessageImage = useCallback(
    (props: any) => {
      const uri = props?.currentMessage?.image;
      if (!uri) return null;
      const cacheKey = String(uri).split("?")[0];
      return (
        <View style={{ padding: 2 }}>
          <ExpoImage source={{ uri, cacheKey }} style={styles.image} contentFit="cover" cachePolicy="disk" transition={120} />
        </View>
      );
    },
    [styles.image]
  );
  const openStoryFromMsg = useCallback(
  (m: any) => {
    const story = m?.story;
    if (!story?.id) return;

    // ⚠️ Du brauchst einen Screen/Flow der eine einzelne Story öffnen kann.
    // Minimal: StoryViewer mit 1 Slide.
    navigation.navigate("StoryViewer", {
      user: story.author ? { id: story.author.id, username: story.author.username, avatar: story.author.avatarUrl } : { id: undefined, username: t("chat.storyFallbackName"), avatar: null },
      slides: [
        {
          id: story.id,
          uri: story.mediaUrl,
          isVideo: !!story.isVideo,
          thumb: story.thumbUrl ?? null,
          when: story.createdAt ?? undefined,
          userId: story.author?.id ?? null,
        },
      ],
      startIndex: 0,
      mine: false,
    });
  },
  [navigation, t]
);

const renderCustomView = useCallback(
  (props: any) => {
    const m = props?.currentMessage as any;
    if (!m) return null;

    const userId = String(m?.user?._id ?? "");
    const isMine = !!userId && userId === String(myId);
    const name = typeof m?.user?.name === "string" ? m.user.name.trim() : "";
    const senderName = isGroupChat && !isMine && name ? (
      <Text style={[styles.senderName, { color: nameColorForUser(userId) }]} numberOfLines={1}>
        {name}
      </Text>
    ) : null;

    const story = m.story;
    const expired = !!m.storyExpired;

    if (!story && !expired) return senderName;

    // ───────────────── Expired ─────────────────
    if (expired || !story?.mediaUrl) {
      return (
        <View>
          {senderName}
          <View style={[styles.storyExpiredCard, { backgroundColor: C.card, borderColor: C.border,width: storyCardWidth, alignSelf: "flex-start", }]}>
            <Ionicons name="time-outline" size={18} color={C.sub} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.storyExpiredTitle, { color: C.text }]}>
                {t("chat.storyNoLongerAvailable")}</Text>
              <Text style={[styles.storyExpiredSub, { color: C.sub }]}>
                {t("chat.thisStoryHasExpired")}</Text>
            </View>
          </View>
        </View>
      );
    }

    // ───────────────── Story Card ─────────────────
    const authorId = story.author?.id;
    const isMineStory = !!authorId && String(authorId) === String(myId);
    const isOpenable = !isMineStory;

    const Container: any = isOpenable ? TouchableOpacity : View;
    const thumbUri = story.thumbUrl || story.mediaUrl ;
    const thumbCacheKey = thumbUri ? String(thumbUri).split("?")[0] : undefined;

    const authorAvatar =
      story?.author?.avatarThumbUrl ||
      story?.author?.avatarUrl ||
      null;

    return (
      <View>
      {senderName}
      <Container
        activeOpacity={isOpenable ? 0.9 : undefined}
        onPress={isOpenable ? () => openStoryFromMsg(m) : undefined}
        style={[
          styles.storyCard,
          {
            backgroundColor: C.card,
            borderColor: C.border,
            opacity: isOpenable ? 1 : 0.85, // dezenter disabled look
            width: storyCardWidth,
            alignSelf: "flex-start",
            marginLeft: 15,
            marginRight: 10,
          },
        ]}
      >
        {/* ─── Thumbnail ─── */}
        <View style={styles.storyThumbOuter}>
          <ExpoImage
            source={thumbUri ? { uri: thumbUri, cacheKey: thumbCacheKey } : avatarPlaceholder}
            style={styles.storyThumb}
            contentFit="cover"
            cachePolicy="disk"
            transition={120}
          />

          {/* leichter Overlay */}
          <View style={styles.storyThumbOverlay} />

          {/* Story Badge (bleibt) */}
          <View style={styles.storyBadge}>
            <Ionicons
              name={story.isVideo ? "play" : "image-outline"}
              size={12}
              color="#fff"
            />
            <Text style={styles.storyBadgeText}>
              {story.isVideo ? t("chat.storyBadgeVideo") : t("chat.storyBadgePhoto")}
            </Text>
          </View>
        </View>

        {/* ─── Footer ─── */}
        <View style={styles.storyFooter}>
          <Text style={[styles.storyReplyText, { color: C.text }]}>
            {t("chat.replyToStory")}</Text>

          <Ionicons name="chevron-forward" size={18} color={C.sub} />
        </View>
      </Container>
      </View>
    );
  },
  [C, isGroupChat, myId, navigation, openStoryFromMsg, styles, storyCardWidth, t]
);


  /* ───────────────── Toolbar ───────────────── */
  const renderPillToolbar = useCallback(
    (props: any) => {
      const handlePressSend = () => {
        if (!canSendChatMessages) return;
        const text = inputText.trim();
        if (!text) return;

        props.onSend?.(
          [{ _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, createdAt: new Date(), user: { _id: myId } }],
          true
        );

        setInputText("");
      };

      if (!canSendChatMessages) {
        return (
          <View style={[styles.toolbarWrap, { backgroundColor: C.bg, paddingBottom: 0 }]}>
            <View style={[styles.broadcastNotice, { backgroundColor: C.card, borderColor: C.border }]}>
              <Ionicons name={isChatDisabled ? "chatbubbles-outline" : "megaphone-outline"} size={18} color={C.sub} />
              <Text style={[styles.broadcastNoticeText, { color: C.sub }]}>
                {isChatDisabled ? t("chat.chatDisabledNotice") : t("chat.broadcastOnlyNotice")}
              </Text>
            </View>
          </View>
        );
      }

      return (
        <View style={[styles.toolbarWrap, { backgroundColor: C.bg, paddingBottom: 0 }]}>
          {!hasText && (
            <TouchableOpacity style={styles.camBtn} onPress={pickImage} activeOpacity={0.78} hitSlop={10}>
              <Ionicons name="camera-outline" size={24} color={C.text} />
            </TouchableOpacity>
          )}

          <View style={[styles.pill, { backgroundColor: C.card, borderColor: C.border }]}>
            <Composer
              {...props}
              text={inputText}
              onTextChanged={setInputText}
              placeholder={t("chat.sendAMessage")}
              textInputProps={{ placeholderTextColor: C.sub, multiline: true, blurOnSubmit: false }}
              textInputStyle={[styles.composer, { color: C.text }]}
            />

            {hasText ? (
              <TouchableOpacity style={styles.sendBtn} onPress={handlePressSend} activeOpacity={0.78} hitSlop={10}>
                <Ionicons name="send" size={20} color={C.accent} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 8 }} />
            )}
          </View>
        </View>
      );
    },
    [C.bg, C.card, C.border, C.text, C.sub, C.accent, canSendChatMessages, hasText, inputText, isChatDisabled, myId, pickImage, t]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 10 }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.78}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: C.text }]} numberOfLines={1}>
          {headerTitle}
        </Text>

        {threadCommunity?.id ? (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={openCommunityLiveFeed}
            activeOpacity={0.78}
            hitSlop={12}
            accessibilityLabel={t("chat.openLiveFeed")}
          >
            <Ionicons name="aperture-outline" size={24} color={C.text} />
          </TouchableOpacity>
        ) : isPlainGroupChat ? (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={openGroupSettings}
            activeOpacity={0.78}
            hitSlop={12}
            accessibilityLabel={t("chat.groupSettings")}
          >
            <Ionicons name="settings-outline" size={23} color={C.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{ _id: myId, avatar: myAvatar }}
        text={inputText}
        onInputTextChanged={setInputText}
        keyboardShouldPersistTaps="handled"
        messagesContainerStyle={{ backgroundColor: C.bg }}
        renderMessage={renderMessage}
        renderBubble={renderBubble}
        renderMessageText={renderMessageText}
        renderCustomView={renderCustomView}
        renderInputToolbar={renderPillToolbar}
        renderMessageImage={renderMessageImage}
        locale={chatLanguage}
        timeFormat={chatTimeFormat}
        dateFormat={chatDateFormat}
        dateFormatCalendar={chatDateFormatCalendar}
        messageIdGenerator={() => `${Date.now()}-${Math.random().toString(36).slice(2)}`}
        onLongPress={(_ctx, message) => setActionMsg(message)}
        // ✅ AVATAR wirklich aktivieren:
        showUserAvatar={true} 
        showAvatarForEveryMessage={true}
        renderAvatar={renderAvatar}
        // falls du trotzdem onPressAvatar willst:
        onPressAvatar={(user) => {
          const userId = String((user as any)?._id);
          if (userId) openUserProfile(userId);
        }}
      />

      <Modal visible={groupSettingsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGroupSettingsOpen(false)}>
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: C.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <TouchableOpacity style={styles.modalIconBtn} onPress={() => setGroupSettingsOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t("chat.groupSettings")}</Text>
            <View style={styles.modalIconBtn} />
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {viewerIsThreadOwner ? (
              <View style={[styles.settingsCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <TouchableOpacity style={styles.groupImageEditBtn} onPress={pickGroupImage} activeOpacity={0.82}>
                  {editGroupImageUri ? (
                    <ExpoImage source={{ uri: editGroupImageUri }} style={styles.groupImageEditPreview} contentFit="cover" />
                  ) : (
                    <Ionicons name="camera-outline" size={26} color={C.sub} />
                  )}
                </TouchableOpacity>

                <TextInput
                  style={[styles.groupNameInput, { color: C.text, borderColor: C.border, backgroundColor: C.bg }]}
                  placeholder={t("messages.groupNamePlaceholder")}
                  placeholderTextColor={C.sub}
                  value={editGroupTitle}
                  onChangeText={setEditGroupTitle}
                  maxLength={48}
                  autoCorrect={false}
                />

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: C.text }, (!editGroupTitle.trim() || groupSettingsSaving) && { opacity: 0.45 }]}
                  onPress={saveGroupSettings}
                  disabled={!editGroupTitle.trim() || groupSettingsSaving}
                  activeOpacity={0.82}
                >
                  {groupSettingsSaving ? (
                    <ActivityIndicator size="small" color={C.bg} />
                  ) : (
                    <Text style={[styles.saveBtnText, { color: C.bg }]}>{t("common.save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[styles.membersTitle, { color: C.sub }]}>{t("chat.groupMembers")}</Text>
            <View style={[styles.settingsCard, { backgroundColor: C.card, borderColor: C.border }]}>
              {groupMembers.map((member: any) => {
                const isMe = member.id === myId;
                return (
                  <View key={member.id} style={[styles.memberRow, { borderBottomColor: C.border }]}>
                    <ExpoImage
                      source={member.avatarThumbUrl || member.avatarUrl ? { uri: member.avatarThumbUrl || member.avatarUrl } : avatarPlaceholder}
                      style={styles.memberAvatar}
                      contentFit="cover"
                      cachePolicy="disk"
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.memberName, { color: C.text }]} numberOfLines={1}>@{member.username}</Text>
                      {isMe ? <Text style={[styles.memberSub, { color: C.sub }]}>{t("chat.you")}</Text> : null}
                    </View>
                    {viewerIsThreadOwner && !isMe ? (
                      <TouchableOpacity
                        style={styles.removeMemberBtn}
                        onPress={() => confirmRemoveMember(member)}
                        disabled={memberRemoving}
                        hitSlop={10}
                      >
                        <Ionicons name="remove-circle-outline" size={22} color={C.danger ?? "#ef4444"} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ActionSheet />
    </SafeAreaView>
  );
}

/* ───────────────── Helpers ───────────────── */
function isWelcomeMessageNode(node?: MsgNode | null) {
  return node?.kind === "text" && node.text === WELCOME_MESSAGE_I18N_TOKEN;
}

function mapMessages(nodes: MsgNode[], t: (key: string) => string): IMessage[] {
  return nodes.map((n) => {
    const isWelcome = isWelcomeMessageNode(n);
    const stableId = n.clientId || n.id;

    return {
      _id: stableId,
      serverId: n.id,
      text: n.kind === "text" ? (isWelcome ? t("chat.welcomeMessage") : n.text ?? "") : "",
      createdAt: new Date(n.createdAt),
      user: {
        _id: n.sender.id,
        name: n.sender.username,
        avatar: n.sender.avatarThumbUrl ?? n.sender.avatarUrl ?? undefined,
      },
      image: n.kind === "image" ? n.media?.url : undefined,
      video: n.kind === "video" ? n.media?.url : undefined,
      kind: n.kind,
      story: n.story ?? null,
      storyExpired: Boolean(n.storyExpired),
      systemWelcome: isWelcome,
      pending: false,
    };
  }) as any;
}

function hasMessage(prev: IMessage[], id: string) {
  return prev.some((m: any) => String(m._id) === String(id) || String(m.serverId ?? "") === String(id));
}

function mergeById(prev: IMessage[], incoming: IMessage[]) {
  const map = new Map<string, IMessage>();
  const serverIdToLocalId = new Map<string, string>();

  for (const m of prev) {
    const localId = String(m._id);
    map.set(localId, m);
    const serverId = String((m as any).serverId ?? "");
    if (serverId) serverIdToLocalId.set(serverId, localId);
  }

  for (const m of incoming) {
    const incomingId = String(m._id);
    const incomingServerId = String((m as any).serverId ?? "");
    const existingLocalId =
      serverIdToLocalId.get(incomingId) ||
      (incomingServerId ? serverIdToLocalId.get(incomingServerId) : undefined);

    if (existingLocalId && map.has(existingLocalId)) {
      const existing = map.get(existingLocalId)! as any;
      map.set(existingLocalId, {
        ...existing,
        ...m,
        _id: existing._id,
        serverId: incomingServerId || incomingId,
        createdAt: existing.createdAt,
      } as any);
      continue;
    }

    map.set(incomingId, m);
    if (incomingServerId) serverIdToLocalId.set(incomingServerId, incomingId);
  }
  const out = Array.from(map.values());
  out.sort((a, b) => +new Date(b.createdAt as any) - +new Date(a.createdAt as any));
  return out;
}

/* ───────────────── Styles ───────────────── */
const makeStyles = (C: any) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingBottom: 8,
      gap: 10,
    },
    headerBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontWeight: "800",
      fontSize: 16,
    },
    modalRoot: {
      flex: 1,
    },
    modalHeader: {
      height: 56,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    modalIconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "900",
    },
    modalBody: {
      padding: 16,
      gap: 14,
    },
    settingsCard: {
      borderWidth: 1,
      borderRadius: 18,
      padding: 12,
      gap: 12,
    },
    groupImageEditBtn: {
      alignSelf: "center",
      width: 86,
      height: 86,
      borderRadius: 43,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    groupImageEditPreview: {
      width: "100%",
      height: "100%",
    },
    groupNameInput: {
      minHeight: 44,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 12,
      fontSize: 16,
      fontWeight: "800",
    },
    saveBtn: {
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtnText: {
      fontSize: 14,
      fontWeight: "900",
    },
    membersTitle: {
      fontSize: 12,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0,
      marginTop: 4,
    },
    memberRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    memberAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    memberName: {
      fontSize: 14,
      fontWeight: "800",
    },
    memberSub: {
      fontSize: 12,
      fontWeight: "600",
      marginTop: 1,
    },
    removeMemberBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
    },
    senderName: {
      marginHorizontal: 10,
      marginTop: 7,
      marginBottom: 2,
      fontSize: 12,
      fontWeight: "800",
    },

    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 6,
    },
    timeText: {
      fontSize: 11,
      opacity: 0.7,
    },
    statusSlot: {
      width: 12, // ✅ immer gleich
      height: 12,
      alignItems: "center",
      justifyContent: "center",
    },

    toolbarWrap: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingTop: 18,
    },
    broadcastNotice: {
      flex: 1,
      minHeight: 42,
      borderRadius: 21,
      borderWidth: 1,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    broadcastNoticeText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center",
    },
    camBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      backgroundColor: "transparent",
    },
    pill: {
      flex: 1,
      minHeight: 38,
      maxHeight: 120,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 10,
      paddingRight: 6,
    },
    composer: {
      flex: 1,
      fontSize: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
      backgroundColor: "transparent",
    },
    image: {
      width: 220,
      height: 220,
      borderRadius: 14,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    storyAttachWrap: {
      marginTop: 6,
      borderWidth: 1,
      borderRadius: 14,
      padding: 10,
    },
    storyAttachRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    storyAttachKicker: {
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 2,
    },
    storyAttachTitle: {
      fontSize: 14,
      fontWeight: "800",
    },
    storyAttachSub: {
      fontSize: 12,
      fontWeight: "600",
      marginTop: 2,
    },
    storyThumbWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
    },
    storyVideoBadge: {
      position: "absolute",
      right: 4,
      bottom: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.55)",
    },

    welcomeInlineText: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "600",
    },
    welcomeInlineLink: {
      fontWeight: "900",
      textDecorationLine: "underline",
    },

    storyCard: {
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 18,
      overflow: "hidden",
    },

    storyThumbOuter: {
      height: 130,
      width: "100%",
      position: "relative",
    },

    storyThumb: {
      width: "100%",
      height: "100%",
    },

    storyThumbOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.18)",
    },

    storyBadge: {
      position: "absolute",
      left: 10,
      bottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(0,0,0,0.55)",
    },

    storyBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },

    storyFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 12,
    },

    storyReplyText: {
      fontSize: 14,
      fontWeight: "800",
    },

    // ─── Expired ───
    storyExpiredCard: {
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 16,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    storyExpiredTitle: {
      fontSize: 14,
      fontWeight: "900",
    },

    storyExpiredSub: {
      fontSize: 12,
      fontWeight: "700",
      marginTop: 2,
    },

  });
