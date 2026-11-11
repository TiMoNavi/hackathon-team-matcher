"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowRight,Check,Compass,Heart,Send,Users,X} from "lucide-react";
import {Button} from "../affectui/button-clean";
import {type Update} from "./profile-steps";
import {LongText} from "./experience";
import {CandidateDeck} from "./candidate-deck";
import {CandidateStory} from "./candidate-story";
import {EVENTS,MATCHES,type Draft,type Match} from "@/lib/onboarding/model";

export {FinalReview} from "./final-review";

export function ResultsStep({draft,update,onRetry,onBrowse,onEdit,onFinish,notify}:{draft:Draft;update:Update;onRetry:()=>void;onBrowse:()=>void;onEdit:()=>void;onFinish:()=>void;notify:(s:string)=>void;reduced?:boolean}){
 const list=draft.matches.map(id=>MATCHES.find(m=>m.id===id&&m.eventId===draft.eventId)).filter((m):m is Match=>Boolean(m));const[selected,setSelected]=useState<string|null>(null);const active=list.find(m=>m.id===selected)||list[0];const[recipients,setRecipients]=useState<Match[]>([]),[message,setMessage]=useState("");const modal=useRef<HTMLDialogElement>(null);
 const shortlist=list.filter(m=>m.kind==="person"&&(draft.shortlisted||[]).includes(m.id)&&!draft.pendingFriends.includes(m.id));
 useEffect(()=>{if(recipients.length){setMessage("你好，看了你的介绍，想和你聊聊我们感兴趣的方向。");modal.current?.showModal();}else modal.current?.close();},[recipients]);
 function select(m:Match){setSelected(m.id);}
 function toggle(id:string){update(d=>({...d,shortlisted:(d.shortlisted||[]).includes(id)?d.shortlisted!.filter(v=>v!==id):[...(d.shortlisted||[]),id]}));}
 function dismiss(){if(!active)return;update(d=>({...d,matches:d.matches.filter(id=>id!==active.id),shortlisted:(d.shortlisted||[]).filter(id=>id!==active.id)}));notify("这张卡已从本次列表移除。可以通过普通浏览重新查看。");}
 function sendRequests(){const allowed=recipients.filter(person=>person.eventId===draft.eventId&&person.kind==="person");if(!allowed.length)return;update(d=>({...d,pendingFriends:[...new Set([...d.pendingFriends,...allowed.map(p=>p.id)])]}));setRecipients([]);notify("演示申请已记录，等待对方接受。没有真实消息发出。");}
 if(!draft.eventId||!list.length)return <div className="flow-discovery-empty"><Compass size={42}/><h2>{draft.eventId?"先别急，这次还没有合适的人。":"加入一场活动，再开始相遇。"}</h2><p>{draft.eventId?"这里只展示当前活动内的结果。你可以调整方向，或主动切换到普通浏览。":"资料可以以后补充。当前没有活动，不进行全站搜索。"}</p><div className="guide-actions">{draft.eventId?<><Button onClick={onRetry}>重新寻找（演示）</Button><Button variant="secondary" onClick={onBrowse}>普通浏览本活动</Button></>:<Button onClick={onEdit}>返回选择活动</Button>}</div><button className="guide-text-link" onClick={onFinish}>{draft.savedFinal?"保存并结束本次体验":"开始补全我的资料"}<ArrowRight size={14}/></button></div>;
 const pending=draft.pendingFriends.includes(active.id),chosen=(draft.shortlisted||[]).includes(active.id);
 return <div className="flow-discovery"><div className="flow-discovery-meta"><span>{EVENTS.find(e=>e.id===draft.eventId)?.name} · {list.length} 张示例卡片</span><span>{draft.resultMode==="browse"?"普通浏览 · 可先逛一逛":"AI 推荐展示演示"}</span></div>{!draft.savedFinal&&<div className="flow-deferred-note"><span>先认识这里的人，资料随时可以回来补。</span><button onClick={onFinish}>开始补全资料 <ArrowRight size={13}/></button></div>}
 <CandidateDeck list={list} active={active} onSelect={select}>
 <CandidateStory key={active.id} person={active}/>
 <div className="flow-detail-actions">{active.kind==="person"?<><div className="flow-match-question"><span>这是你想认识的人吗？</span><button className={"deck-like "+(chosen?"is-chosen":"")} onClick={()=>toggle(active.id)} disabled={pending}>{chosen?<Check size={14}/>:<Heart size={14}/>}是的，想认识</button><button onClick={dismiss}>不太合适</button></div><Button icon={pending?<Check size={16}/>:<Send size={16}/>} disabled={pending} onClick={()=>setRecipients([active])}>{pending?"申请待接受 · 演示":"发送好友申请"}</Button></>:<div className="guide-actions"><Button variant="secondary" icon={<Heart size={15}/>} onClick={()=>update(d=>({...d,followedIdeas:d.followedIdeas.includes(active.id)?d.followedIdeas.filter(id=>id!==active.id):[...d.followedIdeas,active.id]}))}>{draft.followedIdeas.includes(active.id)?"已关注 · 演示":"关注想法"}</Button><Button disabled={draft.discussionRequests.includes(active.id)} onClick={()=>{update(d=>({...d,discussionRequests:[...new Set([...d.discussionRequests,active.id])]}));notify("已记录演示讨论申请，尚未加入讨论。");}}>{draft.discussionRequests.includes(active.id)?"待批准 · 演示":"申请加入讨论（演示）"}</Button></div>}</div>
 </CandidateDeck>
 <div className="flow-discovery-bottom"><div><b>{shortlist.length?"想认识 "+shortlist.length+" 位伙伴":"先看介绍，再决定联系谁"}</b><span>好友申请、关注想法、加入讨论分别确认。</span></div>{shortlist.length>0&&<Button icon={<Users size={16}/>} onClick={()=>setRecipients(shortlist)}>向 {shortlist.length} 位发送好友申请</Button>}<button className="guide-text-link" onClick={onFinish}>{draft.savedFinal?"完成引导预览":"开始补全我的资料"}<ArrowRight size={14}/></button></div>
 <dialog ref={modal} className="guide-dialog flow-friend-dialog" aria-labelledby="friend-dialog-title" onCancel={()=>setRecipients([])} onClose={()=>setRecipients([])}><button className="guide-dialog-close" aria-label="关闭好友申请" onClick={()=>setRecipients([])}><X size={18}/></button><h2 id="friend-dialog-title">向这 {recipients.length} 位打个招呼</h2><div className="flow-recipients">{recipients.map(p=><span key={p.id}>{p.name}<small>{p.role}</small></span>)}</div><LongText id="friend-message" label="第一句话" value={message} onChange={setMessage}/><p className="guide-inline-note">本次为本机演示。确认后仅记录待接受申请，不发送真实消息，也不自动成为好友。</p><div className="guide-actions"><Button variant="secondary" onClick={()=>setRecipients([])}>再想想</Button><Button disabled={!message.trim()} icon={<Send size={16}/>} onClick={sendRequests}>确认发送演示申请</Button></div></dialog>
 </div>;
}

