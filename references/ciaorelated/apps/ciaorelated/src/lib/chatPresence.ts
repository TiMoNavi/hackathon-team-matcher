let activeThreadId: string | null = null;

export function setActiveChatThreadId(threadId: string | null) {
  activeThreadId = threadId;
}

export function getActiveChatThreadId() {
  return activeThreadId;
}
