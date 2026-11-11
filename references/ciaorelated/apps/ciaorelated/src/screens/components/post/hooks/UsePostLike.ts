import { gql, useMutation } from "@apollo/client";
import * as React from "react";

const LIKE_POST = gql`
  mutation LikePost($postId: ID!) {
    likePost(postId: $postId) {
      id
      likeCount
      isLiked
      __typename
    }
  }
`;

const UNLIKE_POST = gql`
  mutation UnlikePost($postId: ID!) {
    unlikePost(postId: $postId) {
      id
      likeCount
      isLiked
      __typename
    }
  }
`;

export function usePostLike({
  postId,
  initialLiked,
  initialLikeCount,
}: {
  postId: string;
  initialLiked: boolean;
  initialLikeCount: number;
}) {
  const [liked, setLiked] = React.useState<boolean>(!!initialLiked);
  const [likeCount, setLikeCount] = React.useState<number>(initialLikeCount ?? 0);

  // wenn Post sich ändert / neue Daten reinkommen:
  React.useEffect(() => {
    setLiked(!!initialLiked);
    setLikeCount(initialLikeCount ?? 0);
  }, [postId, initialLiked, initialLikeCount]);

  const [likePost] = useMutation(LIKE_POST);
  const [unlikePost] = useMutation(UNLIKE_POST);

  const toggleLike = React.useCallback(async () => {
    if (!postId) return;

    const next = !liked;
    const prevLiked = liked;
    const prevCount = likeCount;

    // optimistic UI
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));

    try {
      if (next) {
        await likePost({
          variables: { postId },
          optimisticResponse: {
            likePost: {
              __typename: "Post",
              id: postId,
              isLiked: true,
              likeCount: prevCount + 1,
            },
          },
          update(cache, { data }) {
            const u = data?.likePost;
            if (!u) return;
            cache.modify({
              id: cache.identify({ __typename: "Post", id: postId }),
              fields: {
                isLiked: () => true,
                likeCount: () => u.likeCount,
              },
            });
          },
        });
      } else {
        await unlikePost({
          variables: { postId },
          optimisticResponse: {
            unlikePost: {
              __typename: "Post",
              id: postId,
              isLiked: false,
              likeCount: Math.max(0, prevCount - 1),
            },
          },
          update(cache, { data }) {
            const u = data?.unlikePost;
            if (!u) return;
            cache.modify({
              id: cache.identify({ __typename: "Post", id: postId }),
              fields: {
                isLiked: () => false,
                likeCount: () => u.likeCount,
              },
            });
          },
        });
      }
    } catch {
      // rollback
      setLiked(prevLiked);
      setLikeCount(prevCount);
    }
  }, [postId, liked, likeCount, likePost, unlikePost]);

  return { liked, likeCount, toggleLike, setLiked, setLikeCount };
}
