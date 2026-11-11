import { gql } from "@apollo/client";

/** einzelne als gelesen markieren */
export const MARK_ONE_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id)
  }
`;

/** alle eines Kanals als gelesen markieren */
export const MARK_READ = gql`
  mutation MarkAllRead($channel: NotificationChannel!) {
    markAllRead(channel: $channel)
  }
`;

/** Vlog-Tag (Post→Vlog) freigeben/ablehnen – Schema-Namen verwenden */
export const APPROVE_VLOG_TAG = gql`
  mutation ApprovePostForVlog($postId: ID!, $vlogId: ID!) {
    approvePostForVlog(postId: $postId, vlogId: $vlogId)
  }
`;

export const REJECT_VLOG_TAG = gql`
  mutation RejectPostForVlog($postId: ID!, $vlogId: ID!) {
    rejectPostForVlog(postId: $postId, vlogId: $vlogId)
  }
`;
