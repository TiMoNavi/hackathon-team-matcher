// apps/ciaorelated/src/gql/profile.ts
import { gql } from "@apollo/client";

export const ME_QUERY = gql`
  query Me {
    me {
      id
      username
      name
      bio
      avatarUrl
      avatarThumbUrl

      city
      educationLevel
      educationOrg
      educationField
      educationGradYear
      interests

      account { id email }
    }
  }
`;


export const CHECK_USERNAME = gql`
  query CheckUsername($username: String!) {
    checkUsernameAvailable(username: $username)
  }
`;






/**
 * Geteilte/markierte Beiträge für MICH.
 * Variante A: sharedWithMe
 * Variante B: taggedPosts (oder anderes) – ziehe dir notfalls diese Query analog.
 */
export const SHARED_WITH_ME_FOR_GRID = gql`
  query SharedWithMeForGrid($first: Int = 30, $after: String) {
    sharedWithMe(first: $first, after: $after) {
      edges {
        node {
          __typename
          id
          createdAt
          kind
          imageUrl
          thumbUrl
          videoUrl
          isCarousel
          iShowOnProfile              # falls der Server das direkt liefert
          taggedUsers {               # Fallback: pro-User Flag auslesen
            user { id }
            showOnProfile
          }
          author { id username }
        }
        cursor
      }
      pageInfo { endCursor hasNextPage }
    }
    me { id username }
  }
`;

export const USER_POSTS_FOR_GRID = gql`
  query UserPostsForGrid($username: String!, $first: Int = 30, $after: String) {
    user(username: $username) {
      id
      posts(first: $first, after: $after) {
        edges {
          node {
            id
            createdAt
            kind
            imageUrl
            thumbUrl
            videoUrl
            isCarousel
            hideFromGrid
            author { id username }
          }
          cursor
        }
        pageInfo { endCursor hasNextPage }
      }
    }
    me { id username }
  }
`;

export const TAGGED_FOR_ME = gql`
  query TaggedForMe($limit: Int = 50) {
    me {
      id
      tagged(limit: $limit) {
        id
        createdAt
        kind
        imageUrl
        thumbUrl
        viewCount
        taggedVlogs { id }
        iShowOnProfile
        videoUrl
        isCarousel
        iShowOnProfile
        taggedUsers { user { id } status showOnProfile }
        author { id username }
      }
    }
  }
`;
