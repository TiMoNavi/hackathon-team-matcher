// apps/ciaorelated/src/graphql/queries/stories.ts
import { gql } from "@apollo/client";

/**
 * Stories-Listen sind bei dir flach (Array von Story),
 * daher fragen wir überall die selben Felder ab.
 * Keine "user { ... } / stories { ... }" Verschachtelung.
 */

export const STORIES_FEED = gql`
  query StoriesFeed($offset: Int = 0, $limit: Int = 20) {
    storiesFeed(offset: $offset, limit: $limit) {
      id
      mediaUrl
      thumbUrl
      mime
      isVideo
      duration
      editJson
      isCloseFriends
      createdAt
      seenByMe
      author { id username avatarUrl __typename }
      __typename
    }
  }
`;

export const MY_STORIES = gql`
  query MyStories {
    myStories {
      id
      mediaUrl
      thumbUrl
      editJson
      mime
      isVideo
      duration
      isCloseFriends
      createdAt
      author { id username avatarUrl __typename }
      __typename
    }
  }
`;

export const MY_STORIES_RECENT = gql`
  query MyStoriesRecent {
    myStoriesRecent {
      id
      mediaUrl
      thumbUrl
      mime
      isVideo
      editJson
      duration
      isCloseFriends
      createdAt
      author { id username avatarUrl __typename }
      __typename
    }
  }
`;

// Hinweis: STORIES_RECENT_BY_USER wurde entfernt, weil es im Schema nicht existiert.
