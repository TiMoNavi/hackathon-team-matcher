import { gql } from "@apollo/client";

export const REQUEST_FOLLOW = gql`
  mutation RequestFollow($userId: ID!) {
    requestFollow(userId: $userId)
  }
`;

export const CANCEL_FOLLOW_REQUEST = gql`
  mutation CancelFollowRequest($userId: ID!) {
    cancelFollowRequest(userId: $userId)
  }
`;
