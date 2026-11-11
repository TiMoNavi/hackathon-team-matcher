import { gql } from "@apollo/client";

const COMMUNITY_DISCOVERY_FIELDS = gql`
  fragment CommunityDiscoveryFields on GroupLink {
    id title type slug visibility imageUrl memberCount viewerIsMember viewerIsOwner
  }
`;

export const SEARCH_COMMUNITIES = gql`
  query SearchCommunities($q: String!, $offset: Int = 0, $limit: Int = 6) {
    searchCommunities(q: $q, offset: $offset, limit: $limit) {
      items { ...CommunityDiscoveryFields }
      hasMore
    }
  }
  ${COMMUNITY_DISCOVERY_FIELDS}
`;

export const SUGGESTED_COMMUNITIES = gql`
  query SuggestedCommunities($limit: Int = 6) {
    suggestedCommunities(limit: $limit) {
      community { ...CommunityDiscoveryFields }
      reason
    }
  }
  ${COMMUNITY_DISCOVERY_FIELDS}
`;
