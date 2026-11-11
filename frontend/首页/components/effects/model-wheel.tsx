"use client";

import { useEffect, useRef } from "react";
import { useMotionPreference } from "@/components/motion-preference";

/*
 * Model Wheel – AI model names on a turning drum, in a single self-contained file.
 * The list sits on a cylinder: rows bend away and fade towards the top and bottom edge.
 * Every few seconds the drum rolls one model further and locks onto it like a magnet;
 * the model in the middle sits on a soft gray fill that follows the length of its name.
 * Grab it and spin it: a flick keeps it turning, then it snaps onto the closest model. Hover holds it.
 * Runs only while on screen; prefers-reduced-motion keeps it still.
 */

export type WheelModel = { name: string; viewBox: string; color: string; d: string };

export type ModelWheelProps = {
  /** Models on the wheel – brand marks as a single SVG path; at least 7 keep the drum full */
  models: WheelModel[];
  /** Milliseconds a model stays selected before the wheel turns on */
  hold?: number;
  className?: string;
  /** Accessible description of the scene */
  label?: string;
};

const ROW = 44;
const STEP = 20; // degrees between two rows on the drum
const RADIUS = ROW / 2 / Math.tan(((STEP / 2) * Math.PI) / 180);
const VISIBLE = 4; // rows above and below the middle that are drawn


export function ModelWheel({
  models,
  hold = 1500,
  className,
  label = "AI models on a turning wheel, one after another lands in the middle",
}: ModelWheelProps) {
  const { paused } = useMotionPreference();
  const root = useRef<HTMLDivElement>(null);
  const lastOffset = useRef(0);
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const n = models.length;
    let offset = lastOffset.current;

    // Places every row on the drum for the current offset
    const place = () => {
      rows.current.forEach((row, i) => {
        if (!row) return;
        let rel = (((i - offset) % n) + n) % n;
        if (rel > n / 2) rel -= n;
        const angle = rel * STEP;
        const hidden = Math.abs(rel) > VISIBLE;
        row.style.transform = `translateZ(${-RADIUS}px) rotateX(${-angle}deg) translateZ(${RADIUS}px)`;
        row.style.opacity = hidden ? "0" : String(Math.max(0, Math.cos((angle * Math.PI) / 180)) ** 1.6);
        const active = Math.abs(rel) < 0.5;
        if (active && !row.hasAttribute("data-active")) {
          // The fill grows or shrinks to the new model's name
          el.style.setProperty("--ui-mw-fill-w", `${row.querySelector(".ui-mw-label")!.getBoundingClientRect().width + 28}px`);
        }
        row.toggleAttribute("data-active", active);
      });
    };
    place();

    if (paused) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /*
     * One spring moves the drum: it pulls the offset towards the nearest row like a magnet,
     * overshoots a touch and settles. Dragging sets the offset directly; letting go keeps the
     * swing going and the spring locks onto the row it lands closest to.
     */
    let vel = 0; // rows per second
    let target = 0;
    let stiffness = 0;
    let damping = 0;
    let frame = 0;
    let last = 0;
    let timer = 0;
    let visible = false;
    let hovered = false;
    let drag: { y: number; offset: number; t: number } | null = null;

    const spring = (k: number, ratio: number) => {
      stiffness = k;
      damping = 2 * Math.sqrt(k) * ratio;
    };
    const loop = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      if (!drag) {
        const force = stiffness * (target - offset) - damping * vel;
        vel += force * dt;
        offset += vel * dt;
        if (Math.abs(target - offset) < 0.0005 && Math.abs(vel) < 0.01) {
          offset = target = ((target % n) + n) % n;
          vel = 0;
          place();
          frame = 0;
          schedule();
          return;
        }
      }
      place();
      frame = requestAnimationFrame(loop);
    };
    const run = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };

    // Auto turn: a slow, soft spring to the next row
    const schedule = () => {
      window.clearTimeout(timer);
      if (still || !visible || document.hidden || hovered || drag) return;
      timer = window.setTimeout(() => {
        // Turns downwards: the model above rolls into the middle
        target = Math.round(offset) - 1;
        spring(70, 0.66);
        run();
      }, hold);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      e.preventDefault(); // no text selection or native drag while spinning
      window.clearTimeout(timer);
      el.setPointerCapture(e.pointerId);
      el.setAttribute("data-dragging", "");
      drag = { y: e.clientY, offset, t: performance.now() };
      vel = 0;
      run();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      // The button was released somewhere we didn't hear about (outside the window, another frame) – let go now
      if (e.buttons === 0) return onUp();
      const now = performance.now();
      const raw = drag.offset + (drag.y - e.clientY) / ROW;
      // Detents while dragging: each row pulls the wheel in a little, so it ticks from model to model
      const next = raw - Math.sin(2 * Math.PI * raw) * 0.07;
      // Smoothed speed, so a quick flick keeps spinning after the release
      const instant = (next - offset) / Math.max(0.008, (now - drag.t) / 1000);
      vel = vel * 0.6 + instant * 0.4;
      offset = next;
      drag.t = now;
    };
    const onUp = () => {
      if (!drag) return;
      drag = null;
      el.removeAttribute("data-dragging");
      // Throw: the swing carries on a little, then the magnet locks the closest row
      target = Math.round(offset + vel * 0.22);
      spring(140, 0.68);
      run();
    };

    const visibility = () => { if (document.hidden) { window.clearTimeout(timer); cancelAnimationFrame(frame); frame = 0; } else { target = Math.round(offset); spring(140, .68); run(); schedule(); } };
    document.addEventListener("visibilitychange", visibility);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) schedule();
      else { window.clearTimeout(timer); cancelAnimationFrame(frame); frame = 0; }
    });
    io.observe(el);
    const enter = () => {
      hovered = true;
      window.clearTimeout(timer);
    };
    const leave = () => {
      hovered = false;
      schedule();
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    // Releasing outside the wheel or losing the capture always ends the spin
    el.addEventListener("lostpointercapture", onUp);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("blur", onUp);

    return () => {
      lastOffset.current = offset;
      document.removeEventListener("visibilitychange", visibility);
      io.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("lostpointercapture", onUp);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [models, hold, paused]);

  return (
    <div ref={root} className={["ui-mw", className].filter(Boolean).join(" ")} role="img" aria-label={label}>
      {/* React 19 hoists this into <head> once, no matter how many instances render */}
      <style href="ui-model-wheel" precedence="default">
        {css}
      </style>
      <div className="ui-mw-fill" aria-hidden="true" />
      <div className="ui-mw-drum" aria-hidden="true">
        {models.map((m, i) => (
          <div
            key={m.name}
            ref={(node) => {
              rows.current[i] = node;
            }}
            className="ui-mw-row"
            style={{ opacity: i === 0 ? 1 : 0 }}
          >
            <span className="ui-mw-label">
              <svg viewBox={m.viewBox} style={{ color: m.color === "currentColor" ? undefined : m.color }}>
                <path d={m.d} fill="currentColor" />
              </svg>
              {m.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
.ui-mw {
  touch-action: pan-y;
  cursor: grab;
  --ui-mw-ink: #171717;
  --ui-mw-muted: #8f8f8f;
  --ui-mw-fill: rgba(0, 0, 0, 0.05);
  --ui-mw-mark: #171717;
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: ${ROW * 7}px;
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
/* The selected model sits on a soft gray fill that follows the length of its name */
.ui-mw-fill {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--ui-mw-fill-w, 140px);
  height: ${ROW - 6}px;
  translate: -50% -50%;
  border-radius: 11px;
  background: var(--ui-mw-fill);
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
.ui-mw-drum {
  position: absolute;
  inset: 0;
  perspective: 560px;
  transform-style: preserve-3d;
  /* Rows fade out softly at both ends of the drum */
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
}
.ui-mw-row {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: ${ROW}px;
  margin-top: ${-ROW / 2}px;
  backface-visibility: hidden;
  font-size: 16px;
  font-weight: 450;
  letter-spacing: -0.01em;
  color: var(--ui-mw-muted);
  will-change: transform, opacity;
}
.ui-mw[data-dragging] { cursor: grabbing; }
.ui-mw-label { display: inline-flex; align-items: center; gap: 10px; }
.ui-mw-row svg { flex: none; width: 18px; height: 18px; color: var(--ui-mw-mark); }
.ui-mw-row[data-active] { font-weight: 500; color: var(--ui-mw-ink); }

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor */
:where(.dark, [data-theme="dark"]) .ui-mw {
  --ui-mw-ink: #ededed;
  --ui-mw-muted: #8a8a8f;
  --ui-mw-fill: rgba(255, 255, 255, 0.07);
  --ui-mw-mark: #ededed;
}
`;
