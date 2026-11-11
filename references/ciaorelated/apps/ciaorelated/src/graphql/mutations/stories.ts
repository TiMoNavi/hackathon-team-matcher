// apps/ciaorelated/src/graphql/queries/stories.ts
import { gql } from "@apollo/client";

export const GET_SIGNED_STORY_UPLOAD = gql`
  mutation GetSignedStoryUpload($mime: String!, $size: Int!) {
    getSignedStoryUpload(mime: $mime, size: $size) { key putUrl }
  }
`;



export const CREATE_STORY = gql`
  mutation CreateStory($input: CreateStoryInput!) {
    createStory(input: $input) {
      id
      mediaUrl
      thumbUrl
      mime
      duration
      isCloseFriends
      createdAt
      author { id username avatarUrl __typename }
      __typename
    }
  }
`;



export const MARK_STORY_VIEWED = gql`
  mutation MarkStoryViewed($storyId: ID!) { markStoryViewed(storyId: $storyId) }
`;

export const DELETE_STORY = gql`
  mutation DeleteStory($id: ID!) {
    deleteStory(id: $id)
  }
`;
