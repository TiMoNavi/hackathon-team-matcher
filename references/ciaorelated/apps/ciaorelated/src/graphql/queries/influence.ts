import { gql } from "@apollo/client";

export const MY_COMMUNITY_INFLUENCE = gql`
  query MyCommunityInfluence($offset: Int!, $limit: Int!) {
    myCommunityInfluence(offset: $offset, limit: $limit) {
      profile { id username name avatarUrl }
      earnedUnits retainedUnits assignedUnits receivedUnits availableUnits earningStartsAt rankingEnabled hasMore
      positions {
        communityId title type visibility imageUrl isMember joinedAt entryPosition growthCount settledThrough
        earnState canAssign supportState earnedUnits communityUnits participationUnits resonanceUnits
        recipient { id username name avatarUrl }
      }
    }
  }
`;
export const INFLUENCE_RECIPIENTS = gql`
  query CommunityInfluenceRecipients($q: String!) {
    communityInfluenceRecipients(q: $q) { id username name avatarUrl }
  }
`;
export const SET_INFLUENCE_RECIPIENT = gql`
  mutation SetCommunityInfluenceRecipient($communityId: ID!, $recipientId: ID, $expectedProfileId: ID!) {
    setCommunityInfluenceRecipient(communityId: $communityId, recipientId: $recipientId, expectedProfileId: $expectedProfileId)
  }
`;
