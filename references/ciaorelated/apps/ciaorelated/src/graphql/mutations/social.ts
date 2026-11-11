import { gql } from "@apollo/client";

export const FOLLOW = gql`
  mutation Follow($userId: ID!) {
    follow(userId: $userId)
  }
`;

export const UNFOLLOW = gql`
  mutation Unfollow($userId: ID!) {
    unfollow(userId: $userId)
  }
`;
