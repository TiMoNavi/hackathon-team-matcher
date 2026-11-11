import { gql, useMutation } from "@apollo/client";
import { useCallback, useRef } from "react";

const MARK_POST_VIEWED = gql`
  mutation MarkPostViewed($postId: ID!) {
    markPostViewed(postId: $postId) {
      id
      viewCount
    }
  }
`;

export function useMarkPostViewed() {
  const viewedRef = useRef<Set<string>>(new Set());
  const [markPostViewed] = useMutation(MARK_POST_VIEWED);

  return useCallback(
    (postId?: string | null) => {
      if (!postId || viewedRef.current.has(postId)) return;
      viewedRef.current.add(postId);
      markPostViewed({ variables: { postId } }).catch(() => {
        viewedRef.current.delete(postId);
      });
    },
    [markPostViewed]
  );
}
