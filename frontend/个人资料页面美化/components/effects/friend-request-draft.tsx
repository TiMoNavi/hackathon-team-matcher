"use client";
// Adapted from AffectUI email-draft-clean: keep the editable draft/receipt,
// tone controls, measured height and styles. Recipient is fixed to this profile;
// the only completion action saves a local draft, never sends a request.
import { useLayoutEffect,useRef,useState,type ReactNode,type RefObject } from 'react';
export type RequestVariant={id:string;label:string;body:string};
export function FriendRequestDraft({initialBody,tones,onDraftChange,onSave,className}:{initialBody:string;tones:RequestVariant[];onDraftChange:(body:string)=>void;onSave:(body:string)=>void;className?:string}){
 const [body,setBody]=useState(initialBody);
 const [tone,setTone]=useState(tones.find(t=>t.body===initialBody)?.id??'');
 const [editing,setEditing]=useState(!initialBody);
 const [phase,setPhase]=useState<'draft'|'saved'|'discarded'>('draft');
 const inner=useRef<HTMLDivElement>(null);const outer=useSmoothHeight(inner);const textRef=useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(()=>{const el=textRef.current;if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}},[editing,body]);
 const change=(value:string)=>{setBody(value);onDraftChange(value);};
 const startEditing=()=>{setEditing(true);requestAnimationFrame(()=>{textRef.current?.focus();textRef.current?.setSelectionRange(body.length,body.length);});};
 const pickTone=(variant:RequestVariant)=>{setTone(variant.id);change(variant.body);setEditing(false);};
 const save=()=>{if(!body.trim())return;setEditing(false);setPhase('saved');onSave(body.trim());};
 const discard=()=>{setEditing(false);setPhase('discarded');onDraftChange('');};
 const undo=()=>{setPhase('draft');onDraftChange(body);};
 const open=phase==='draft';
 return <div className={['ui-edc','friend-request-draft',className].filter(Boolean).join(' ')} data-phase={phase} data-source="affectui/email-draft-clean">
  <style href="profile-friend-request-draft" precedence="default">{css}</style>
  <div className="ui-edc__record"><div className="ui-edc__ref"><span className="ui-edc__id">好友申请</span><span className="ui-edc__status">{phase==='saved'?'草稿已保存':phase==='discarded'?'已放下':'待你确认'}</span><span className="ui-edc__amount">{body.length}/300</span></div><span className="ui-edc__account">周末造物场 · 站内好友申请</span></div>
  <div className="ui-edc__outer" ref={outer}><div ref={inner}>
   {open?<div className="ui-edc__draft"><div className="ui-edc__meta"><div className="ui-edc__to"><span className="ui-edc__label">收件人</span><span className="request-recipient"><span className="ui-edc__avatar" aria-hidden="true">林</span><strong>林知夏</strong><span>产品设计师 / 创意前端</span></span></div></div>
    <div className="ui-edc__body">{editing?<textarea ref={textRef} className="ui-edc__edit" value={body} maxLength={300} onChange={e=>{setTone('');change(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();save();}if(e.key==='Escape'){e.stopPropagation();setEditing(false);}}} onBlur={()=>setEditing(false)} aria-label="好友申请正文" placeholder="说说你为什么想认识她，或者请 AI 帮你起草。"/>:<button key={tone} type="button" className="ui-edc__text request-editable-text" onClick={startEditing} aria-label="编辑好友申请正文">{body||'点击写下你的好友申请。'}</button>}</div>
    <div className="ui-edc__tune"><div className="ui-edc__tones" role="group" aria-label="AI 代写语气">{tones.map(t=><button key={t.id} type="button" aria-pressed={tone===t.id} onClick={()=>pickTone(t)}>{t.label}</button>)}<button type="button" className="ui-edc__edit-btn" aria-label="编辑申请" aria-pressed={editing} onClick={startEditing}><Icon><path d="M14.5 5.5 18.5 9.5M5 19l1-4L15.5 5.5l4 4L10 19l-5 0Z"/></Icon></button></div><span className="ui-edc__hint">切换语气会替换正文</span></div>
   </div>:<div className="ui-edc__receipt" role="status"><span className="ui-edc__receipt-icon" data-tone={phase==='saved'?'ok':'muted'} aria-hidden="true"><Icon>{phase==='saved'?<path d="m6 12.5 4 4 8-9"/>:<path d="M7 7l10 10M17 7 7 17"/>}</Icon></span><span className="ui-edc__receipt-text">{phase==='saved'?<>给 <b>林知夏</b> 的申请草稿已保存<span className="request-receipt-note">没有发送，也没有建立好友关系。</span></>:'已放下这份草稿'}</span><button type="button" className="ui-edc__undo" onClick={undo}>{phase==='saved'?'继续编辑':'恢复草稿'}</button></div>}
  </div></div>
  <div className="ui-edc__foot"><span className="ui-edc__agent">AI 代写 · 预写示例</span><span className="ui-edc__badge" data-tone={phase==='saved'?'ok':'muted'}>{phase==='saved'?'本页已保存':phase==='discarded'?'已放下':'请先审阅'}</span>{open&&<div className="ui-edc__buttons"><button type="button" className="ui-edc__secondary" onClick={discard}>放下草稿</button><button type="button" className="ui-edc__primary" onClick={save} disabled={!body.trim()}>保存申请草稿</button></div>}</div>
 </div>;
}
const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

/** The outer box follows the inner box's height, with a transition after the first frame */
function useSmoothHeight(inner: RefObject<HTMLElement | null>) {
  const outer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const sync = () => {
      o.style.height = `${i.offsetHeight}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(i);
    const frame = requestAnimationFrame(() => o.setAttribute("data-smooth", ""));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [inner]);
  return outer;
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-edc */
.ui-edc {
  --ui-edc-card: #ffffff;
  --ui-edc-strong: #000000;
  --ui-edc-ink: rgba(0, 0, 0, 0.88);
  --ui-edc-text: rgba(0, 0, 0, 0.61);
  --ui-edc-muted: rgba(0, 0, 0, 0.45);
  --ui-edc-faint: rgba(0, 0, 0, 0.27);
  --ui-edc-icon: rgba(0, 0, 0, 0.447);
  --ui-edc-line: rgba(0, 0, 0, 0.06);
  --ui-edc-fill: rgba(0, 0, 0, 0.06);
  --ui-edc-wash: rgba(0, 0, 0, 0.03);
  --ui-edc-solid: rgba(0, 0, 0, 0.88);
  --ui-edc-on-solid: #fcfcfc;
  --ui-edc-accent: rgba(0, 96, 226, 0.765);
  --ui-edc-ok: #1a9a52;
  --ui-edc-ok-bg: rgba(26, 154, 82, 0.08);
  --ui-edc-warn: #b47a06;
  --ui-edc-warn-bg: rgba(232, 162, 12, 0.12);
  /* Strokes are shadows: a 0.5px hairline plus a soft lift */
  --ui-edc-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 1px -1px rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --ui-edc-shadow-pop: 0 0 0 0.5px rgba(0, 0, 0, 0.08), 0 12px 28px -10px rgba(0, 0, 0, 0.16), 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --ui-edc-focus: rgba(0, 96, 226, 0.35);
  --ui-edc-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  box-sizing: border-box;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  border-radius: 10px;
  background: var(--ui-edc-card);
  box-shadow: var(--ui-edc-shadow);
  font-family: "Inter", "InterVariable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 20px;
  font-weight: 400;
  color: var(--ui-edc-ink);
  -webkit-font-smoothing: antialiased;
}
.ui-edc *, .ui-edc *::before, .ui-edc *::after { box-sizing: border-box; }
:where(.ui-edc) button {
  appearance: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ui-edc button:focus-visible, .ui-edc a:focus-visible { outline: 2px solid var(--ui-edc-focus); outline-offset: 1px; }
:where(.ui-edc) svg {
  display: block;
  width: 16px;
  height: 16px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- The record, heading the card ---------- */

.ui-edc__record { display: grid; padding: 12px 16px; border-bottom: 0.5px solid var(--ui-edc-line); }
.ui-edc__ref { display: flex; align-items: center; gap: 8px; min-width: 0; }
/* The status gives way first, then the reference – the amount never does */
.ui-edc__id { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 15px; font-weight: 500; line-height: 24px; color: var(--ui-edc-strong); }
.ui-edc__status {
  flex: 0 100 auto;
  min-width: 0;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--ui-edc-warn-bg);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--ui-edc-warn);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ui-edc__amount {
  flex: none;
  margin-left: auto;
  font-size: 15px;
  font-weight: 500;
  line-height: 24px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-edc-strong);
}
.ui-edc__account { overflow-wrap: anywhere; font-size: 12px; line-height: 16px; color: var(--ui-edc-text); }

/* ---------- The email: only this part changes height ---------- */

.ui-edc__outer { position: relative; overflow: hidden; overflow: clip; }
/* The recipient menu may reach out of the card while it's open – the height doesn't move then */
.ui-edc__outer[data-menu] { overflow: visible; z-index: 2; }
.ui-edc__outer[data-smooth] { transition: height 360ms var(--ui-edc-ease); }

.ui-edc__draft { animation: ui-edc-in 320ms var(--ui-edc-ease) both; transition: opacity 220ms ease; }
.ui-edc__draft[data-sending] { opacity: 0.6; pointer-events: none; }

.ui-edc__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 10px 16px;
  border-bottom: 0.5px solid var(--ui-edc-line);
}
.ui-edc__to { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; }
.ui-edc__label { flex: none; font-size: 13px; color: var(--ui-edc-muted); }
/* Recipient: the button-switch look – a hairline, the address in gray */
.ui-edc__recipient {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 28px;
  padding: 0 6px 0 10px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 0.5px var(--ui-edc-line);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--ui-edc-ink);
  transition: background-color 160ms ease;
}
.ui-edc__recipient:hover,
.ui-edc__recipient[aria-expanded="true"] { background: var(--ui-edc-wash); }
/* A long name shortens; the address gives way before it */
.ui-edc__name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-edc__email { flex: 0 100 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 400; color: var(--ui-edc-muted); }
.ui-edc__recipient svg { color: var(--ui-edc-icon); transition: transform 220ms var(--ui-edc-ease); }
.ui-edc__recipient[aria-expanded="true"] svg { transform: rotate(180deg); }

/* Recipient menu: a white popover */
.ui-edc__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 26px;
  z-index: 5;
  display: grid;
  gap: 2px;
  width: 260px;
  max-width: calc(100cqw - 40px);
  max-height: 288px;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0;
  padding: 4px;
  list-style: none;
  border-radius: 10px;
  background: var(--ui-edc-card);
  box-shadow: var(--ui-edc-shadow-pop);
  animation: ui-edc-menu 200ms var(--ui-edc-ease) both;
  transform-origin: top left;
}
.ui-edc__menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: left;
  font-size: 13px;
  line-height: 20px;
  color: var(--ui-edc-ink);
}
.ui-edc__menu button:hover { background: var(--ui-edc-fill); }
.ui-edc__avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 6px;
  background: var(--ui-edc-fill);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: var(--ui-edc-text);
}
.ui-edc__menu-text { display: grid; flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ui-edc__menu-text small { overflow: hidden; font-size: 12px; line-height: 16px; white-space: nowrap; text-overflow: ellipsis; color: var(--ui-edc-muted); }
.ui-edc__tick { color: var(--ui-edc-accent); stroke-width: 1.8; }

/* Attachment */
.ui-edc__file {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  white-space: nowrap;
  color: var(--ui-edc-text);
}
.ui-edc__file > svg { color: var(--ui-edc-icon); }
.ui-edc__file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-edc__file button {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  margin-left: -2px;
  border-radius: 6px;
  color: var(--ui-edc-icon);
  transition: background-color 160ms ease, color 160ms ease;
}
.ui-edc__file button svg { width: 14px; height: 14px; }
.ui-edc__file button:hover { background: var(--ui-edc-wash); color: var(--ui-edc-ink); }
.ui-edc__attach {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 28px;
  padding: 0 8px 0 6px;
  border-radius: 6px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--ui-edc-text);
  transition: background-color 160ms ease, color 160ms ease;
  animation: ui-edc-fade 220ms ease both;
}
.ui-edc__attach svg { color: var(--ui-edc-icon); }
.ui-edc__attach:hover { background: var(--ui-edc-wash); color: var(--ui-edc-ink); }

/* Body */
.ui-edc__body { padding: 14px 16px 2px; }
.ui-edc__text {
  margin: -4px -6px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 20px;
  color: var(--ui-edc-ink);
  white-space: pre-line;
  overflow-wrap: anywhere;
  cursor: text;
  transition: background-color 160ms ease;
  animation: ui-edc-fade 280ms ease both;
}
.ui-edc__text:hover { background: var(--ui-edc-wash); }
.ui-edc__text a {
  color: var(--ui-edc-strong);
  font-weight: 500;
  text-decoration: underline;
  text-decoration-color: var(--ui-edc-faint);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition: text-decoration-color 160ms ease;
}
.ui-edc__text a:hover { text-decoration-color: currentColor; }
.ui-edc__edit {
  display: block;
  width: calc(100% + 12px);
  margin: -4px -6px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: var(--ui-edc-wash);
  box-shadow: inset 0 0 0 0.5px var(--ui-edc-line);
  outline: none;
  resize: none;
  overflow: hidden;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  color: var(--ui-edc-strong);
  caret-color: var(--ui-edc-accent);
}

/* Tones and the pencil */
.ui-edc__tune {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px 14px 16px;
}
.ui-edc__tones { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
.ui-edc__tones button {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 4px 10px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 0.5px var(--ui-edc-line);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  color: var(--ui-edc-text);
  transition: background-color 160ms ease, color 160ms ease;
}
.ui-edc__tones button:hover { background: var(--ui-edc-wash); color: var(--ui-edc-ink); }
.ui-edc__tones button[aria-pressed="true"] { background: var(--ui-edc-fill); color: var(--ui-edc-ink); }
/* Edit: a ghost icon button */
.ui-edc__tones .ui-edc__edit-btn {
  justify-content: center;
  width: 28px;
  margin-left: 4px;
  padding: 0;
  box-shadow: none;
  color: var(--ui-edc-icon);
}
.ui-edc__tones .ui-edc__edit-btn:hover { color: var(--ui-edc-ink); }
.ui-edc__tones .ui-edc__edit-btn[aria-pressed="true"] { background: var(--ui-edc-fill); color: var(--ui-edc-ink); }
.ui-edc__hint { flex: none; font-size: 12px; line-height: 16px; white-space: nowrap; color: var(--ui-edc-faint); }

/* ---------- Receipt after send / discard ---------- */

.ui-edc__receipt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 12px 16px;
  font-size: 13px;
  color: var(--ui-edc-text);
  animation: ui-edc-in 320ms var(--ui-edc-ease) both;
}
.ui-edc__receipt b { font-weight: 500; color: var(--ui-edc-strong); }
.ui-edc__receipt-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 6px;
  background: var(--ui-edc-fill);
  color: var(--ui-edc-icon);
}
.ui-edc__receipt-icon[data-tone="ok"] { background: var(--ui-edc-ok-bg); color: var(--ui-edc-ok); }
.ui-edc__receipt-icon svg { width: 14px; height: 14px; stroke-width: 2; }
.ui-edc__receipt-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-edc__undo {
  flex: none;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-edc-ink);
  transition: background-color 160ms ease;
}
.ui-edc__undo:hover { background: var(--ui-edc-wash); }

/* ---------- The last row ---------- */

/* Discard and Send drop to their own row when the row runs out of room */
.ui-edc__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 10px 10px 10px 16px;
  border-top: 0.5px solid var(--ui-edc-line);
}
.ui-edc__agent { min-width: 0; overflow: hidden; font-size: 13px; white-space: nowrap; text-overflow: ellipsis; color: var(--ui-edc-ink); }
.ui-edc__badge {
  flex: none;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  animation: ui-edc-fade 260ms ease both;
}
.ui-edc__badge[data-tone="ok"] { background: var(--ui-edc-ok-bg); color: var(--ui-edc-ok); }
.ui-edc__badge[data-tone="muted"] { background: var(--ui-edc-fill); color: var(--ui-edc-text); }
.ui-edc__buttons { display: flex; flex: none; gap: 8px; margin-left: auto; }
.ui-edc__secondary,
.ui-edc__primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms var(--ui-edc-ease);
}
/* Discard: white with the card's hairline shadow */
.ui-edc__secondary { background: var(--ui-edc-card); box-shadow: var(--ui-edc-shadow); color: var(--ui-edc-strong); }
.ui-edc__secondary:hover:not(:disabled) { background: linear-gradient(var(--ui-edc-wash), var(--ui-edc-wash)), var(--ui-edc-card); }
/* Send: the dark chip */
.ui-edc__primary { background: var(--ui-edc-solid); color: var(--ui-edc-on-solid); }
.ui-edc__primary:hover:not(:disabled) { background: var(--ui-edc-strong); }
.ui-edc__secondary:disabled, .ui-edc__primary:disabled { cursor: default; }
.ui-edc__secondary:not(:disabled):active, .ui-edc__primary:not(:disabled):active { transform: scale(0.97); }
.ui-edc__spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid color-mix(in srgb, var(--ui-edc-on-solid) 30%, transparent);
  border-top-color: var(--ui-edc-on-solid);
  border-radius: 50%;
  animation: ui-edc-spin 700ms linear infinite;
}

@keyframes ui-edc-in { from { opacity: 0; transform: translateY(4px); } }
@keyframes ui-edc-fade { from { opacity: 0; } }
@keyframes ui-edc-menu { from { opacity: 0; transform: scale(0.97) translateY(-4px); } }
@keyframes ui-edc-spin { to { transform: rotate(360deg); } }

/* Narrow containers (phones): the address, hint and author step back */
@container (max-width: 440px) {
  .ui-edc__email, .ui-edc__hint { display: none; }
}
@container (max-width: 380px) {
  .ui-edc__record { padding: 12px 14px; }
  .ui-edc__meta, .ui-edc__tune, .ui-edc__receipt, .ui-edc__foot { padding-left: 14px; }
  .ui-edc__body { padding-left: 14px; padding-right: 14px; }
  .ui-edc[data-phase="draft"] .ui-edc__agent,
  .ui-edc[data-phase="sending"] .ui-edc__agent { display: none; }
  .ui-edc__tones { gap: 2px; }
  .ui-edc__tones button { padding: 4px 8px; }
  .ui-edc__tones .ui-edc__edit-btn { margin-left: 2px; }
}
/* Touch screens: taller hit targets */
@media (pointer: coarse) {
  .ui-edc__recipient, .ui-edc__tones button, .ui-edc__secondary, .ui-edc__primary, .ui-edc__undo, .ui-edc__attach { height: 34px; }
  .ui-edc__tones .ui-edc__edit-btn { width: 34px; }
  .ui-edc__file button { width: 30px; height: 30px; }
  .ui-edc__menu button { padding: 9px 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-edc__outer[data-smooth] { transition: none; }
  .ui-edc__draft, .ui-edc__receipt, .ui-edc__text, .ui-edc__badge, .ui-edc__menu, .ui-edc__attach { animation: none; }
}

/* Text fields: no focus box while typing – also against global :focus-visible rules of the host page */
.ui-edc input:not([type="checkbox"]):not([type="radio"]):focus-visible,
.ui-edc textarea:focus-visible,
.ui-edc [contenteditable]:focus-visible { outline: none; }

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-edc {
  --ui-edc-card: #1c1c1e;
  --ui-edc-strong: #ffffff;
  --ui-edc-ink: rgba(255, 255, 255, 0.9);
  --ui-edc-text: rgba(255, 255, 255, 0.62);
  --ui-edc-muted: rgba(255, 255, 255, 0.46);
  --ui-edc-faint: rgba(255, 255, 255, 0.3);
  --ui-edc-icon: rgba(255, 255, 255, 0.5);
  --ui-edc-line: rgba(255, 255, 255, 0.08);
  --ui-edc-fill: rgba(255, 255, 255, 0.08);
  --ui-edc-wash: rgba(255, 255, 255, 0.04);
  --ui-edc-solid: rgba(255, 255, 255, 0.92);
  --ui-edc-on-solid: #161618;
  --ui-edc-accent: #4d8dff;
  --ui-edc-ok: #3ec27a;
  --ui-edc-ok-bg: rgba(62, 194, 122, 0.14);
  --ui-edc-warn: #f0b43c;
  --ui-edc-warn-bg: rgba(232, 162, 12, 0.14);
  --ui-edc-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --ui-edc-shadow-pop: 0 0 0 0.5px rgba(255, 255, 255, 0.12), 0 12px 28px -10px rgba(0, 0, 0, 0.6);
  --ui-edc-focus: rgba(77, 141, 255, 0.5);
}
:where(.dark, [data-theme="dark"]) .ui-edc__primary:hover:not(:disabled) { background: #ffffff; }
`;
