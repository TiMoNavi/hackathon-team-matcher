"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  Compass,
  Download,
  FileText,
  Info,
  Lightbulb,
  MessageCircle,
  Paperclip,
  Pause,
  Pin,
  Play,
  Plus,
  Search,
  Send,
  Smile,
  Sparkles,
  Users,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/chat/theme-toggle";
import {
  FriendRequestEntry,
  FriendRequestsDrawer,
} from "@/components/chat/friend-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  me,
  people,
  personDirectory,
  useConversations,
  type Attachment,
  type Conversation,
  type Filter,
  type Person,
} from "@/lib/conversations";

function Avatar({
  person,
  group,
  small = false,
}: {
  person?: Person;
  group?: boolean;
  small?: boolean;
}) {
  return (
    <span
      className={cn(
        "person-avatar",
        small && "avatar-small",
        group && "group-avatar",
      )}
    >
      {group ? (
        <Users aria-hidden="true" />
      ) : person ? (
        <Image src={person.avatar} alt="" width={44} height={44} unoptimized />
      ) : (
        <MessageCircle aria-hidden="true" />
      )}
      {person?.online && !group && <i className="online-dot" />}
    </span>
  );
}
function ChatAvatar({ chat }: { chat: Conversation }) {
  return (
    <Avatar
      group={chat.kind === "group"}
      person={personDirectory.find(
        (p) => p.id === chat.members.find((id) => id !== "me"),
      )}
    />
  );
}

export function ConversationApp({
  initialFilter = "all",
}: {
  initialFilter?: Filter;
}) {
  const {
    contacts,
    friendRequests,
    chats,
    drafts,
    setDraft,
    send,
    markRead,
    toggle,
    createGroup,
    openDirect,
  } = useConversations();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    initialFilter === "direct" ? "lin" : "weekend",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const pendingRequests = friendRequests.filter(
    (request) =>
      request.direction === "incoming" && request.status === "pending",
  ).length;
  const [newOpen, setNewOpen] = useState(false);
  const [newMode, setNewMode] = useState<"direct" | "group">("group");
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<
    Record<string, Attachment | undefined>
  >({});
  const input = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const uploads = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const backRef = useRef<HTMLButtonElement>(null);
  const active = chats.find((chat) => chat.id === selected) ?? chats[0];
  const unread = chats.reduce((sum, chat) => sum + chat.unread, 0);
  const visible = chats
    .filter((chat) => {
      const matches =
        filter === "all" ||
        (filter === "unread"
          ? chat.unread > 0
          : filter === "pinned"
            ? chat.pinned
            : chat.kind === filter);
      return (
        matches &&
        `${chat.name} ${chat.subtitle}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      );
    })
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const draft = drafts[active.id] || "";
  const attachment = pending[active.id];
  const directPerson = personDirectory.find(
    (p) => p.id === active.members.find((id) => id !== "me"),
  );

  useEffect(() => {
    const viewport = messages.current?.closest(
      "[data-slot=scroll-area-viewport]",
    );
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [active.id, active.messages.length, mobileOpen]);
  useEffect(() => {
    const activeUrls = urls.current;
    return () => {
      activeUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.chatMotion = paused ? "paused" : "playing";
    const updateVisibility = () => {
      root.dataset.chatHidden = String(document.hidden);
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      delete root.dataset.chatMotion;
      delete root.dataset.chatHidden;
    };
  }, [paused]);

  function choose(id: string) {
    setSelected(id);
    markRead(id);
    setMobileOpen(true);
    setDetailsOpen(false);
  }
  function openNew(mode: "direct" | "group") {
    setNewMode(mode);
    setGroupName("");
    setMembers([]);
    setNewOpen(true);
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() && !attachment) return;
    send(active.id, attachment);
    setPending((current) => ({ ...current, [active.id]: undefined }));
    setFeedback("已添加到本地演示会话");
    input.current?.focus();
  }
  function makeGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim() || members.length < 2) return;
    const id = createGroup(groupName, members);
    setFilter("group");
    setQuery("");
    choose(id);
    setNewOpen(false);
    setFeedback("演示群聊已创建，刷新后恢复初始数据");
  }

  return (
    <div
      className="conversation-page"
      data-motion={paused ? "paused" : "playing"}
    >
      <div className="chat-atmosphere" aria-hidden="true">
        <div className="atmosphere-wash">
          <span className="atmosphere-violet" />
          <span className="atmosphere-lime" />
        </div>
        <div className="atmosphere-rings">
          <i />
          <i />
          <i />
        </div>
        <div className="atmosphere-specks" />
      </div>
      <a className="skip-link" href="#conversation-main">
        跳到对话
      </a>
      <header className="app-header">
        <a
          className="brand-link"
          href="http://127.0.0.1:4200/"
          aria-label="返回同频首页"
        >
          <Brand />
        </a>
        <span className="header-note">一个人的灵感，一群人的作品</span>
        <div className="header-actions">
          <span className="preview-label">
            <span />
            本地演示
          </span>
          <ThemeToggle />
          <button
            className="icon-button motion-button"
            onClick={() => setPaused(!paused)}
            aria-label={paused ? "播放背景动效" : "暂停背景动效"}
            aria-pressed={paused}
          >
            {paused ? <Play /> : <Pause />}
          </button>
          <a className="home-link" href="http://127.0.0.1:4200/">
            回到首页
            <ArrowUpRight />
          </a>
        </div>
      </header>

      {/* Soho: navigation rail + independently scrolling list + flexible thread. */}
      <main
        id="conversation-main"
        className="conversation-shell"
        tabIndex={-1}
        data-chat-open={mobileOpen}
      >
        <nav className="navigation-rail" aria-label="消息导航">
          <span className="rail-spark" aria-hidden="true">
            <Sparkles />
          </span>
          <button
            className="rail-item"
            aria-pressed={
              filter === "all" || filter === "direct" || filter === "unread"
            }
            onClick={() => {
              setFilter("all");
              setMobileOpen(false);
            }}
          >
            <MessageCircle />
            <span>消息</span>
            {unread > 0 && <i />}
          </button>
          <button
            className="rail-item"
            aria-pressed={filter === "group"}
            onClick={() => {
              setFilter("group");
              setMobileOpen(false);
            }}
          >
            <Users />
            <span>群聊</span>
          </button>
          <button
            className="rail-item"
            aria-pressed={filter === "pinned"}
            onClick={() => {
              setFilter("pinned");
              setMobileOpen(false);
            }}
          >
            <Pin />
            <span>置顶</span>
          </button>
          <button
            type="button"
            className="rail-item friend-rail-item"
            aria-label={
              pendingRequests
                ? `好友申请，${pendingRequests} 条待确认`
                : "好友申请"
            }
            aria-haspopup="dialog"
            aria-expanded={requestsOpen}
            onClick={() => setRequestsOpen(true)}
          >
            <UserRoundPlus />
            <span>新朋友</span>
            {pendingRequests > 0 && (
              <b className="friend-rail-badge">{pendingRequests}</b>
            )}
          </button>
          <div className="rail-bottom">
            <a className="rail-item" href="http://127.0.0.1:4200/#people">
              <Compass />
              <span>发现</span>
            </a>
            <span className="rail-self" title="演示中的你">
              <Avatar person={me} small />
              <span>你</span>
            </span>
          </div>
        </nav>

        <aside className="conversation-list" aria-label="会话列表">
          <div className="list-heading">
            <div>
              <div className="eyebrow">好想法，从聊聊开始</div>
              <h1>
                我的消息<span>{chats.length.toString().padStart(2, "0")}</span>
              </h1>
            </div>
            <button
              className="icon-button new-button"
              onClick={() => openNew("group")}
              aria-label="新建会话"
            >
              <Plus />
            </button>
          </div>
          <label className="chat-search">
            <Search />
            <input
              aria-label="搜索会话"
              placeholder="搜索好友或群聊"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="清除搜索" onClick={() => setQuery("")}>
                <X />
              </button>
            )}
          </label>
          <div className="filter-tabs" role="group" aria-label="会话分类">
            {(
              [
                ["all", "全部"],
                ["direct", "私聊"],
                ["group", "群聊"],
                ["unread", "未读"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
                {value === "unread" && unread > 0 && <span>{unread}</span>}
              </button>
            ))}
          </div>
          <FriendRequestEntry onOpen={() => setRequestsOpen(true)} />
          <div className="list-section-label">
            {filter === "pinned" ? "置顶会话" : "最近联系"}
            <span>{visible.length} 个会话</span>
          </div>
          <ScrollArea className="chat-list-scroll">
            <div className="chat-list-items">
              {visible.map((chat) => (
                <button
                  key={chat.id}
                  data-testid={`chat-${chat.id}`}
                  className="chat-list-item"
                  aria-current={selected === chat.id ? "true" : undefined}
                  onClick={() => choose(chat.id)}
                >
                  <ChatAvatar chat={chat} />
                  <span className="chat-item-copy">
                    <span className="chat-item-name">
                      <strong>{chat.name}</strong>
                      <time>{chat.messages.at(-1)?.time || "刚刚"}</time>
                    </span>
                    <span className="chat-item-preview">
                      {drafts[chat.id] ? (
                        <>
                          <em>草稿</em>
                          {drafts[chat.id]}
                        </>
                      ) : (
                        chat.messages.at(-1)?.text || "向大家打个招呼吧"
                      )}
                    </span>
                    {chat.kind === "group" && (
                      <span className="chat-item-context">
                        <span />
                        {chat.event}
                      </span>
                    )}
                  </span>
                  <span className="item-markers">
                    {chat.unread > 0 ? (
                      <span className="unread-count">{chat.unread}</span>
                    ) : chat.pinned ? (
                      <Pin />
                    ) : chat.muted ? (
                      <BellOff />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            {!visible.length && (
              <div className="list-empty">
                <Search />
                <p>{query ? "没有找到这个会话" : "这里暂时没有会话"}</p>
                <button
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  查看全部会话
                </button>
              </div>
            )}
          </ScrollArea>
          <button
            className="new-conversation-card"
            onClick={() => openNew("direct")}
          >
            <span>
              <MessageCircle />
            </span>
            <div>
              <strong>把第一句招呼，交给你</strong>
              <p>找一位朋友，聊聊新想法</p>
            </div>
            <ArrowUpRight />
          </button>
        </aside>

        <section className="active-conversation" aria-label={active.name}>
          <header className="thread-header">
            <button
              ref={backRef}
              className="icon-button back-button"
              aria-label="返回会话列表"
              onClick={() => {
                setMobileOpen(false);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      `[data-testid="chat-${active.id}"]`,
                    )
                    ?.focus(),
                );
              }}
            >
              <ArrowLeft />
            </button>
            <ChatAvatar chat={active} />
            <div className="thread-heading">
              <h2>{active.name}</h2>
              <p>
                {active.kind === "group" ? (
                  <>
                    <Users />
                    {active.members.length} 位成员
                    <span className="context-divider" />
                    {active.event}
                  </>
                ) : (
                  <>
                    <span
                      className={cn(
                        "presence",
                        directPerson?.online && "is-online",
                      )}
                    />
                    {directPerson?.online ? "在线" : "暂时离线"}
                    <span className="context-divider" />
                    {directPerson?.role}
                  </>
                )}
              </p>
            </div>
            <div className="thread-actions">
              <button
                className="icon-button pin-button"
                aria-label={active.pinned ? "取消置顶会话" : "置顶会话"}
                aria-pressed={!!active.pinned}
                onClick={() => toggle(active.id, "pinned")}
              >
                <Pin />
              </button>
              <button
                className="detail-button"
                onClick={() => setDetailsOpen(true)}
                aria-label={
                  active.kind === "group" ? "查看群聊详情" : "查看好友资料"
                }
              >
                <Info />
                <span>{active.kind === "group" ? "群聊详情" : "好友资料"}</span>
              </button>
            </div>
          </header>
          <button
            className="conversation-context"
            onClick={() => setDetailsOpen(true)}
          >
            <span className="idea-mark">
              <Lightbulb />
            </span>
            <span>
              <small>
                {active.kind === "group"
                  ? "正在一起做的事"
                  : "从一个共同的想法开始"}
              </small>
              <strong>{active.subtitle}</strong>
            </span>
            <ChevronRight />
          </button>
          <ScrollArea
            className="messages-scroll"
            viewportClassName="message-viewport"
          >
            <div
              className="message-history"
              ref={messages}
              role="log"
              aria-label="聊天记录"
              aria-live="polite"
              aria-relevant="additions"
            >
              <div className="history-date">
                <span />
                {active.messages.length ? "演示会话 · 今天" : "新会话"}
                <span />
              </div>
              {active.kind === "group" && (
                <p className="group-welcome">
                  你们在同一场活动相遇，接下来，一起把想法变成作品。
                </p>
              )}
              {active.messages.map((msg) => {
                const own = msg.sender === "me";
                const person = own
                  ? me
                  : personDirectory.find((p) => p.id === msg.sender);
                return (
                  <article
                    key={msg.id}
                    className={cn("message-row", own && "message-own")}
                    data-local={msg.local || undefined}
                    data-testid="message"
                  >
                    <Avatar person={person} small />
                    <div className="message-stack">
                      <div className="message-author">
                        {person?.name ?? "成员"}
                        <time>{msg.time}</time>
                      </div>
                      <Bubble
                        align={own ? "end" : "start"}
                        variant={own ? "default" : "outline"}
                        className="message-bubble"
                      >
                        <BubbleContent>
                          {msg.text && <p>{msg.text}</p>}
                          {msg.attachment && (
                            <a
                              className="file-attachment"
                              href={msg.attachment.url}
                              download={msg.attachment.name}
                            >
                              <span>
                                <FileText />
                              </span>
                              <span>
                                <strong>{msg.attachment.name}</strong>
                                <small>{msg.attachment.size}</small>
                              </span>
                              <Download aria-label="下载文件" />
                            </a>
                          )}
                        </BubbleContent>
                      </Bubble>
                      {own && (
                        <span className="message-status">
                          {msg.local ? (
                            <>
                              <Check />
                              仅保存在本次演示
                            </>
                          ) : (
                            <>
                              <CheckCheck />
                              演示消息
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
              {!active.messages.length && (
                <div className="thread-empty">
                  <Sparkles />
                  <h3>好故事，等你开个头</h3>
                  <p>说说你想做什么，或者简单打个招呼。</p>
                  <button
                    onClick={() => {
                      setDraft(
                        active.id,
                        active.kind === "group"
                          ? "大家好，很高兴和你们一起开工！"
                          : `你好，${active.name}，很高兴认识你！`,
                      );
                      input.current?.focus();
                    }}
                  >
                    写一句开场白
                  </button>
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="composer-area">
            {active.kind === "group" && (
              <button
                className="group-notice"
                onClick={() => setDetailsOpen(true)}
              >
                <Pin />
                <span>{active.notice}</span>
                <ChevronRight />
              </button>
            )}
            <form className="message-composer" onSubmit={submit}>
              {attachment && (
                <div className="pending-file">
                  <FileText />
                  <span>{attachment.name}</span>
                  <button
                    type="button"
                    aria-label="移除附件"
                    onClick={() => {
                      URL.revokeObjectURL(attachment.url);
                      urls.current.delete(attachment.url);
                      setPending((current) => ({
                        ...current,
                        [active.id]: undefined,
                      }));
                    }}
                  >
                    <X />
                  </button>
                </div>
              )}
              <label className="sr-only" htmlFor="message-draft">
                输入消息
              </label>
              <textarea
                ref={input}
                id="message-draft"
                rows={2}
                maxLength={4000}
                placeholder={
                  active.kind === "group"
                    ? "和大家聊聊，让好想法接着发生…"
                    : `给${active.name}发一条消息…`
                }
                value={draft}
                onChange={(event) => setDraft(active.id, event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229
                  ) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="composer-toolbar">
                <div className="composer-tools">
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="插入表情"
                        />
                      }
                    >
                      <Smile />
                    </PopoverTrigger>
                    <PopoverContent className="emoji-picker" side="top">
                      <p>给消息一点表情</p>
                      <div>
                        {["👋", "😊", "👍", "✨", "🎉", "💡", "🙌", "❤️"].map(
                          (emoji, index) => (
                            <button
                              key={emoji}
                              type="button"
                              aria-label={
                                [
                                  "挥手",
                                  "微笑",
                                  "赞",
                                  "闪光",
                                  "庆祝",
                                  "灵感",
                                  "举手",
                                  "爱心",
                                ][index]
                              }
                              onClick={() => setDraft(active.id, draft + emoji)}
                            >
                              {emoji}
                            </button>
                          ),
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="添加本地附件"
                    onClick={() => uploads.current?.click()}
                  >
                    <Paperclip />
                  </button>
                  <input
                    ref={uploads}
                    type="file"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="选择附件"
                    accept="image/*,.pdf,.txt,.md"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) {
                        setFeedback("请选择 10 MB 以内的文件");
                        return;
                      }
                      if (attachment) {
                        URL.revokeObjectURL(attachment.url);
                        urls.current.delete(attachment.url);
                      }
                      const url = URL.createObjectURL(file);
                      urls.current.add(url);
                      setPending((current) => ({
                        ...current,
                        [active.id]: {
                          name: file.name,
                          url,
                          size: `${Math.max(1, Math.round(file.size / 1024))} KB · 本地附件`,
                        },
                      }));
                    }}
                  />
                </div>
                <span className="keyboard-hint">
                  Enter 发送 · Shift + Enter 换行
                </span>
                <Button
                  type="submit"
                  className="send-button"
                  disabled={!draft.trim() && !attachment}
                >
                  发送
                  <Send />
                </Button>
              </div>
            </form>
            <p className="demo-footnote">
              演示人物与消息 · 内容仅在当前页面保留
            </p>
          </div>
        </section>
      </main>
      <p className="page-caption">
        <span>同频，让相遇有下文。</span>
        <span>
          在这里，好好说话，一起做事。
          <Sparkles />
        </span>
      </p>
      <div className="feedback" role="status" aria-live="polite">
        {feedback && (
          <span>
            <Check />
            {feedback}
          </span>
        )}
      </div>

      <Drawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        swipeDirection="right"
      >
        <DrawerContent className="details-drawer">
          <DrawerHeader>
            <DrawerTitle>
              {active.kind === "group" ? "群聊详情" : "好友资料"}
            </DrawerTitle>
            <DrawerDescription>
              此处展示虚构人物与活动，供界面体验。
            </DrawerDescription>
            <DrawerClose
              render={
                <button
                  className="icon-button drawer-close"
                  aria-label="关闭详情"
                />
              }
            >
              <X />
            </DrawerClose>
          </DrawerHeader>
          <ScrollArea className="details-scroll">
            <div className="details-body">
              <div className="detail-identity">
                <ChatAvatar chat={active} />
                <h3>{active.name}</h3>
                <p>{active.subtitle}</p>
                {active.event && (
                  <span className="event-pill">
                    <span />
                    {active.event}
                  </span>
                )}
              </div>
              {active.kind === "group" && (
                <section className="detail-notice">
                  <h4>
                    <Lightbulb />
                    讨论安排
                  </h4>
                  <p>{active.notice}</p>
                </section>
              )}
              <div className="detail-toggles">
                <button
                  onClick={() => toggle(active.id, "pinned")}
                  aria-pressed={!!active.pinned}
                >
                  <Pin />
                  <span>置顶会话</span>
                  <i className={active.pinned ? "toggle-on" : ""} />
                </button>
                <button
                  onClick={() => toggle(active.id, "muted")}
                  aria-pressed={!!active.muted}
                >
                  {active.muted ? <BellOff /> : <Bell />}
                  <span>消息免打扰（演示）</span>
                  <i className={active.muted ? "toggle-on" : ""} />
                </button>
              </div>
              <section className="member-section">
                <h4>
                  {active.kind === "group"
                    ? `群成员 · ${active.members.length}`
                    : "参与会话的人"}
                </h4>
                {active.members.map((id) => {
                  const person =
                    id === "me" ? me : personDirectory.find((p) => p.id === id);
                  return (
                    person && (
                      <div key={id} className="member-row">
                        <Avatar person={person} small />
                        <div>
                          <strong>{person.name}</strong>
                          <span>{person.role}</span>
                        </div>
                        {person.online && <small>在线</small>}
                      </div>
                    )
                  );
                })}
              </section>
              <p className="detail-boundary">
                {active.kind === "group"
                  ? "此讨论属于上方活动。不同活动的讨论成员与消息分别保存。"
                  : "已有好友与私聊独立保留，不会因切换活动而消失。"}
              </p>
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      <FriendRequestsDrawer
        open={requestsOpen}
        onOpenChange={setRequestsOpen}
        onStartChat={(id) => {
          const chatId = openDirect(id);
          if (chatId) {
            setFilter("all");
            setQuery("");
            choose(chatId);
          }
        }}
      />

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="new-dialog" showCloseButton={false}>
          <button
            className="icon-button drawer-close"
            onClick={() => setNewOpen(false)}
            aria-label="关闭新建会话"
          >
            <X />
          </button>
          <DialogTitle>让对话开始</DialogTitle>
          <DialogDescription>
            选择演示联系人，私聊或一起组个小队。
          </DialogDescription>
          <div className="dialog-tabs">
            <button
              aria-pressed={newMode === "direct"}
              onClick={() => setNewMode("direct")}
            >
              发起私聊
            </button>
            <button
              aria-pressed={newMode === "group"}
              onClick={() => setNewMode("group")}
            >
              新建群聊
            </button>
          </div>
          <form onSubmit={makeGroup}>
            {newMode === "group" && (
              <label className="group-name-field">
                群聊名称
                <Input
                  autoComplete="off"
                  required
                  maxLength={24}
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="给你们的小队起个名字"
                />
              </label>
            )}
            <div className="contact-choices">
              {(newMode === "group" ? people : contacts).map((person) =>
                newMode === "group" ? (
                  <label key={person.id} className="contact-choice">
                    <Avatar person={person} small />
                    <span>
                      <strong>{person.name}</strong>
                      <small>{person.role}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={members.includes(person.id)}
                      onChange={(event) =>
                        setMembers((current) =>
                          event.target.checked
                            ? [...current, person.id]
                            : current.filter((id) => id !== person.id),
                        )
                      }
                      aria-label={`选择${person.name}`}
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    key={person.id}
                    className="contact-choice"
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                      choose(openDirect(person.id));
                      setNewOpen(false);
                    }}
                  >
                    <Avatar person={person} small />
                    <span>
                      <strong>{person.name}</strong>
                      <small>{person.role}</small>
                    </span>
                    <ChevronRight />
                  </button>
                ),
              )}
            </div>
            {newMode === "group" && (
              <div className="create-group-footer">
                <p>
                  同一活动的演示联系人
                  <br />
                  至少选择 2 位，已选 {members.length} 位
                </p>
                <Button
                  type="submit"
                  disabled={!groupName.trim() || members.length < 2}
                >
                  创建演示群聊
                  <Plus />
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
