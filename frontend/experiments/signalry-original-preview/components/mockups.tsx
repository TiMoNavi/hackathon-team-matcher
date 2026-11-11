"use client";

import { motion } from "motion/react";
import {
  ArrowUp,
  BellRing,
  Bot,
  Check,
  CircleDot,
  Headset,
  Inbox,
  Kanban,
  LayoutGrid,
  Mail,
  MessageSquareText,
  MessagesSquare,
  Send,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export const sources = {
  chat: { label: "Live chat", icon: MessagesSquare, color: "bg-[#E8F7EE] text-[#15803D]" },
  email: { label: "Email", icon: Mail, color: "bg-[#FFF1E6] text-[#C2410C]" },
  support: { label: "Support", icon: Headset, color: "bg-[#E8F1FF] text-[#1D4ED8]" },
  survey: { label: "Survey", icon: MessageSquareText, color: "bg-[#FDF0FA] text-[#A21CAF]" },
  ticket: { label: "Tickets", icon: Ticket, color: "bg-[#FEF9E7] text-[#A16207]" },
} satisfies Record<string, { label: string; icon: LucideIcon; color: string }>;

type SourceKey = keyof typeof sources;

export function SourceBadge({ source }: { source: SourceKey }) {
  const s = sources[source];
  const Icon = s.icon;
  return (
    <Badge className={cn("h-auto px-2 py-0.5 text-[11px]", s.color)}>
      <Icon />
      {s.label}
    </Badge>
  );
}

const avatarColors = ["#5B3DF5", "#0EA5E9", "#F97316", "#10B981", "#EC4899", "#64748B"];

/** Initials avatar on a colored fill, built on the shadcn Avatar. */
export function PersonAvatar({
  name,
  i = 0,
  size = 24,
}: {
  name: string;
  i?: number;
  size?: number;
}) {
  return (
    <Avatar className="after:hidden" style={{ width: size, height: size }}>
      <AvatarFallback
        className="font-semibold text-white"
        style={{ fontSize: size * 0.42, background: avatarColors[i % avatarColors.length] }}
      >
        {name
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  );
}

function Window({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "gap-0 rounded-2xl border border-border py-0 text-base shadow-[0_20px_60px_-20px_rgba(37,22,120,0.25)] ring-0",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B6B]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FFC94D]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#4ADE80]" />
        {title && <span className="ml-3 text-[12px] font-medium text-muted-foreground">{title}</span>}
      </div>
      {children}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Hero product shot                                                   */
/* ------------------------------------------------------------------ */

const heroSignals: { name: string; text: string; source: SourceKey; votes: number }[] = [
  { name: "Maya Ortiz", text: "Can we get bulk export to CSV for reports?", source: "chat", votes: 42 },
  { name: "Jonas Berg", text: "Dark mode for the mobile app would be amazing", source: "survey", votes: 31 },
  { name: "Priya Shah", text: "SSO with Okta is a blocker for our rollout", source: "support", votes: 27 },
  { name: "Leo Grant", text: "Calendar view for the roadmap, please!", source: "email", votes: 18 },
];

export function HeroDashboard() {
  return (
    <Window title="app.signalry.io / inbox" className="text-left">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_300px]">
        {/* sidebar */}
        <aside className="hidden flex-col gap-1 border-r border-border p-4 md:flex">
          {[
            { icon: Inbox, label: "Inbox", count: 128, active: true },
            { icon: Sparkles, label: "AI themes" },
            { icon: Kanban, label: "Roadmap" },
            { icon: Users, label: "Customers" },
            { icon: BellRing, label: "Changelog" },
          ].map((item) => (
            <div
              key={item.label}
              className={
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] " +
                (item.active ? "bg-secondary font-semibold text-primary" : "text-body")
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.count && (
                <span className="ml-auto rounded-md bg-primary px-1.5 text-[10px] font-semibold text-white">
                  {item.count}
                </span>
              )}
            </div>
          ))}
        </aside>

        {/* inbox */}
        <div className="flex flex-col p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-heading text-[15px] font-semibold text-foreground">New signals</span>
            <span className="text-[12px] text-muted-foreground">Sorted by demand</span>
          </div>
          <div className="flex flex-col gap-2">
            {heroSignals.map((s, i) => (
              <motion.div
                key={s.name}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.12, duration: 0.5 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-white p-3"
              >
                <PersonAvatar name={s.name} i={i} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{s.text}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <SourceBadge source={s.source} />
                    <span className="text-[11px] text-muted-foreground">{s.name}</span>
                  </div>
                </div>
                <span className="flex flex-col items-center rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground">
                  <ArrowUp className="h-3 w-3 text-primary" />
                  {s.votes}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* AI summary */}
        <div className="hidden flex-col gap-3 border-l border-border bg-muted p-5 md:flex">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-primary">
            <Sparkles className="h-4 w-4" /> AI summary · this week
          </div>
          <p className="text-[13px] leading-5 text-body">
            <span className="rounded bg-lime px-1 font-medium text-foreground">Data export</span> is
            the fastest-growing request, up 38% from last week, mostly from accounts on the
            Growth plan.
          </p>
          <div className="mt-1 flex flex-col gap-2">
            {[
              ["Data export", 82],
              ["Mobile dark mode", 64],
              ["Enterprise SSO", 51],
            ].map(([label, value], i) => (
              <div key={label as string}>
                <div className="mb-1 flex justify-between text-[11px] text-body">
                  <span>{label}</span>
                  <span className="font-semibold text-foreground">{value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ delay: 1.3 + i * 0.15, duration: 0.9, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto rounded-xl bg-white p-3 text-[12px] text-body shadow-sm">
            <span className="font-semibold text-foreground">Suggested next step:</span> move “CSV
            export” to <span className="font-medium text-primary">Next up</span>.
          </div>
        </div>
      </div>
    </Window>
  );
}

/* ------------------------------------------------------------------ */
/* Feature bento visuals                                               */
/* ------------------------------------------------------------------ */

export function UnifiedInbox() {
  const rows: { source: SourceKey; text: string }[] = [
    { source: "support", text: "Need a way to merge duplicate requests" },
    { source: "chat", text: "Love the new editor! Any keyboard shortcuts?" },
    { source: "email", text: "Our team keeps asking for Jira sync" },
    { source: "ticket", text: "Bulk tagging would save us hours" },
  ];
  return (
    <div className="relative flex h-full w-full items-end justify-center">
      <div className="flex w-full max-w-[560px] flex-col gap-2.5">
        {rows.map((r, i) => (
          <motion.div
            key={r.text}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
            className={
              (i % 2 ? "sm:ml-6 " : "sm:mr-6 ") +
              "flex items-center gap-3 rounded-xl border bg-white p-3 " +
              (i === 1 ? "border-primary shadow-[0_8px_24px_-8px_rgba(91,61,245,0.35)]" : "border-border")
            }
          >
            <SourceBadge source={r.source} />
            <span className="truncate text-[13px] text-foreground">{r.text}</span>
            {i === 1 && (
              <Badge
                variant="lime"
                className="ml-auto hidden h-auto rounded-md px-1.5 py-0.5 text-[10px] sm:inline-flex"
              >
                Auto-tagged
              </Badge>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function DemandChart({ compact = false }: { compact?: boolean }) {
  const bars = [38, 54, 46, 72, 61, 88, 79];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex h-full w-full flex-col justify-end">
      {!compact && (
        <div className="mb-4 flex items-baseline gap-2">
          <span className="font-heading text-[32px] font-semibold tracking-tight text-foreground">+38%</span>
          <span className="flex items-center gap-1 text-[12px] font-medium text-[#15803D]">
            <TrendingUp className="h-3.5 w-3.5" /> demand this week
          </span>
        </div>
      )}
      <div className="flex h-[150px] items-end gap-2">
        {bars.map((h, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <motion.div
                className={"w-full rounded-t-md " + (i === 5 ? "bg-primary" : "bg-secondary")}
                initial={{ height: 0 }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.07, duration: 0.7, ease: "easeOut" }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoadmapBoard() {
  const columns = [
    {
      title: "Next up",
      dot: "bg-[#0EA5E9]",
      items: [
        { title: "CSV & PDF export for reports", tag: "Analytics", votes: 82 },
        { title: "Okta & Azure AD single sign-on", tag: "Security", votes: 51 },
      ],
    },
    {
      title: "Building",
      dot: "bg-primary",
      items: [
        { title: "Dark mode for iOS and Android", tag: "Mobile", votes: 64 },
        { title: "Two-way Jira sync", tag: "Integrations", votes: 47 },
      ],
    },
    {
      title: "Shipped",
      dot: "bg-[#10B981]",
      items: [
        { title: "Duplicate request merging", tag: "Inbox", votes: 39 },
        { title: "Weekly AI digest email", tag: "AI", votes: 33 },
      ],
    },
  ];
  return (
    <div className="grid w-full grid-cols-1 items-start gap-3 sm:grid-cols-3">
      {columns.map((col, ci) => (
        <div key={col.title} className="flex flex-col gap-2 rounded-xl bg-muted p-3">
          <div className="flex items-center gap-2 px-1 text-[12px] font-semibold text-foreground">
            <span className={"h-2 w-2 rounded-full " + col.dot} />
            {col.title}
            <span className="ml-auto text-muted-foreground">{col.items.length}</span>
          </div>
          {col.items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + ci * 0.12 + i * 0.08, duration: 0.5 }}
              className="rounded-lg border border-border bg-white p-3"
            >
              <p className="text-[13px] font-medium leading-snug text-foreground">{item.title}</p>
              <div className="mt-2 flex items-center justify-between">
                <Badge variant="secondary" className="h-auto rounded-md px-1.5 py-0.5 text-[10px]">
                  {item.tag}
                </Badge>
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-body">
                  <ArrowUp className="h-3 w-3" />
                  {item.votes}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Advantage panels                                                    */
/* ------------------------------------------------------------------ */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-linear-to-br from-muted via-white to-[#F0FBD0] p-3 sm:p-6">
      <Card className="h-full gap-4 rounded-2xl border border-border text-base shadow-[0_20px_50px_-24px_rgba(37,22,120,0.35)] ring-0 [--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 gap-0">{children}</CardContent>
      </Card>
    </div>
  );
}

export function SourcesPanel() {
  const list: [SourceKey, number][] = [
    ["support", 412],
    ["chat", 286],
    ["email", 198],
    ["survey", 143],
    ["ticket", 97],
  ];
  return (
    <Panel title="Signals by channel · last 30 days">
      <div className="flex flex-col gap-3">
        {list.map(([key, n], i) => (
          <div key={key} className="flex items-center gap-3">
            <div className="w-[96px]">
              <SourceBadge source={key} />
            </div>
            <div className="h-2 flex-1 rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${(n / 412) * 100}%` }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.7 }}
              />
            </div>
            <span className="w-8 text-right text-[12px] font-semibold text-foreground">{n}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 rounded-xl bg-muted p-3 text-[12px] text-body lg:mt-auto">
        <Inbox className="h-4 w-4 text-primary" /> 1,136 signals merged into 214 unique requests
      </div>
    </Panel>
  );
}

export function SentimentPanel() {
  const parts = [
    { label: "Positive", value: 58, color: "#10B981" },
    { label: "Neutral", value: 27, color: "#CBD5E1" },
    { label: "Frustrated", value: 15, color: "#F43F5E" },
  ];
  return (
    <Panel title="Sentiment across all feedback">
      <div className="flex h-4 overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <motion.div
            key={p.label}
            style={{ background: p.color }}
            initial={{ width: 0 }}
            animate={{ width: `${p.value}%` }}
            transition={{ delay: 0.1 + i * 0.15, duration: 0.6 }}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-4">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5 text-[12px] text-body">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label} <b className="text-foreground">{p.value}%</b>
          </span>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {[
          ["“Onboarding took us less than a day.”", "#10B981"],
          ["“Search is slow on large workspaces.”", "#F43F5E"],
        ].map(([q, c]) => (
          <div
            key={q}
            className="rounded-lg border-l-[3px] bg-muted px-3 py-2 text-[12px] text-body"
            style={{ borderColor: c }}
          >
            {q}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function LoopPanel() {
  return (
    <Panel title="Release note · sent automatically">
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Send className="h-3.5 w-3.5 text-primary" /> To 214 customers who asked for this
        </div>
        <p className="mt-3 font-heading text-[18px] font-semibold text-foreground">
          CSV export is live 🎉
        </p>
        <p className="mt-1 text-[13px] leading-5 text-body">
          You asked, we built it. Export any report to CSV or PDF from the share menu.
        </p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["68%", "opened"],
          ["41%", "tried it"],
          ["+12", "NPS"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-muted py-3">
            <p className="font-heading text-[18px] font-semibold text-foreground">{v}</p>
            <p className="text-[11px] text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function RankingPanel() {
  const items = [
    ["CSV & PDF export", 82, "12 enterprise accounts"],
    ["Mobile dark mode", 64, "Mostly self-serve users"],
    ["Okta SSO", 51, "$184k ARR waiting"],
    ["Calendar roadmap view", 33, "Product teams"],
  ] as const;
  return (
    <Panel title="Top requests by impact">
      <div className="flex flex-col gap-2">
        {items.map(([title, score, note], i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="flex items-center gap-3 rounded-lg border border-border p-2.5"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-[12px] font-bold text-primary">
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-foreground">{title}</p>
              <p className="text-[11px] text-muted-foreground">{note}</p>
            </div>
            <span className="text-[13px] font-semibold text-foreground">{score}</span>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
}

export function VotingPanel() {
  return (
    <Panel title="Public feedback board">
      <div className="flex flex-col gap-2">
        {[
          ["Zapier integration", 128, true],
          ["Custom domains for the portal", 96, false],
          ["Slack thread capture", 74, false],
        ].map(([title, votes, voted]) => (
          <div key={title as string} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <span
              className={
                "flex w-12 flex-col items-center rounded-md border py-1 text-[12px] font-semibold " +
                (voted ? "border-primary bg-primary text-white" : "border-border text-foreground")
              }
            >
              <ArrowUp className="h-3.5 w-3.5" />
              {votes as number}
            </span>
            <p className="text-[13px] font-medium text-foreground">{title as string}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-4 text-[12px] text-body">
        <AvatarGroup>
          {["Ana Lima", "Tom Reed", "Kim Ito", "Sam Cole"].map((n, i) => (
            <PersonAvatar key={n} name={n} i={i} size={22} />
          ))}
        </AvatarGroup>
        +2.4k customers voting
      </div>
    </Panel>
  );
}

export function AlignPanel() {
  return (
    <Panel title="Weekly product sync">
      <div className="flex flex-col gap-3">
        {[
          { team: "Product", note: "Prioritized SSO for Q3", icon: LayoutGrid },
          { team: "Engineering", note: "Scoped export API, 2 sprints", icon: CircleDot },
          { team: "Customer success", note: "Notified 12 waiting accounts", icon: Headset },
        ].map((r, i) => (
          <div key={r.team} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <r.icon className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-foreground">{r.team}</p>
              <p className="text-[12px] text-muted-foreground">{r.note}</p>
            </div>
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 + i * 0.15, type: "spring" }}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981] text-white"
            >
              <Check className="h-3 w-3" />
            </motion.span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Ask AI                                                              */
/* ------------------------------------------------------------------ */

export function AskAiMockup() {
  return (
    <Window title="Ask Signalry" className="mx-auto w-full max-w-[880px]">
      <div className="flex flex-col gap-4 p-5 md:p-6">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[14px] text-white">
          What are enterprise customers most frustrated about this month?
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex gap-3"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-foreground">
            <Bot className="h-4 w-4" />
          </span>
          <div className="flex-1 rounded-2xl rounded-tl-md border border-border bg-muted p-4 text-[14px] leading-6 text-body">
            I found <b className="text-foreground">3 recurring themes</b> across 186 signals from
            enterprise accounts:
            <div className="mt-3 flex flex-col gap-2">
              {[
                ["Access control & SSO", 74],
                ["Slow search in large workspaces", 61],
                ["Audit log exports", 51],
              ].map(([t, n], i) => (
                <motion.div
                  key={t as string}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.8 + i * 0.15 }}
                  className="flex flex-col items-start justify-between gap-0.5 rounded-lg bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="text-[13px] font-medium text-foreground">{t}</span>
                  <span className="shrink-0 whitespace-nowrap text-[12px] text-muted-foreground">{n} mentions</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
        <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-[13px] text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Ask anything about your feedback…
          <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
            <ArrowUp className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Window>
  );
}

/* ------------------------------------------------------------------ */
/* Integrations orbit                                                  */
/* ------------------------------------------------------------------ */

const orbitIcons: { icon: LucideIcon; label: string }[] = [
  { icon: MessagesSquare, label: "Chat" },
  { icon: Mail, label: "Email" },
  { icon: Headset, label: "Helpdesk" },
  { icon: Ticket, label: "Issues" },
  { icon: MessageSquareText, label: "Surveys" },
  { icon: Kanban, label: "Boards" },
  { icon: Users, label: "CRM" },
  { icon: BellRing, label: "Alerts" },
];

function OrbitRing({
  size,
  items,
  duration,
  reverse = false,
}: {
  size: number;
  items: typeof orbitIcons;
  duration: number;
  reverse?: boolean;
}) {
  // The chips spin the opposite way at the same speed so they stay upright.
  const spin = (dir: "normal" | "reverse") => ({
    animation: `orbit-spin ${duration}s linear infinite ${dir}`,
  });
  return (
    <div
      className="absolute left-1/2 top-1/2 rounded-full border border-dashed border-primary/25"
      style={{
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        ...spin(reverse ? "reverse" : "normal"),
      }}
    >
      {items.map((item, i) => {
        const angle = (i / items.length) * Math.PI * 2;
        // Rounded so server and client render the same style string.
        const x = Math.round(Math.cos(angle) * (size / 2));
        const y = Math.round(Math.sin(angle) * (size / 2));
        return (
          <div
            key={item.label}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ marginLeft: x, marginTop: y }}
          >
            <div style={spin(reverse ? "normal" : "reverse")}>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-[12px] font-medium text-foreground shadow-[0_8px_20px_-8px_rgba(37,22,120,0.25)]">
                <item.icon className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">{item.label}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function IntegrationOrbit() {
  return (
    <div className="relative mx-auto h-full w-full max-w-[720px] overflow-hidden">
      <div className="absolute inset-0 origin-center scale-[0.55] sm:scale-75 md:scale-100">
        <OrbitRing size={300} duration={40} items={orbitIcons.slice(0, 3)} />
        <OrbitRing size={560} duration={60} items={orbitIcons.slice(3)} reverse />
        <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-primary shadow-[0_20px_50px_-10px_rgba(91,61,245,0.6)]">
          <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden>
            <path
              d="M9 18.5a7 7 0 0 1 14 0M12.5 18.5a3.5 3.5 0 0 1 7 0"
              fill="none"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="16" cy="18.5" r="1.6" className="fill-lime" />
          </svg>
        </div>
      </div>
    </div>
  );
}
