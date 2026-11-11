// apps/ciaorelated/src/gql/profile.ts
import { gql } from "@apollo/client";

export const UPDATE_ME = gql`
  mutation UpdateMe($input: UpdateMeInput!) {
    updateMe(input: $input) {
      id
      username
      name
      bio
      avatarUrl
      avatarThumbUrl
    }
  }
`;

export const GET_SIGNED_AVATAR_UPLOAD = gql`
  mutation GetSignedAvatarUpload($mime: String!, $size: Int!) {
    getSignedAvatarUpload(mime: $mime, size: $size) {
      key
      putUrl
    }
  }
`;