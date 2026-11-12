"use client";
import { useCallback, useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import { ArrowUpRight, Check, Compass, LogIn, Moon, RefreshCw, ShieldCheck, Sun, UserRound } from "lucide-react";
import { Brand } from "../components/brand";
import { Providers } from "../components/providers";
import { Button } from "../components/ui/button";
import { AuthPanel } from "./auth-panel";
import { RecommendationEntry } from "../../推荐/integration/recommendation-entry";
import "../../推荐/integration/recommendation.css";
import { GithubImportNotice } from "./github-import-notice";
import { EventAccessPanel } from "./event-access-panel";
import type { Bootstrap } from "../../integration/src/contracts.ts";
import type { SessionReader, SessionState } from "../../integration/src/session.ts";

const routes = [{ path: "", label: "活动入口" }, { path: "/home", label: "账号与活动" }, { path: "/login", label: "登录与关联" }, { path: "/discover", label: "发现伙伴" }];
const pathOf = (base: string) => location.pathname === base ? "" : location.pathname.startsWith(base + "/") ? location.pathname.slice(base.length).replace(/\/$/, "") : "/unknown";

function SessionContent({ state, bootstrap, reader, path }: { state: SessionState; bootstrap: Bootstrap; reader: SessionReader; path: string }) {
  const refreshAuthority = useCallback(() => { void reader.refresh(); }, [reader]);
  const [blockedEventActor, setBlockedEventActor] = useState<string | null>(null);
  const eventActor = state.status === "ready" ? JSON.stringify([state.identity.user_id, state.identity.identity_version]) : null;
  const invalidateEventAuthority = useCallback(() => { if (eventActor !== null) setBlockedEventActor(eventActor); void reader.refresh(); }, [reader, eventActor]);
  const retry = <Button variant="secondary" size="xl" onClick={() => void reader.refresh()}><RefreshCw aria-hidden="true" />重新读取</Button>;
  if (state.status === "loading") return <section className="webapp-state" role="status" aria-live="polite"><span className="webapp-state-icon webapp-loading"><RefreshCw aria-hidden="true" /></span><h1>正在确认你的登录状态</h1><p>读取当前账号与活动，请稍候。</p></section>;
  if (state.status === "signed_out") return <section className="webapp-state" data-state="signed-out"><span className="webapp-state-icon"><LogIn aria-hidden="true" /></span><h1>登录后，继续你的活动</h1><p>使用 GitHub 或邮箱验证码登录，继续查看你的账号与活动。</p><div className="webapp-actions"><Button asChild size="xl"><a href={bootstrap.base_path + "/login"}>前往登录<ArrowUpRight aria-hidden="true" /></a></Button>{retry}</div><p className="webapp-note"><a href={bootstrap.native_login_url}>也可以使用原站登录入口</a></p></section>;
  if (state.status === "forbidden" || state.status === "error") return <section className="webapp-state" data-state={state.status} role="alert"><span className="webapp-state-icon"><ShieldCheck aria-hidden="true" /></span><h1>{state.status === "forbidden" ? "当前账号暂时无法访问" : "暂时无法读取账号"}</h1><p>{state.status === "forbidden" ? "请返回原站确认账号状态，再重新打开。" : "连接中断或服务暂时不可用。你可以重新读取，也可以返回原站。"}</p><div className="webapp-actions">{retry}<Button asChild variant="outline" size="xl"><a href={bootstrap.native_home_url}>返回原站</a></Button></div>{state.error.requestId && <p className="webapp-note">问题编号：{state.error.requestId}</p>}</section>;
  if (state.status !== "ready") return null;
  const event = state.event;
  return <section className="webapp-signed-in" data-state="ready"><div className="webapp-introduction"><span className="webapp-state-icon"><Check aria-hidden="true" /></span><h1>{state.identity.nickname?.trim() ? `${state.identity.nickname}，欢迎回来` : "欢迎回来"}</h1><p>先确认当前账号与活动，再继续你的旅程。</p></div><div className="webapp-details">{path !== "/activity" && <section className="webapp-detail" aria-labelledby="webapp-account-title"><UserRound className="webapp-detail-icon" aria-hidden="true" /><div><h2 id="webapp-account-title">当前账号</h2><p>{state.identity.nickname?.trim() || "尚未设置昵称"}</p><a className="webapp-account-link" href={bootstrap.base_path + "/login"}>关联登录方式或退出账号<ArrowUpRight aria-hidden="true" /></a></div></section>}{path !== "/account" && <section className="webapp-detail" aria-labelledby="webapp-event-title" aria-live="polite"><Compass className="webapp-detail-icon" aria-hidden="true" /><div><h2 id="webapp-event-title">当前活动</h2>{event.status === "loading" || event.status === "idle" ? <p role="status">正在确认活动资格…</p> : event.status === "selected" ? <><p>已连接当前活动</p><span className="webapp-caption">活动编号 {event.value.space_id}</span></> : event.status === "unselected" ? <><p>尚未选择活动</p><span className="webapp-caption">账号已登录；有有效活动后，再继续活动内功能。</span></> : <div role="alert"><p>{event.status === "forbidden" ? "当前活动无法访问" : event.status === "conflict" ? "活动状态已变化" : "暂时无法读取活动"}</p><span className="webapp-caption">{event.status === "forbidden" ? "请确认活动资格后重新读取。" : event.status === "conflict" ? "请重新读取最新活动状态。" : "请检查连接后重新读取。"}</span></div>}</div></section>}</div>{blockedEventActor === eventActor ? <section className="webapp-auth-feedback" role="alert"><p>活动访问资格已变化。请确认后重新读取。</p><Button type="button" variant="outline" size="xl" onClick={() => { setBlockedEventActor(null); void reader.refresh(); }}>重新读取活动</Button></section> : <EventAccessPanel key={eventActor} bootstrap={bootstrap} identity={state.identity} onAuthorityLost={invalidateEventAuthority} onSelectionSettled={refreshAuthority} />}<GithubImportNotice bootstrap={bootstrap} /><div className="webapp-actions">{retry}<Button asChild variant="outline" size="xl"><a href={bootstrap.native_home_url}>返回原站<ArrowUpRight aria-hidden="true" /></a></Button></div><p className="webapp-note">可在这里加入和选择活动，再从“发现伙伴”查看当前活动中的伙伴。</p></section>;
}

function RecommendationRoute({ state, bootstrap, reader }: { state: SessionState; bootstrap: Bootstrap; reader: SessionReader }) {
  const invalidate = useCallback(() => { void reader.refresh(); }, [reader]);
  if (state.status !== "ready" || state.event.status !== "selected") return <SessionContent state={state} bootstrap={bootstrap} reader={reader} path="/discover" />;
  const event = state.event.value;
  return <RecommendationEntry key={JSON.stringify([state.identity.user_id, state.identity.identity_version, event.space_id, event.selection_revision, event.access_version])} bootstrap={bootstrap} identity={state.identity} currentEvent={event} onAuthorityInvalidated={invalidate} />;
}

export function WebappEntry({ bootstrap, reader }: { bootstrap: Bootstrap; reader: SessionReader }) {
  const state = useSyncExternalStore(reader.subscribe, reader.snapshot);
  const [dark, setDark] = useState(false);
  const [path, setPath] = useState(() => pathOf(bootstrap.base_path));
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => { const update = () => { setPath(pathOf(bootstrap.base_path)); void reader.refresh(); }; addEventListener("popstate", update); return () => removeEventListener("popstate", update); }, [bootstrap.base_path, reader]);
  function navigate(event: MouseEvent<HTMLAnchorElement>, next: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); history.pushState(null, "", bootstrap.base_path + next); setPath(next); void reader.refresh();
  }
  const known = routes.some((route) => route.path === path);
  const showAuth = path === "/login" && (state.status === "signed_out" || state.status === "ready");
  return <Providers><div className="webapp-page"><a href="#webapp-main" className="skip-link">跳到正文</a><header className="webapp-header"><a href={bootstrap.base_path} onClick={(event) => navigate(event, "")} aria-label="同频活动入口" className="webapp-brand"><Brand /></a><div className="webapp-header-actions"><Button variant="ghost" className="webapp-theme-toggle" onClick={() => setDark((value) => !value)} aria-label={dark ? "切换日间模式" : "切换夜间模式"} aria-pressed={dark}>{dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}<span>{dark ? "日间" : "夜间"}</span></Button><a className="webapp-native-link" href={bootstrap.native_home_url}>原站<ArrowUpRight aria-hidden="true" /></a></div></header><nav className="webapp-tabs" aria-label="入口导航">{routes.map((route) => <a key={route.path} href={bootstrap.base_path + route.path} onClick={(event) => navigate(event, route.path)} aria-current={path === route.path ? "page" : undefined}>{route.label}</a>)}</nav><main id="webapp-main" className={path === "/discover" ? "webapp-main webapp-main-discover" : showAuth ? "webapp-main webapp-main-auth" : "webapp-main"} tabIndex={-1}>{path === "/discover" ? <RecommendationRoute state={state} bootstrap={bootstrap} reader={reader} /> : showAuth ? <AuthPanel key={state.identity?.user_id || "signed-out"} bootstrap={bootstrap} identity={state.identity} /> : known ? <SessionContent state={state} bootstrap={bootstrap} reader={reader} path={path} /> : <section className="webapp-state"><h1>这个页面尚未接入</h1><p>可以回到活动入口，或使用原站继续。</p><Button asChild size="xl"><a href={bootstrap.base_path} onClick={(event) => navigate(event, "")}>回到活动入口</a></Button></section>}</main><footer className="webapp-footer"><ShieldCheck aria-hidden="true" /><span>Team Matcher · 活动资格和资料可见范围以当前账号的授权为准</span></footer></div></Providers>;
}
