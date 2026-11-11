// apps/ciaorelated/src/graphql/comments.ts
import { gql } from "@apollo/client";


export const ADD_COMMENT = gql`
  mutation AddComment($postId: ID!, $content: String!) {
    addComment(postId: $postId, content: $content) {
      id
      content
      createdAt
      author { id username avatarThumbUrl avatarUrl }
      post { id __typename }
      __typename
    }
  }
`;

export const DELETE_COMMENT = gql`
  mutation DeleteComment($commentId: ID!) {
    deleteComment(commentId: $commentId)
  }
`;
