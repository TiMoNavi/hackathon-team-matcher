export type DiscoverableCommunity = {
  id: string;
  title: string;
  type: string;
  slug?: string | null;
  imageUrl?: string | null;
  memberCount: number;
  viewerIsMember: boolean;
  viewerIsOwner: boolean;
};

export type CommunitySuggestion = {
  community: DiscoverableCommunity;
  reason: "FOLLOWING" | "ACTIVE" | "PUBLIC";
};

export function feedPostId(item: any): string | null {
  if (!item || item.kind === "SUGGESTED_PROFILES" || item.kind === "COMMUNITY_SUGGESTIONS") return null;
  return item.post?.id ?? item.id ?? null;
}

// The recommendation is a local row, never part of the server's feed offset.
export function withCommunitySuggestions(items: any[], enabled: boolean): any[] {
  if (!enabled) return items;
  let posts = 0;
  let index = items.findIndex(item => feedPostId(item) && ++posts === 3);
  index = index < 0 ? items.length : index + 1;
  return [...items.slice(0, index), { id: "__community_suggestions__", kind: "COMMUNITY_SUGGESTIONS" }, ...items.slice(index)];
}
