"use client";
import type { Viewer } from '@/lib/request-drafts';
import { ArrowRight, ArrowUpRight, Braces, Check, CircleHelp, Layers, Sparkles, UserRound } from 'lucide-react';
import { CitedAnswer, type CitedSegment } from '@/components/effects/cited-answer';
import { Button } from '@/components/ui/button';
import type { ProfileEntry } from '@/lib/profile-data';

const viewers = {
 developer:{label:'全栈开发者',icon:Braces,context:'你做全栈开发，想完成一个 AI 小产品；11 月 14 日 14:00–18:00（UTC+8）可参与。',headline:'你负责实现，她把体验做细。',segments:[{text:'如果你负责全栈实现，她的交互设计与前端原型能力可以补上产品体验这一段；这也回应了她本次寻找全栈伙伴的需求。',cite:['skill-design','event-seeking']},{text:'漫游地图已有收藏与路线预览原型，可以从地图服务接入开始明确分工。',cite:['project-roam'],paragraph:true},{text:'你提供的周六下午与她已填的时段有交集，可以先约一次短讨论，再按各自习惯异步推进。',cite:['event-availability','collab'],paragraph:true}] as CitedSegment[],strength:'能力互补',shared:'可以从漫游地图切入',unknown:'地图服务经验、上线分工与最终投入仍需双方确认。',greeting:'你好，知夏！我做全栈开发，看到漫游地图已有交互原型。我们可以聊聊地图服务接入怎么分工吗？'},
 designer:{label:'产品设计师',icon:Layers,context:'你关注创意工具，希望找到愿意一起打磨体验的伙伴。',headline:'有共同的方向，可以先共创。',segments:[{text:'你们都关注创意工具，她也有交互设计与 React 原型经验，适合先一起梳理场景、验证一条关键路径。',cite:['direction-ai','skill-react']},{text:'她本次明确在寻找全栈伙伴。两位设计师合作后，仍需要确认谁来承担后端与上线工作。',cite:['event-seeking'],paragraph:true}] as CitedSegment[],strength:'方向相近',shared:'可以一起验证关键体验',unknown:'开发角色仍有空缺；不宜仅凭共同兴趣判断合作可行。',greeting:'你好，知夏！我也做产品设计，对创意工具很感兴趣。我们可以先一起看一条关键用户路径，再讨论开发分工吗？'},
 guest:{label:'暂不提供背景',icon:UserRound,context:'未提供观看者资料，先了解她能做什么，以及本次的明确需求。',headline:'从设计到原型，她能推进这一段。',segments:[{text:'她填写了交互设计与 React 原型技能，也有地图与灵感工具的项目经历。',cite:['skill-design','skill-react','project-roam']},{text:'这次希望找到全栈伙伴，每周预计投入 8–12 小时。你们是否合适，还需要结合你的目标与可用时间。',cite:['event-seeking','event-time'],paragraph:true}] as CitedSegment[],strength:'先了解能力',shared:'尚未判断与你的适配',unknown:'缺少你的目标、技能和时间，不生成个性化合作结论。',greeting:'你好，知夏！我看了你的漫游地图项目，想先了解这次活动最希望推进哪一部分。'},
};
export function ViewerInsights({entries,sparse,onOpen,onGreet,viewer,onViewerChange}:{entries:ProfileEntry[];sparse:boolean;onOpen:(entry:ProfileEntry)=>void;onGreet:()=>void;viewer:Viewer;onViewerChange:(viewer:Viewer)=>void}){

 const data=viewers[viewer];
 const allowed=new Map(entries.map(e=>[e.id,e]));
 const segments=sparse?[{text:'目前可见资料中，她填写了交互设计技能。缺少项目经历、本次目标与投入信息，暂不能给出具体合作建议。',cite:['skill-design']}] as CitedSegment[]:data.segments;
 const ids=[...new Set(segments.flatMap(s=>s.cite??[]))].filter(id=>allowed.has(id));
 const sources=ids.map(id=>{const e=allowed.get(id)!;return{id,title:e.short,site:e.label,quote:e.detail};});
 return <section className="content-section insights-section" id="insights" aria-labelledby="insights-title">
   <div className="section-heading-row"><div><span className="eyebrow"><span>01</span> A SECOND PERSPECTIVE</span><h2 id="insights-title">你们，可以一起做什么<span className="primary-dot">？</span></h2></div><span className="section-aside"><Sparkles size={15}/>为观看者提供另一种视角</span></div>
   <div className="insights-shell">
     <div className="insights-main"><div className="ai-label"><span className="ai-symbol"><Sparkles size={21}/></span><strong>AI 合作推荐</strong><span className="demo-badge">演示</span><span className="ai-private">仅基于本页可见资料</span></div>
       <h3>{sparse?'资料还少，先保留判断。':data.headline}</h3>
       <CitedAnswer key={viewer+(sparse?'-sparse':'')} className="profile-citations" segments={segments} sources={sources} onOpenSource={s=>{const entry=allowed.get(s.id);if(entry)onOpen(entry);}}/>
       <div className="insights-bottom"><span><i/>预写示例，未调用 AI</span><span>点击数字，查看判断依据<ArrowUpRight size={13}/></span></div>
     </div>
     <aside className="viewer-context"><span className="eyebrow">THROUGH YOUR LENS</span><label htmlFor="viewer-context">换个身份，看合作建议</label><div className="viewer-select"><data.icon size={18}/><select id="viewer-context" value={viewer} onChange={e=>onViewerChange(e.target.value as Viewer)}>{Object.entries(viewers).map(([id,v])=><option key={id} value={id}>{v.label}</option>)}</select></div><p>{data.context}</p><span className="context-demo">模拟观看者背景</span>
       <div className="match-points"><div><Check size={16}/><span><small>{sparse?'资料状态':data.strength}</small>{sparse?'等待更多可见资料':data.shared}</span></div><div><CircleHelp size={16}/><span><small>还需要聊清楚</small>{sparse?'本次目标、投入时间与可贡献角色尚未提供。':data.unknown}</span></div></div>
     </aside>
   </div>
   {!sparse&&<div className="conversation-starter"><span className="starter-icon"><MessageGlyph/></span><div><span>可以从这个话题开始</span><p>{data.greeting}</p></div><Button variant="outline" onClick={onGreet}>AI 代写好友申请<ArrowRight size={16}/></Button></div>}
 </section>;
}
function MessageGlyph(){return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>}
