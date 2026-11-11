// packages/shared/src/fragments.ts
export const FRAGMENTS = {
  UserBasic: /* GraphQL */ `
    fragment UserBasic on User {
      id
      username
      avatarUrl
    }
  `,
  PostCard: /* GraphQL */ `
    fragment PostCard on Post {
      id
      imageUrl
      caption
      location
      likeCount
      createdAt
      author { ...UserBasic }
    }
  `,
};

// optionaler Helper, falls du gern programmatisch kombinierst
export const compose = (...parts: string[]) => parts.join("\n");
