"use client";
import {useState} from "react";
import {ArrowRight,Edit3,LockKeyhole} from "lucide-react";
import {Button} from "../affectui/button-clean";
import {AudienceSwitch,ProfileEditor,ProfilePreview,editableFields,type Update} from "./profile-steps";
import {DocumentWorkspace} from "./document-workspace";
import {IdeaPlan} from "./idea-steps";
import {LongText} from "./experience";
import {activityPlan,visibleFields,EVENTS,VISIBILITIES,type Audience,type Draft,type Visibility} from "@/lib/onboarding/model";

export function FinalReview({draft,update,onIdeaEdit,onConfirm,onEventChange}:{draft:Draft;update:Update;onProfileEdit:()=>void;onIdeaEdit:(id:string)=>void;onConfirm:()=>void;onEventChange:(id:string|null)=>void;reduced?:boolean}){
 const[audience,setAudience]=useState<Audience>("self");const plan=activityPlan(draft);
 const ideas=draft.ideas.filter(i=>audience==="self"||i.visibility==="authenticated"||audience==="friends"&&i.visibility==="friends");
 const fields=audience==="self"?editableFields(draft):visibleFields(draft,audience);
 const outline=[...fields,...ideas.map(i=>({id:i.id,label:i.title||"未命名想法",value:[i.description,i.audience,i.firstStep,i.help].join(""),visibility:i.visibility,origin:""})),...(audience==="self"?[{id:"activity",label:"本次活动",value:plan.role+plan.time,visibility:"private" as const,origin:""}]:[])];
 return <div className="final-document"><DocumentWorkspace fields={outline} character={false} title="完整资料" toolbar={<><AudienceSwitch value={audience} onChange={setAudience}/><span>{audience==="self"?"介绍、想法与活动安排，逐段核对":"当前视角仅预览可见资料；活动设置仅本人可见"}</span></>} footer={<><span><LockKeyhole size={14}/>确认保存，不会自动发布或邀请</span><Button iconRight={<ArrowRight size={16}/>} onClick={onConfirm}>{draft.eventId?"确认资料，寻找同伴":"保存草稿，暂不寻找"}</Button></>}>
 {audience==="self"?<ProfileEditor draft={draft} update={update}/>:<ProfilePreview draft={draft} audience={audience}/>}
 <div className="final-section-heading"><span>02</span><h2>想法与计划</h2><small>{ideas.length} 个方向</small></div>
 {ideas.map(idea=><section key={idea.id} className="final-idea" data-field={idea.id}><div className="final-idea-tools">{audience==="self"&&<><label>展示给谁<select aria-label={idea.title+"的展示范围"} value={idea.visibility} onChange={e=>update(d=>({...d,ideas:d.ideas.map(i=>i.id===idea.id?{...i,visibility:e.target.value as Visibility}:i),savedFinal:false,completed:false}))}>{VISIBILITIES.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label><button onClick={()=>onIdeaEdit(idea.id)}><Edit3 size={14}/>回到对话修改</button></>}</div><IdeaPlan idea={idea}/></section>)}
 {!ideas.length&&<p className="flow-empty-note">这个视角下，没有可展示的想法。</p>}
 {audience==="self"&&<section className="final-activity" data-field="activity"><div className="final-section-heading"><span>03</span><h2>本次活动</h2><small>本人设置</small></div><label className="flow-activity-label" htmlFor="final-event">在哪个活动寻找伙伴</label><select id="final-event" value={draft.eventId||""} onChange={e=>onEventChange(e.target.value||null)}><option value="">暂未加入活动</option>{EVENTS.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select>
 {draft.eventId?<><div className="final-activity-answers"><LongText id="activity-role" label="希望贡献什么（可选）" value={plan.role} onChange={role=>update(d=>({...d,activities:{...d.activities,[d.eventId!]:{...activityPlan(d),role}},savedFinal:false,completed:false}))} minRows={2}/><LongText id="activity-time" label="可以投入多少（可选）" value={plan.time} onChange={time=>update(d=>({...d,activities:{...d.activities,[d.eventId!]:{...activityPlan(d),time}},savedFinal:false,completed:false}))} minRows={2}/></div><label className="flow-discover-toggle"><input type="checkbox" checked={plan.discoverable} onChange={e=>update(d=>({...d,activities:{...d.activities,[d.eventId!]:{...activityPlan(d),discoverable:e.target.checked}},savedFinal:false,completed:false}))}/><span><b>允许本活动成员发现我</b><small>默认关闭。每个活动分别决定。</small></span></label></>:<p className="flow-empty-note">可以先保存介绍，加入活动后再开始寻找。不会自动切换成全站找人。</p>}
 </section>}
 </DocumentWorkspace></div>;
}
