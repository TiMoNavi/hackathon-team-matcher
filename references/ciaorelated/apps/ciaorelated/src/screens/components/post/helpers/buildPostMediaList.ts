export type PostMediaItem = {
  id: string;
  idx?: number | null;
  kind: "IMAGE" | "VIDEO";
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbUrl?: string | null;
};

export function buildPostMediaList(post: any): PostMediaItem[] {
  const serverThumb = post?.thumbUrl ?? null;

  // Single cover fallback (für Posts ohne media[])
  const singleCover =
    post?.imageUrl ?? serverThumb ?? null;

  // Carousel
  if (post?.isCarousel && Array.isArray(post?.media) && post.media.length > 0) {
    return [...post.media]
      .sort((a: any, b: any) => (a?.idx ?? 0) - (b?.idx ?? 0))
      .map((m: any) => {
        const isVideo = (m?.kind ?? "").toUpperCase() === "VIDEO" || !!m?.videoUrl;
        return {
          id: m?.id ?? `${post?.id}:${m?.idx ?? 0}`,
          idx: m?.idx ?? 0,
          kind: isVideo ? "VIDEO" : "IMAGE",
          imageUrl: m?.imageUrl ?? null,
          videoUrl: m?.videoUrl ?? null,
          thumbUrl: m?.thumbUrl ?? serverThumb ?? null,
        } as PostMediaItem;
      });
  }

  // Single
  const isVideo = !!post?.videoUrl || (post?.kind ?? "").toUpperCase() === "VIDEO";
  return [
    {
      id: post?.id ?? "single",
      idx: 0,
      kind: isVideo ? "VIDEO" : "IMAGE",
      imageUrl: post?.imageUrl ?? null,
      videoUrl: post?.videoUrl ?? null,
      thumbUrl: serverThumb ?? singleCover,
    },
  ];
}
