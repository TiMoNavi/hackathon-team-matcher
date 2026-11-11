// apps/ciaorelated/src/gql/storage.ts
import { gql } from "@apollo/client";

export const GET_SIGNED_POST_UPLOAD = gql`
  mutation GetSignedPostUpload($mime: String!, $size: Int!) {
    getSignedPostUpload(mime: $mime, size: $size) {
      key
      putUrl
    }
  }
`;

export const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      imageKey
      imageUrl     # vom Post-Field-Resolver
      caption
      location
      likeCount
      createdAt
    }
  }
`;
