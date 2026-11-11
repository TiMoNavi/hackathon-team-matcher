"use client";
import {ArrowRight,FileText,Github,Lightbulb,MessageCircle,Sparkles,UserRound,Users} from "lucide-react";
import {IntegrationBeam} from "../reference-originals/integration-beam";
import {AgentTrail,type TrailStep} from "../reference-originals/agent-trail";
import {ThinkingLoader} from "../affectui/thinking-loader-clean";
import {GradientText} from "../reference-originals/gradient-text";
import {Button} from "../affectui/button-clean";
import {JOB_STEPS,type Draft} from "@/lib/onboarding/model";
import {MascotAnchor} from "./experience";
export function Processing({draft,reduced,onSkip,onRetry,onManual,compact=false}:{draft:Draft;reduced:boolean;onSkip:()=>void;onRetry:()=>void;onManual?:()=>void;compact?:boolean}){
 const job=draft.job;if(!job)return null;const failed=job.status==="failed",match=job.kind==="match";
 const unavailable=job.kind==="sources"&&!draft.sources.some(s=>s.sample||s.kind==="text"&&s.text?.trim());
 const stages:TrailStep[]=JOB_STEPS[job.kind].map((title,i)=>({id:job.id+"-"+i,title,state:failed&&i===job.cursor?"failed":i<job.cursor?"done":i===job.cursor?"running":"pending",status:"",substeps:i===job.cursor&&!failed?[{title:match?"只整理本活动的示例卡片":"保留你的原文，结果交给你确认",state:"running"}]:undefined}));
 return <section className={"flow-loading"+(compact?" is-compact":"")+(failed?" is-failed":"")} aria-label="AI 处理进程演示">
 {!compact&&<div className={"flow-loading-visual"+(match?" is-search":"")} aria-hidden="true" inert>
  {!reduced&&<div className="flow-loading-halo"/>}
  {!reduced&&<IntegrationBeam className="flow-loading-beam" center={{name:"小同",logo:match?<Sparkles/>:<span/>}} left={match?[{name:"当前活动",logo:<Users/>},{name:"个人画像",logo:<UserRound/>},{name:"想法",logo:<Lightbulb/>}]:[{name:"资料",logo:<FileText/>},{name:"公开作品",logo:<Github/>},{name:"自述",logo:<MessageCircle/>}]} right={[{name:"经历",logo:<UserRound/>},{name:"合作方式",logo:<Users/>},{name:"共同方向",logo:<Lightbulb/>}]} label="线索汇聚动效"/>}
  {!match&&<div className="flow-loading-character"><MascotAnchor mode="loading"/></div>}
  {reduced&&match&&<Sparkles className="flow-static-search"/>}
 </div>}
 <div className="flow-loading-process"><div className="flow-loading-title">{failed?<h2>{unavailable?"这份资料暂时无法解析":"这次整理暂时停下了"}</h2>:compact?<ThinkingLoader variant="plain" phases={JOB_STEPS[job.kind]} phase={job.cursor}/>:reduced?<h2>{JOB_STEPS[job.kind][job.cursor]}</h2>:<GradientText as="h2" colors={["var(--primary)","var(--body)","var(--primary)"]}>{JOB_STEPS[job.kind][job.cursor]}</GradientText>}</div>
 <div className="flow-task-progress" role="progressbar" aria-label="演示处理阶段" aria-valuemin={0} aria-valuemax={3} aria-valuenow={job.cursor}>{[0,1,2].map(i=><span key={i} data-state={i<job.cursor?"done":i===job.cursor&&!failed?"active":"pending"}/>)}</div>
 <AgentTrail className="flow-open-trail" steps={stages} title="" labels={{running:"进行中",approval:"待确认",waiting:"等待你",failed:"未完成",done:"已完成",pending:"下一步",empty:"尚未开始",untitled:"处理步骤",earlier:"更早步骤",more:"更多",fewer:"收起"}}/>
 <p className="flow-loading-note">{failed?unavailable?"本机预览尚未连接文件和网页解析服务。已选的资料还在。":"已填内容保留，可以重试。":"AI 处理状态演示 · 随时可以跳过动画"}</p>
 <div className="flow-loading-actions">{failed?<><Button variant="secondary" onClick={onRetry}>{unavailable?"使用示例资料重试":"重试演示"}</Button>{onManual&&<button onClick={onManual}>{match?"普通浏览本活动":"手动继续"}</button>}</>:<button onClick={onSkip}>跳过演示动画 <ArrowRight size={14}/></button>}</div>
 </div></section>;
}
