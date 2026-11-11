"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Inbox,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import { useConversations } from "@/lib/conversations";
import {
  type FriendRequest,
  type RequestAction,
  type RequestStatus,
} from "@/lib/friend-requests";

const statusLabels: Record<RequestStatus, string> = {
  pending: "等待确认",
  accepted: "已成为好友",
  declined: "已婉拒",
  withdrawn: "已撤回",
  expired: "已过期",
  invalidated: "已失效",
};
type RequestFilter = "incoming" | "outgoing" | "handled";

export function FriendRequestEntry({ onOpen }: { onOpen: () => void }) {
  const count = useConversations(
    (state) =>
      state.friendRequests.filter(
        (request) =>
          request.direction === "incoming" && request.status === "pending",
      ).length,
  );
  return (
    <button
      type="button"
      className="friend-request-entry"
      onClick={onOpen}
      aria-label={count ? `查看好友申请，${count} 条待确认` : "查看好友申请"}
      aria-haspopup="dialog"
    >
      <span className="friend-entry-icon">
        <UserRoundPlus />
      </span>
      <span className="friend-entry-copy">
        <strong>
          新的朋友<span>{count ? "等你回应" : "查看记录"}</span>
        </strong>
        <small>
          {count
            ? `${count} 份招呼，或许就是合作的开始`
            : "每一次相遇，都有迹可循"}
        </small>
      </span>
      <span className="friend-entry-count" aria-hidden="true">
        {count || <Check />}
      </span>
      <ChevronRight className="friend-entry-arrow" />
    </button>
  );
}

export function FriendRequestsDrawer({
  open,
  onOpenChange,
  onStartChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartChat: (id: string) => void;
}) {
  const requests = useConversations((state) => state.friendRequests);
  const resolve = useConversations((state) => state.resolveFriendRequest);
  const [filter, setFilter] = useState<RequestFilter>("incoming");
  const [notice, setNotice] = useState("");
  const [accepted, setAccepted] = useState<{ id: string; name: string } | null>(
    null,
  );
  const incoming = requests.filter(
    (request) =>
      request.direction === "incoming" && request.status === "pending",
  ).length;
  const outgoing = requests.filter(
    (request) =>
      request.direction === "outgoing" && request.status === "pending",
  ).length;
  const handled = requests.filter(
    (request) => request.status !== "pending",
  ).length;
  const visible = requests.filter((request) =>
    filter === "handled"
      ? request.status !== "pending"
      : request.direction === filter && request.status === "pending",
  );
  function handle(request: FriendRequest, action: RequestAction) {
    const result = resolve(request.id, action, request.version);
    if (!result.ok) {
      setNotice("这条申请的状态已变化，请查看最新记录。");
      return;
    }
    if (action === "accept") {
      setAccepted({ id: request.person.id, name: request.person.name });
      setNotice(`已接受${request.person.name}的好友申请（本地演示）。`);
    } else {
      setNotice(
        action === "decline"
          ? `已婉拒${request.person.name}，记录保留在“已处理”。`
          : `已撤回发给${request.person.name}的申请。`,
      );
    }
  }
  function start(id: string) {
    onOpenChange(false);
    onStartChat(id);
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="friend-requests-drawer">
        <DrawerHeader className="friend-drawer-header">
          <div className="friend-heading-mark">
            <UserRoundPlus />
          </div>
          <div className="friend-heading-text">
            <div className="friend-overline">CONNECTIONS</div>
            <DrawerTitle>
              新的朋友<span>{incoming}</span>
            </DrawerTitle>
            <DrawerDescription>
              先认识彼此，再让好想法有下文。
            </DrawerDescription>
          </div>
          <DrawerClose
            render={
              <button
                type="button"
                className="icon-button friend-drawer-close"
                aria-label="关闭好友申请"
              />
            }
          >
            <X />
          </DrawerClose>
        </DrawerHeader>
        <div className="friend-summary">
          <span>
            <Sparkles />
          </span>
          <div>
            <strong>
              {incoming
                ? `${incoming} 位朋友，想和你聊聊`
                : "所有招呼，都已认真回应"}
            </strong>
            <p>
              {incoming
                ? "看看对方的介绍，按自己的节奏决定。"
                : "新的相遇到来时，会在这里等你。"}
            </p>
          </div>
          <div className="friend-avatar-stack" aria-hidden="true">
            {requests
              .filter(
                (r) => r.direction === "incoming" && r.status === "pending",
              )
              .slice(0, 3)
              .map((r) => (
                <Image
                  key={r.id}
                  src={r.person.avatar}
                  width={28}
                  height={28}
                  alt=""
                  unoptimized
                />
              ))}
          </div>
        </div>
        <div className="friend-tabs" role="group" aria-label="好友申请分类">
          {(
            [
              ["incoming", "收到的", incoming],
              ["outgoing", "已发出", outgoing],
              ["handled", "已处理", handled],
            ] as const
          ).map(([value, label, count]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <div className="friend-live-status" role="status" aria-live="polite">
          {notice && (
            <p>
              <Check />
              {notice}
            </p>
          )}
        </div>
        {accepted && filter === "incoming" && (
          <div className="friend-accepted-banner">
            <span>
              <CheckCheck />
            </span>
            <div>
              <strong>已和{accepted.name}成为好友</strong>
              <small>好友申请已确认，可以开始交流。</small>
            </div>
            <button type="button" onClick={() => start(accepted.id)}>
              开始聊天
              <ArrowUpRight />
            </button>
          </div>
        )}
        <ScrollArea className="friend-requests-scroll">
          <div className="friend-request-cards">
            <div className="friend-section-caption">
              <span>
                {filter === "incoming"
                  ? "待你确认"
                  : filter === "outgoing"
                    ? "等待对方回应"
                    : "申请处理记录"}
              </span>
              <small>虚构人物 · 本地演示</small>
            </div>
            {visible.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onAction={(action) => handle(request, action)}
                onStartChat={() => start(request.person.id)}
              />
            ))}
            {!visible.length && (
              <div className="friend-empty">
                <span>
                  <Inbox />
                </span>
                <h3>
                  {filter === "incoming"
                    ? "暂时没有待确认的申请"
                    : filter === "outgoing"
                      ? "没有正在等待的申请"
                      : "还没有处理记录"}
                </h3>
                <p>
                  {filter === "incoming"
                    ? "慢慢相遇，也很好。处理过的招呼可以在“已处理”里找到。"
                    : filter === "outgoing"
                      ? "发出的好友申请会出现在这里。"
                      : "接受、婉拒或撤回后，可以在这里查看。"}
                </p>
                {filter === "incoming" && (
                  <button type="button" onClick={() => setFilter("handled")}>
                    查看已处理
                    <ChevronRight />
                  </button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
        <footer className="friend-drawer-footer">
          <ShieldCheck />
          <p>
            确认后才建立好友关系，本次不交换联系方式。
            <span>申请与操作仅供本地演示，刷新后恢复初始数据。</span>
          </p>
        </footer>
      </DrawerContent>
    </Drawer>
  );
}

function RequestCard({
  request,
  onAction,
  onStartChat,
}: {
  request: FriendRequest;
  onAction: (action: RequestAction) => void;
  onStartChat: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pending = request.status === "pending";
  const person = request.person;
  return (
    <article
      className="friend-request-card"
      data-testid={request.id}
      data-status={request.status}
    >
      <div className="friend-person-row">
        <Image src={person.avatar} width={44} height={44} alt="" unoptimized />
        <div>
          <h3>{person.name}</h3>
          <p>{person.role}</p>
        </div>
        <time>{request.time}</time>
      </div>
      <div className="friend-source">
        <span
          className={
            request.sourceType === "public_post" ? "source-square" : ""
          }
        />
        {request.sourceLabel}
      </div>
      <blockquote>
        <span>
          {request.direction === "incoming" ? "TA 的招呼" : "我发出的招呼"}
        </span>
        {request.message}
      </blockquote>
      <button
        type="button"
        className="friend-profile-toggle"
        aria-label={`${expanded ? "收起" : "查看"}${person.name}的简介`}
        aria-expanded={expanded}
        aria-controls={`bio-${request.id}`}
        onClick={() => setExpanded(!expanded)}
      >
        了解一下 TA
        <ChevronDown />
      </button>
      <div
        id={`bio-${request.id}`}
        className="friend-profile"
        hidden={!expanded}
      >
        <p>{person.bio}</p>
        <div>
          {person.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <div className="friend-card-footer">
        <span className="friend-status" data-status={request.status}>
          {pending ? (
            <Clock3 />
          ) : request.status === "accepted" ? (
            <CheckCheck />
          ) : (
            <Check />
          )}
          <span>
            {pending ? request.expiresLabel : statusLabels[request.status]}
          </span>
        </span>
        {pending ? (
          <div className="friend-actions">
            {request.direction === "incoming" ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => onAction("decline")}
                  aria-label={`婉拒${person.name}的好友申请`}
                >
                  婉拒
                </Button>
                <Button
                  onClick={() => onAction("accept")}
                  aria-label={`接受${person.name}的好友申请`}
                >
                  <UserRoundPlus />
                  接受
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => onAction("withdraw")}
                aria-label={`撤回发给${person.name}的好友申请`}
              >
                撤回申请
              </Button>
            )}
          </div>
        ) : request.status === "accepted" ? (
          <Button
            variant="secondary"
            className="friend-start-chat"
            onClick={onStartChat}
            aria-label={`与${person.name}开始聊天`}
          >
            <MessageCircle />
            开始聊天
          </Button>
        ) : (
          <span className="friend-record-note">
            {request.status === "expired"
              ? "已超过 7 天有效期"
              : "处理记录已保留"}
          </span>
        )}
      </div>
    </article>
  );
}
