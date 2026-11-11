import { defaultFieldResolver, getNamedType, isObjectType, type GraphQLSchema } from "graphql";
import type { Ctx } from "../context";
import { visiblePostWhere } from "../lib/postVisibility";

type PendingCheck = {
  ids: Set<string>;
  resolve: Array<(allowed: Set<string>) => void>;
  reject: Array<(error: unknown) => void>;
};
const pendingChecks = new WeakMap<Ctx, PendingCheck>();

// Batch sibling FeedItem.post checks, without caching permissions between
// mutation fields or requests (a leave/block must take effect immediately).
function readablePostIds(ctx: Ctx, ids: string[]): Promise<Set<string>> {
  let pending = pendingChecks.get(ctx);
  if (!pending) {
    pending = { ids: new Set(), resolve: [], reject: [] };
    pendingChecks.set(ctx, pending);
    const batch = pending;
    queueMicrotask(async () => {
      pendingChecks.delete(ctx);
      try {
        const posts = await ctx.prisma.post.findMany({
          where: { AND: [{ id: { in: [...batch.ids] } }, visiblePostWhere(ctx)] }, select: { id: true },
        });
        const allowed = new Set(posts.map(post => post.id));
        batch.resolve.forEach(resolve => resolve(allowed));
      } catch (error) { batch.reject.forEach(reject => reject(error)); }
    });
  }
  ids.forEach(id => pending!.ids.add(id));
  return new Promise((resolve, reject) => {
    pending!.resolve.push(resolve);
    pending!.reject.push(reject);
  });
}

function referencedPosts(item: any, name: string): string[] {
  if (name === "Post" || name === "PostMini") return typeof item?.id === "string" ? [item.id] : [""];
  if (name === "Story") {
    try {
      const id = JSON.parse(item.editJson ?? "null")?.sharedPost?.postId;
      return typeof id === "string" ? [id] : [];
    } catch { return []; }
  }
  return [item.postId, item.post?.id, item.payload?.postId, ...(Array.isArray(item.payload?.postIds) ? item.payload.postIds : [])]
    .filter((id): id is string => typeof id === "string");
}

// Defense at the response boundary: nested posts and notification previews must
// pass the same check as feeds, before any child resolver signs a media URL.
export function protectPostResults(schema: GraphQLSchema) {
  for (const type of Object.values(schema.getTypeMap())) {
    if (!isObjectType(type) || type.name.startsWith("__")) continue;
    for (const field of Object.values(type.getFields())) {
      const name = getNamedType(field.type).name;
      if (!["Post", "PostMini", "Story", "Notification"].includes(name)) continue;
      const resolve = field.resolve ?? defaultFieldResolver;
      field.resolve = async (parent, args, ctx: Ctx, info) => {
        const result: any = await resolve(parent, args, ctx, info);
        if (result == null) return result;
        const items = Array.isArray(result) ? result : [result];
        const partialStories = name === "Story" ? items.filter((item: any) => item?.id && item.editJson === undefined) : [];
        const stories = partialStories.length ? await ctx.prisma.story.findMany({
          where: { id: { in: partialStories.map((item: any) => item.id) } }, select: { id: true, editJson: true },
        }) : [];
        const storyById = new Map(stories.map(story => [story.id, story]));
        const refs = items.map((item: any) => referencedPosts(storyById.get(item?.id) ?? item, name));
        const ids = [...new Set(refs.flat())];
        if (!ids.length) return result;
        const allowedIds = await readablePostIds(ctx, ids);
        return Array.isArray(result)
          ? items.filter((_: any, index: number) => refs[index].every(id => allowedIds.has(id)))
          : refs[0].every(id => allowedIds.has(id)) ? result : null;
      };
    }
  }
  return schema;
}
