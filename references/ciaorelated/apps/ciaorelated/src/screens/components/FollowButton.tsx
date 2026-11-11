// apps/ciaorelated/src/screens/components/FollowButton.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { TouchableOpacity, Text, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { gql, useMutation } from "@apollo/client";
import { FOLLOW, UNFOLLOW } from "../../graphql/mutations/social";
import { useTranslation } from "react-i18next";

type Props = {
  userId: string;
  isFollowing?: boolean;
  followRequested?: boolean;
  isPrivate?: boolean;
  me?: boolean;
  compact?: boolean;
  buttonStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const ME_QUERY = gql`query MePrivacyMini { me { id followingCount __typename } }`;

export default function FollowButton({
  userId,
  isFollowing = false,
  followRequested = false,
  isPrivate = false,
  me = false,
  compact,
  buttonStyle,
  textStyle,
}: Props) {
  const [doFollow, { loading: loadingF }] = useMutation(FOLLOW);
  const [doUnfollow, { loading: loadingU }] = useMutation(UNFOLLOW);
  const { t } = useTranslation();


  // local UI state (optimistic)
  const [localFollowing, setLocalFollowing] = useState(isFollowing);
  const [localRequested, setLocalRequested] = useState(followRequested);

  useEffect(() => setLocalFollowing(isFollowing), [isFollowing]);
  useEffect(() => setLocalRequested(followRequested), [followRequested]);

  const loading = loadingF || loadingU;
  if (me) return null;

  const label = useMemo(() => {
    if (localFollowing) return t("followbutton.unfollow");
    if (localRequested) return t("followbutton.requested");
    return t("followbutton.follow");
  }, [localFollowing, localRequested, t]);

  const onPress = useCallback(async () => {
    // 1) already following -> unfollow
    if (localFollowing) {
      setLocalFollowing(false);
      try {
        await doUnfollow({
          variables: { userId },
          optimisticResponse: { unfollow: true },
          update(cache) {
            const userEntityId = cache.identify({ __typename: "User", id: userId });

            // me.followingCount -1
            const meData = cache.readQuery<any>({ query: ME_QUERY });
            if (meData?.me) {
              cache.writeQuery({
                query: ME_QUERY,
                data: {
                  me: {
                    ...meData.me,
                    followingCount: Math.max(0, (meData.me.followingCount ?? 0) - 1),
                    __typename: "User",
                  },
                },
              });
            }

            if (userEntityId) {
              cache.modify({
                id: userEntityId,
                fields: {
                  followerCount(existing = 0) {
                    return Math.max(0, existing - 1);
                  },
                  isFollowing() {
                    return false;
                  },
                  followRequested() {
                    return false;
                  },
                },
              });
            }
          },
        });
      } catch {
        setLocalFollowing(true);
      }
      return;
    }

    // 2) request pending -> cancel (unfollow() cancels request server-side)
    if (localRequested) {
      setLocalRequested(false);
      try {
        await doUnfollow({
          variables: { userId },
          optimisticResponse: { unfollow: true },
          update(cache) {
            const userEntityId = cache.identify({ __typename: "User", id: userId });
            if (userEntityId) {
              cache.modify({
                id: userEntityId,
                fields: {
                  followRequested() {
                    return false;
                  },
                  isFollowing() {
                    return false;
                  },
                },
              });
            }
          },
        });
      } catch {
        setLocalRequested(true);
      }
      return;
    }

    // 3) not following + not requested -> follow (server decides: direct follow vs request)
    // optimistic: if private => requested, else following
    const optimisticRequested = !!isPrivate;
    setLocalRequested(optimisticRequested);
    setLocalFollowing(!optimisticRequested);

    try {
      await doFollow({
        variables: { userId },
        optimisticResponse: { follow: true },
        update(cache) {
          const userEntityId = cache.identify({ __typename: "User", id: userId });

          // followingCount changes ONLY if public follow.
          // For private request: don't change counts.
          if (!isPrivate) {
            const meData = cache.readQuery<any>({ query: ME_QUERY });
            if (meData?.me) {
              cache.writeQuery({
                query: ME_QUERY,
                data: {
                  me: {
                    ...meData.me,
                    followingCount: (meData.me.followingCount ?? 0) + 1,
                    __typename: "User",
                  },
                },
              });
            }
          }

          if (userEntityId) {
            cache.modify({
              id: userEntityId,
              fields: {
                isFollowing() {
                  return !isPrivate;
                },
                followRequested() {
                  return isPrivate;
                },
                followerCount(existing = 0) {
                  // public follow -> +1, private request -> no change
                  return isPrivate ? existing : existing + 1;
                },
              },
            });
          }
        },
      });
    } catch {
      // rollback
      setLocalFollowing(false);
      setLocalRequested(false);
    }
  }, [localFollowing, localRequested, doFollow, doUnfollow, userId, isPrivate]);

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        localFollowing ? styles.secondary : localRequested ? styles.ghost : styles.primary,
        compact && { paddingHorizontal: 10, paddingVertical: 6 },
        buttonStyle,
      ]}
      onPress={onPress}
      disabled={loading}
    >
      <Text style={[styles.text, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  primary: { backgroundColor: "#4F46E5" },
  secondary: { backgroundColor: "#262626" },
  ghost: { backgroundColor: "#1F2937" },
  text: { color: "#fff", fontWeight: "700" },
});
