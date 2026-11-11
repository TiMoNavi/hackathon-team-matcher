"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, Layers3, Menu, MessagesSquare, Orbit, Pause, Play, UsersRound, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { AnimatedSelection } from "@/components/effects/animated-selection";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMotionPreference } from "@/components/motion-preference";

const links = [
  { id: "people", label: "遇见队友", icon: UsersRound },
  { id: "profile", label: "AI 认识你", icon: Orbit },
  { id: "recommendations", label: "找到同频", icon: Layers3 },
  { id: "community", label: "一起开工", icon: MessagesSquare },
];

// Signalry floating-header structure, Kit navbar2 grouping and selection layer.
export function SiteHeader({ activeScene = "top" }: { activeScene?: string }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { paused, toggle, reduced } = useMotionPreference();
  const closeMenu = () => {
    if (open) { setOpen(false); menuButton.current?.focus({ preventScroll: true }); }
  };
  const navigationLinks = (mobile = false) => <AnimatedSelection value={activeScene}>
    {links.map(({ id, label, icon: Icon }) => <a
      key={id}
      data-id={id}
      href={"#" + id}
      aria-current={activeScene === id ? "location" : undefined}
      className="site-nav-link"
      onClick={mobile ? closeMenu : undefined}
    >
      <Icon className="site-nav-link-icon" size={15} strokeWidth={1.7} aria-hidden />
      <span>{label}</span>
      {mobile && <ArrowUpRight className="site-nav-mobile-arrow" size={14} aria-hidden />}
    </a>)}
  </AnimatedSelection>;

  return <Collapsible open={open} onOpenChange={setOpen} asChild>
    <nav aria-label="首页导航" className="site-glass-nav" data-nav-paused={paused} data-scene={activeScene}>
      <span className="site-nav-atmosphere" aria-hidden><span /></span>
      <div className="site-nav-row">
        <a href="#top" aria-label="同频首页" aria-current={activeScene === "top" ? "location" : undefined} className="site-nav-brand" onClick={closeMenu}><Brand /></a>
        <div className="site-nav-links site-nav-desktop">{navigationLinks()}</div>
        <div className="site-nav-actions">
          <Button variant="ghost" size="icon" className="site-nav-icon-button" disabled={reduced}
            aria-label={reduced ? "已按系统设置减少动画" : paused ? "播放页面动画" : "暂停页面动画"}
            title={reduced ? "已按系统设置减少动画" : paused ? "播放页面动画" : "暂停页面动画"}
            aria-pressed={paused} onClick={toggle}>{paused ? <Play /> : <Pause />}</Button>
          <Button asChild className="site-nav-cta"><a href="#community" onClick={closeMenu}>体验组队<span className="site-nav-cta-arrow"><ArrowUpRight size={15} aria-hidden /></span></a></Button>
          <CollapsibleTrigger asChild>
            <Button ref={menuButton} variant="ghost" size="icon" className="site-nav-icon-button site-nav-menu-button" aria-label={open ? "收起导航" : "打开导航"}>{open ? <X /> : <Menu />}</Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent className="site-nav-mobile">
        <div className="site-nav-links">{navigationLinks(true)}</div>
      </CollapsibleContent>
    </nav>
  </Collapsible>;
}
