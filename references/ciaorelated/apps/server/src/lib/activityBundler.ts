// apps/server/src/lib/activityBundler.ts

type MiniUser = { id: string; username: string; avatarUrl?: string | null; avatarThumbKey?: string | null };

export type ActivityBundle = {
  __typename: "ActivityBundle";
  id: string;
  kind: "LIKE" | "STORY_POSTED";
  latestAt: string;
  createdAt: string;
  count: number;
  ids: string[];
  actors: MiniUser[];
  isRead: boolean;

  // LIKE bundle
  post?: { id: string; imageUrl?: string | null; thumbUrl?: string | null; videoUrl?: string | null } | null;

  // STORY_POSTED bundle
  storyIds?: string[]; // ✅ wichtig fürs Frontend (Picker)
};

export type ActivityEdge =
  | { __typename: "Notification"; [k: string]: any }
  | ActivityBundle;

function uniqBy<T>(arr: T[], key: (x: T) => string) {
  const m = new Map<string, T>();
  for (const it of arr) m.set(key(it), it);
  return Array.from(m.values());
}

// items sind DESC sortiert (neu -> alt). Wenn x außerhalb vom Window ist, können wir breaken.
function withinWindowNewestFirst(newestIso: string, olderIso: string, ms: number) {
  const newest = new Date(newestIso).getTime();
  const older = new Date(olderIso).getTime();
  return newest - older <= ms;
}

// n.kind === "LIKE" nutzt n.post?.id oder n.payload.postId
function getPostId(n: any): string | null {
  return n?.post?.id ?? n?.payload?.postId ?? null;
}

// n.kind === "STORY_POSTED": storyId muss irgendwo herkommen (payload.storyId o.ä.)
function getStoryId(n: any): string | null {
  return n?.payload?.storyId ?? n?.payload?.id ?? n?.payload?.story?.id ?? null;
}

export function bundleActivityEdges(notifs: any[]) {
  const LIKE_WINDOW = 24 * 60 * 60 * 1000;
  const STORY_POSTED_WINDOW = 24 * 60 * 60 * 1000;

  const items = [...notifs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const used = new Set<string>();
  const out: ActivityEdge[] = [];

  for (let i = 0; i < items.length; i++) {
    const n = items[i];
    if (!n?.id || used.has(n.id)) continue;

    // ---- STORY_POSTED bundle (time window) ----
    // Ziel: mehrere "X hat eine Story gepostet" zusammenfassen.
    // storyIds[] sammeln für Picker / Jump.
    if (n.kind === "STORY_POSTED") {
      const bucket = [n];
      used.add(n.id);

      for (let j = i + 1; j < items.length; j++) {
        const x = items[j];
        if (!x?.id || used.has(x.id)) continue;
        if (x.kind !== "STORY_POSTED") continue;

        // weil DESC sortiert: sobald außerhalb window -> break
        if (!withinWindowNewestFirst(n.createdAt, x.createdAt, STORY_POSTED_WINDOW)) break;

        bucket.push(x);
        used.add(x.id);
      }

      if (bucket.length === 1) {
        out.push({ __typename: "Notification", ...n });
      } else {
        const actors = uniqBy(
          bucket.map((b) => b.fromUser).filter(Boolean),
          (a) => a.id
        );

        const isRead = bucket.every((b) => b.isRead === true);

        const storyIds = bucket
          .map((b) => getStoryId(b))
          .filter((sid): sid is string => typeof sid === "string" && sid.length > 0);

        out.push({
          __typename: "ActivityBundle",
          id: `bundle:STORY_POSTED:${bucket[0].createdAt}`,
          kind: "STORY_POSTED",
          latestAt: bucket[0].createdAt,
          createdAt: bucket[0].createdAt,
          count: bucket.length,
          ids: bucket.map((b) => b.id),
          actors,
          isRead,
          storyIds: storyIds.length ? storyIds : [],
        });
      }
      continue;
    }

    // ---- LIKE bundle (by postId + window) ----
    if (n.kind === "LIKE") {
      const pid = getPostId(n);
      if (!pid) {
        used.add(n.id);
        out.push({ __typename: "Notification", ...n });
        continue;
      }

      const bucket = [n];
      used.add(n.id);

      for (let j = i + 1; j < items.length; j++) {
        const x = items[j];
        if (!x?.id || used.has(x.id)) continue;
        if (x.kind !== "LIKE") continue;

        const xpid = getPostId(x);
        if (xpid !== pid) continue;

        if (!withinWindowNewestFirst(n.createdAt, x.createdAt, LIKE_WINDOW)) break;

        bucket.push(x);
        used.add(x.id);
      }

      if (bucket.length === 1) {
        out.push({ __typename: "Notification", ...n });
      } else {
        const actors = uniqBy(
          bucket.map((b) => b.fromUser).filter(Boolean),
          (a) => a.id
        );

        const isRead = bucket.every((b) => b.isRead === true);

        const post = bucket[0]?.post
          ? {
              id: bucket[0].post.id,
              imageUrl: bucket[0].post.imageUrl,
              thumbUrl: bucket[0].post.thumbUrl,
              videoUrl: bucket[0].post.videoUrl,
            }
          : { id: pid };

        out.push({
          __typename: "ActivityBundle",
          id: `bundle:LIKE:${pid}:${bucket[0].createdAt}`,
          kind: "LIKE",
          latestAt: bucket[0].createdAt,
          createdAt: bucket[0].createdAt,
          count: bucket.length,
          ids: bucket.map((b) => b.id),
          actors,
          isRead,
          post,
          storyIds: [],
        });
      }
      continue;
    }

    // default single
    used.add(n.id);
    out.push({ __typename: "Notification", ...n });
  }

  return out;
}
