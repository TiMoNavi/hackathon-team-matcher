"use client";
import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {ArrowUp,Check,Cloud,ListChecks,Sparkles} from "lucide-react";
import {GlowCloud} from "../reference-originals/glow-cloud";
import {TextArea} from "../affectui/text-area-clean";
import {ThinkingLoader} from "../affectui/thinking-loader-clean";
import {AIAnswer} from "../affectui/ai-answer-clean";
import {TextReveal} from "../reference-originals/text-reveal";
import {DocumentText} from "./document-text";

const Experience = createContext({dark:false,reduced:false});
export const ExperienceProvider = Experience.Provider;
export const useExperience = () => useContext(Experience);

export function MascotAnchor({mode="avatar"}:{mode?:"hero"|"reader"|"avatar"|"loading"|"dock"}) {
 return <span className={"flow-mascot-anchor flow-anchor-"+mode} data-mascot-anchor={mode} aria-hidden="true"/>;
}

// One persistent character travels between real layout anchors, including message avatars.
export function TravellingMascot({step,ready}:{step:number;ready:boolean}) {
 const {dark,reduced}=useExperience();
 const layer=useRef<HTMLDivElement>(null);
 const[host,setHost]=useState<HTMLDivElement|null>(null);
 const previousAnchor=useRef<HTMLElement|null>(null),lastBox=useRef<{x:number;y:number;width:number}|null>(null);
 useLayoutEffect(()=>{const node=document.createElement("div");node.className="flow-travelling-mascot";node.setAttribute("aria-hidden","true");setHost(node);return()=>node.remove();},[]);
 useLayoutEffect(()=>{
  if(!ready||!host)return;
  let target:HTMLElement|null=null,animation:Animation|null=null,raf=0,disposed=false;
  const boxOf=(el:Element)=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};};
  const settle=()=>{
   animation?.cancel();animation=null;if(!target?.isConnected)return;
   if(host.parentElement!==target)target.appendChild(host);
   host.style.cssText="position:absolute;inset:0;width:100%;height:100%;transform:none;transform-origin:0 0;visibility:visible";
   lastBox.current=boxOf(target);
  };
  const scan=(layout=false)=>{
   if(disposed)return;
   const anchor=Array.from(document.querySelectorAll<HTMLElement>(".guide [data-mascot-anchor]")).filter(el=>el.getBoundingClientRect().width>0).at(-1);
   if(!anchor)return;
   const changed=anchor!==previousAnchor.current,previous=lastBox.current,next=boxOf(anchor);
   target=anchor;previousAnchor.current=anchor;
   host.dataset.position=anchor.dataset.mascotAnchor||"hero";
   if(changed&&previous&&!layout&&!reduced&&layer.current){
    animation?.cancel();layer.current.appendChild(host);
    host.style.cssText="position:absolute;left:0;top:0;width:"+next.width+"px;height:"+next.width+"px;transform-origin:0 0;transform:translate3d("+next.x+"px,"+next.y+"px,0)";
    animation=host.animate([{transform:"translate3d("+previous.x+"px,"+previous.y+"px,0) scale("+previous.width/next.width+")"},{transform:"translate3d("+next.x+"px,"+next.y+"px,0) scale(1)"}],{duration:580,easing:"cubic-bezier(.22,1,.36,1)"});
    animation.onfinish=settle;lastBox.current=next;
   }else if(!animation||layout||!previous||Math.abs(next.x-previous.x)>.5||Math.abs(next.y-previous.y)>.5||Math.abs(next.width-previous.width)>.5)settle();
  };
  const schedule=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;scan();});};
  scan();
  const root=document.querySelector(".guide-main"),observer=new MutationObserver(schedule),resize=new ResizeObserver(()=>scan());
  if(root){observer.observe(root,{childList:true,subtree:true});resize.observe(root);}
  const sync=()=>{cancelAnimationFrame(raf);raf=0;scan(true);};
  window.addEventListener("resize",sync);window.addEventListener("scroll",sync,true);
  window.visualViewport?.addEventListener("resize",sync);window.visualViewport?.addEventListener("scroll",sync);
  return()=>{disposed=true;if(host.isConnected)lastBox.current=boxOf(host);animation?.cancel();observer.disconnect();resize.disconnect();cancelAnimationFrame(raf);window.removeEventListener("resize",sync);window.removeEventListener("scroll",sync,true);window.visualViewport?.removeEventListener("resize",sync);window.visualViewport?.removeEventListener("scroll",sync);};
 },[step,ready,reduced,host]);
 useLayoutEffect(()=>{if(host)host.dataset.tone=dark?"orange":"violet";},[host,dark]);
 if(!ready)return null;
 return <><div ref={layer} className="flow-mascot-layer" aria-hidden="true"/>{host&&createPortal(reduced?<div className="flow-static-cloud"><Cloud/><span>••</span></div>:<GlowCloud color={dark?"orange":"blue"} background={false} className="flow-cloud" label={dark?"橙色的小同引导助手":"紫色的小同引导助手"}/>,host)}</>;
}

export function scrollConversationToLatest(end:HTMLElement|null){const thread=end?.closest<HTMLElement>(".flow-thread");const latest=thread?.querySelectorAll<HTMLElement>(".flow-assistant-message");const target=latest?.item((latest?.length||1)-1);if(thread&&target)thread.scrollTo({top:thread.scrollTop+target.getBoundingClientRect().top-thread.getBoundingClientRect().top-12,behavior:"instant"});}

export function ReaderCompanion({title,children}:{title:string;children:ReactNode}) {
 return <aside className="flow-reader-companion"><MascotAnchor mode="reader"/><span className="flow-companion-name">小同在这里</span><h2>{title}</h2><div>{children}</div><span className="flow-companion-foot"><Sparkles size={14}/>一起把你的故事讲完整</span></aside>;
}
export function AssistantMessage({children,active=false,thinking=false,className=""}:{children?:ReactNode;active?:boolean;thinking?:boolean;className?:string}) {
 return <article className={"flow-assistant-message "+className}>
  <div className="flow-message-avatar">{active?<MascotAnchor/>:<Sparkles size={19}/>}</div>
  <div className="flow-message-content"><div className="flow-message-byline">小同<span>引导助手</span></div>{thinking?<ThinkingLoader variant="plain" phases={["正在理解你提供的线索","想好一个更贴近你的问题"]} interval={650}/>:children}</div>
 </article>;
}
export function UserMessage({children}:{children:ReactNode}) {return <article className="flow-user-message"><span>你</span><div>{children}</div></article>;}
export function Answer({text,animate=true}:{text:string;animate?:boolean}) {const{reduced}=useExperience();return <AIAnswer className="flow-answer" sources={[]} answer={text} animate={animate&&!reduced} speed={55}/>;}
export function QuestionText({text}:{text:string}){const{reduced}=useExperience();return reduced?<p className="flow-question-text">{text}</p>:<TextReveal className="flow-question-text" text={text} by="char" stagger={12} duration={400}/>;}
export function useThinking(key:string,delay=850){const{reduced}=useExperience();const[readyKey,setReadyKey]=useState<string|null>(null);useEffect(()=>{const timer=setTimeout(()=>setReadyKey(key),reduced?0:delay);return()=>clearTimeout(timer);},[key,reduced,delay]);return readyKey!==key;}


export function PlanMode({items,completed=0}:{items:string[];completed?:number}){
 return <details className="flow-plan-mode"><summary><ListChecks size={15}/>Plan 模式<span>{Math.min(completed,items.length)}/{items.length}</span></summary><div><b>我们只聊这些</b>{items.map((item,index)=><p key={item}>{index<completed?<Check size={13}/>:<span className="flow-plan-dot"/>}{item}</p>)}<small>不确定的可以跳过，之后仍能修改。</small></div></details>;
}
export function Composer({id,value,onChange,onSend,label="发送回答",placeholder="用你自己的话说……",disabled=false,tools,footnote="Enter 发送 · Shift + Enter 换行",children}:{id:string;value:string;onChange:(value:string)=>void;onSend:()=>void;label?:string;placeholder?:string;disabled?:boolean;tools?:ReactNode;footnote?:string;children?:ReactNode}){
 return <div className="flow-composer-wrap"><form className="flow-composer" onSubmit={e=>{e.preventDefault();if(!disabled&&value.trim())onSend();}}>
  <TextArea id={id} aria-label={label} className="flow-composer-text" minRows={2} maxRows={8} maxLength={20000} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!disabled&&value.trim())onSend();}}}/>
  <div className="flow-composer-toolbar"><div>{tools}</div><button type="submit" className="flow-send" aria-label={label} disabled={disabled||!value.trim()}><ArrowUp size={21}/></button></div>
 </form><div className="flow-composer-caption"><span>{footnote}</span>{children}</div></div>;
}
export function LongText({id,label,value,onChange,placeholder,minRows=3}:{id:string;label:string;value:string;onChange:(value:string)=>void;placeholder?:string;minRows?:number}){
 return <DocumentText id={id} label={label} value={value} onChange={onChange} placeholder={placeholder} minRows={minRows}/>;
}
