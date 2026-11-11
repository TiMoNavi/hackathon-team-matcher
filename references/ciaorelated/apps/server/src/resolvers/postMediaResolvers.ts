// apps/server/src/resolvers/postMediaResolvers.ts
import type { Ctx } from "../context";
import { getSignedGetUrl } from "../s3";

export default {
  // Feld-Resolver am Post
  Post: {
    // true, wenn der Post mind. 2 Media-Items hat (klassisches Carousel)
    // -> passe auf >=1 an, wenn du "jedes Media = Carousel" willst
    isCarousel: async (post: any, _: unknown, ctx: Ctx) => {
      const count = await ctx.prisma.postMedia.count({ where: { postId: post.id } });
      return count >= 2;
    },

    // sortierte Media-Liste für das Carousel
    media: async (post: any, _: unknown, ctx: Ctx) => {
      return ctx.prisma.postMedia.findMany({
        where: { postId: post.id },
        orderBy: [{ order: "asc" }, { idx: "asc" }],
      });
    },
    isProcessing: async (post: any, _: unknown, ctx: Ctx) => {
      const n = await ctx.prisma.postMedia.count({
        where: { postId: post.id, kind: "VIDEO", processStatus: { in: ["PENDING", "PROCESSING"] } },
      });
      return n > 0;
    },
  },

  // Feld-Resolver am PostMedia
  PostMedia: {
    // Für Bilder: signierte URL aus key; sonst null
    imageUrl: async (m: any) => {
      if (m.kind !== "IMAGE") return null;
      if (!m.key) return null;
      return await getSignedGetUrl(m.key);
    },

    videoUrl: async (m: any) => {
      if (m.kind !== "VIDEO") return null;
      if (m.processStatus === "PENDING" || m.processStatus === "PROCESSING") return null;
      if (!m.key) return null;
      return await getSignedGetUrl(m.key);
    },

    thumbUrl: async (m: any) => {
      if (m.thumbKey) return await getSignedGetUrl(m.thumbKey);
      if (m.kind === "IMAGE" && m.key) return await getSignedGetUrl(m.key);
      return null;
    },
  },
};
