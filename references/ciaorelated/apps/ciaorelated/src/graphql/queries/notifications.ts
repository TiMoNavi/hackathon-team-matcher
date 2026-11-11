// apps/ciaorelated/src/graphql/notifications.ts
import { gql } from "@apollo/client";


export const MARK_READ = gql`mutation Mark($id:ID!){ markNotificationRead(id:$id) }`;



/** Inbox (Papierflieger) */
export const INBOX = gql`
  query Inbox($offset: Int, $limit: Int) {
    inbox(offset: $offset, limit: $limit) {
      edges {
        id
        kind
        channel
        isRead
        createdAt
        payload
        fromUser { id username avatarUrl }
        vlog { id title slug }
        post { id thumbUrl imageUrl videoUrl }
      }
      nextCursor
    }
  }
`;

/** Activity (Herz) */
export const ACTIVITY = gql`
  query Activity($offset: Int, $limit: Int) {
    activity(offset: $offset, limit: $limit) {
      edges {
        id
        kind
        channel
        isRead
        createdAt
        payload
        fromUser { id username avatarUrl }
        vlog { id title slug }
        post { id thumbUrl imageUrl videoUrl }
      }
      nextCursor
    }
  }
`;
