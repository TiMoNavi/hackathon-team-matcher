"use client";

import { Children, useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SceneMotion, useMotionPreference } from "@/components/motion-preference";

const scenes = [
  { id: "top", title: "一次相遇", hint: "你的下一个队友，也在找你" },
  { id: "people", title: "遇见队友", hint: "不同的技能，相近的热爱" },
  { id: "profile", title: "AI 认识你", hint: "把认真做过的事，介绍给未来队友" },
  { id: "recommendations", title: "找到同频", hint: "看看你们的想法，在哪里相遇" },
  { id: "community", title: "一起开工", hint: "把一句你好，变成我们来做" },
  { id: "invitation", title: "等你加入", hint: "最后一页，也是下一段故事的开始" },
];
const controls = 'input,textarea,select,button,a,[contenteditable="true"],[role="dialog"],[role="group"][tabindex]:not(.presentation-panel),[data-no-page-turn]';

/** Vertical full-page stage with native inner scrolling for long scenes.
 * Persistent mounted slides preserve local demo state; inactive slides are inert. */
export function Presentation({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const { paused } = useMotionPreference();
  const activeRef = useRef(0);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const shell = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const finish = useRef(0);
  const lockedUntil = useRef(0);
  const lightFrame = useRef(0);

  const goTo = useCallback((next: number, updateUrl = true, align: "start" | "end" = "start") => {
    if (next < 0 || next >= scenes.length || next === activeRef.current) return;
    const previous = activeRef.current;
    const restoreFocus = panels.current[previous]?.contains(document.activeElement);
    activeRef.current = next;
    clearTimeout(finish.current);
    setDirection(next > previous ? 1 : -1);
    setLeaving(paused ? null : previous);
    setActive(next);
    lockedUntil.current = performance.now() + (paused ? 180 : 950);
    if (updateUrl) history.pushState(null, "", "#" + scenes[next].id);
    const panel = panels.current[next];
    if (panel) panel.scrollTop = align === "end" ? panel.scrollHeight : 0;
    if (restoreFocus) requestAnimationFrame(() => panel?.focus({ preventScroll: true }));
    finish.current = window.setTimeout(() => setLeaving(null), paused ? 0 : 760);
  }, [paused]);

  useEffect(() => {
    const synchronize = () => {
      const id = location.hash.slice(1);
      const index = id === "demo-event" ? 4 : scenes.findIndex(scene => scene.id === id);
      if (index >= 0) goTo(index, false);
    };
    const frame = requestAnimationFrame(synchronize);
    window.addEventListener("hashchange", synchronize);
    window.addEventListener("popstate", synchronize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", synchronize); window.removeEventListener("popstate", synchronize); };
  }, [goTo]);

  useEffect(() => {
    document.documentElement.dataset.view = "presentation";
    return () => { delete document.documentElement.dataset.view; };
  }, []);

  useEffect(() => {
    const handleLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link || link.closest('[role="dialog"]')) return;
      const id = link.hash.slice(1);
      const next = id === "demo-event" ? 4 : scenes.findIndex(scene => scene.id === id);
      if (next < 0) return;
      event.preventDefault();
      goTo(next);
      if (next === activeRef.current) panels.current[next]?.scrollTo({ top: 0, behavior: "instant" });
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('[role="dialog"]') || (event.target as Element).closest(controls)) return;
      const delta = ["PageDown","ArrowDown"].includes(event.key) ? 1 : ["PageUp","ArrowUp"].includes(event.key) ? -1 : 0;
      const next = event.key === "Home" ? 0 : event.key === "End" ? scenes.length - 1 : activeRef.current + delta;
      if (!delta && !["Home","End"].includes(event.key)) return;
      event.preventDefault();
      const panel = panels.current[activeRef.current];
      if (panel && ["ArrowDown","ArrowUp"].includes(event.key) && canScroll(panel, delta)) {
        panel.scrollBy({ top: delta * 90, behavior: "instant" });
        return;
      }
      goTo(next, true, delta < 0 ? "end" : "start");
    };
    const root = stage.current;
    const canScroll = (panel: HTMLElement, delta: number) => delta > 0 ? panel.scrollTop + panel.clientHeight < panel.scrollHeight - 3 : panel.scrollTop > 3;
    const ownsScroll = (target: Element, panel: HTMLElement) => {
      if (target.closest('input,textarea,select,[contenteditable="true"],[role="log"],[data-no-page-turn],[role="dialog"]')) return true;
      let node: HTMLElement | null = target as HTMLElement;
      while (node && node !== panel) {
        if (node.scrollHeight > node.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
        node = node.parentElement;
      }
      return false;
    };
    let lastWheel = 0, accumulation = 0, consumed = false;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      const panel = panels.current[activeRef.current];
      if (!panel || ownsScroll(event.target as Element, panel)) return;
      const now = performance.now();
      // Keep the gesture consumed across a busy render during the transition.
      if (now < lockedUntil.current) { lastWheel = now; event.preventDefault(); return; }
      if (now - lastWheel > 350) { accumulation = 0; consumed = false; }
      lastWheel = now;
      if (consumed) { event.preventDefault(); return; }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? panel.clientHeight : 1);
      if (!delta) return;
      if (canScroll(panel, delta)) { accumulation = 0; return; }
      event.preventDefault();
      if (Math.sign(accumulation) !== Math.sign(delta)) accumulation = 0;
      accumulation += delta;
      if (Math.abs(accumulation) >= 65) { consumed = true; goTo(activeRef.current + Math.sign(delta), true, delta < 0 ? "end" : "start"); accumulation = 0; }
    };
    let gesture: { x: number; y: number; atTop: boolean; atBottom: boolean; consumed: boolean } | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      gesture = null;
      const panel = panels.current[activeRef.current];
      if (event.touches.length !== 1 || !panel || ownsScroll(event.target as Element, panel) || document.querySelector('[role="dialog"]')) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, atTop: !canScroll(panel, -1), atBottom: !canScroll(panel, 1), consumed: performance.now() < lockedUntil.current };
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { gesture = null; return; }
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
      if (Math.abs(dx) > Math.abs(dy)) return;
      if (gesture.consumed) { if (event.cancelable) event.preventDefault(); return; }
      // A gesture must start at the content edge; long-page reading stays native.
      if (!(dy < 0 ? gesture.atBottom : gesture.atTop)) return;
      if (event.cancelable) event.preventDefault();
      if (Math.abs(dy) < 65) return;
      gesture.consumed = true;
      goTo(activeRef.current + (dy < 0 ? 1 : -1), true, dy > 0 ? "end" : "start");
    };
    const handleTouchEnd = () => { gesture = null; };
    document.addEventListener("click", handleLink);
    document.addEventListener("keydown", handleKey);
    root?.addEventListener("wheel", handleWheel, { passive: false });
    root?.addEventListener("touchstart", handleTouchStart, { passive: true });
    root?.addEventListener("touchmove", handleTouchMove, { passive: false });
    root?.addEventListener("touchend", handleTouchEnd);
    root?.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      document.removeEventListener("click", handleLink); document.removeEventListener("keydown", handleKey);
      root?.removeEventListener("wheel", handleWheel); root?.removeEventListener("touchstart", handleTouchStart);
      root?.removeEventListener("touchmove", handleTouchMove); root?.removeEventListener("touchend", handleTouchEnd); root?.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [goTo]);

  useEffect(() => () => { clearTimeout(finish.current); cancelAnimationFrame(lightFrame.current); }, []);

  const moveLight = (event: PointerEvent<HTMLDivElement>) => {
    if (paused || event.pointerType !== "mouse") return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(lightFrame.current);
    lightFrame.current = requestAnimationFrame(() => {
      shell.current?.style.setProperty("--pointer-x", `${clientX}px`);
      shell.current?.style.setProperty("--pointer-y", `${clientY}px`);
      shell.current?.setAttribute("data-pointer", "true");
    });
  };
  return <div ref={shell} className="presentation-shell" data-mode="deck" data-transitioning={leaving !== null && !paused ? "true" : "false"} data-direction={direction > 0 ? "forward" : "backward"} onPointerMove={moveLight} onPointerLeave={() => { cancelAnimationFrame(lightFrame.current); shell.current?.removeAttribute("data-pointer"); }}>
    <div className="presentation-header"><SiteHeader activeScene={scenes[active].id} /></div>
    <span className="page-pointer-light" aria-hidden="true" />
      <main ref={stage} className="presentation-stage" aria-label="同频首页，上下滚动翻页">
        {items.map((item, index) => <div key={scenes[index].id} ref={node => { panels.current[index] = node; }} className="presentation-panel" data-scene={scenes[index].id} data-state={index === active ? "active" : index === leaving ? "leaving" : "hidden"} inert={index !== active} aria-hidden={index !== active} role="group" aria-roledescription="幻灯片" aria-label={`${index + 1} / ${scenes.length} ${scenes[index].title}`} tabIndex={-1}>
          <SceneMotion active={index === active}>{item}</SceneMotion>
        </div>)}
      </main>
      <nav className="scene-rail" aria-label="章节导航">{scenes.map((scene, index) => <button key={scene.id} type="button" aria-label={`前往第 ${index + 1} 页：${scene.title}`} aria-current={active === index ? "step" : undefined} onClick={() => goTo(index)}><span className="scene-rail-label">{scene.title}</span><span className="scene-rail-dot" /></button>)}</nav>
    {active === 0 && <span className="presentation-scroll-hint"><ArrowDown size={12} />向下滚动，继续探索</span>}
    <div className="sr-only" role="status" aria-live="polite">{`第 ${active + 1} 页，共 ${scenes.length} 页。${scenes[active].title}`}</div>
  </div>;
}
