import { gql } from "@apollo/client";

export const THREADS = gql`
  query Threads {
    threads { id title unreadCount lastMessageAt members { id username avatarUrl } }
  }
`;

export const MESSAGES = gql`
  query Messages($threadId: ID!, $cursor: ID) {
    messages(threadId: $threadId, cursor: $cursor) {
      edges { cursor node {
        id threadId createdAt kind text
        sender { id username avatarUrl }
        media { url mime width height durationMs }
      }}
      nextCursor
    }
  }
`;





export const SIGN_UPLOAD = gql`
  mutation SignUpload($mime: String!, $filename: String) {
    signUpload(mime: $mime, filename: $filename) {
      putUrl url headers { key value }
    }
  }
`;



export const SUB_UNREAD = gql`
  subscription OnUnread { unreadUpdated { total perThread { threadId count } } }
`;





export const THREADS_Q = gql`
  query Threads {
    threads {
      id
      title
      lastMessageAt
      unreadCount
      members { id username avatarUrl }
    }
  }
`;

export const SEARCH_USERS_Q = gql`
  query SearchUsers($q: String!, $offset: Int = 0, $limit: Int = 20) {
    searchUsers(q: $q, offset: $offset, limit: $limit) {
      id username name avatarUrl isFollowing
    }
  }
`;

export const CREATE_THREAD = gql`
  mutation CreateThread($memberUserIds: [ID!]!, $title: String) {
    createThread(memberUserIds: $memberUserIds, title: $title) {
      id
    }
  }
`;

export const MESSAGES_Q = gql`
  query Messages($threadId: ID!, $cursor: ID) {
    messages(threadId: $threadId, cursor: $cursor, take: 30) {
      nextCursor
      edges {
        cursor
        node {
          id threadId createdAt kind text
          sender { id username avatarUrl }
          media { url mime }
        }
      }
    }
  }
`;

export const SEND_MESSAGE = gql`
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
      threadId
      kind
      text
      media { url mime }
      createdAt
      sender { id username avatarUrl }
    }
  }
`;

export const MARK_READ = gql`
  mutation MarkRead($threadId: ID!) {
    markThreadRead(threadId: $threadId)
  }
`;

/* Typing */
export const SUB_MESSAGE_ADDED = gql`
  subscription OnMsg($threadId: ID!) {
    messageAdded(threadId: $threadId) {
      id threadId createdAt kind text
      sender { id username avatarUrl }
      media { url mime }
    }
  }
`;

export const SUB_TYPING = gql`
  subscription OnTyping($threadId: ID!, $userId: ID!) {
    typing(threadId: $threadId, userId: $userId)
  }
`;

export const SET_TYPING = gql`
  mutation SetTyping($threadId: ID!, $typing: Boolean!) {
    setTyping(threadId: $threadId, typing: $typing)
  }
`;

/* Optional für Composer-User-ID */
export const ME_MINI = gql`query { me { id username avatarUrl } }`;
