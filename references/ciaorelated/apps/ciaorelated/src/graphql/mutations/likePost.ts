// apps/ciaorelated/src/graphql/likePost.ts
import { gql } from "@apollo/client";
export const LIKE_POST = gql`
  mutation LikePost($id: ID!) {
    likePost(id: $id) { id likeCount }
  }
`;
