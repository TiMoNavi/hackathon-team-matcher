/** Framework-free integration surface. Importing or constructing it performs
 * no request. A server-provided conversation id is navigation intent only;
 * every read/write still requires the current native session's authorization. */
import { readPath } from "./navigation.js";
import { safeInteger } from "./contracts.js";

export { createChatApi, ChatApiError } from "./http.js";
export type { ChatApi, ChatApiConfig, ChatFetcher, PageOptions, IncrementOptions, ReadOptions, SendOptions } from "./http.js";
export type { SendReceipt } from "./contracts.js";
export { createClientMessageId, validateMessageBody, validateClientMessageId, MessageInputError } from "./send-input.js";

export function chatConversationPath(conversationId: number): string { return readPath(safeInteger(conversationId, 1)); }
export function chatListPath(): string { return readPath(null); }

// Deliberately no user-id resolver, get-or-create, friend request, invitation,
// navigation side effect or automatic send. Those contracts have other owners.
