// components/ui/agent-findings-clean.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";

/*
 * Agent Findings – a swarm of agents checking something, and what they've found so far, in a single self-contained file.
 * One white card: a calm row per agent (what it's checking right now, a progress bar, checks done, findings so far)
 * and below it the latest findings as a short feed – new ones slide in on top, the oldest fades out at the bottom.
 * Click an agent to see only its findings; click a finding to open it. Rows never change height while the run goes on:
 * the current step swaps in place. The feed grows a row at a time as findings come in, up to its size.
 * The data is yours: pass agents with their progress and findings with a time – the component orders and animates them.
 * The styles are injected below, so no extra files are needed.
 */

export type FindingSeverity = "critical" | "warning" | "note";

export type FindingAgent = {
  id: string;
  name: string;
  /** Model or role, shown in the agent's tooltip and to screen readers */
  model?: string;
  /** A small mark – defaults to the initials on a soft tile */
  avatar?: ReactNode;
  /** What it's checking right now, a few words */
  step?: string;
  /** Checks done and planned – drives the bar */
  done: number;
  total: number;
  /** Defaults to running until done reaches total */
  status?: "running" | "done" | "failed";
};

export type Finding = {
  id: string;
  agentId: string;
  title: string;
  severity: FindingSeverity;
  /** Where it was found, e.g. "Vault.sol:142" */
  location?: string;
  at: number | Date;
};

export type AgentFindingsProps = {
  agents: FindingAgent[];
  findings: Finding[];
  /** Heading in the bar */
  title?: string;
  /** How many findings the feed shows at most (default 4) – it grows to that height as they come in */
  rows?: number;
  /** A clock you control, for the "2m ago" times – without it they follow real time */
  now?: number;
  onOpen?: (finding: Finding) => void;
  className?: string;
};

/** A time as a number, a Date or an ISO string – NaN when it can't be read */
const ms = (d: unknown) => (d instanceof Date ? d.getTime() : typeof d === "number" ? d : typeof d === "string" ? Date.parse(d) : NaN);
/** An unreadable time shows nothing; past a day it counts days */
const ago = (t: number, now: number) => {
  if (!Number.isFinite(t) || !Number.isFinite(now)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 5 ? "now" : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
/** Whole letters, so an emoji or an accent is never cut in half */
const letters = (w: string) => (typeof Intl.Segmenter === "function" ? Array.from(new Intl.Segmenter().segment(w), (x) => x.segment) : Array.from(w));
/** The first letters of the first and last word */
const initials = (name: string) => {
  const all = name.trim().split(/\s+/).filter(Boolean);
  // Words that start with a letter or digit – an emoji in front doesn't count, unless it's all there is
  const words = all.filter((w) => /^[\p{L}\p{N}]/u.test(w));
  if (!words.length) return all.length ? letters(all[0])[0] : "";
  return (words.length > 1 ? [words[0], words[words.length - 1]] : words).map((w) => letters(w)[0]).join("").toUpperCase();
};
/** A count: a whole number from 0 – NaN and negatives read 0 */
const whole = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
const num = new Intl.NumberFormat("en");
/** A small badge: 999+ past a thousand */
const many = (n: number) => (n > 999 ? "999+" : num.format(n));
const toSeverity = (s: unknown): FindingSeverity => (s === "critical" || s === "warning" ? s : "note");
const LABEL: Record<FindingSeverity, string> = { critical: "Critical", warning: "Warning", note: "Note" };
type Agent = FindingAgent & { key: string };
type Item = Omit<Finding, "at"> & { key: string; at: number; src: Finding };
/** Gaps are skipped and a repeated id gets a key of its own */
const keyed = <T extends { id: string }>(list: unknown) => {
  const seen = new Map<string, number>();
  return (Array.isArray(list) ? list : [])
    .filter((x): x is T => !!x && typeof x === "object")
    .map((x) => {
      const id = String(x.id ?? "");
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      return { x, id, key: n ? `${id}#${n}` : id };
    });
};
const ROW = 40;

/** A severity as a 2×2 dot matrix in its color, at stepped strengths */
const Mark = ({ severity }: { severity: FindingSeverity }) => {
  const on = severity === "critical" ? [1, 1, 1, 0.6] : severity === "warning" ? [1, 0.6, 0.6, 0.3] : [0.6, 0.3, 0.3, 0.3];
  return (
    <svg className="ui-afc__mark" data-severity={severity} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {[
        [0, 0],
        [5.5, 0],
        [0, 5.5],
        [5.5, 5.5],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="4.5" height="4.5" rx="1" fill="currentColor" opacity={on[i]} />
      ))}
    </svg>
  );
};

const Spark = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 1.2c.4 2.9 1.9 4.4 4.8 4.8-2.9.4-4.4 1.9-4.8 4.8C6.6 7.9 5.1 6.4 2.2 6 5.1 5.6 6.6 4.1 7 1.2Z" fill="currentColor" />
    <circle cx="11.6" cy="11.4" r="1.1" fill="currentColor" opacity="0.55" />
  </svg>
);

/** The current step: the new text fades in where the old one was, so the row never grows */
function Step({ text }: { text?: string }) {
  return (
    <span className="ui-afc__step" key={text} dir="auto" title={text}>
      {text}
    </span>
  );
}

/** The agent's mark – its avatar, or its initials when there is none or the image doesn't load */
function Face({ avatar, name }: { avatar?: ReactNode; name: string }) {
  const [broken, setBroken] = useState(false);
  const logo = avatar != null && avatar !== false && !broken;
  return (
    <span className="ui-afc__avatar" data-logo={logo ? "" : undefined} onErrorCapture={() => setBroken(true)}>
      {logo ? avatar : initials(name)}
    </span>
  );
}

export function AgentFindings({ agents, findings, title = "Verification", rows = 4, now: nowProp, onOpen, className }: AgentFindingsProps) {
  const [tick, setTick] = useState(nowProp ?? 0);
  const [only, setOnly] = useState<string | null>(null);
  useEffect(() => {
    if (nowProp !== undefined) return;
    const id = window.setInterval(() => setTick(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [nowProp]);
  const now = nowProp ?? tick;
  // How many rows the feed keeps – a broken value falls back to 4
  const rowsN = typeof rows === "number" && Number.isFinite(rows) && rows >= 1 ? Math.floor(rows) : 4;

  // Counts from 0, done never past total, a name to show, a known status
  const list: Agent[] = keyed<FindingAgent>(agents).map(({ x, id, key }) => {
    const total = whole(x.total);
    const status = x.status === "running" || x.status === "done" || x.status === "failed" ? x.status : undefined;
    return { ...x, id, key, name: String(x.name ?? "").trim() || id || "Agent", total, done: Math.min(whole(x.done), total), status };
  });
  const items: Item[] = keyed<Finding>(findings).map(({ x, id, key }) => ({ ...x, id, key, src: x, agentId: String(x.agentId ?? ""), title: String(x.title ?? ""), severity: toSeverity(x.severity), at: ms(x.at) }));

  const done = list.reduce((n, a) => n + a.done, 0);
  const total = list.reduce((n, a) => n + a.total, 0);
  const count = (severity: FindingSeverity, agentId?: string) => items.filter((f) => f.severity === severity && (!agentId || f.agentId === agentId)).length;
  const crit = count("critical");
  const warn = count("warning");
  // The count and findings columns fit the widest row, so every bar starts in the same place
  const countW = Math.max(0, ...list.map((a) => `${num.format(a.done)}/${num.format(a.total)}`.length));
  const foundW = Math.max(1, ...list.map((a) => Math.max(many(count("critical", a.id)).length, many(count("warning", a.id)).length)));

  // Newest first; one more than fits, so the oldest can fade out at the bottom while a new one slides in on top
  const agentOf = (id: string) => list.find((a) => a.id === id);
  // A filter on an agent that's gone no longer hides everything
  const filtered = only ? agentOf(only) : undefined;
  const pick = filtered ? only : null;
  // Unreadable times go last
  const when = (f: Item) => (Number.isFinite(f.at) ? f.at : -Infinity);
  const feed = items
    .filter((f) => !pick || f.agentId === pick)
    .sort((a, b) => (when(a) === when(b) ? 0 : when(b) > when(a) ? 1 : -1))
    .slice(0, rowsN + 1);

  return (
    <div className={["ui-afc", className].filter(Boolean).join(" ")} style={{ ["--ui-afc-rows" as string]: rowsN, ["--ui-afc-count-w" as string]: `${countW}ch`, ["--ui-afc-found-w" as string]: `calc(38px + ${foundW * 2}ch)` }}>
      <style href="ui-agent-findings-clean" precedence="default">
        {css}
      </style>
      <div className="ui-afc__card">
        <header className="ui-afc__bar">
          <span className="ui-afc__spark">
            <Spark />
          </span>
          <span className="ui-afc__title" title={title}>
            {title}
          </span>
          <span className="ui-afc__progress">
            {total > 0 && `${num.format(done)} / ${num.format(total)} 项资料`}
          </span>
          <span className="ui-afc__totals" aria-label={`${num.format(crit)} critical, ${num.format(warn)} ${warn === 1 ? "warning" : "warnings"}`}>
            <span data-severity="critical" data-zero={crit === 0 || undefined}>
              <b key={crit}>{num.format(crit)}</b> critical
            </span>
            <span data-severity="warning" data-zero={warn === 0 || undefined}>
              <b key={warn}>{num.format(warn)}</b> {warn === 1 ? "warning" : "warnings"}
            </span>
          </span>
        </header>

        <ul className="ui-afc__agents" aria-label="按资料类别查看">
          {list.length === 0 && <li className="ui-afc__none">暂时没有资料</li>}
          {list.map((a) => {
            const status = a.status ?? (a.done >= a.total ? "done" : "running");
            const pct = a.total ? Math.min(100, (a.done / a.total) * 100) : 0;
            const c = count("critical", a.id);
            const w = count("warning", a.id);
            const selected = pick === a.id;
            const step = status === "done" ? "示例资料已整理" : status === "failed" ? "已停止" : a.step;
            return (
              <li key={a.key}>
                <button
                  type="button"
                  className="ui-afc__agent"
                  data-status={status}
                  aria-pressed={selected}
                  data-dim={pick && !selected ? "" : undefined}
                  title={a.model ? `${a.name} · ${a.model}` : a.name}
                  onClick={() => setOnly(selected ? null : a.id)}
                >
                  <Face avatar={a.avatar} name={a.name} />
                  <span className="ui-afc__who">
                    <span className="ui-afc__name" dir="auto">
                      {a.name}
                    </span>
                    <Step text={step} />
                  </span>
                  <span className="ui-afc__track" aria-hidden="true">
                    <span className="ui-afc__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="ui-afc__count">
                    {num.format(a.done)}/{num.format(a.total)}
                  </span>
                  <span className="ui-afc__found" aria-label={`${num.format(c)} critical, ${num.format(w)} ${w === 1 ? "warning" : "warnings"}`}>
                    <span data-severity="critical" data-zero={c === 0 || undefined}>
                      <Mark severity="critical" />
                      <b key={c}>{many(c)}</b>
                    </span>
                    <span data-severity="warning" data-zero={w === 0 || undefined}>
                      <Mark severity="warning" />
                      <b key={w}>{many(w)}</b>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="ui-afc__feed-head">
          <span className="ui-afc__label">可以继续聊的线索</span>
          {filtered && (
            <button type="button" className="ui-afc__chip" onClick={() => setOnly(null)} aria-label={`Show all agents (now only ${filtered.name})`} title={filtered.name}>
              <span className="ui-afc__chip-name">{filtered.name}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* As tall as the findings so far – it grows a row at a time up to `rows`, instead of starting out empty */}
        <ol className="ui-afc__feed" aria-live="polite" style={{ ["--ui-afc-shown" as string]: Math.max(1, Math.min(feed.length, rowsN)) }}>
          {feed.length === 0 && <li className="ui-afc__empty">还没有整理出线索</li>}
          {feed.map((f, i) => {
            const who = agentOf(f.agentId)?.name;
            const where = f.location ? String(f.location) : "";
            return (
            <li key={f.key} className="ui-afc__slot" style={{ transform: `translateY(${i * ROW}px)` }} data-out={i >= rowsN || undefined} aria-hidden={i >= rowsN || undefined}>
              <button type="button" className="ui-afc__finding" tabIndex={i >= rowsN ? -1 : 0} onClick={() => onOpen?.(f.src)}>
                <span className="ui-afc__in">
                  <Mark severity={f.severity} />
                  <span className="ui-afc__sr">{LABEL[f.severity]}: </span>
                  <span className="ui-afc__ftitle" dir="auto" title={f.title}>
                    {f.title}
                  </span>
                  {/* A missing agent or place leaves no lone dot */}
                  <span className="ui-afc__meta" title={[who, where].filter(Boolean).join(" · ") || undefined}>
                    {who && <span className="ui-afc__who-name">{who}</span>}
                    {who && where && <span className="ui-afc__dot">·</span>}
                    {where && <code>{where}</code>}
                  </span>
                  <span className="ui-afc__time">{ago(f.at, now)}</span>
                </span>
              </button>
            </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-afc */
.ui-afc {
  --ui-afc-card: #ffffff;
  --ui-afc-strong: var(--aui-ink, #000000);
  --ui-afc-ink: var(--aui-ink, rgba(0, 0, 0, 0.88));
  --ui-afc-text: rgba(0, 0, 0, 0.61);
  --ui-afc-muted: var(--aui-muted, rgba(0, 0, 0, 0.45));
  --ui-afc-faint: var(--aui-placeholder, rgba(0, 0, 0, 0.27));
  --ui-afc-line: var(--aui-border, rgba(0, 0, 0, 0.06));
  --ui-afc-fill: rgba(0, 0, 0, 0.06);
  --ui-afc-hover: var(--aui-subtle, rgba(0, 0, 0, 0.025));
  --ui-afc-select: rgba(0, 0, 0, 0.04);
  /* Bars after Trace Waterfall: a light tint with a hairline edge, ink for text */
  --ui-afc-run-bg: rgba(0, 96, 226, 0.1);
  --ui-afc-run-edge: rgba(0, 96, 226, 0.32);
  --ui-afc-done-bg: rgba(0, 0, 0, 0.05);
  --ui-afc-done-edge: rgba(0, 0, 0, 0.1);
  --ui-afc-fail-bg: #f52b0018;
  --ui-afc-fail-edge: color-mix(in srgb, var(--aui-red, #f04438) 34%, transparent);
  --ui-afc-crit: var(--aui-danger, #c4320a);
  --ui-afc-warn: var(--aui-warning, #b25e00);
  --ui-afc-note: rgba(0, 96, 226, 0.8);
  --ui-afc-focus: var(--aui-focus, rgba(0, 96, 226, 0.7));
  --ui-afc-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 1px -1px rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --ui-afc-ease: var(--aui-ease, cubic-bezier(0.22, 1, 0.36, 1));
  --ui-afc-row: ${ROW}px;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 640px;
  container-type: inline-size;
  font-family: var(--aui-font, "Inter", "InterVariable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  color: var(--aui-muted, var(--ui-afc-text));
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
.ui-afc *, .ui-afc *::before, .ui-afc *::after { box-sizing: border-box; }
:where(.ui-afc) button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ui-afc button:focus-visible { outline: 2px solid var(--ui-afc-focus); outline-offset: -2px; }
.ui-afc :is(ul, ol) { margin: 0; padding: 0; list-style: none; }
.ui-afc svg { display: block; flex: none; }
.ui-afc b { font-weight: 500; }
.ui-afc__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.ui-afc__card { border-radius: var(--aui-radius-lg, 10px); background: var(--aui-surface, var(--ui-afc-card)); box-shadow: var(--aui-shadow-card, var(--ui-afc-shadow)); overflow: hidden; }

/* ----- Bar ----- */
.ui-afc__bar { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 14px 16px; border-bottom: 0.5px solid var(--ui-afc-line); }
.ui-afc__spark { display: grid; flex: none; place-items: center; width: 16px; color: rgba(0, 96, 226, 0.765); }
/* A long title shortens with … – the totals stay */
.ui-afc__title { font-weight: 500; color: var(--ui-afc-strong); white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-afc__progress { flex: 1 0 auto; min-width: 0; overflow: hidden; font-size: 12px; line-height: 16px; color: var(--ui-afc-muted); white-space: nowrap; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.ui-afc__totals { display: flex; flex: none; gap: 12px; font-size: 12px; line-height: 16px; white-space: nowrap; }
.ui-afc__totals > span { display: inline-flex; align-items: center; gap: 6px; transition: color 300ms ease; }
.ui-afc__totals > span::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ui-afc__totals [data-severity="critical"] { color: var(--ui-afc-crit); }
.ui-afc__totals [data-severity="warning"] { color: var(--ui-afc-warn); }
.ui-afc__totals [data-zero] { color: var(--ui-afc-faint); }
.ui-afc__totals b, .ui-afc__found b { display: inline-block; font-variant-numeric: tabular-nums; animation: ui-afc-roll 420ms var(--ui-afc-ease); }

/* ----- Agents: one fixed row each ----- */
.ui-afc__agents { padding: 6px 6px 2px; }
.ui-afc__agent {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 128px max(40px, var(--ui-afc-count-w)) max(60px, var(--ui-afc-found-w));
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 48px;
  padding: 0 10px;
  border-radius: calc(var(--aui-radius-lg, 10px) - 2px);
  transition: background-color 160ms ease, opacity 220ms ease;
}
.ui-afc__agent:hover { background: var(--ui-afc-hover); }
.ui-afc__agent[aria-pressed="true"] { background: var(--ui-afc-select); }
.ui-afc__agent[data-dim] { opacity: 0.5; }
.ui-afc__agent[data-dim]:hover { opacity: 0.8; }
.ui-afc__avatar { display: grid; place-items: center; width: 24px; height: 24px; overflow: hidden; border-radius: 6px; background: var(--ui-afc-fill); font-size: 10px; font-weight: 500; letter-spacing: 0.3px; color: var(--ui-afc-text); }
.ui-afc__avatar[data-logo] { background: var(--ui-afc-card); box-shadow: var(--ui-afc-shadow); }
.ui-afc__avatar > svg { width: 14px; height: 14px; }
/* An image fills the tile, whatever its shape */
.ui-afc__avatar > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ui-afc__who { display: grid; min-width: 0; }
.ui-afc__name { overflow: hidden; font-weight: 500; line-height: 18px; color: var(--ui-afc-ink); white-space: nowrap; text-overflow: ellipsis; }
.ui-afc__step { overflow: hidden; font-size: 12px; line-height: 16px; color: var(--ui-afc-muted); white-space: nowrap; text-overflow: ellipsis; animation: ui-afc-swap 360ms var(--ui-afc-ease); }

/* Progress: a tinted bar with a hairline edge; while running a sheen sweeps over it and its front edge glows */
.ui-afc__track { position: relative; height: 6px; border-radius: 3px; background: var(--ui-afc-fill); overflow: hidden; }
.ui-afc__fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  border-radius: 3px;
  background: var(--ui-afc-done-bg);
  box-shadow: inset 0 0 0 0.5px var(--ui-afc-done-edge);
  transition: width 700ms var(--ui-afc-ease), background-color 300ms ease;
}
.ui-afc__agent[data-status="running"] .ui-afc__fill { background: var(--ui-afc-run-bg); box-shadow: inset 0 0 0 0.5px var(--ui-afc-run-edge); }
.ui-afc__agent[data-status="failed"] .ui-afc__fill { background: var(--ui-afc-fail-bg); box-shadow: inset 0 0 0 0.5px var(--ui-afc-fail-edge); }
.ui-afc__agent[data-status="running"] .ui-afc__fill::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 40px;
  background: linear-gradient(90deg, transparent, var(--ui-afc-card), transparent);
  opacity: 0.7;
  animation: ui-afc-sheen 1500ms linear infinite;
}
.ui-afc__agent[data-status="running"] .ui-afc__fill::after {
  content: "";
  position: absolute;
  inset: 0 0 0 auto;
  width: 18px;
  background: linear-gradient(90deg, transparent, var(--ui-afc-run-edge));
  animation: ui-afc-breathe 1100ms ease-in-out infinite alternate;
}
.ui-afc__count { font-size: 12px; line-height: 16px; color: var(--ui-afc-muted); text-align: right; font-variant-numeric: tabular-nums; }
.ui-afc__found { display: flex; justify-content: flex-end; gap: 10px; font-size: 12px; line-height: 16px; }
.ui-afc__found > span { display: inline-flex; align-items: center; gap: 4px; min-width: 22px; }
.ui-afc__found [data-zero] { opacity: 0.28; }
.ui-afc__found [data-zero] .ui-afc__mark { color: var(--ui-afc-faint); }
.ui-afc__found [data-severity="critical"] b { color: var(--ui-afc-crit); }
.ui-afc__found [data-severity="warning"] b { color: var(--ui-afc-warn); }
.ui-afc__found [data-zero] b { color: var(--ui-afc-muted); }

.ui-afc__mark[data-severity="critical"] { color: var(--ui-afc-crit); }
.ui-afc__mark[data-severity="warning"] { color: var(--ui-afc-warn); }
.ui-afc__mark[data-severity="note"] { color: var(--ui-afc-note); }

/* ----- Feed: a fixed number of rows; new findings slide in on top ----- */
.ui-afc__feed-head { display: flex; align-items: center; gap: 8px; height: 40px; margin-top: 4px; padding: 0 16px; border-top: 0.5px solid var(--ui-afc-line); }
.ui-afc__label { font-size: 10px; font-weight: 500; line-height: 16px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--ui-afc-muted); }
.ui-afc__chip { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 6px 0 8px; border-radius: calc(var(--aui-radius-sm, 5px) + 1px); background: var(--ui-afc-fill); font-size: 12px; font-weight: 500; line-height: 16px; color: var(--ui-afc-ink); animation: ui-afc-swap 260ms var(--ui-afc-ease); }
.ui-afc__chip { max-width: 60%; }
.ui-afc__chip-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ui-afc__chip svg { color: var(--ui-afc-muted); }
.ui-afc__feed { position: relative; height: calc(var(--ui-afc-shown, var(--ui-afc-rows)) * var(--ui-afc-row) + 8px); transition: height 520ms var(--ui-afc-ease); margin: 0 6px; padding-bottom: 8px; overflow: hidden; }
.ui-afc__slot { position: absolute; top: 0; right: 0; left: 0; height: var(--ui-afc-row); transition: transform 520ms var(--ui-afc-ease), opacity 320ms ease; }
.ui-afc__slot[data-out] { opacity: 0; pointer-events: none; }
.ui-afc__finding { display: block; width: 100%; height: 100%; border-radius: calc(var(--aui-radius-lg, 10px) - 2px); transition: background-color 160ms ease; }
.ui-afc__finding:hover { background: var(--ui-afc-hover); }
.ui-afc__in { display: flex; align-items: center; gap: 10px; height: 100%; min-width: 0; padding: 0 10px; animation: ui-afc-in 560ms var(--ui-afc-ease); }
.ui-afc__ftitle { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--ui-afc-ink); white-space: nowrap; text-overflow: ellipsis; }
.ui-afc__meta { display: flex; flex: 1 1 0; align-items: center; gap: 6px; min-width: 0; overflow: hidden; font-size: 12px; line-height: 16px; color: var(--ui-afc-muted); white-space: nowrap; }
.ui-afc__meta code { overflow: hidden; font-family: var(--aui-font-mono, ui-monospace, "SF Mono", Menlo, monospace); font-size: 11.5px; text-overflow: ellipsis; }
.ui-afc__who-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-afc__meta code { flex: 0 1 auto; min-width: 0; }
.ui-afc__dot { color: var(--ui-afc-faint); }
.ui-afc__time { flex: none; min-width: 28px; font-size: 12px; line-height: 16px; color: var(--ui-afc-faint); text-align: right; font-variant-numeric: tabular-nums; }
.ui-afc__none { display: grid; place-items: center; height: 48px; font-size: 12px; color: var(--ui-afc-muted); }
.ui-afc__empty { display: grid; place-items: center; height: var(--ui-afc-row); font-size: 12px; color: var(--ui-afc-muted); }

@keyframes ui-afc-in { from { opacity: 0; transform: translateY(-10px); filter: blur(2px); } }
@keyframes ui-afc-swap { from { opacity: 0; transform: translateY(3px); } }
@keyframes ui-afc-roll { from { opacity: 0; transform: translateY(-5px); } }
@keyframes ui-afc-sheen { from { transform: translateX(-40px); } to { transform: translateX(160px); } }
@keyframes ui-afc-breathe { from { opacity: 0.45; } to { opacity: 1; } }

/* Narrow: the step count goes, the bar gets shorter */
@container (max-width: 480px) {
  .ui-afc__agent { grid-template-columns: 24px minmax(0, 1fr) 64px max(52px, var(--ui-afc-found-w)); gap: 10px; }
  .ui-afc__count { display: none; }
  .ui-afc__progress { display: none; }
  .ui-afc__meta { display: none; }
  .ui-afc__ftitle { flex: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-afc *, .ui-afc *::before, .ui-afc *::after { animation: none !important; transition: none !important; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-afc {
  --ui-afc-card: #1c1c1f;
  --ui-afc-strong: var(--aui-ink, #ffffff);
  --ui-afc-ink: var(--aui-ink, rgba(255, 255, 255, 0.9));
  --ui-afc-text: rgba(255, 255, 255, 0.62);
  --ui-afc-muted: var(--aui-muted, rgba(255, 255, 255, 0.45));
  --ui-afc-faint: var(--aui-placeholder, rgba(255, 255, 255, 0.28));
  --ui-afc-line: var(--aui-border, rgba(255, 255, 255, 0.08));
  --ui-afc-fill: rgba(255, 255, 255, 0.08);
  --ui-afc-hover: var(--aui-subtle, rgba(255, 255, 255, 0.04));
  --ui-afc-select: rgba(255, 255, 255, 0.06);
  --ui-afc-run-bg: color-mix(in srgb, var(--aui-blue, #4fb0fe) 18%, transparent);
  --ui-afc-run-edge: color-mix(in srgb, var(--aui-blue, #4fb0fe) 50%, transparent);
  --ui-afc-done-bg: rgba(255, 255, 255, 0.08);
  --ui-afc-done-edge: rgba(255, 255, 255, 0.14);
  --ui-afc-fail-bg: #ff35232b;
  --ui-afc-fail-edge: color-mix(in srgb, var(--aui-red, #ff6b5f) 45%, transparent);
  --ui-afc-crit: var(--aui-danger, #ff8a7a);
  --ui-afc-warn: var(--aui-warning, #ffb35c);
  --ui-afc-note: var(--aui-blue, #4fb0fe);
  --ui-afc-focus: var(--aui-focus, rgba(77, 141, 255, 0.8));
  --ui-afc-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.4);
}
:where(.dark, [data-theme="dark"]) .ui-afc__spark { color: var(--aui-info, #4fb0fe); }
:where(.dark, [data-theme="dark"]) .ui-afc__agent[data-status="running"] .ui-afc__fill::before { background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent); }
`;
