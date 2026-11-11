// components/ui/agent-trail.tsx
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/*
 * Agent Trail – the way an agent works through a task, in a single self-contained file.
 * A small header names the task and counts the steps ("3/5"). Under it one quiet trail: done steps get a tinted check
 * and how long they took, the one the agent is on spins and says what it does with a live timer, and the work inside
 * that step branches off to the side as small sub-steps with a detail each. A step that needs your approval before it
 * runs has a dashed ring and an "Approval" badge. While it works, a short fading light runs down the trail from the
 * step into the sub-step it is on.
 * Classic style: a gray tray with the task on it and the trail on a white card inside.
 * The styles are injected below, so no extra files are needed.
 */

export type TrailStepState = "done" | "running" | "pending" | "waiting" | "failed";
export type TrailSubstepState = "done" | "running" | "pending";

export type TrailSubstep = {
  id?: string;
  title: string;
  /** done by default */
  state?: TrailSubstepState;
  /** A short fact on the right – a file, "+18 −3", "182/214" */
  detail?: string;
};

export type TrailStep = {
  id: string;
  title: string;
  state: TrailStepState;
  /** How long it took – ms as a number ("12s", "1m 4s"), or your own text */
  duration?: number | string;
  /** What it is doing right now, on the right of a running step – "Testing" */
  status?: string;
  /** When a running step started (ms, Date.now()) – shows a live timer next to its status */
  startedAt?: number;
  /** Needs a person's approval before it runs – a dashed ring and "Approval" while it waits its turn */
  gate?: boolean;
  /** What it does inside the step – branches off the trail under it */
  substeps?: TrailSubstep[];
};

export type AgentTrailLabels = {
  title: string;
  running: string;
  approval: string;
  waiting: string;
  failed: string;
  done: string;
  pending: string;
  /** No steps at all */
  empty: string;
  /** A step or sub-step without a title */
  untitled: string;
  /** "+35 earlier" / "+3 more" over and under a long list of sub-steps */
  earlier: string;
  more: string;
  fewer: string;
};

export type AgentTrailProps = {
  steps: TrailStep[];
  /** The task, in the header – leave it out for no header */
  title?: string;
  /** Which steps show their sub-steps – by default only the running one */
  expanded?: string[];
  onExpandedChange?: (ids: string[]) => void;
  labels?: Partial<AgentTrailLabels>;
  className?: string;
};

const defaults: AgentTrailLabels = {
  title: "Progress",
  running: "Working",
  approval: "Approval",
  waiting: "Needs you",
  failed: "Failed",
  done: "Done",
  pending: "Up next",
  empty: "No steps yet",
  untitled: "Untitled step",
  earlier: "earlier",
  more: "more",
  fewer: "Show fewer",
};

/* ---------- Helpers ---------- */

/** 12s, 1m 4s, 1h 2m – a string is shown as it is, anything broken as nothing */
export function formatDuration(d: number | string | undefined) {
  if (typeof d === "string") return d;
  if (typeof d !== "number" || !Number.isFinite(d) || d < 0) return "";
  const s = Math.round(d / 1000);
  if (s < 1) return "<1s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const days = Math.floor(h / 24);
  return h % 24 ? `${days}d ${h % 24}h` : `${days}d`;
}

/** Long details keep their end – a path's file and line, a hash's tail: "src/…/PaymentElementWrapper.tsx:1284" */
function shorten(text: string, max = 22) {
  const chars = [...text];
  if (chars.length <= max) return text;
  const tail = Math.ceil(max * 0.62);
  return `${chars.slice(0, max - tail - 1).join("")}…${chars.slice(-tail).join("")}`;
}

const STATES: TrailStepState[] = ["done", "running", "pending", "waiting", "failed"];
const cleanSteps = (steps: unknown) =>
  (Array.isArray(steps) ? steps : [])
    .filter((s): s is TrailStep => !!s && typeof s === "object" && !!(s as TrailStep).id)
    .map((s) => ({ ...s, title: String(s.title ?? ""), state: STATES.includes(s.state) ? s.state : "pending" }) as TrailStep);
const subsOf = (s: TrailStep) => (Array.isArray(s.substeps) ? s.substeps.filter((x) => !!x && typeof x === "object") : []);

/** The time now, once a second – only while something needs it */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Touch screens get taller rows – the same media query the styles use */
const TOUCH = "(hover: none) and (pointer: coarse)";
function useTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(TOUCH);
    const on = () => setTouch(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return touch;
}

/* Geometry – every row has a fixed height, so the trail can be drawn from counts alone (taller on touch screens) */
const ROW = 32;
const SUB = 24;
const ROW_TOUCH = 40;
const SUB_TOUCH = 28;
const PAD = 2;
/** Sub-steps shown before the rest folds into "+N earlier" */
const VISIBLE = 5;
/** The marker's center, and where the sub-steps' line runs */
const X = 9;
const XS = 21;
/** The light: this many slices of this length, from 0 at the back to full at the front */
const SLICES = 14;
const SLICE = 2;

/* ---------- Component ---------- */

export function AgentTrail({ steps, title, expanded: expandedProp, onExpandedChange, labels: labelsProp, className }: AgentTrailProps) {
  const labels: AgentTrailLabels = { ...defaults, ...labelsProp };
  const list = cleanSteps(steps);
  const uid = useId();
  const now = useNow(list.some((s) => s.state === "running" && typeof s.startedAt === "number"));
  const touch = useTouch();
  const geo = { row: touch ? ROW_TOUCH : ROW, sub: touch ? SUB_TOUCH : SUB };

  // Which steps are open: the running one by default, until someone opens or closes one by hand
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (s: TrailStep) => {
    if (!subsOf(s).length) return false;
    if (expandedProp) return expandedProp.includes(s.id);
    return toggled[s.id] ?? s.state === "running";
  };
  const toggle = (s: TrailStep) => {
    const next = !isOpen(s);
    if (!expandedProp) setToggled((t) => ({ ...t, [s.id]: next }));
    onExpandedChange?.(list.filter((x) => (x.id === s.id ? next : isOpen(x))).map((x) => x.id));
  };

  const seen = useRef<Map<string, TrailStepState> | null>(null);
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    const before = seen.current;
    seen.current = new Map(list.map((s) => [s.id, s.state]));
    if (!before) return;
    const said: string[] = [];
    // Steps that start or stop running go back to their default: open while running, closed after
    const reset: string[] = [];
    for (const s of list) {
      const was = before.get(s.id);
      if (was === undefined || was === s.state) continue;
      if (s.state === "running" || was === "running") reset.push(s.id);
      if (s.state === "done") said.push(`${s.title}: ${labels.done.toLowerCase()}`);
      if (s.state === "waiting") said.push(`${s.title}: ${labels.waiting.toLowerCase()}`);
      if (s.state === "failed") said.push(`${s.title}: ${labels.failed.toLowerCase()}`);
    }
    if (reset.some((id) => toggled[id] !== undefined)) setToggled((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !reset.includes(k))));
    if (said.length) setAnnounce(said.join(". "));
  });

  const reached = (s?: TrailStep) => !!s && s.state !== "pending";
  const doneCount = list.filter((s) => s.state === "done").length;

  return (
    <>
      <style href="ui-agent-trail" precedence="default">
        {css}
      </style>
      <div className={["ui-atr", className].filter(Boolean).join(" ")}>
        {title ? (
          <div className="ui-atr__head">
            <span className="ui-atr__task" dir="auto" title={title}>
              {title}
            </span>
            <span className="ui-atr__count" aria-label={`${doneCount} of ${list.length} steps done`}>
              {doneCount}/{list.length}
            </span>
          </div>
        ) : null}
        <div className="ui-atr__card">
        {list.length ? null : <p className="ui-atr__empty">{labels.empty}</p>}
        <ol className="ui-atr__list" aria-label={title || labels.title} hidden={!list.length}>
          {list.map((s, i) => {
            const prev = list[i - 1];
            const next = list[i + 1];
            // The line between two steps fills once the agent has walked it
            const linkIn = !prev ? undefined : prev.state === "done" && reached(s) ? "on" : "off";
            const linkOut = !next ? undefined : s.state === "done" && reached(next) ? "on" : "off";
            return (
              <Step
                key={s.id}
                step={s}
                subs={subsOf(s)}
                open={isOpen(s)}
                linkIn={linkIn}
                linkOut={linkOut}
                afterBranch={!!prev && isOpen(prev)}
                labels={labels}
                now={now}
                geo={geo}
                panelId={`${uid}-${i}`}
                onToggle={() => toggle(s)}
              />
            );
          })}
        </ol>
        </div>
        <span className="ui-atr__sr" role="status" aria-live="polite">
          {announce}
        </span>
      </div>
    </>
  );
}

function Step({
  step: s,
  subs,
  open,
  linkIn,
  linkOut,
  afterBranch,
  labels,
  now,
  geo,
  panelId,
  onToggle,
}: {
  step: TrailStep;
  subs: TrailSubstep[];
  open: boolean;
  linkIn?: "on" | "off";
  linkOut?: "on" | "off";
  afterBranch: boolean;
  labels: AgentTrailLabels;
  now: number;
  geo: { row: number; sub: number };
  panelId: string;
  onToggle: () => void;
}) {
  const time = formatDuration(s.duration);
  const gated = !!s.gate && (s.state === "pending" || s.state === "waiting");
  const status = s.status || labels.running;
  const elapsed = s.state === "running" && typeof s.startedAt === "number" && Number.isFinite(s.startedAt) ? formatDuration(Math.max(0, now - s.startedAt)) : "";
  const stateWord =
    s.state === "running" ? status : s.state === "waiting" ? labels.waiting : s.state === "failed" ? labels.failed : s.state === "done" ? labels.done : gated ? labels.approval : labels.pending;

  // The sub-step the agent is on – the light runs down to it
  const current = s.state === "running" ? subs.findIndex((x) => x.state === "running") : -1;
  // A long list shows five around where the agent is; the rest folds into "+N earlier" / "+N more"
  const [all, setAll] = useState(false);
  const long = subs.length > VISIBLE + 1;
  const anchor = current >= 0 ? current : subs.length - 1;
  const end = long && !all ? Math.max(Math.min(subs.length, anchor + 2), VISIBLE) : subs.length;
  const start = long && !all ? end - VISIBLE : 0;
  const shown = subs.slice(start, end);
  const later = subs.length - end;
  // The light counts the fold row on top as one row
  const target = current >= start && current < end ? current - start + (long ? 1 : 0) : -1;
  const name = s.title.trim() || labels.untitled;

  // A step that loses its sub-steps while focused turns from a button into a plain row – focus stays on it
  const rowRef = useRef<HTMLElement | null>(null);
  const focused = useRef(false);
  const expandable = subs.length > 0;
  useLayoutEffect(() => {
    if (focused.current && (document.activeElement === document.body || !document.activeElement)) rowRef.current?.focus();
  }, [expandable]);
  const focusProps = {
    onFocus: () => (focused.current = true),
    onBlur: () => (focused.current = false),
  };

  const meta =
    s.state === "running" ? (
      <span className="ui-atr__live">
        <span className="ui-atr__status" dir="auto" title={status}>
          {status}
        </span>
        {elapsed ? (
          <span className="ui-atr__clock" dir="auto">
            {elapsed}
          </span>
        ) : null}
      </span>
    ) : s.state === "waiting" ? (
      <span className="ui-atr__badge" dir="auto" title={labels.waiting}>
        {labels.waiting}
      </span>
    ) : gated ? (
      <span className="ui-atr__badge" dir="auto" title={labels.approval}>
        {labels.approval}
      </span>
    ) : s.state === "failed" ? (
      <span className="ui-atr__fail" dir="auto">
        {labels.failed}
      </span>
    ) : s.state === "done" && time ? (
      <span className="ui-atr__time" dir="auto">
        {time}
      </span>
    ) : null;

  const inner = (
    <>
      <Marker state={s.state} gated={gated} />
      <span className="ui-atr__title" dir="auto" title={name} data-untitled={s.title.trim() ? undefined : ""}>
        {name}
      </span>
      {subs.length ? <Chevron /> : null}
      <span className="ui-atr__meta" key={`${s.state}-${gated}`}>
        {meta}
      </span>
    </>
  );
  const sr = `${name} – ${stateWord}${s.state === "done" && time ? `, ${time}` : ""}`;

  return (
    <li
      className="ui-atr__step"
      data-state={s.state}
      data-gate={gated || undefined}
      data-open={open || undefined}
      data-in={linkIn}
      data-out={linkOut}
      data-after-branch={afterBranch || undefined}
      aria-current={s.state === "running" ? "step" : undefined}
    >
      {subs.length ? (
        <button ref={(el) => void (rowRef.current = el)} type="button" className="ui-atr__row" aria-expanded={open} aria-controls={panelId} aria-label={sr} onClick={onToggle} {...focusProps}>
          {inner}
        </button>
      ) : (
        <div ref={(el) => void (rowRef.current = el)} className="ui-atr__row" role="group" aria-label={sr} tabIndex={-1} {...focusProps}>
          {inner}
        </div>
      )}
      {subs.length ? (
        <>
          {/* The branch: off the marker, down past the sub-steps and back onto the trail */}
          <span className="ui-atr__wire" aria-hidden="true">
            <svg className="ui-atr__bend" viewBox="0 0 28 14" width="28" height="14">
              <path d={`M${X} 0 C${X} 8 ${XS} 6 ${XS} 14`} />
            </svg>
            <span className="ui-atr__spine" />
            <svg className="ui-atr__bend ui-atr__bend--out" viewBox="0 0 28 14" width="28" height="14">
              <path d={`M${XS} 0 C${XS} 8 ${X} 6 ${X} 14`} />
            </svg>
          </span>
          {open && target >= 0 ? <Spark index={target} geo={geo} /> : null}
          <div className="ui-atr__subs" id={panelId} data-open={open || undefined} inert={!open || undefined}>
            <ul className="ui-atr__sublist">
              {long ? (
                <li className="ui-atr__sub ui-atr__sub--fold">
                  <button type="button" className="ui-atr__fold" aria-expanded={all} onClick={() => setAll((v) => !v)}>
                    <span className="ui-atr__dot" aria-hidden="true" />
                    {all ? labels.fewer : `+${start} ${labels.earlier}`}
                  </button>
                </li>
              ) : null}
              {shown.map((x, i) => {
                const k = start + i;
                const st = x.state ?? "done";
                const subName = String(x.title ?? "").replace(/\s+/g, " ").trim();
                return (
                  <li key={x.id ?? `${k}-${x.title}`} className="ui-atr__sub" data-state={st} aria-current={st === "running" ? "step" : undefined}>
                    <span className="ui-atr__dot" aria-hidden="true" />
                    <span className="ui-atr__subtitle" dir="auto" title={subName || labels.untitled} data-untitled={subName ? undefined : ""}>
                      {subName || labels.untitled}
                    </span>
                    {x.detail ? (
                      <span className="ui-atr__detail" dir="auto" title={x.detail}>
                        {shorten(String(x.detail))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
              {long && later > 0 && !all ? (
                <li className="ui-atr__sub ui-atr__sub--fold">
                  <button type="button" className="ui-atr__fold" aria-expanded={false} onClick={() => setAll(true)}>
                    <span className="ui-atr__dot" aria-hidden="true" />
                    {`+${later} ${labels.more}`}
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        </>
      ) : null}
    </li>
  );
}

/**
 * The light that runs from the step's marker down the branch into the sub-step it is on.
 * One line that fades from full at the front to nothing at the back: thin slices along the same path, each a little
 * fainter than the one ahead, all moving together. Past the path's end they are simply not drawn, so the light drains
 * into the dot.
 */
function Spark({ index, geo }: { index: number; geo: { row: number; sub: number } }) {
  // From the marker's bottom edge (marker 16, centered in the row): the bend ends 14 lower, then straight down to the dot
  const end = geo.row / 2 - 8 + PAD + geo.sub / 2 + geo.sub * index;
  const d = `M${X} 0 C${X} 8 ${XS} 6 ${XS} 14 L${XS} ${end}`;
  const ref = useRef<SVGPathElement>(null);
  // The path's real length, so the whole light leaves it before the loop starts over
  const [len, setLen] = useState(() => Math.round(19 + (end - 14)));
  useLayoutEffect(() => {
    const l = ref.current?.getTotalLength?.();
    if (l && Number.isFinite(l)) setLen(Math.ceil(l));
  }, [d]);
  return (
    <svg
      className="ui-atr__spark"
      viewBox={`0 0 28 ${end + 2}`}
      width="28"
      height={end + 2}
      aria-hidden="true"
      style={{ "--len": len, "--tail": SLICES * SLICE } as CSSProperties}
    >
      <path ref={ref} d={d} className="ui-atr__probe" />
      {Array.from({ length: SLICES }, (_, i) => (
        <path
          key={i}
          d={d}
          className="ui-atr__slice"
          style={{ "--k": (SLICES - i) * SLICE, opacity: (i + 1) / SLICES, strokeDasharray: `${SLICE} 9999` } as CSSProperties}
        />
      ))}
    </svg>
  );
}

function Marker({ state, gated }: { state: TrailStepState; gated: boolean }) {
  if (state === "done")
    return (
      <span className="ui-atr__mark" data-kind="done" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M5 8.3L7 10.2L11 6" pathLength={1} />
        </svg>
      </span>
    );
  if (state === "failed")
    return (
      <span className="ui-atr__mark" data-kind="failed" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M6 6L10 10M10 6L6 10" />
        </svg>
      </span>
    );
  if (state === "running")
    return (
      <span className="ui-atr__mark" data-kind="running" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <circle className="ui-atr__track" cx="8" cy="8" r="6.25" />
          <circle className="ui-atr__arc" cx="8" cy="8" r="6.25" pathLength={40} />
        </svg>
      </span>
    );
  if (gated)
    return (
      <span className="ui-atr__mark" data-kind={state === "waiting" ? "waiting" : "gate"} aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16">
          <circle cx="8" cy="8" r="6.25" />
        </svg>
      </span>
    );
  return <span className="ui-atr__mark" data-kind={state} aria-hidden="true" />;
}

const Chevron = () => (
  <svg className="ui-atr__chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 9C18 9 13.58 15 12 15C10.42 15 6 9 6 9" />
  </svg>
);

/* ---------- Styles ---------- */

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-atr (e.g. --ui-atr-accent: #ee3e9e for pink) */
.ui-atr {
  --ui-atr-tray: var(--aui-subtle, #f0f0f0);
  --ui-atr-card: var(--aui-surface, #ffffff);
  --ui-atr-strong: var(--aui-ink, #171717);
  --ui-atr-ink: var(--aui-ink, #171717);
  --ui-atr-text: var(--aui-muted, #6b6b6b);
  --ui-atr-muted: var(--aui-muted, #8a8a8a);
  --ui-atr-faint: var(--aui-placeholder, #b8b8b8);
  --ui-atr-line: #e4e4e4;
  --ui-atr-divider: var(--aui-border, #ececec);
  --ui-atr-hover: var(--aui-subtle, rgba(0, 0, 0, 0.03));
  --ui-atr-focus: var(--aui-focus, rgba(0, 96, 226, 0.7));
  --ui-atr-accent: var(--aui-blue, #0190fe);
  --ui-atr-wash: #e3f3ff;
  --ui-atr-amber: var(--aui-amber, #e8b000);
  --ui-atr-badge: #8f6c00;
  --ui-atr-badge-wash: #f9f1d6;
  --ui-atr-red: var(--aui-red, #f04438);
  --ui-atr-red-wash: #fdecea;
  /* A 1px edge and a soft lift for the white card on the tray */
  --ui-atr-edge: 0 0 0 1px var(--ui-atr-divider), 0 1px 2px rgba(0, 0, 0, 0.04);
  --ui-atr-ease: cubic-bezier(0.32, 0.72, 0.24, 1);
  /* One loop of the light down the trail */
  --ui-atr-loop: 2400ms;
  /* Row heights – the trail is drawn from them, so change them only together with ROW / SUB in the code */
  --ui-atr-row: ${ROW}px;
  --ui-atr-sub: ${SUB}px;
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 392px;
  padding: 4px;
  border-radius: var(--aui-radius-lg, 16px);
  background: var(--ui-atr-tray);
  font-family: var(--aui-font, "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 14px;
  line-height: 20px;
  letter-spacing: -0.006em;
  font-weight: 400;
  color: var(--ui-atr-ink);
  text-align: start;
  -webkit-font-smoothing: antialiased;
}
.ui-atr *, .ui-atr *::before, .ui-atr *::after { box-sizing: border-box; }
.ui-atr :is(ol, ul) { margin: 0; padding: 0; list-style: none; }
.ui-atr svg { display: block; flex: none; }
.ui-atr__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* The trail sits on a white card inside the tray */
.ui-atr__card { padding: 6px 4px; border-radius: calc(var(--aui-radius-lg, 16px) - 4px); background: var(--ui-atr-card); box-shadow: var(--aui-shadow-card, var(--ui-atr-edge)); }

/* ----- Header: the task and how many steps are done ----- */
.ui-atr__head { display: flex; align-items: center; gap: 12px; height: 36px; padding: 0 12px 2px; }
.ui-atr__task { flex: 1; min-width: 0; overflow: hidden; font-weight: 500; color: var(--ui-atr-strong); white-space: nowrap; text-overflow: ellipsis; }
.ui-atr__count { flex: none; font-size: 13px; line-height: 16px; color: var(--ui-atr-muted); font-variant-numeric: tabular-nums; }

/* ----- One step: a 32px row, the sub-steps under it ----- */
.ui-atr__step { position: relative; }
.ui-atr__row {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: var(--ui-atr-row);
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: calc(var(--aui-radius-sm, 7px) - 1px);
  background: none;
  font: inherit;
  color: inherit;
  text-align: inherit;
}
button.ui-atr__row { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background-color 140ms ease; }
button.ui-atr__row:hover { background: var(--ui-atr-hover); }
.ui-atr__row:focus-visible { outline: 2px solid var(--ui-atr-focus); outline-offset: -2px; }
div.ui-atr__row:focus:not(:focus-visible) { outline: none; }

/* The trail between markers: half a line above the marker, half below – they meet between two rows */
.ui-atr__row::before, .ui-atr__row::after {
  content: "";
  position: absolute;
  inset-inline-start: calc(8px + ${X}px - 0.75px);
  width: 1.5px;
  height: calc((var(--ui-atr-row) - 16px) / 2);
  background: var(--ui-atr-line);
  transition: background-color 400ms ease;
}
.ui-atr__row::before { top: 0; }
.ui-atr__row::after { bottom: 0; }
.ui-atr__step:not([data-in]) > .ui-atr__row::before,
.ui-atr__step:not([data-out]) > .ui-atr__row::after,
.ui-atr__step[data-open] > .ui-atr__row::after,
.ui-atr__step[data-after-branch] > .ui-atr__row::before { visibility: hidden; }
.ui-atr__step[data-in="on"] > .ui-atr__row::before,
.ui-atr__step[data-out="on"] > .ui-atr__row::after { background: var(--ui-atr-accent); }

/* ----- Markers, 16px ----- */
.ui-atr__mark { position: relative; display: grid; flex: none; place-items: center; width: 18px; height: 16px; margin-inline-end: 14px; }
.ui-atr__mark::before { content: ""; position: absolute; inset-inline-start: ${X - 8}px; width: 16px; height: 16px; border-radius: 50%; transition: background-color 300ms ease, box-shadow 300ms ease; }
.ui-atr__mark > svg { position: relative; }
.ui-atr__mark :is(path, circle) { fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
/* Up next: an empty ring */
.ui-atr__mark[data-kind="pending"]::before { background: var(--ui-atr-card); box-shadow: inset 0 0 0 1.5px var(--ui-atr-line); }
/* Done: a tinted disc, the check draws itself */
.ui-atr__mark[data-kind="done"]::before { background: var(--ui-atr-wash); animation: ui-atr-pop 380ms var(--ui-atr-ease) both; }
.ui-atr__mark[data-kind="done"] path { stroke: var(--ui-atr-accent); stroke-width: 1.7; stroke-dasharray: 1; animation: ui-atr-draw 360ms 120ms var(--ui-atr-ease) both; }
/* Running: a faint ring with an arc going round */
.ui-atr__mark[data-kind="running"]::before { background: var(--ui-atr-card); }
.ui-atr__track { stroke: var(--ui-atr-wash); }
.ui-atr__arc { stroke: var(--ui-atr-accent); stroke-dasharray: 12 28; transform-origin: 8px 8px; animation: ui-atr-spin 900ms linear infinite; }
/* Needs approval before it runs: a dashed ring – a stop ahead */
.ui-atr__mark[data-kind="gate"]::before { background: var(--ui-atr-card); }
.ui-atr__mark[data-kind="gate"] circle { stroke: var(--ui-atr-amber); stroke-dasharray: 2.4 2.5; }
/* Waiting for you: the ring closes and fills with a light tint */
.ui-atr__mark[data-kind="waiting"]::before { background: var(--ui-atr-badge-wash); }
.ui-atr__mark[data-kind="waiting"] circle { stroke: var(--ui-atr-amber); }
/* Failed */
.ui-atr__mark[data-kind="failed"]::before { background: var(--ui-atr-red-wash); animation: ui-atr-pop 380ms var(--ui-atr-ease) both; }
.ui-atr__mark[data-kind="failed"] path { stroke: var(--ui-atr-red); stroke-width: 1.7; }

/* ----- Title and what's on the right ----- */
.ui-atr__title { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--ui-atr-text); transition: color 300ms ease; }
.ui-atr__step:is([data-state="running"], [data-state="failed"], [data-state="waiting"]) .ui-atr__title { color: var(--ui-atr-ink); }
.ui-atr__step[data-state="pending"] .ui-atr__title { color: var(--ui-atr-muted); }
.ui-atr__title[data-untitled], .ui-atr__subtitle[data-untitled] { color: var(--ui-atr-faint) !important; font-weight: 400 !important; }
.ui-atr__empty { margin: 0; padding: 8px 10px; font-size: 13px; line-height: 16px; color: var(--ui-atr-muted); }
.ui-atr__list[hidden] { display: none; }
.ui-atr__chev { flex: none; margin-inline-start: 4px; color: var(--ui-atr-faint); opacity: 0; rotate: -90deg; transition: rotate 200ms var(--ui-atr-ease), opacity 140ms ease; }
.ui-atr:dir(rtl) .ui-atr__chev { rotate: 90deg; }
.ui-atr__step[data-open] .ui-atr__chev { rotate: 0deg; }
.ui-atr__row:is(:hover, :focus-visible) .ui-atr__chev { opacity: 1; }
.ui-atr__meta { display: flex; flex: none; justify-content: flex-end; max-width: 40%; min-width: 0; margin-inline-start: auto; padding-inline-start: 12px; animation: ui-atr-in 260ms var(--ui-atr-ease) both; }
.ui-atr__time { font-size: 12px; line-height: 16px; color: var(--ui-atr-faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ui-atr__fail { font-size: 12px; font-weight: 500; line-height: 16px; color: var(--ui-atr-red); white-space: nowrap; }
/* Running: what it does, shimmering, and how long it has been at it */
.ui-atr__live { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ui-atr__status {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: linear-gradient(90deg, var(--ui-atr-accent) 0 40%, color-mix(in srgb, var(--ui-atr-accent) 35%, var(--ui-atr-card)) 50%, var(--ui-atr-accent) 60% 100%) 0 0 / 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: ui-atr-shine 1300ms linear infinite;
}
.ui-atr__clock { flex: none; min-width: 3ch; font-size: 12px; line-height: 16px; color: var(--ui-atr-faint); font-variant-numeric: tabular-nums; text-align: end; }
.ui-atr__badge { overflow: hidden; height: 20px; padding: 0 7px; border-radius: calc(var(--aui-radius-sm, 7px) - 1px); background: var(--ui-atr-badge-wash); font-size: 12px; font-weight: 500; line-height: 20px; color: var(--ui-atr-badge); white-space: nowrap; text-overflow: ellipsis; }

/* ----- The branch: sub-steps under a step, on their own line a little to the side ----- */
.ui-atr__subs { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 420ms var(--ui-atr-ease); }
.ui-atr__subs[data-open] { grid-template-rows: 1fr; }
.ui-atr__sublist { min-height: 0; overflow: hidden; }
.ui-atr__sublist::before, .ui-atr__sublist::after { content: ""; display: block; height: ${PAD}px; }
.ui-atr__sub { display: flex; align-items: center; gap: 12px; height: var(--ui-atr-sub); padding-inline: calc(8px + ${XS}px - 2.5px) 8px; opacity: 0; translate: 0 -4px; transition: opacity 260ms ease, translate 360ms var(--ui-atr-ease); }
.ui-atr__subs[data-open] .ui-atr__sub { opacity: 1; translate: 0 0; }
.ui-atr__dot { position: relative; flex: none; width: 5px; height: 5px; margin-inline-end: ${32 - XS - 2.5 - 12}px; border-radius: 50%; background: linear-gradient(var(--ui-atr-faint), var(--ui-atr-faint)), var(--ui-atr-card); transition: background-color 300ms ease; }
.ui-atr__sub[data-state="pending"] .ui-atr__dot { background: var(--ui-atr-card); box-shadow: inset 0 0 0 1px var(--ui-atr-faint); }
.ui-atr__sub[data-state="running"] .ui-atr__dot { background: var(--ui-atr-accent); }
/* When the light arrives, the dot rings once */
.ui-atr__sub[data-state="running"] .ui-atr__dot::after { content: ""; position: absolute; inset: -3px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--ui-atr-accent); opacity: 0; animation: ui-atr-ring var(--ui-atr-loop) ease-out infinite; }
.ui-atr__subtitle { flex: 0 1 auto; min-width: 0; overflow: hidden; font-size: 13px; line-height: 16px; color: var(--ui-atr-muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-atr__sub[data-state="running"] .ui-atr__subtitle { color: var(--ui-atr-text); }
.ui-atr__sub[data-state="pending"] .ui-atr__subtitle { color: var(--ui-atr-faint); }
.ui-atr__detail { flex: none; max-width: 45%; margin-inline-start: auto; overflow: hidden; font-size: 11px; line-height: 16px; color: var(--ui-atr-faint); font-variant-numeric: tabular-nums; white-space: nowrap; text-overflow: ellipsis; }

/* "+35 earlier" / "+3 more": a quiet row on the branch that opens the rest */
.ui-atr__sub--fold { padding-inline-end: 0; }
.ui-atr__fold { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; height: 100%; margin: 0; margin-inline-start: -6px; padding: 0; padding-inline: 6px 8px; border: 0; border-radius: calc(var(--aui-radius-sm, 7px) - 1px); background: none; font: inherit; font-size: 12px; line-height: 16px; color: var(--ui-atr-muted); text-align: start; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background-color 140ms ease, color 140ms ease; }
.ui-atr__fold:hover { background: var(--ui-atr-hover); color: var(--ui-atr-text); }
.ui-atr__fold:focus-visible { outline: 2px solid var(--ui-atr-focus); outline-offset: -2px; }
.ui-atr__fold .ui-atr__dot { background: var(--ui-atr-card); box-shadow: inset 0 0 0 1px var(--ui-atr-faint); }

/* The branch line: a bend out of the marker, straight down, a bend back onto the trail */
.ui-atr__wire { position: absolute; top: calc(var(--ui-atr-row) / 2 + 8px); bottom: calc((16px - var(--ui-atr-row)) / 2); inset-inline-start: 8px; width: 28px; pointer-events: none; opacity: 0; transition: opacity 200ms ease; }
.ui-atr__step[data-open] > .ui-atr__wire { opacity: 1; }
.ui-atr__step:not([data-out]) > .ui-atr__wire > .ui-atr__bend--out { display: none; }
.ui-atr__bend { position: absolute; top: 0; left: 0; }
.ui-atr__bend--out { top: auto; bottom: 0; }
.ui-atr__bend path { fill: none; stroke: var(--ui-atr-line); stroke-width: 1.5; }
/* A finished step opened by hand: its branch is part of the walked trail */
.ui-atr__step[data-out="on"] > .ui-atr__wire .ui-atr__bend path { stroke: var(--ui-atr-accent); }
.ui-atr__step[data-out="on"] > .ui-atr__wire .ui-atr__spine { background: var(--ui-atr-accent); }
.ui-atr__spine { position: absolute; top: 14px; bottom: 14px; left: calc(${XS}px - 0.75px); width: 1.5px; background: var(--ui-atr-line); }
.ui-atr__step:not([data-out]) > .ui-atr__wire > .ui-atr__spine { bottom: calc((var(--ui-atr-row) - 16px) / 2 + ${PAD}px + var(--ui-atr-sub) / 2); }
.ui-atr:dir(rtl) :is(.ui-atr__wire, .ui-atr__spark) { scale: -1 1; }

/* The light: one line, full at the front and fading to nothing at the back */
.ui-atr__spark { position: absolute; top: calc(var(--ui-atr-row) / 2 + 8px); inset-inline-start: 8px; overflow: visible; pointer-events: none; }
.ui-atr__probe { fill: none; stroke: none; }
.ui-atr__slice { fill: none; stroke: var(--ui-atr-accent); stroke-width: 1.5; stroke-linecap: butt; animation: ui-atr-run var(--ui-atr-loop) linear infinite; }

/* An even glide down – most of the loop – then a short rest before the next one */
@keyframes ui-atr-run {
  0% { stroke-dashoffset: calc(var(--k) * 1px); animation-timing-function: cubic-bezier(0.45, 0, 0.3, 1); }
  62%, 100% { stroke-dashoffset: calc((var(--k) - var(--len) - var(--tail)) * 1px); }
}
@keyframes ui-atr-ring {
  0%, 50% { opacity: 0; transform: scale(0.5); }
  56% { opacity: 0.6; }
  85%, 100% { opacity: 0; transform: scale(1.4); }
}
@keyframes ui-atr-spin { to { transform: rotate(360deg); } }
@keyframes ui-atr-pop { from { transform: scale(0.5); } }
@keyframes ui-atr-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes ui-atr-in { from { opacity: 0; transform: translateY(3px); } }
@keyframes ui-atr-shine { from { background-position: 100% 0; } to { background-position: 0 0; } }

/* Touch screens: taller rows to tap, and the chevron shows without hover */
@media (hover: none) and (pointer: coarse) {
  .ui-atr { --ui-atr-row: ${ROW_TOUCH}px; --ui-atr-sub: ${SUB_TOUCH}px; }
  .ui-atr__chev { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-atr *, .ui-atr *::before, .ui-atr *::after { animation: none !important; transition: none !important; }
  .ui-atr__spark { display: none; }
  .ui-atr__status { color: var(--ui-atr-accent); background: none; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-atr {
  --ui-atr-tray: var(--aui-subtle, #19191b);
  --ui-atr-card: var(--aui-surface, #232326);
  --ui-atr-strong: var(--aui-ink, #ededed);
  --ui-atr-ink: var(--aui-ink, #ededed);
  --ui-atr-text: var(--aui-muted, #a1a1a6);
  --ui-atr-muted: var(--aui-muted, #7c7c82);
  --ui-atr-faint: var(--aui-placeholder, #5a5a60);
  --ui-atr-line: #3a3a3f;
  --ui-atr-divider: var(--aui-border, #2e2e33);
  --ui-atr-hover: var(--aui-subtle, rgba(255, 255, 255, 0.04));
  --ui-atr-focus: var(--aui-focus, rgba(77, 141, 255, 0.8));
  --ui-atr-accent: var(--aui-blue, #4fb0fe);
  --ui-atr-wash: #1d3850;
  --ui-atr-amber: var(--aui-amber, #e6c24d);
  --ui-atr-badge: var(--aui-amber, #e6c24d);
  --ui-atr-badge-wash: #3d351d;
  --ui-atr-red: var(--aui-red, #ff6b5f);
  --ui-atr-red-wash: #40261f;
  --ui-atr-edge: 0 0 0 1px var(--ui-atr-divider);
}
`;

