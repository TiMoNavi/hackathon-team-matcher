"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Compass, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Bootstrap, Identity } from "../../integration/src/contracts.ts";
import { EventAccessClient, EventAccessController, eventAccessFeedback, invitationTokenIsValid, receiptBlocksMembership, type EventAccessState } from "../../integration/src/event-access.ts";

/** Parent owns session refresh and routing. This panel never navigates or starts recommendations. */
export function EventAccessPanel({ bootstrap, identity, onAuthorityLost, onSelectionSettled }: { bootstrap: Bootstrap; identity: Identity; onAuthorityLost: () => void; onSelectionSettled: () => void }) {
  const [state, setState] = useState<EventAccessState>({ status: "idle", items: [], nextCursor: null, selection: null, receipt: null, operation: null, error: null, joinUncertain: false });
  const [token, setToken] = useState("");
  const [inputError, setInputError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<EventAccessController | null>(null);
  const callbacks = useRef({ onAuthorityLost, onSelectionSettled });
  callbacks.current = { onAuthorityLost, onSelectionSettled };
  useEffect(() => {
    // Create inside the effect so React Strict Mode's cleanup/restart gets a fresh scope.
    const current = new EventAccessController(new EventAccessClient(bootstrap), () => { setToken(""); setInputError(false); callbacks.current.onAuthorityLost(); });
    controller.current = current; setToken(""); setInputError(false); setState(current.snapshot());
    const unsubscribe = current.subscribe(() => setState(current.snapshot()));
    void current.refresh();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [bootstrap, identity.user_id, identity.identity_version]);

  const busy = state.status === "loading" || Boolean(state.operation);
  const enabled = state.status === "ready" && !busy && !state.joinUncertain;
  function join(event: FormEvent) {
    event.preventDefault();
    if (!enabled || !controller.current) return;
    const submitted = token.trim();
    if (!invitationTokenIsValid(submitted)) { setInputError(true); input.current?.focus(); return; }
    setToken(""); setInputError(false); void controller.current.join(submitted);
  }
  async function select(spaceId: number) {
    const current = controller.current; if (!enabled || !current) return;
    await current.select(spaceId);
    if (controller.current === current && !["signed_out", "forbidden"].includes(current.snapshot().status)) callbacks.current.onSelectionSettled();
  }
  const selection = state.selection;
  const selectedId = selection?.status === "selected" ? selection.value.space_id : null;
  const selectedName = state.items.find((item) => item.space_id === selectedId)?.name;

  return <section className="webapp-auth-fields" aria-labelledby="webapp-event-access-title" data-event-access={state.status} aria-busy={busy}>
    <div className="webapp-detail"><Compass className="webapp-detail-icon" aria-hidden="true" /><div><h2 id="webapp-event-access-title">加入与选择活动</h2><p>填写组织者提供的邀请码加入活动，再选择本次要进入的活动。</p><p className="webapp-caption">发现、搜索与推荐只使用你当前选择且有权访问的活动。</p></div></div>
    <div aria-live="polite" aria-atomic="true">{state.status === "loading" || state.status === "idle" ? <p role="status">正在读取活动资格…</p> : selection?.status === "selected" ? <p>当前活动：{selectedName || `活动 ${selectedId}`}</p> : selection?.status === "unselected" ? <p>尚未选择当前活动。</p> : selection?.status === "revoked" ? <p>此前选择的活动已无法访问。请选择列表中仍有资格参加的活动。</p> : null}</div>
    {state.error && <div className="webapp-auth-feedback webapp-auth-error" role="alert"><p>{eventAccessFeedback(state.error)}</p>{state.error.requestId && <p className="webapp-caption">问题编号：{state.error.requestId}</p>}</div>}
    {state.receipt && <div className="webapp-auth-feedback" role="status">{state.receipt.membership_current ? <p>{state.receipt.outcome === "joined" ? "已加入活动。" : "你已经是该活动的成员。"}请在活动列表中明确选择当前活动。</p> : <p>这份旧回执关联的成员资格已失效；回执不会重新加入活动。{state.items.some((item) => item.space_id === state.receipt?.space_id && item.membership_id !== state.receipt.membership_id) ? "已读取你新加入的成员资格，可以在列表中选择活动。" : "请联系组织者确认。"}</p>}</div>}
    {state.joinUncertain && <div className="webapp-auth-feedback" role="alert"><p>尚未确认这次加入请求的结果。点击下方按钮，使用同一请求记录重新确认。</p><Button type="button" variant="outline" size="xl" disabled={busy} onClick={() => void controller.current?.retryJoin()}>重新确认这次加入</Button></div>}
    {state.status !== "signed_out" && state.status !== "forbidden" && <><form onSubmit={join} noValidate className="webapp-auth-fields"><div className="webapp-auth-field"><label htmlFor="webapp-event-invitation">活动邀请码</label><Input ref={input} id="webapp-event-invitation" type="password" name="event-invitation" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={43} value={token} disabled={!enabled} onChange={(event) => { setToken(event.target.value); setInputError(false); }} className="webapp-auth-input" aria-describedby="webapp-event-invitation-help" aria-invalid={inputError} /><p id="webapp-event-invitation-help" className={inputError ? "webapp-auth-error" : "webapp-auth-help"}>{inputError ? "请填写完整的 43 位邀请码。" : "确认加入只建立活动成员关系；选择当前活动需要单独操作。"}</p></div><Button type="submit" size="xl" disabled={!enabled}>{state.operation === "join" && <LoaderCircle className="webapp-auth-spinner" aria-hidden="true" />}{state.operation === "join" ? "正在确认加入…" : "确认加入活动"}</Button></form>
      {state.status === "ready" && state.items.length === 0 && <p className="webapp-caption">你还没有有效的活动成员资格。可以向组织者获取邀请码。</p>}
      {state.items.length > 0 && <ul className="webapp-auth-fields" aria-label="我已加入的活动">{state.items.map((item) => <li key={item.space_id} className="webapp-detail"><div className="min-w-0 break-words"><h3>{item.name}</h3><p className="webapp-caption">活动编号 {item.space_id}</p><Button type="button" size="xl" variant={selectedId === item.space_id ? "secondary" : "outline"} disabled={!enabled || !selection || selectedId === item.space_id || receiptBlocksMembership(state.receipt, item)} onClick={() => void select(item.space_id)}>{selectedId === item.space_id && <Check aria-hidden="true" />}{selectedId === item.space_id ? "当前活动" : "设为当前活动"}</Button></div></li>)}</ul>}
      <div className="webapp-actions"><Button type="button" variant="outline" size="xl" disabled={busy} onClick={() => void controller.current?.refresh()}><RefreshCw aria-hidden="true" />重新读取活动</Button>{state.nextCursor && <Button type="button" variant="secondary" size="xl" disabled={busy} onClick={() => void controller.current?.more()}>{state.operation === "more" ? "正在读取…" : "加载更多活动"}</Button>}</div></>}
  </section>;
}
