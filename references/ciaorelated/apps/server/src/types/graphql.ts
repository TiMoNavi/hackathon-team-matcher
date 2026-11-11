// apps/server/src/types/graphql.ts
export type PostKind = "POST" | "REEL";

export interface CreatePostInput {
  kind: PostKind;
  key: string;
  thumbKey?: string;
  caption?: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  mime: string;
  groupLinkId?: string;
  taggedUserIds?: string[];
}
