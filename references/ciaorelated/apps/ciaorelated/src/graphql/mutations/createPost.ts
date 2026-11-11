import { gql } from "@apollo/client";
export const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      image
      caption
      location
      likeCount
      createdAt
    }
  }
`;