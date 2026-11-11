export * from "./fragments";

export type UserBasic = {
  id: string;
  username: string;
  avatarUrl?: string | null;
};

export type PostCard = {
  id: string;
  imageUrl?: string | null;    // optional wie im Schema
  caption?: string | null;
  location?: string | null;
  likeCount: number;
  createdAt: string; // ISO
  author: UserBasic;
};
