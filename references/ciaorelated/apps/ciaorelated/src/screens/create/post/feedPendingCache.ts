import { apollo } from "../../../apollo";
import { gql } from "@apollo/client";

export const FEED_QUERY = gql`
  query Feed($offset: Int, $limit: Int) {
    feed(offset: $offset, limit: $limit) {
      id
      kind
      imageUrl
      videoUrl
      thumbUrl
      createdAt
      isProcessing
      author { id username avatarUrl }
    }
  }
`;

export function addPendingToFeed(pending: any, variables = { offset: 0, limit: 20 }) {
  try {
    const existing = apollo.readQuery({ query: FEED_QUERY, variables }) as any;
    if (!existing?.feed) return;

    apollo.writeQuery({
      query: FEED_QUERY,
      variables,
      data: {
        ...existing,
        feed: [pending, ...existing.feed],
      },
    });
  } catch {
    // Feed query evtl. noch nicht im Cache → ignorieren
  }
}

export function removePendingFromFeed(pendingId: string, variables = { offset: 0, limit: 20 }) {
  try {
    const existing = apollo.readQuery({ query: FEED_QUERY, variables }) as any;
    if (!existing?.feed) return;

    apollo.writeQuery({
      query: FEED_QUERY,
      variables,
      data: {
        ...existing,
        feed: existing.feed.filter((p: any) => p.id !== pendingId),
      },
    });
  } catch {}
}
