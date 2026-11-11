import { gql } from "@apollo/client";

export const REPORT_CONTENT = gql`
  mutation ReportContent($input: ReportInput!) {
    reportContent(input: $input)
  }
`;

export const BLOCK_USER = gql`
  mutation BlockUser($userId: ID!) {
    blockUser(userId: $userId)
  }
`;

export const UNBLOCK_USER = gql`
  mutation UnblockUser($userId: ID!) {
    unblockUser(userId: $userId)
  }
`;
