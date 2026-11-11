// apps/ciaorelated/src/screens/components/post/comments/PostCommentSheet.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
} from "react-native";
import { useMutation, useQuery } from "@apollo/client";
import { Image as ExpoImage } from "expo-image";

import { POST_COMMENTS } from "../../../../graphql/queries/comments";
import { ADD_COMMENT, DELETE_COMMENT } from "../../../../graphql/mutations/comments";
import { CommentInput } from "../../CommentInput";
import ReportComment from "../../ReportComment";

// ✅ local placeholder (kein externes URL)
import { avatarPlaceholder } from "../../../../../assets/placeholders";

import { useTranslation } from "react-i18next";

type Props = {
  visible: boolean;
  onClose: () => void;

  postId: string;
  postAuthorId?: string | null;

  meId?: string | null;
  meUsername?: string | null;
  meAvatarUrl?: string | null;

  // ✅ theme.colors (kommt vom parent)
  C?: {
    bg: string;
    card: string;
    text: string;
    subtext: string;
    border: string;
    primary: string;
    danger: string;

    // optional overrides
    sheetBg?: string;
    inputBg?: string;
  };
};

// ✅ shared avatar resolver (thumb-first)
function avatarSource(thumb?: string | null, full?: string | null) {
  if (thumb) return { uri: thumb };
  if (full) return { uri: full };
  return avatarPlaceholder;
}

export function PostCommentSheet({
  visible,
  onClose,
  postId,
  postAuthorId,
  meId,
  meUsername,
  meAvatarUrl,
  C,
}: Props) {
  const { t } = useTranslation();

  const COLORS = React.useMemo(
    () => ({
      bg: C?.bg ?? "#0B0F1A",
      card: C?.card ?? "#121418",
      text: C?.text ?? "#E6ECFF",
      subtext: C?.subtext ?? "#9AA4BF",
      border: C?.border ?? "rgba(255,255,255,0.10)",
      primary: C?.primary ?? "#60a5fa",
      danger: C?.danger ?? "#ef4444",

      // ✅ WICHTIG: sheetBg MUSS deckend sein (nicht transparent)
      sheetBg: C?.sheetBg ?? (C?.bg ?? "#0B0F1A"),
      inputBg: C?.inputBg ?? (C?.card ?? "#121418"),
    }),
    [C]
  );

  const s = React.useMemo(() => styles(COLORS), [COLORS]);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

  React.useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setKeyboardHeight(event.endCoordinates?.height ?? 0)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // nur laden wenn sichtbar
  const { data: cData, refetch: refetchComments } = useQuery(POST_COMMENTS, {
    variables: { postId, offset: 0, limit: 50 },
    skip: !visible,
    fetchPolicy: "cache-and-network",
  });

  const [addComment] = useMutation(ADD_COMMENT, {
    optimisticResponse: ({ content }: { content: string }) => ({
      addComment: {
        __typename: "Comment",
        id: `optimistic-${Math.random().toString(36).slice(2)}`,
        content,
        createdAt: new Date().toISOString(),
        author: {
          __typename: "Profile",
          id: meId ?? "me",
          username: meUsername ?? "Ich",
          avatarThumbUrl: null,
          avatarUrl: meAvatarUrl ?? "",
        },
        post: { __typename: "Post", id: postId },
      },
    }),
    update(cache, { data }) {
      const newComment = data?.addComment;
      if (!newComment) return;

      cache.updateQuery<{ postComments: any[] }>(
        { query: POST_COMMENTS, variables: { postId, offset: 0, limit: 50 } },
        (existing) => {
          const prev = existing?.postComments ?? [];
          if (prev.some((c) => c.id === newComment.id)) return existing;
          return { postComments: [newComment, ...prev] };
        }
      );

      cache.modify({
        id: cache.identify({ __typename: "Post", id: postId }),
        fields: {
          commentCount(c = 0) {
            return c + 1;
          },
        },
      });
    },
  });

  const [deleteComment] = useMutation(DELETE_COMMENT, {
    update(cache, _res, { variables }) {
      const commentId = (variables as any)?.commentId;
      const vars = { postId, offset: 0, limit: 50 };
      const existing: any = cache.readQuery({ query: POST_COMMENTS, variables: vars });

      if (existing?.postComments) {
        cache.writeQuery({
          query: POST_COMMENTS,
          variables: vars,
          data: { postComments: existing.postComments.filter((c: any) => c.id !== commentId) },
        });
      }

      cache.modify({
        id: cache.identify({ __typename: "Post", id: postId }),
        fields: {
          commentCount(c = 0) {
            return Math.max(0, c - 1);
          },
        },
      });
    },
  });

  const onSend = (text: string) => {
    addComment({ variables: { postId, content: text } }).catch(() => refetchComments?.());
  };

  const onDelete = (commentId: string) => {
    deleteComment({ variables: { commentId } }).catch(() => refetchComments?.());
  };

  const comments = cData?.postComments ?? [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.sheetOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <Pressable style={s.backdrop} onPress={onClose} />
        {keyboardHeight > 0 ? (
          <View pointerEvents="none" style={[s.keyboardFill, { height: keyboardHeight }]} />
        ) : null}

        {/* ✅ Sheet MUSS deckend sein */}
        <View style={s.sheet}>
          <View style={s.grabber} />

          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{t("postcommentsheet.comments")}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeButton}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={comments}
            keyExtractor={(c: any) => c.id}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item: c }: any) => {
              const canDelete = !!meId && (c.author?.id === meId || postAuthorId === meId);

              const src = avatarSource(c.author?.avatarThumbUrl, c.author?.avatarUrl);

              return (
                <View style={s.commentRow}>
                  <ExpoImage
                    source={src}
                    style={s.commentAvatar}
                    contentFit="cover"
                    transition={80}
                    cachePolicy="memory-disk"
                    recyclingKey={`cav:${c.author?.id ?? "x"}:${c.author?.avatarThumbUrl ?? c.author?.avatarUrl ?? "p"}`}
                  />

                  <View style={s.commentBody}>
                    <Text style={s.commentText}>
                      <Text style={s.commentUser}>{c.author?.username}</Text> {c.content}
                    </Text>
                    <Text style={s.commentMeta}>{new Date(c.createdAt).toLocaleString()}</Text>
                  </View>

                  <View style={s.commentAction}>
                    {canDelete ? (
                      <TouchableOpacity
                        onPress={() => onDelete(c.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ color: COLORS.danger }}>🗑️</Text>
                      </TouchableOpacity>
                    ) : (
                      <ReportComment commentId={c.id} />
                    )}
                  </View>
                </View>
              );
            }}
          />

          {/* ✅ Abstände als Padding (nicht margin), damit nichts "durchscheint" */}
          <View style={s.sheetInputWrap}>
            <View style={s.commentInputInner}>
              <CommentInput placeholder={t("postcommentsheet.comment")} onSend={onSend} C={COLORS} />
            </View>
          </View>

          {Platform.OS === "android" ? <View style={{ height: 2, backgroundColor: COLORS.sheetBg }} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    sheetOverlay: {
      flex: 1,
      justifyContent: "flex-end",
    },

    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.35)",
    },

    keyboardFill: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: C.sheetBg,
    },

    sheet: {
      backgroundColor: C.sheetBg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "85%",
      overflow: "hidden",
      borderColor: C.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },

    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginTop: 8,
      marginBottom: 14,
    },

    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 10,
      backgroundColor: C.sheetBg,
    },
    sheetTitle: { fontWeight: "900", fontSize: 18, color: C.text },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.card,
    },
    close: { color: C.text, fontSize: 18, opacity: 0.9, lineHeight: 20 },

    commentRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: C.sheetBg,
    },

    commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card },
    commentBody: {
      flex: 1,
      minWidth: 0,
      paddingRight: 2,
    },
    commentText: {
      color: C.text,
      flexShrink: 1,
      lineHeight: 20,
    },
    commentUser: { fontWeight: "700", color: C.text },
    commentMeta: { color: C.subtext, fontSize: 12, marginTop: 2 },
    commentAction: {
      width: 62,
      alignItems: "flex-end",
      flexShrink: 0,
      paddingTop: 1,
    },

    sheetInputWrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      backgroundColor: C.sheetBg,
      paddingTop: 10,
      paddingBottom: 0,
      marginBottom: 12,
    },

    commentInputInner: {
      marginBottom: 0,
      backgroundColor: C.inputBg,
      borderRadius: 20,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
  });
