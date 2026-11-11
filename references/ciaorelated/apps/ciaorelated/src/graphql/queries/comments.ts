// apps/ciaorelated/src/graphql/comments.ts
import { gql } from "@apollo/client";

export const POST_COMMENTS = gql`
  query PostComments($postId: ID!, $offset: Int, $limit: Int) {
    postComments(postId: $postId, offset: $offset, limit: $limit) {
      id
      content
      createdAt
      author { id username avatarThumbUrl avatarUrl }
      __typename
    }
  }
`;

