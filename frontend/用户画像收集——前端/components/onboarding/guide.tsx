"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {ArrowLeft,ArrowRight,Check,Cloud,Compass,ExternalLink,LogOut,Moon,RefreshCw,Settings2,Sparkles,Sun,X} from "lucide-react";
import {Button} from "../affectui/button-clean";
import {GridBackground} from "../reference-originals/grid-background";
import {GradientFloor} from "../reference-originals/gradient-floor";
import {SourceStep,ReviewStep,PreferencesStep,ProfileStep} from "./profile-steps";
import {IdeasStep,IdeaWorkshop} from "./idea-steps";
import {FinalReview,ResultsStep} from "./final-steps";
import {Processing} from "./processing";
import {useGuide} from "./use-guide";
import {changeEvent,CHAPTERS,EVENTS,getField,MATCHES,STEPS,startJob,validIdea,type Audience,type Draft,type Phase} from "@/lib/onboarding/model";
import {ExperienceProvider,MascotAnchor,TravellingMascot} from "./experience";
import {TextReveal} from "../reference-originals/text-reveal";
import "./guide.css";
import "./experience.css";
import "./refinements.css";
import "./document-flow.css";

const HEADINGS=[
 ["从你已经有的开始。","一份资料，几次选择。把自我介绍，留给我们一起完成。"],
 ["让我把这些线索，连起来。","经历、技能，还有你在意的事，都会先交给你核对。"],
 ["这是我初步认识的你。","有没有哪里不太像你？点一下，就能改。"],
 ["再靠近你一点点。","三个小偏好，没有标准答案，每一题都可以跳过。"],
 ["现在，这份介绍像你了吗？","让别人看到什么，由你一条一条决定。"],
 ["你想和别人，一起做点什么？","一个模糊的点子，或者一个想探索的方向，都值得开始。"],
 ["让这个想法，有一个起点。","不必一下想完整。先聊清楚，谁需要它、第一步做什么。"],
 ["最后，看一眼你的故事。","你的介绍、你的想法，还有你希望遇见的人。"],
 ["寻找可以一起出发的人。","本次只在当前示例活动内寻找，不跨活动补齐结果。"],
 ["相遇，可以从一句话开始。","看看彼此在意的方向，再决定要不要聊一聊。"]
];
const SAMPLE_SOURCES:Draft["sources"]=[{id:"sample-resume",kind:"resume",label:"小夏的创造者简历 · 示例",sample:true,status:"ready"},{id:"sample-github",kind:"github",label:"xiaxia-lab · 示例公开作品",sample:true,status:"ready"}];

export default function Guide(){
 const {draft,ready,update,go,persist,saveStatus,recovery,setRecovery,theme,setTheme,isDark,motionOff,setMotionOff,reduced,systemReduced,skipAnimation,reset}=useGuide();
 const[audience,setAudience]=useState<Audience>("self");const[notice,setNotice]=useState("");const[dialog,setDialog]=useState<"save"|"restart"|"complete"|null>(null);const[returnTo,setReturnTo]=useState<number|null>(null);const heading=useRef<HTMLHeadingElement>(null);const modal=useRef<HTMLDialogElement>(null);const lastStep=useRef(1);
 const chapter=CHAPTERS.findIndex(c=>draft.step>=c.start&&draft.step<=c.end);const busy=draft.job?.status==="running";const currentEvent=EVENTS.find(e=>e.id===draft.eventId);
 useEffect(()=>{if(!ready||lastStep.current===draft.step)return;lastStep.current=draft.step;heading.current?.focus({preventScroll:true});window.scrollTo({top:0,behavior:"instant"});},[draft.step,ready,reduced]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),5000);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(dialog)modal.current?.showModal();else modal.current?.close();},[dialog]);
 function sourceStart(sample=false){update(d=>startJob({...d,sources:sample?SAMPLE_SOURCES:d.sources,step:2,reached:Math.max(d.reached,2),skippedSources:false,profileConfirmed:false,savedFinal:false,completed:false},"sources"));}
 function noSources(){update(d=>({...d,step:3,reached:Math.max(d.reached,3),skippedSources:true,job:d.job?{...d.job,status:"cancelled"}:null}));}
 function deferOnboarding(){update(d=>({...d,step:10,reached:10,savedFinal:false,completed:false,job:null,resultMode:"browse",matches:MATCHES.filter(m=>m.eventId===d.eventId).map(m=>m.id)}));}
 function profileGenerate(){setAudience("self");update(d=>startJob({...d,step:5,reached:Math.max(d.reached,5)},"profile"));}
 function saveProfile(){if(!getField(draft,"name").trim()){setNotice("请保留一个称呼，其他资料可以自愿补充。");return;}const next:Draft={...draft,profileConfirmed:true,step:returnTo||6,reached:Math.max(draft.reached,returnTo||6),fields:draft.fields.filter(f=>f.value.trim())};if(persist(next)){update(()=>next);setReturnTo(null);setNotice("你的资料已确认，并保存在本机。");}else setNotice("本机保存失败，编辑内容仍在。请重试或释放浏览器存储空间。");}
 function generateIdea(id:string){update(d=>startJob(d,"idea",id));}
 function eventChange(id:string|null){update(d=>({...changeEvent(d,id),step:d.step>=9?8:d.step}));}
 function matchStart(){if(!draft.eventId){setNotice("先选择一个示例活动，或暂时保留草稿。");go(8);return;}update(d=>startJob({...d,step:9,reached:Math.max(d.reached,9),matches:[]},"match"));}
 function confirmFinal(){if(!getField(draft,"name").trim()||!draft.ideas.length||!draft.ideas.every(validIdea)){setNotice("请保留称呼，以及至少一张有标题和具体方向的想法或探索草稿。");return;}let next:Draft={...draft,profileConfirmed:true,savedFinal:true,completed:false,fields:draft.fields.filter(f=>f.value.trim()),step:draft.eventId?9:10,reached:Math.max(draft.reached,draft.eventId?9:10),matches:[],job:null};if(next.eventId)next=startJob(next,"match");if(persist(next))update(()=>next);else setNotice("本机保存没有成功，先留在这里，请重试。");}
 function browse(){if(!draft.eventId){go(8);return;}update(d=>({...d,job:d.job?{...d.job,status:"cancelled"}:null,matches:MATCHES.filter(m=>m.eventId===d.eventId).map(m=>m.id),resultMode:"browse",step:10,reached:10}));}
 function retry(){const kind=draft.job?.kind;if(kind==="sources"){update(d=>startJob({...d,sources:d.sources.some(s=>s.sample||s.kind==="text"&&s.text?.trim())?d.sources:SAMPLE_SOURCES,settings:{...d.settings,sourceFailure:false}},"sources"));}else if(kind==="match"){update(d=>startJob({...d,settings:{...d.settings,matchOutcome:d.settings.matchOutcome==="failed"?"normal":d.settings.matchOutcome},step:9},"match"));}else if(kind)update(d=>startJob(d,kind,d.job?.target));}
 function navigate(step:number){if(step>draft.reached)return;if(step>=4&&!getField(draft,"name").trim()){go(3);return;}if(step>=6&&!draft.profileConfirmed){setNotice("资料有修改，先核对并确认这版画像。");go(5);return;}if(step>=7&&!draft.ideas.some(validIdea)){go(6);return;}if(step>=9&&!draft.savedFinal){go(8);return;}if(step===9&&draft.job?.kind==="match"&&draft.job.status==="succeeded"){go(10);return;}go(step);}
 function previous(){const step=draft.step===3&&draft.skippedSources?1:Math.max(1,draft.step-1);if(step===2){go(1);return;}go(step);}
 function finish(){if(!draft.savedFinal){go(1);return;}const next={...draft,completed:true};if(persist(next)){update(()=>next);setDialog("complete");}else setNotice("保存未成功，暂时没有结束体验，请重试。");}
 function saveExit(){if(persist(draft))setDialog("save");else setNotice("本机保存失败，已填写内容仍保留在当前页面，请暂时不要关闭。");}
 function openProfile(){setReturnTo(8);go(5);}
 const processing=(kind:Phase)=>draft.job?.kind===kind&&(draft.job.status==="running"||draft.job.status==="failed");
 const scene=([2].includes(draft.step)||draft.step===5&&processing("profile"))?"loading":[3,5].includes(draft.step)?"reader":[4,6,7].includes(draft.step)?"conversation":draft.step===8?"document":draft.step>=9?"discovery":"entry";
 const title=draft.step===10&&!draft.eventId?"先把故事留下，相遇慢慢来。":draft.step===10&&!draft.matches.length?"这次暂时没有合适的结果。":draft.step===10?"这些人，是你想遇见的吗？":HEADINGS[draft.step-1][0];
 let body:ReactNode=null;
 if(draft.step===1)body=<SourceStep draft={draft} update={update} onStart={sourceStart} onSkip={noSources} onDefer={deferOnboarding} notify={setNotice}/>;
 if(draft.step===2)body=processing("sources")?<Processing draft={draft} reduced={reduced} onSkip={skipAnimation} onRetry={retry} onManual={noSources}/>:<div className="guide-resume-processing"><p>材料还在，准备好后可以继续整理。</p><Button onClick={()=>sourceStart()}>继续整理资料</Button><button className="guide-text-link" onClick={noSources}>直接填写</button></div>;
 if(draft.step===3)body=<ReviewStep draft={draft} update={update} onNext={()=>go(4)} notify={setNotice}/>;
 if(draft.step===4)body=<PreferencesStep draft={draft} update={update} onFinish={profileGenerate} reduced={reduced}/>;
 if(draft.step===5)body=processing("profile")?<Processing draft={draft} reduced={reduced} onSkip={skipAnimation} onRetry={retry}/>:<ProfileStep draft={draft} update={update} audience={audience} setAudience={setAudience} onSave={saveProfile} reduced={reduced}/>;
 if(draft.step===6)body=<IdeasStep draft={draft} update={update} onNext={()=>go(7)} notify={setNotice}/>;
 if(draft.step===7)body=<IdeaWorkshop draft={draft} update={update} onGenerate={generateIdea} onNext={()=>go(8)} notify={setNotice} onSkip={skipAnimation} onRetry={retry}/>;
 if(draft.step===8)body=<FinalReview draft={draft} update={update} onProfileEdit={openProfile} onIdeaEdit={id=>{update(d=>({...d,activeIdea:id}));go(7);}} onConfirm={confirmFinal} onEventChange={eventChange} reduced={reduced}/>;
 if(draft.step===9)body=processing("match")?<Processing draft={draft} reduced={reduced} onSkip={skipAnimation} onRetry={retry} onManual={browse}/>:<div className="guide-resume-processing"><Compass size={28}/><p>准备好后，在当前示例活动内寻找。</p><Button onClick={matchStart}>开始寻找（演示）</Button><button className="guide-text-link" onClick={browse}>普通浏览本活动</button></div>;
 if(draft.step===10)body=<ResultsStep draft={draft} update={update} onRetry={matchStart} onBrowse={browse} onEdit={()=>go(8)} onFinish={finish} notify={setNotice} reduced={reduced}/>;
 return <ExperienceProvider value={{dark:isDark,reduced}}><div className={"guide guide-v2"+(reduced?" guide-reduced":"")} data-step={draft.step} data-scene={scene}>
  <link rel="stylesheet" href="/reference-kit.css"/>
  <div className="guide-ambient" aria-hidden="true">{reduced?<div className="guide-static-background"/>:<GridBackground size={56} speed={16} fade={80}><GradientFloor className="guide-floor" colors={["var(--primary)","var(--secondary)","var(--lime)"]} speed={8}><div className="guide-ambient-fill"/></GradientFloor></GridBackground>}</div>
  <header className="guide-header"><a className="guide-brand" href="/guide" aria-label="同频引导"><span className="guide-brand-symbol"><i/><i/><i/></span><span>同频<small>meet your people</small></span></a><span className="guide-header-context">你的故事，从这里开始</span><div className="guide-header-actions"><button className="guide-icon-button" aria-label={isDark?"切换浅色":"切换夜间"} onClick={()=>setTheme(isDark?"light":"dark")}>{isDark?<Sun size={18}/>:<Moon size={18}/>}</button><details className="guide-settings"><summary aria-label="体验设置"><Settings2 size={18}/></summary><div className="guide-settings-popover"><h2>体验设置</h2><label>页面主题<select aria-label="页面主题" value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">浅色</option><option value="dark">夜间</option><option value="system">跟随系统</option></select></label><label className="guide-settings-check"><input type="checkbox" checked={motionOff} onChange={e=>setMotionOff(e.target.checked)}/>减少动态效果</label>{systemReduced&&<small>系统的减少动态设置已生效。</small>}<hr/><p>下列设置只改变演示场景。</p><label>示例活动<select aria-label="演示活动上下文" value={draft.eventId||""} onChange={e=>eventChange(e.target.value||null)}><option value="">未加入活动</option>{EVENTS.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></label><label className="guide-settings-check"><input type="checkbox" checked={draft.settings.sourceFailure} onChange={e=>update(d=>({...d,settings:{...d.settings,sourceFailure:e.target.checked}}))}/>下一次资料整理演示失败</label><label>下一次寻找结果<select aria-label="推荐演示结果" value={draft.settings.matchOutcome} onChange={e=>update(d=>({...d,settings:{...d.settings,matchOutcome:e.target.value as Draft["settings"]["matchOutcome"]}}))}><option value="normal">正常结果</option><option value="empty">没有结果</option><option value="failed">推荐失败</option></select></label><a href="/references">查看 48 组组件参考 <ExternalLink size={13}/></a><button className="guide-text-link" onClick={()=>setDialog("restart")}><RefreshCw size={14}/>清空本机草稿，重新体验</button></div></details><button className="guide-save-exit" onClick={saveExit}><LogOut size={15}/><span>保存退出</span></button></div></header>
  <nav className="guide-chapters" aria-label="引导章节">{CHAPTERS.map((c,index)=><button key={c.name} disabled={draft.reached<c.start} aria-current={chapter===index?"step":undefined} onClick={()=>navigate(c.start)}><span className={"guide-chapter-dot"+(chapter>index?" is-done":"")}>{chapter>index?<Check size={12}/>:index+1}</span><span>{c.name}</span>{index<3&&<span className="guide-chapter-line"/>}</button>)}</nav>
  <main className={"guide-main"+([5,7,8,10].includes(draft.step)&&!processing("profile")?" guide-main-wide":"")}>
   {!ready?<div className="guide-restoring" role="status">正在恢复本机草稿…</div>:<>{draft.step===1&&<div className="flow-hero-character"><MascotAnchor mode="hero"/></div>}<div className="guide-intro"><span className="guide-step-caption">{STEPS[draft.step-1]}<i/>{draft.step} / 10</span><h1 ref={heading} tabIndex={-1}>{reduced?title:<TextReveal key={draft.step} text={title} by="char" as="span" stagger={14} duration={400}/>}</h1><p>{HEADINGS[draft.step-1][1]}</p></div>
   {recovery&&<div className="guide-inline-alert" role="alert">{recovery}<button aria-label="关闭草稿恢复提示" onClick={()=>setRecovery("")}><X size={14}/></button></div>}
   {saveStatus==="failed"&&<div className="guide-inline-alert" role="alert">本机草稿尚未保存成功，内容仍保留在本页。<button onClick={()=>persist(draft)}>重试保存</button></div>}
   <div key={draft.step} className="guide-stage-content flow-stage-content">{body}</div>
   {draft.step>1&&<div className="guide-back-row"><button className="guide-text-link" onClick={previous}><ArrowLeft size={14}/>上一步</button><span>{draft.step>=8?currentEvent?.label||"尚未加入活动":"按自己的节奏来，随时可以返回修改。"}</span></div>}
   <footer className="guide-footer"><span className={"guide-save-status "+saveStatus} role="status">{saveStatus==="saved"?<Check size={12}/>:saveStatus==="failed"?<X size={12}/>:<span className="guide-saving-dot"/>}{saveStatus==="saved"?"本机草稿已保存":saveStatus==="failed"?"本机保存失败":"正在保存到本机"}</span><span>交互原型 · AI、导入和推荐均为演示</span></footer></>}
  </main>
  {ready&&draft.step>=8&&<MascotAnchor mode="dock"/>}
  <TravellingMascot step={draft.step} ready={ready}/>
  {notice&&<div className="guide-toast" role="status"><Sparkles size={16}/><span>{notice}</span><button aria-label="关闭提示" onClick={()=>setNotice("")}><X size={15}/></button></div>}
  <dialog ref={modal} className="guide-dialog" aria-labelledby="guide-dialog-title" onCancel={()=>setDialog(null)} onClose={()=>setDialog(null)}><button className="guide-dialog-close" aria-label="关闭窗口" onClick={()=>setDialog(null)}><X size={18}/></button><span className="guide-dialog-icon">{dialog==="restart"?<RefreshCw size={26}/>:<Check size={28}/>}</span><h2 id="guide-dialog-title">{dialog==="save"?"先停在这里，也很好。":dialog==="restart"?"重新开始这次体验？":"你的故事，已经有了一个开始。"}</h2><p>{dialog==="save"?"草稿已保存在当前浏览器。下次打开，会从「"+STEPS[draft.step-1]+"」继续。":dialog==="restart"?"将清空这份本机画像、想法和演示关系记录，组件参考库不受影响。":"本次引导体验已完成，画像和想法保留在本机。正式应用的登录、AI 和社交服务尚未接入。"}</p><div className="guide-actions">{dialog==="restart"?<><Button variant="secondary" onClick={()=>setDialog(null)}>保留草稿</Button><Button onClick={()=>{reset();setReturnTo(null);setAudience("self");setDialog(null);}}>清空并重新开始</Button></>:<><Button onClick={()=>setDialog(null)}>{dialog==="save"?"继续引导":"再看看结果"}</Button><a className="guide-secondary-link" href="/references">返回组件参考 <ArrowRight size={14}/></a></>}</div></dialog>
 </div></ExperienceProvider>;
}
