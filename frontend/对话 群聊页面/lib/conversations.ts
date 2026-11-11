import { create } from "zustand";
import {
  initialFriendRequests,
  requestPeople,
  transitionFriendRequest,
  type FriendRequest,
  type RequestAction,
} from "@/lib/friend-requests";

// Fictional people and avatars match the sibling homepage. No network writes.
export type Person = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  online: boolean;
};
export const people: Person[] = [
  {
    id: "lin",
    name: "林小满",
    role: "前端开发",
    avatar: "/avatars/avatar-1.jpg",
    online: true,
  },
  {
    id: "chen",
    name: "陈序",
    role: "AI 工程师",
    avatar: "/avatars/avatar-2.jpg",
    online: true,
  },
  {
    id: "xu",
    name: "许知夏",
    role: "产品设计",
    avatar: "/avatars/avatar-3.jpg",
    online: true,
  },
  {
    id: "zhou",
    name: "周野",
    role: "全栈开发",
    avatar: "/avatars/avatar-4.jpg",
    online: false,
  },
  {
    id: "tang",
    name: "唐可",
    role: "创意开发",
    avatar: "/avatars/avatar-5.jpg",
    online: false,
  },
  {
    id: "song",
    name: "宋一舟",
    role: "后端开发",
    avatar: "/avatars/avatar-6.jpg",
    online: true,
  },
];
export const me: Person = {
  id: "me",
  name: "你",
  role: "产品与协作",
  avatar: "/avatars/avatar-7.jpg",
  online: true,
};
export const personDirectory: Person[] = [...people, ...requestPeople];
export type Attachment = { name: string; url: string; size: string };
export type Message = {
  id: string;
  sender: string;
  text: string;
  time: string;
  attachment?: Attachment;
  local?: boolean;
};
export type Conversation = {
  id: string;
  kind: "direct" | "group";
  name: string;
  subtitle: string;
  members: string[];
  messages: Message[];
  unread: number;
  pinned?: boolean;
  muted?: boolean;
  event?: string;
  notice?: string;
};
export type Filter = "all" | "direct" | "group" | "unread" | "pinned";
const message = (
  id: string,
  sender: string,
  text: string,
  time = "14:32",
): Message => ({ id, sender, text, time });
export const initialConversations: Conversation[] = [
  {
    id: "weekend",
    kind: "group",
    name: "周末造物小队",
    subtitle: "让会议结束后，行动真正开始",
    members: ["me", "lin", "chen", "xu"],
    unread: 2,
    pinned: true,
    event: "周末 AI 创造营",
    notice: "今晚 20:00，一起过一遍第一版流程。带着想法来就好。",
    messages: [
      message(
        "w1",
        "xu",
        "把第一版交互画出来了。先做一个很小的闭环，让会后的待办真的有人接住。",
        "14:26",
      ),
      message(
        "w2",
        "chen",
        "我来接内容整理这部分。录音转成文字之后，先给出建议，再让用户确认。",
        "14:28",
      ),
      message(
        "w3",
        "me",
        "赞同，先让它简单、好用。我们把今晚要讨论的内容放在一起吧。",
        "14:29",
      ),
      {
        ...message("w4", "xu", "整理了一份协作草稿，大家可以先看看。", "14:31"),
        attachment: {
          name: "协作草稿.md",
          url: "/files/协作草稿.md",
          size: "Markdown 文档",
        },
      },
      message(
        "w5",
        "lin",
        "前端这边没问题！今晚一起把录入、整理、确认三个步骤走通。",
        "14:32",
      ),
    ],
  },
  {
    id: "lin",
    kind: "direct",
    name: "林小满",
    subtitle: "前端开发 · React / TypeScript",
    members: ["me", "lin"],
    unread: 1,
    messages: [
      message(
        "l1",
        "lin",
        "嗨！看了你的想法，感觉我们可以一起做点什么。",
        "13:42",
      ),
      message(
        "l2",
        "me",
        "我也这么觉得。想先做一个能用的小版本，你更想负责哪一块？",
        "13:44",
      ),
      message(
        "l3",
        "lin",
        "我来做前端和交互。很喜欢把复杂的流程变得简单一点。",
        "13:45",
      ),
      message("l4", "me", "那正好，我来整理用户流程。周末一起试试？", "13:46"),
      message(
        "l5",
        "lin",
        "好呀，周末见！有参考页面的话也可以先发给我。",
        "13:48",
      ),
    ],
  },
  {
    id: "chen",
    kind: "direct",
    name: "陈序",
    subtitle: "AI 工程师 · Python / LLM",
    members: ["me", "chen"],
    unread: 0,
    messages: [
      message(
        "c1",
        "chen",
        "接口的输入输出我整理好了，晚点一起对一下。",
        "12:16",
      ),
      message("c2", "me", "收到！我先把界面上的几个状态列出来。", "12:20"),
    ],
  },
  {
    id: "garden",
    kind: "group",
    name: "城市声音花园",
    subtitle: "把城市里的声音变成一座花园",
    members: ["me", "tang", "zhou"],
    unread: 0,
    event: "周末 AI 创造营",
    notice: "先收集三段日常声音，再一起讨论交互。",
    messages: [
      message(
        "g1",
        "tang",
        "今天录到了雨落在树叶上的声音，很适合做第一段体验。",
        "11:05",
      ),
      message("g2", "zhou", "我来试一下音频和视觉之间的映射。", "11:12"),
    ],
  },
  {
    id: "xu",
    kind: "direct",
    name: "许知夏",
    subtitle: "产品设计 · Figma / Research",
    members: ["me", "xu"],
    unread: 0,
    messages: [
      message(
        "x1",
        "xu",
        "我做了两个不同的开场版本，你有空的时候看看？",
        "10:26",
      ),
    ],
  },
  {
    id: "song",
    kind: "direct",
    name: "宋一舟",
    subtitle: "后端开发 · Rust / PostgreSQL",
    members: ["me", "song"],
    unread: 0,
    messages: [
      message("s1", "song", "可以的，我们先把最小的数据结构对齐。", "昨天"),
    ],
  },
];
type Store = {
  contacts: Person[];
  friendRequests: FriendRequest[];
  resolveFriendRequest: (
    id: string,
    action: RequestAction,
    expectedVersion: number,
  ) => { ok: boolean };
  chats: Conversation[];
  drafts: Record<string, string>;
  setDraft: (id: string, value: string) => void;
  markRead: (id: string) => void;
  send: (id: string, attachment?: Attachment) => void;
  toggle: (id: string, property: "pinned" | "muted") => void;
  createGroup: (name: string, members: string[]) => string;
  openDirect: (id: string) => string;
};
// Soho's per-chat message append/update pattern, adapted to stable ids and drafts.
// All state is intentionally memory-only. Refresh restores the fixtures.
export const useConversations = create<Store>((set, get) => ({
  contacts: people,
  friendRequests: initialFriendRequests,
  resolveFriendRequest: (id, action, expectedVersion) => {
    const state = get();
    const request = state.friendRequests.find((item) => item.id === id);
    if (!request) return { ok: false };
    const updated = transitionFriendRequest(request, action, expectedVersion);
    if (!updated) return { ok: false };
    const accepted = updated.status === "accepted";
    const person = request.person;
    set({
      friendRequests: state.friendRequests.map((item) =>
        item.id === id ? updated : item,
      ),
      contacts:
        accepted && !state.contacts.some((item) => item.id === person.id)
          ? [...state.contacts, person]
          : state.contacts,
      chats:
        accepted &&
        !state.chats.some(
          (chat) => chat.kind === "direct" && chat.id === person.id,
        )
          ? [
              {
                id: person.id,
                kind: "direct",
                name: person.name,
                subtitle: person.role,
                members: ["me", person.id],
                messages: [],
                unread: 0,
              },
              ...state.chats,
            ]
          : state.chats,
    });
    return { ok: true };
  },
  chats: initialConversations,
  drafts: {},
  setDraft: (id, value) =>
    set((state) => ({ drafts: { ...state.drafts, [id]: value } })),
  markRead: (id) =>
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, unread: 0 } : chat,
      ),
    })),
  send: (id, attachment) => {
    const text = (get().drafts[id] || "").trim();
    if ((!text && !attachment) || !get().chats.some((chat) => chat.id === id))
      return;
    const next: Message = {
      id: crypto.randomUUID(),
      sender: "me",
      text,
      attachment,
      local: true,
      time: new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date()),
    };
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, messages: [...chat.messages, next] } : chat,
      ),
      drafts: { ...state.drafts, [id]: "" },
    }));
  },
  toggle: (id, property) =>
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === id ? { ...chat, [property]: !chat[property] } : chat,
      ),
    })),
  createGroup: (name, members) => {
    const id = crypto.randomUUID();
    const chat: Conversation = {
      id,
      name: name.trim(),
      kind: "group",
      subtitle: "新的讨论，从一句招呼开始",
      members: ["me", ...members],
      unread: 0,
      messages: [],
      event: "周末 AI 创造营",
      notice: "还没有讨论安排，先向大家打个招呼吧。",
    };
    set((state) => ({ chats: [chat, ...state.chats] }));
    return id;
  },
  openDirect: (id) => {
    const person = get().contacts.find((p) => p.id === id);
    if (!person) return "";
    if (!get().chats.some((chat) => chat.id === id))
      set((state) => ({
        chats: [
          {
            id,
            kind: "direct",
            name: person.name,
            subtitle: person.role,
            members: ["me", id],
            messages: [],
            unread: 0,
          },
          ...state.chats,
        ],
      }));
    return id;
  },
}));
