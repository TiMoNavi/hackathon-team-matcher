// apps/ciaorelated/src/graphql/shares.ts
import { gql } from "@apollo/client";

export const REQUEST_SHARE_POST = gql`
  mutation RequestSharePostWithUsers($postId: ID!, $userIds: [ID!]!) {
    requestSharePostWithUsers(postId: $postId, userIds: $userIds)
  }
`;

export const APPROVE_SHARED_POST = gql`
  mutation ApproveSharedPost($postId: ID!) {
    approveSharedPost(postId: $postId)
  }
`;

export const REJECT_SHARED_POST = gql`
  mutation RejectSharedPost($postId: ID!) {
    rejectSharedPost(postId: $postId)
  }
`;

export const SET_SHARED_POST_ON_PROFILE = gql`
  mutation SetSharedPostOnProfile($postId: ID!, $show: Boolean!) {
    setSharedPostOnProfile(postId: $postId, show: $show)
  }
`;

export const SET_POST_GRID_VISIBILITY = gql`
  mutation SetPostGridVisibility($postId: ID!, $visible: Boolean!) {
    setPostGridVisibility(postId: $postId, visible: $visible)
  }
`;