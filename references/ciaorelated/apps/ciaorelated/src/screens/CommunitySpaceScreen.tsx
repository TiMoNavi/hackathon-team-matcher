import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { gql, useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Svg, { Rect } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import Screen from "./components/Screen";
import { AvatarImage } from "./components/AvatarImage";
import { useTheme } from "../theme/ThemeProvider";
import { PostCard } from "./components/feed/PostCard";
import { useMarkPostViewed } from "../hooks/useMarkPostViewed";
import { buildJoinUrl } from "../config/webLinks";
import { brand } from "../config/brand";

const heroBackground = require("../../assets/sticky-header-bg.png");

const QR_CARD_SIZE = 1080;
const QR_GRID_SIZE = 820;

type QrModule = { x: number; y: number; size: number };
const QRCode = require("qrcode/lib/core/qrcode") as {
  create: (value: string, options: { errorCorrectionLevel: "H" }) => {
    modules: {
      size: number;
      get: (x: number, y: number) => boolean | number;
    };
  };
};

const JOIN_COMMUNITY = gql`
  mutation JoinCommunitySpace($slug: String!) {
    joinGroupLink(slug: $slug) { id title }
  }
`;

const COMMUNITY_SPACE = gql`
  query CommunitySpace($id: ID!, $offset: Int = 0, $limit: Int = 30) {
    groupLink(id: $id) {
      id
      title
      type
      visibility
      isNetworkCommunity
      slug
      imageUrl
      imageThumbUrl
      memberCount
      viewerIsOwner
      viewerIsMember
      owner {
        id
        username
        avatarUrl
        avatarThumbUrl
      }
    }
    groupLinkMembers(groupId: $id, limit: 60) {
      id
      username
      name
      avatarUrl
      avatarThumbUrl
      isFollowing
      followRequested
      isPrivate
    }
    groupLinkPosts(groupId: $id, offset: $offset, limit: $limit) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      caption
      location
      createdAt
      likeCount
      commentCount
      isLiked
      communityContext {
        groupId
        title
        type
        slug
      }
      taggedUsers {
        status
        showOnProfile
        user {
          id
          username
          avatarUrl
          avatarThumbUrl
        }
      }
      author {
        id
        username
        avatarUrl
        avatarThumbUrl
        isFollowing
        followRequested
        isPrivate
      }
      isCarousel
      media {
        id
        idx
        kind
        imageUrl
        videoUrl
        thumbUrl
        width
        height
        durationS
      }
    }
  }
`;

const COMMUNITY_THREAD = gql`
  query CommunityThread($groupId: ID!) {
    communityThread(groupId: $groupId) {
      id
      title
      kind
    }
  }
`;

const SET_COMMUNITY_CHAT_KIND = gql`
  mutation SetCommunityChatKind($groupId: ID!, $kind: ThreadKind!) {
    setCommunityChatKind(groupId: $groupId, kind: $kind) {
      id
      kind
    }
  }
`;

const UPDATE_GROUP_LINK = gql`
  mutation UpdateGroupLink($id: ID!, $input: UpdateGroupLinkInput!) {
    updateGroupLink(id: $id, input: $input) {
      id
      title
      imageUrl
      imageThumbUrl
      viewerIsOwner
      viewerIsMember
    }
  }
`;

const GET_SIGNED_GROUP_IMAGE_UPLOAD = gql`
  mutation GetSignedGroupLinkImageUpload($groupId: ID!, $mime: String!, $size: Int!) {
    getSignedGroupLinkImageUpload(groupId: $groupId, mime: $mime, size: $size) {
      key
      putUrl
    }
  }
`;

const REMOVE_GROUP_LINK_MEMBER = gql`
  mutation RemoveGroupLinkMember($groupId: ID!, $profileId: ID!) {
    removeGroupLinkMember(groupId: $groupId, profileId: $profileId)
  }
`;

function inviteUrl(slug?: string | null) {
  return slug ? buildJoinUrl(slug) : "";
}

function isLocalUri(uri?: string | null) {
  return !!uri && /^(file|ph|content|assets):\/\//i.test(uri);
}

function mimeFromUri(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function createQrModules(value: string): { modules: QrModule[]; size: number } {
  if (!value) return { modules: [], size: 0 };
  const qr = QRCode.create(value, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const modules: QrModule[] = [];
  const centerFrom = Math.floor(size * 0.36);
  const centerTo = Math.ceil(size * 0.64);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x >= centerFrom && x <= centerTo && y >= centerFrom && y <= centerTo) continue;
      if (qr.modules.get(x, y)) modules.push({ x, y, size: 1 });
    }
  }

  return { modules, size };
}

export default function CommunitySpaceScreen() {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const groupId = route.params?.id;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const C = theme.colors as any;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => styles(C), [C]);

  const { data, loading, error, refetch } = useQuery(COMMUNITY_SPACE, {
    variables: { id: groupId, offset: 0, limit: 30 },
    skip: !groupId,
    fetchPolicy: "cache-and-network",
  });
  const [loadCommunityThread, { data: threadData, loading: chatLoading }] = useLazyQuery(COMMUNITY_THREAD, {
    fetchPolicy: "network-only",
  });
  const [setCommunityChatKind, { loading: chatModeSaving }] = useMutation(SET_COMMUNITY_CHAT_KIND);
  const [joinCommunity, { loading: joining }] = useMutation(JOIN_COMMUNITY);
  const [updateGroupLink, { loading: groupSaving }] = useMutation(UPDATE_GROUP_LINK);
  const [getSignedGroupImageUpload] = useMutation(GET_SIGNED_GROUP_IMAGE_UPLOAD);
  const [removeGroupLinkMember, { loading: memberRemoving }] = useMutation(REMOVE_GROUP_LINK_MEMBER);

  const fallbackGroup = {
    id: groupId,
    title: route.params?.title ?? t("communityspace.communityFallback"),
    type: route.params?.type ?? "COMMUNITY",
    slug: route.params?.slug ?? null,
    memberCount: 0,
  };
  const group = data?.groupLink ?? fallbackGroup;
  const posts = data?.groupLinkPosts ?? [];
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const markPostViewed = useMarkPostViewed();
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const top = viewableItems?.find((v: any) => v.isViewable && v.item?.id);
    const id = top?.item?.id ?? null;
    setActivePostId(id);
    markPostViewed(id);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const members = data?.groupLinkMembers ?? [];
  const isEvent = group?.type === "EVENT";
  const link = inviteUrl(group?.slug);
  const groupAvatarThumb = group?.imageThumbUrl ?? group?.owner?.avatarThumbUrl ?? null;
  const groupAvatarFull = group?.imageUrl ?? group?.owner?.avatarUrl ?? null;
  const communityThread = threadData?.communityThread;
  const isNetworkCommunity = group?.isNetworkCommunity === true;
  const isChatDisabled = isNetworkCommunity || communityThread?.kind === "DISABLED";
  const isOwner = Boolean(group?.viewerIsOwner);
  const isMember = isOwner || Boolean(group?.viewerIsMember);
  const qrShareRef = useRef<View>(null);
  const [qrSharing, setQrSharing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const qr = useMemo(() => createQrModules(link), [link]);

  const shareLink = async () => {
    if (!link) return;
    await Share.share({ message: link });
  };

  const copyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    Alert.alert(t("communityspace.linkCopiedTitle"), t("communityspace.linkCopiedBody"));
  };

  const openCommunityChat = async () => {
    if (!isMember || isNetworkCommunity) return;
    try {
      const result = communityThread
        ? { data: { communityThread } }
        : await loadCommunityThread({ variables: { groupId: String(group?.id ?? groupId) } });
      const thread = result?.data?.communityThread;
      const threadId = thread?.id;
      if (!threadId) {
        Alert.alert(t("communityspace.chatUnavailableTitle"), t("communityspace.chatUnavailableBody"));
        return;
      }
      if (thread?.kind === "DISABLED") {
        Alert.alert(t("communityspace.chatDisabledTitle"), t("communityspace.chatDisabledBody"));
        return;
      }

      nav.navigate("Chat", {
        threadId,
        title: thread?.title ?? group?.title ?? t("communityspace.communityFallback"),
      });
    } catch {
      Alert.alert(t("communityspace.chatUnavailableTitle"), t("communityspace.chatUnavailableBody"));
    }
  };

  const shareQrCode = async () => {
    if (!link || !qrShareRef.current || qrSharing) return;
    try {
      setQrSharing(true);
      const uri = await captureRef(qrShareRef, {
        format: "png",
        quality: 1,
        width: QR_CARD_SIZE,
        height: QR_CARD_SIZE,
        result: "tmpfile",
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          dialogTitle: group?.title ?? t("communityspace.communityFallback"),
          mimeType: "image/png",
          UTI: "public.png",
        });
      } else {
        await Share.share({ message: link });
      }
    } catch {
      Alert.alert(t("communityspace.qrShareFailedTitle"), t("communityspace.qrShareFailedBody"));
    } finally {
      setQrSharing(false);
    }
  };

  const setBroadcastMode = async (enabled: boolean) => {
    try {
      await setCommunityChatKind({
        variables: {
          groupId: String(group?.id ?? groupId),
          kind: enabled ? "BROADCAST" : "COMMUNITY",
        },
      });
      await loadCommunityThread({ variables: { groupId: String(group?.id ?? groupId) } });
    } catch {
      Alert.alert(t("communityspace.chatModeFailedTitle"), t("communityspace.chatModeFailedBody"));
    }
  };

  const setChatDisabledMode = async (enabled: boolean) => {
    try {
      await setCommunityChatKind({
        variables: {
          groupId: String(group?.id ?? groupId),
          kind: enabled ? "DISABLED" : "COMMUNITY",
        },
      });
      await loadCommunityThread({ variables: { groupId: String(group?.id ?? groupId) } });
    } catch {
      Alert.alert(t("communityspace.chatModeFailedTitle"), t("communityspace.chatModeFailedBody"));
    }
  };

  const openCommunityEdit = () => {
    setEditTitle(String(group?.title ?? ""));
    setEditImageUri(groupAvatarThumb ?? groupAvatarFull ?? null);
    setSettingsOpen(false);
    setEditOpen(true);
  };

  const pickCommunityImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("communityspace.permissionNeededTitle"), t("communityspace.permissionNeededBody"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setEditImageUri(result.assets[0].uri);
    }
  };

  const saveCommunityEdit = async () => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      Alert.alert(t("common.error"), t("communityspace.titleRequired"));
      return;
    }

    try {
      const input: any = { title: nextTitle };
      if (isLocalUri(editImageUri)) {
        const info = await FileSystem.getInfoAsync(editImageUri!);
        if (!info.exists) throw new Error(t("communityspace.imageMissing"));

        const mime = mimeFromUri(editImageUri!);
        const signed = await getSignedGroupImageUpload({
          variables: {
            groupId: String(group?.id ?? groupId),
            mime,
            size: info.size ?? 0,
          },
        });
        const { key, putUrl } = signed.data.getSignedGroupLinkImageUpload;
        const upload = await FileSystem.uploadAsync(putUrl, editImageUri!, {
          httpMethod: "PUT",
          headers: { "Content-Type": mime },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });

        if (upload.status !== 200 && upload.status !== 204) {
          throw new Error(t("communityspace.uploadFailedStatus", { status: upload.status }));
        }

        input.imageKey = key;
      }

      await updateGroupLink({
        variables: { id: String(group?.id ?? groupId), input },
      });
      await refetch();
      setEditOpen(false);
    } catch (e: any) {
      Alert.alert(t("communityspace.editFailedTitle"), e?.message ?? t("communityspace.editFailedBody"));
    }
  };

  const openCommunitySettings = async () => {
    if (!isMember) return;
    setSettingsOpen(true);
    if (!isNetworkCommunity && !communityThread && groupId) {
      try {
        await loadCommunityThread({ variables: { groupId: String(group?.id ?? groupId) } });
      } catch {}
    }
  };

  const removeMember = (profileId: string, username?: string | null) => {
    Alert.alert(
      t("communityspace.removeMemberTitle"),
      t("communityspace.removeMemberBody", { username: username ? `@${username}` : t("communityspace.thisMember") }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("communityspace.removeMemberCta"),
          style: "destructive",
          onPress: async () => {
            try {
              await removeGroupLinkMember({ variables: { groupId: String(group?.id ?? groupId), profileId } });
              await refetch();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message ?? t("communityspace.removeMemberFailed"));
            }
          },
        },
      ]
    );
  };

  const join = async () => {
    if (!group?.slug || joining) return;
    try {
      await joinCommunity({ variables: { slug: group.slug } });
      await refetch();
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("communityprivacy.joinFailed"));
    }
  };

  const Header = (
    <View>
      <View style={s.hero}>
        <Image source={heroBackground} style={s.heroImage} />
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={[s.backBtn, { top: Math.max(insets.top + 8, 12) }]}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={s.heroShade} />
        <View style={s.heroContent}>
          <View style={s.pill}>
            <Ionicons name={isEvent ? "flash" : group?.type === "DROP" ? "shirt-outline" : "people"} size={14} color="#fff" />
            <Text style={s.pillText}>{isEvent ? t("communityspace.festivalFeed") : group?.type === "DROP" ? "Drop" : t("communityspace.communityLiveFeed")}</Text>
          </View>
          <View style={s.titleRow}>
            <AvatarImage
              thumb={groupAvatarThumb}
              full={groupAvatarFull}
              style={s.groupAvatar}
              recyclingKey={`community-space:${group?.id ?? groupId}`}
            />
            <Text style={s.title} numberOfLines={2}>{group?.title ?? t("communityspace.communityFallback")}</Text>
            {isOwner ? (
              <TouchableOpacity
                style={s.titleEditBtn}
                onPress={openCommunityEdit}
                activeOpacity={0.78}
                hitSlop={12}
                accessibilityLabel={t("communityspace.editCommunity")}
                disabled={groupSaving}
              >
                {groupSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="create-outline" size={15} color="rgba(255,255,255,0.82)" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={s.sub} numberOfLines={2}>
            {isEvent ? t("communityspace.liveMomentsFromEvent") : t("communityspace.momentsFromCommunity")}
          </Text>
          <View style={s.metaRow}>
            <Text style={s.meta}>{t("communityspace.peopleHere", { count: group?.memberCount ?? 0 })}</Text>
            <Text style={s.metaDot}>•</Text>
            <Text style={s.meta}>{t(group?.visibility === "PUBLIC" ? "communityprivacy.public" : "communityprivacy.private")}</Text>
          </View>
        </View>
      </View>

      <View style={s.actions}>
        <TouchableOpacity
          style={s.primaryAction}
          onPress={isMember ? () => nav.navigate("CreateMedia", { initialMode: "POST" }) : join}
          disabled={joining || (!isMember && !group?.slug)}
          activeOpacity={0.9}
        >
          <Ionicons name={isMember ? "camera-outline" : "person-add-outline"} size={18} color={C.bg} />
          <Text style={s.primaryActionText}>{t(isMember ? "communityspace.createEventMoment" : joining ? "communityprivacy.joining" : "communityprivacy.join")}</Text>
        </TouchableOpacity>
        {isMember ? <TouchableOpacity
          style={s.secondaryAction}
          onPress={openCommunitySettings}
          activeOpacity={0.9}
          accessibilityLabel={t("communityspace.settingsTitle")}
          disabled={chatLoading || qrSharing || chatModeSaving}
        >
          {chatLoading || qrSharing || chatModeSaving ? (
            <ActivityIndicator size="small" color={C.text} />
          ) : (
            <Ionicons name="settings-outline" size={18} color={C.text} />
          )}
        </TouchableOpacity> : null}
      </View>

      <View style={s.peopleSection}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{isEvent ? t("communityspace.peopleInEvent") : t("communityspace.peopleInCommunity")}</Text>
          <Text style={s.sectionHint}>{t("communityspace.alsoAt", { title: group?.title ?? t("communityspace.thisCommunity") })}</Text>
        </View>
        <FlatList
          data={members}
          horizontal
          keyExtractor={(item: any) => String(item.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
          renderItem={({ item }: any) => (
            <TouchableOpacity
              style={s.personCard}
              activeOpacity={0.85}
              onPress={() => nav.navigate("UserProfile", { username: item.username, userId: item.id })}
            >
              <AvatarImage
                thumb={item.avatarThumbUrl}
                full={item.avatarUrl}
                style={s.avatar}
                recyclingKey={`community-member:${item.id}`}
              />
              <Text style={s.personName} numberOfLines={1}>@{item.username}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={s.feedIntro}>
        <Text style={s.sectionTitle}>{isEvent ? t("communityspace.liveMomentsFromEvent") : t("communityspace.communityMoments")}</Text>
        <Text style={s.sectionHint}>{t("communityspace.onlyContextPosts")}</Text>
      </View>
    </View>
  );

  if (loading && !data?.groupLink && !route.params?.title) {
    return (
      <Screen scroll={false}>
        <View style={s.center}>
          <ActivityIndicator color={C.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={["left", "right"]} barStyle="light-content">
      <FlatList
        data={posts}
        keyExtractor={(item: any) => String(item.id)}
        ListHeaderComponent={Header}
        refreshing={loading}
        onRefresh={() => refetch()}
        progressViewOffset={96}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListEmptyComponent={
          error ? (
            <View style={s.empty}>
              <Ionicons name="cloud-offline-outline" size={28} color={C.subtext} />
              <Text style={s.emptyTitle}>{t("communityspace.feedUnavailableTitle")}</Text>
              <Text style={s.emptySub}>
                {t("communityspace.feedUnavailableBody")}
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => refetch()}>
                <Text style={s.emptyBtnText}>{t("communityspace.tryAgain")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="sparkles-outline" size={28} color={C.subtext} />
              <Text style={s.emptyTitle}>{t("communityspace.createFirstMoment")}</Text>
              <Text style={s.emptySub}>
                {t("communityspace.emptyBody")}
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={copyLink}>
                <Text style={s.emptyBtnText}>{t("communityspace.inviteWithGroupLink")}</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }: any) => (
          <View style={s.postWrap}>
            <PostCard
              post={item}
              isActive={item.id === activePostId}
              screenFocused
              C={C}
              source={{
                kind: "GROUP",
                groupId: String(group?.id ?? groupId),
                title: group?.title ?? t("communityspace.communityFallback"),
                groupType: group?.type,
              }}
            />
          </View>
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
      <View
        ref={qrShareRef}
        collapsable={false}
        pointerEvents="none"
        style={s.qrShareCard}
      >
        <Svg width={QR_GRID_SIZE} height={QR_GRID_SIZE} viewBox={`0 0 ${qr.size || 1} ${qr.size || 1}`}>
          <Rect x={0} y={0} width={qr.size || 1} height={qr.size || 1} fill="#fff" />
          {qr.modules.map((m, idx) => (
            <Rect key={`${m.x}:${m.y}:${idx}`} x={m.x} y={m.y} width={m.size} height={m.size} fill="#000" />
          ))}
        </Svg>
        <View style={s.qrCenterLabel} pointerEvents="none">
          <Text style={s.qrCenterText}>{brand.qrCenterText}</Text>
        </View>
      </View>

      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalHeader}>
            <TouchableOpacity style={s.modalIconBtn} onPress={() => setEditOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t("communityspace.editCommunity")}</Text>
            <TouchableOpacity
              style={s.modalSaveBtn}
              onPress={saveCommunityEdit}
              disabled={groupSaving}
              activeOpacity={0.82}
            >
              {groupSaving ? (
                <ActivityIndicator size="small" color={C.bg} />
              ) : (
                <Text style={s.modalSaveText}>{t("common.save")}</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.editBody} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={s.editImageWrap} onPress={pickCommunityImage} activeOpacity={0.86}>
              <AvatarImage
                thumb={editImageUri}
                full={editImageUri}
                style={s.editImage}
                recyclingKey={`community-edit:${group?.id ?? groupId}:${editImageUri ?? "empty"}`}
              />
              <View style={s.editImageBadge}>
                <Ionicons name="camera-outline" size={18} color="#fff" />
              </View>
            </TouchableOpacity>

            <Text style={s.inputLabel}>{t("communityspace.communityName")}</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t("communityspace.communityNamePlaceholder")}
              placeholderTextColor={C.subtext}
              style={s.textInput}
              maxLength={80}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={settingsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSettingsOpen(false)}>
        <Screen scroll={false} edges={["top", "left", "right"]}>
          <View style={s.modalHeader}>
            <TouchableOpacity style={s.modalIconBtn} onPress={() => setSettingsOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>{t("communityspace.settingsTitle")}</Text>
            <View style={s.modalIconBtn} />
          </View>

          <ScrollView contentContainerStyle={s.settingsBody}>
            <View style={s.settingsCard}>
              {!isNetworkCommunity ? (
                <TouchableOpacity
                  style={[s.settingsRow, isChatDisabled && { opacity: 0.55 }]}
                  onPress={openCommunityChat}
                  activeOpacity={0.78}
                  disabled={isChatDisabled}
                >
                  <Ionicons name="chatbubbles-outline" size={22} color={C.text} />
                  <View style={s.settingsRowText}>
                    <Text style={s.settingsRowTitle}>
                      {isChatDisabled ? t("communityspace.chatDisabledTitle") : t("communityspace.openChat")}
                    </Text>
                    <Text style={s.settingsRowSub}>
                      {isChatDisabled ? t("communityspace.chatDisabledBody") : t("communityspace.chatModeBody")}
                    </Text>
                  </View>
                  {!isChatDisabled ? <Ionicons name="chevron-forward" size={18} color={C.subtext} /> : null}
                </TouchableOpacity>
              ) : null}

              {isOwner ? (
                <TouchableOpacity style={s.settingsRow} onPress={openCommunityEdit} activeOpacity={0.78}>
                  <Ionicons name="create-outline" size={22} color={C.text} />
                  <View style={s.settingsRowText}>
                    <Text style={s.settingsRowTitle}>{t("communityspace.editCommunity")}</Text>
                    <Text style={s.settingsRowSub}>{t("communityspace.editCommunitySub")}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.subtext} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={s.settingsRow} onPress={shareLink} activeOpacity={0.78}>
                <Ionicons name="share-outline" size={22} color={C.text} />
                <View style={s.settingsRowText}>
                  <Text style={s.settingsRowTitle}>{t("communityspace.shareLink")}</Text>
                  <Text style={s.settingsRowSub}>{link}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.subtext} />
              </TouchableOpacity>

              <TouchableOpacity style={s.settingsRow} onPress={copyLink} activeOpacity={0.78}>
                <Ionicons name="copy-outline" size={22} color={C.text} />
                <View style={s.settingsRowText}>
                  <Text style={s.settingsRowTitle}>{t("communityspace.copyLink")}</Text>
                  <Text style={s.settingsRowSub}>{t("communityspace.copyLinkSub")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.subtext} />
              </TouchableOpacity>

              <TouchableOpacity style={s.settingsRow} onPress={shareQrCode} activeOpacity={0.78}>
                <Ionicons name="qr-code-outline" size={22} color={C.text} />
                <View style={s.settingsRowText}>
                  <Text style={s.settingsRowTitle}>{t("communityspace.shareQr")}</Text>
                  <Text style={s.settingsRowSub}>{t("communityspace.shareQrSub")}</Text>
                </View>
                {qrSharing ? <ActivityIndicator size="small" color={C.text} /> : <Ionicons name="chevron-forward" size={18} color={C.subtext} />}
              </TouchableOpacity>

              {isOwner && !isNetworkCommunity ? (
                <TouchableOpacity
                  style={s.settingsRow}
                  onPress={() => setChatDisabledMode(!isChatDisabled)}
                  activeOpacity={0.78}
                  disabled={chatModeSaving}
                >
                  <Ionicons name={isChatDisabled ? "chatbox-ellipses-outline" : "chatbox-ellipses"} size={22} color={C.text} />
                  <View style={s.settingsRowText}>
                    <Text style={s.settingsRowTitle}>
                      {isChatDisabled ? t("communityspace.enableChat") : t("communityspace.disableChat")}
                    </Text>
                    <Text style={s.settingsRowSub}>
                      {isChatDisabled ? t("communityspace.enableChatSub") : t("communityspace.disableChatSub")}
                    </Text>
                  </View>
                  {chatModeSaving ? <ActivityIndicator size="small" color={C.text} /> : <Ionicons name="chevron-forward" size={18} color={C.subtext} />}
                </TouchableOpacity>
              ) : null}

              {isOwner && !isChatDisabled ? (
                <TouchableOpacity
                  style={s.settingsRow}
                  onPress={() => setBroadcastMode(communityThread?.kind !== "BROADCAST")}
                  activeOpacity={0.78}
                  disabled={chatModeSaving}
                >
                  <Ionicons name={communityThread?.kind === "BROADCAST" ? "megaphone" : "megaphone-outline"} size={22} color={C.text} />
                  <View style={s.settingsRowText}>
                    <Text style={s.settingsRowTitle}>
                      {communityThread?.kind === "BROADCAST" ? t("communityspace.disableBroadcast") : t("communityspace.enableBroadcast")}
                    </Text>
                    <Text style={s.settingsRowSub}>
                      {communityThread?.kind === "BROADCAST" ? t("communityspace.broadcastModeBody") : t("communityspace.broadcastModeSub")}
                    </Text>
                  </View>
                  {chatModeSaving ? <ActivityIndicator size="small" color={C.text} /> : <Ionicons name="chevron-forward" size={18} color={C.subtext} />}
                </TouchableOpacity>
              ) : null}
            </View>

            {isOwner ? (
              <View style={s.settingsSection}>
                <Text style={s.settingsSectionTitle}>{t("communityspace.manageMembers")}</Text>
                <View style={s.settingsCard}>
                  {members.map((member: any) => {
                    const isGroupOwner = member.id === group?.owner?.id;
                    return (
                      <View key={member.id} style={s.memberRow}>
                        <AvatarImage
                          thumb={member.avatarThumbUrl}
                          full={member.avatarUrl}
                          style={s.memberAvatar}
                          recyclingKey={`settings-member:${member.id}`}
                        />
                        <View style={s.settingsRowText}>
                          <Text style={s.settingsRowTitle} numberOfLines={1}>@{member.username}</Text>
                          <Text style={s.settingsRowSub}>{isGroupOwner ? t("communityspace.owner") : t("communityspace.member")}</Text>
                        </View>
                        {!isGroupOwner ? (
                          <TouchableOpacity
                            style={s.removeMemberBtn}
                            onPress={() => removeMember(member.id, member.username)}
                            disabled={memberRemoving}
                            activeOpacity={0.78}
                          >
                            <Ionicons name="remove-circle-outline" size={22} color={C.danger ?? "#ef4444"} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    hero: {
      height: 260,
      backgroundColor: "#111827",
      overflow: "hidden",
      justifyContent: "flex-end",
    },
    heroImage: {
      ...StyleSheet.absoluteFillObject,
      width: "100%",
      height: "100%",
      opacity: 0.82,
    },
    heroShade: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.36)",
    },
    backBtn: {
      position: "absolute",
      left: 12,
      zIndex: 2,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.18)",
    },
    heroContent: { padding: 18, gap: 8 },
    pill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    pillText: { color: "#fff", fontWeight: "800", fontSize: 12 },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    groupAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.34)",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    title: { flexShrink: 1, color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: 0 },
    titleEditBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    sub: { color: "rgba(255,255,255,0.82)", fontSize: 15, fontWeight: "700" },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    meta: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "700" },
    metaDot: { color: "rgba(255,255,255,0.55)", fontWeight: "900" },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      backgroundColor: C.bg,
    },
    primaryAction: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: C.text,
    },
    primaryActionText: { color: C.bg, fontWeight: "900" },
    secondaryAction: {
      width: 42,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    peopleSection: { paddingVertical: 8, backgroundColor: C.bg },
    sectionHeader: { paddingHorizontal: 14, marginBottom: 10 },
    sectionTitle: { color: C.text, fontWeight: "900", fontSize: 17 },
    sectionHint: { color: C.subtext, marginTop: 3, fontWeight: "600", fontSize: 12 },
    personCard: {
      width: 92,
      padding: 10,
      borderRadius: 14,
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    avatar: { width: 54, height: 54, borderRadius: 27, marginBottom: 8 },
    personName: { color: C.text, fontWeight: "800", fontSize: 12, maxWidth: 72 },
    feedIntro: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 8 },
    postWrap: { paddingBottom: 14 },
    empty: {
      margin: 14,
      padding: 20,
      borderRadius: 18,
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    emptyTitle: { color: C.text, fontWeight: "900", fontSize: 17, marginTop: 10 },
    emptySub: { color: C.subtext, textAlign: "center", marginTop: 6, lineHeight: 19 },
    emptyBtn: {
      marginTop: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: C.text,
    },
    emptyBtnText: { color: C.bg, fontWeight: "900" },
    qrShareCard: {
      position: "absolute",
      left: -10000,
      top: 0,
      width: QR_CARD_SIZE,
      height: QR_CARD_SIZE,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#fff",
    },
    qrCenterLabel: {
      position: "absolute",
      left: (QR_CARD_SIZE - 420) / 2,
      top: (QR_CARD_SIZE - 190) / 2,
      width: 420,
      height: 190,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#fff",
    },
    qrCenterText: {
      color: "#000",
      fontFamily: "Pacifico",
      fontSize: 108,
      lineHeight: 156,
      fontWeight: "400",
      letterSpacing: 0,
    },
    modalRoot: {
      flex: 1,
      backgroundColor: C.bg,
    },
    modalHeader: {
      minHeight: 56,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      backgroundColor: C.bg,
    },
    modalIconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: {
      flex: 1,
      color: C.text,
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
    },
    modalSaveBtn: {
      minWidth: 64,
      height: 36,
      paddingHorizontal: 14,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.text,
    },
    modalSaveText: {
      color: C.bg,
      fontWeight: "900",
      fontSize: 14,
    },
    editBody: {
      padding: 18,
      gap: 12,
    },
    editImageWrap: {
      alignSelf: "center",
      marginBottom: 14,
    },
    editImage: {
      width: 108,
      height: 108,
      borderRadius: 54,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    editImageBadge: {
      position: "absolute",
      right: 4,
      bottom: 4,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.72)",
      borderWidth: 2,
      borderColor: C.bg,
    },
    inputLabel: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0,
    },
    textInput: {
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.card,
      color: C.text,
      paddingHorizontal: 14,
      fontSize: 16,
      fontWeight: "700",
    },
    settingsBody: {
      padding: 14,
      paddingBottom: 36,
      gap: 18,
    },
    settingsCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      backgroundColor: C.card,
      overflow: "hidden",
    },
    settingsRow: {
      minHeight: 68,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    settingsRowText: {
      flex: 1,
      minWidth: 0,
    },
    settingsRowTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: "800",
    },
    settingsRowSub: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 3,
    },
    settingsSection: {
      gap: 8,
    },
    settingsSectionTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: "900",
      paddingHorizontal: 2,
    },
    memberRow: {
      minHeight: 64,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    memberAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.border,
    },
    removeMemberBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
  });
