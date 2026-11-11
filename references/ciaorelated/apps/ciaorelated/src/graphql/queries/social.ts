import { gql } from "@apollo/client";


// Posts der gefolgten Nutzer + eigene
export const FEED_QUERY = gql`
  query Feed($offset: Int = 0, $limit: Int = 20) {
    me { id username avatarUrl __typename }
    feed(offset: $offset, limit: $limit) {
      id
    kind
    imageUrl
    videoUrl
    thumbUrl
    caption
    location
    createdAt
    likeCount
    taggedUsers { status showOnProfile user { id username avatarUrl } }
    iAmTagged
    acceptedVlogs {
      id
      slug
      title
      owner { id username avatarUrl }
    }
    commentCount
    isLiked
    author { id username avatarUrl }
    isCarousel
    media {
      id
      idx
      kind
      imageUrl
      videoUrl
      thumbUrl
      width
      height
      durationS
    }
    __typename
    }
  }
`;

// Stories der gefolgten + eigene (letzte zuerst)
export const STORIES_FEED = gql`
  query StoriesFeed($offset: Int = 0, $limit: Int = 20) {
    storiesFeed(offset: $offset, limit: $limit) {
      id
      mediaUrl
      thumbUrl
      mime
      isVideo
      editJson
      createdAt
      seenByMe
      author { id username avatarUrl avatarThumbUrl __typename }
      __typename
    }
  }
`;


export const HOME_FEED_QUERY = gql`
  query HomeFeed($offset: Int = 0, $limit: Int = 20, $mode: HomeFeedMode = SONGVERWANDT) {
    me { id username avatarUrl __typename }
    homeFeed(offset: $offset, limit: $limit, mode: $mode) {
      id
      kind
      title
      source { kind groupId title }
      users {
        id
        username
        avatarUrl
        isPrivate
        followerCount
        isFollowing
        followRequested
        __typename
      }
      post {
        id
        kind
        imageUrl
        videoUrl
        thumbUrl
        caption
        location
        createdAt
        likeCount
        commentCount
        taggedUsers {
          status
          showOnProfile
          user {
            id
            username
            avatarUrl
            avatarThumbUrl
            __typename
          }
          __typename
        }
        isLiked
        author { id username avatarUrl avatarThumbUrl isFollowing followRequested }
        isCarousel
        media { id idx kind imageUrl videoUrl thumbUrl width height durationS }
        __typename
      }
      __typename
    }
  }
`;
