// Fictional fixtures for the local preview; no server writes or live requests.
export type RequestStatus =
  "pending" | "accepted" | "declined" | "withdrawn" | "expired" | "invalidated";
export type RequestAction = "accept" | "decline" | "withdraw";
export type RequestPerson = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  online: boolean;
  bio: string;
  tags: string[];
};
export type FriendRequest = {
  id: string;
  person: RequestPerson;
  direction: "incoming" | "outgoing";
  status: RequestStatus;
  version: number;
  sourceType: "event_card" | "public_post";
  sourceLabel: string;
  message: string;
  time: string;
  expiresLabel: string;
};
export const initialFriendRequests: FriendRequest[] = [
  {
    id: "request-lu",
    direction: "incoming",
    status: "pending",
    version: 1,
    person: {
      id: "lu",
      name: "陆遥",
      role: "交互设计 · Figma",
      avatar: "/avatars/avatar-8.jpg",
      online: false,
      bio: "喜欢把模糊的想法画成可以上手试的原型。这个周末想和开发伙伴一起做出第一个可用版本。",
      tags: ["交互原型", "用户体验", "周末协作"],
    },
    sourceType: "event_card",
    sourceLabel: "周末 AI 创造营 · 活动名片",
    message:
      "看到你在做会后行动整理，我也很想试试这个方向。我可以负责交互原型，要不要先聊聊？",
    time: "10 分钟前",
    expiresLabel: "6 天后到期",
  },
  {
    id: "request-gu",
    direction: "incoming",
    status: "pending",
    version: 1,
    person: {
      id: "gu",
      name: "顾言",
      role: "AI 工程师 · Python",
      avatar: "/avatars/avatar-2.jpg",
      online: false,
      bio: "最近在探索语音与轻量工作流，愿意从小功能开始一起打磨。",
      tags: ["语音识别", "Python", "快速原型"],
    },
    sourceType: "event_card",
    sourceLabel: "周末 AI 创造营 · 活动名片",
    message:
      "你好！你的想法和我最近在试的语音工具挺契合，想加个好友，交换一下思路。",
    time: "1 小时前",
    expiresLabel: "6 天后到期",
  },
  {
    id: "request-meng",
    direction: "incoming",
    status: "pending",
    version: 1,
    person: {
      id: "meng",
      name: "孟晚",
      role: "产品策划 · 内容体验",
      avatar: "/avatars/avatar-5.jpg",
      online: false,
      bio: "关注日常生活里的小问题，喜欢从用户故事和实际使用场景开始讨论。",
      tags: ["产品策划", "用户访谈", "内容体验"],
    },
    sourceType: "public_post",
    sourceLabel: "广场帖子 · 把灵感做成小作品",
    message:
      "从广场帖子看到你分享的创作过程，很喜欢这种从小处开始的方法，想认识一下。",
    time: "昨天",
    expiresLabel: "5 天后到期",
  },
  {
    id: "request-qiao",
    direction: "outgoing",
    status: "pending",
    version: 1,
    person: {
      id: "qiao",
      name: "乔木",
      role: "全栈开发 · TypeScript",
      avatar: "/avatars/avatar-4.jpg",
      online: false,
      bio: "喜欢边做边验证的协作方式，关注工具和可视化。",
      tags: ["全栈开发", "可视化"],
    },
    sourceType: "event_card",
    sourceLabel: "周末 AI 创造营 · 活动名片",
    message:
      "你好，我正在整理一个会后协作的小想法，看到你擅长全栈开发，希望有机会一起交流。",
    time: "今天 09:20",
    expiresLabel: "6 天后到期",
  },
  {
    id: "request-ye",
    direction: "incoming",
    status: "expired",
    version: 2,
    person: {
      id: "ye",
      name: "叶舟",
      role: "视觉设计 · 创意编程",
      avatar: "/avatars/avatar-6.jpg",
      online: false,
      bio: "探索图形、声音和交互之间的联系。",
      tags: ["视觉设计", "创意编程"],
    },
    sourceType: "event_card",
    sourceLabel: "创意周末 · 活动名片",
    message: "看到你做的交互作品很有趣，有机会一起交流！",
    time: "8 天前",
    expiresLabel: "已到期",
  },
];
export const requestPeople = initialFriendRequests.map(
  (request) => request.person,
);
// Pure demo transition. Production requires server authorization and transactions.
export function transitionFriendRequest(
  request: FriendRequest,
  action: RequestAction,
  expectedVersion: number,
): FriendRequest | null {
  if (request.status !== "pending" || request.version !== expectedVersion)
    return null;
  if (
    action === "withdraw"
      ? request.direction !== "outgoing"
      : request.direction !== "incoming"
  )
    return null;
  const status: RequestStatus =
    action === "accept"
      ? "accepted"
      : action === "decline"
        ? "declined"
        : "withdrawn";
  return { ...request, status, version: request.version + 1 };
}
