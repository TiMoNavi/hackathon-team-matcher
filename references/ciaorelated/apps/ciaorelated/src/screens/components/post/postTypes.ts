export type MediaItem = {
  id: string;
  idx?: number | null;
  kind: "IMAGE" | "VIDEO";
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbUrl?: string | null;
};
