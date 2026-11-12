import { safeInteger } from "./contracts.js";

export type ReadRoute = Readonly<{ conversationId: number | null }>;

/** Routes carry navigation intent only; the API must authorize every object. */
export function parseReadPath(pathname: string): ReadRoute {
  if (pathname === "/matcher/chat") return Object.freeze({ conversationId: null });
  const match = /^\/matcher\/chat\/conversations\/([1-9][0-9]{0,15})$/.exec(pathname);
  if (!match) throw new Error("Invalid chat path.");
  const conversationId = safeInteger(Number(match[1]), 1);
  if (String(conversationId) !== match[1]) throw new Error("Invalid chat path.");
  return Object.freeze({ conversationId });
}

export function readPath(conversationId: number | null): string {
  return conversationId === null ? "/matcher/chat" : `/matcher/chat/conversations/${safeInteger(conversationId, 1)}`;
}
