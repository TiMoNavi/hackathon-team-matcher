"use client";
import {useEffect,useRef,useState} from "react";
import {AnimatePresence,motion} from "motion/react";
import {ArrowRight,Layers,Pause,Play,Sparkles} from "lucide-react";
import type {Match} from "@/lib/onboarding/model";
import {useExperience} from "./experience";

// A vertical reading sequence composed from the existing Motion runtime.
// The source data is never summarized, truncated or changed by the animation.
export function CandidateStory({person}:{person:Match}) {
 const {reduced}=useExperience();
 const [group,setGroup]=useState(0),[paused,setPaused]=useState(false),[all,setAll]=useState(false);
 const [hover,setHover]=useState(false),[focus,setFocus]=useState(false),[visible,setVisible]=useState(false),[hidden,setHidden]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const groups=[
  [{label:person.kind==="person"?"关于我":"这个想法",text:person.description},{label:"在意的方向",text:person.tags.join(" · ")},{label:"可以从这里认识彼此",text:person.reason}],
  [{label:"想和你聊的问题",text:person.question},{label:"愿意带来什么",text:person.contribution}]
 ];
 const showAll=all||reduced;
 const stopped=paused||hover||focus||showAll||hidden||!visible;
 const duration=Math.max(9000,Math.min(30000,groups[group].reduce((n,row)=>n+row.text.length,0)*85));
 useEffect(()=>{const node=root.current;if(!node)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.25});observer.observe(node);const sync=()=>setHidden(document.hidden);sync();document.addEventListener("visibilitychange",sync);return()=>{observer.disconnect();document.removeEventListener("visibilitychange",sync);};},[]);
 useEffect(()=>{if(stopped)return;const timer=setTimeout(()=>setGroup(current=>(current+1)%groups.length),duration);return()=>clearTimeout(timer);},[stopped,group,duration,person.id]);
 const rows=showAll?groups.flat():groups[group];
 return <div ref={root} className={"candidate-story"+(showAll?" is-all":"")} data-person={person.id} data-cycle={group} data-paused={stopped} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocus(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setFocus(false);}}>
  <header className="story-heading" id="candidate-story-heading" tabIndex={-1}><span><Sparkles size={14}/>从这些细节，认识 {person.name}</span><p>{person.kind==="person"?"本活动人物示例":"本活动想法示例"}</p></header>
  <div className="story-controls"><div className="story-chapters" aria-label="介绍章节">{["先认识一下","聊聊合作"].map((label,i)=><button key={label} aria-pressed={!showAll&&group===i} onClick={()=>{setAll(false);setGroup(i);}} disabled={reduced}>{label}</button>)}</div><div className="story-playback">{!showAll&&<button aria-label={paused?"继续轮换介绍":"暂停轮换介绍"} onClick={()=>setPaused(v=>!v)}>{paused?<Play size={14}/>:<Pause size={14}/>}<span>{paused?"继续":"暂停"}</span></button>}<button aria-pressed={showAll} onClick={()=>setAll(v=>!v)} disabled={reduced}><Layers size={14}/>{showAll?"分段浏览":"展开全部"}</button></div></div>
  <div className="story-stream" aria-label={person.name+"的介绍"}>
   <AnimatePresence mode="wait" initial={false}><motion.div key={showAll?"all":group} className="story-group" initial={reduced?false:{opacity:0}} animate={{opacity:1}} exit={{opacity:0,transition:{duration:reduced?0:.16}}}>
    {rows.map((row,i)=><motion.section className="story-row" key={row.label} initial={reduced?false:{opacity:0,x:-36,y:10}} animate={{opacity:1,x:0,y:0}} transition={{duration:reduced?0:.52,delay:reduced?0:i*.14,ease:[.22,1,.36,1]}}><span className="story-node" aria-hidden="true"/><h3>{row.label}</h3><p>{row.text}</p></motion.section>)}
   </motion.div></AnimatePresence>
  </div>
  <div className="story-progress"><span>{showAll?"完整介绍 · 静态阅读":paused?"已暂停，慢慢看":hover||focus?"阅读中，暂不轮换":"介绍会自动轮换，也可以暂停"}</span>{!showAll&&<button onClick={()=>setGroup(v=>(v+1)%groups.length)} aria-label="下一组介绍">{group+1} / {groups.length}<ArrowRight size={14}/></button>}</div>
 </div>;
}
