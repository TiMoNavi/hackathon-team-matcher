"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {AnimatePresence,animate,motion,useMotionValue,useTransform,useIsPresent} from "motion/react";
import {ArrowLeft,ArrowRight,MoveHorizontal,Users} from "lucide-react";
import type {Match} from "@/lib/onboarding/model";
import {Card,CardContent} from "./kit-card";
import {useExperience} from "./experience";

const photos:Record<string,string>={"demo-lin":"lin","demo-chen":"chen","demo-open-luo":"luo","demo-idea":"idea"};
export const candidatePhoto=(match:Match)=>"/guide/photos/"+(photos[match.id]||"idea")+".webp";

function PhotoCard({person,onRead,onSwipe}:{person:Match;onRead:()=>void;onSwipe:(direction:number)=>void}){
 const {reduced}=useExperience();const[coarse,setCoarse]=useState(false);const present=useIsPresent();
 const x=useMotionValue(0),rotation=useTransform(x,[-250,250],[-14,14]);
 const hint=useTransform(x,[-120,-25,25,120],[1,0,0,1]);const dragged=useRef(false);
 useEffect(()=>{const media=matchMedia('(pointer:coarse)');const sync=()=>setCoarse(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 return <motion.article aria-hidden={!present} inert={!present} className="deck-photo-motion" data-candidate-id={person.id} data-touch-swipe={coarse} style={{x,rotate:reduced?0:rotation}} drag={coarse?"x":false} dragConstraints={{left:0,right:0}} dragElastic={.7} dragMomentum={false} onPointerDown={()=>{dragged.current=false;}} onDragStart={()=>{dragged.current=true;}} onDragEnd={(_,info)=>{if(Math.abs(info.offset.x)>80||Math.abs(info.velocity.x)>650)onSwipe(info.offset.x<0?1:-1);animate(x,0,{duration:reduced?0:.25});}} initial={reduced?false:{opacity:0,scale:.97,x:24}} animate={{opacity:1,scale:1,x:0}} exit={{opacity:0,scale:.96,transition:{duration:reduced?0:.16}}} transition={{duration:reduced?0:.4,ease:[.22,1,.36,1]}}>
  <Card className="deck-photo-card" data-component-source="shadcnuikit/card3"><CardContent className="deck-photo-content">
   <img src={candidatePhoto(person)} alt={person.kind==="person"?"人物示意照片，与虚构资料无身份关联":"想法的示意配图"} draggable={false}/>
   <div className="deck-photo-shade"/><span className="deck-photo-label">{person.kind==="person"?"人物示例 · 照片仅作配图":"想法示例"}</span>
   {coarse&&<motion.span className="deck-swipe-hint" style={{opacity:hint}}><MoveHorizontal size={21}/>切换介绍</motion.span>}
   <button className="deck-photo-open" onClick={()=>{if(!dragged.current)onRead();}} aria-label={"阅读 "+person.name+" 的介绍"}><span className="deck-photo-role">{person.role}</span><h2>{person.name}</h2><span className="deck-photo-tags">{person.tags.map(tag=><span key={tag}>{tag}</span>)}</span><span className="deck-photo-more">阅读介绍 <ArrowRight size={17}/></span></button>
  </CardContent></Card>
 </motion.article>;
}

// Clicks are primary. Touch swipes remain an optional shortcut.
export function CandidateDeck({list,active,onSelect,children}:{list:Match[];active:Match;onSelect:(m:Match)=>void;children:ReactNode}){
 const{reduced}=useExperience();const index=list.indexOf(active),behind=list.slice(index+1,index+3);
 function advance(direction:number){const person=list[index+direction];if(person)onSelect(person);}
 function read(){const node=document.getElementById('candidate-story-heading');node?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});node?.focus({preventScroll:true});}
 return <div className="discovery-stage discovery-lines">
  <div className="deck-stage-heading"><span><Users size={16}/>{index+1} / {list.length} 张推荐</span><span>点击切换，慢慢认识</span></div>
  <div className="deck-canvas">
   <aside className="deck-column" aria-label="推荐照片">
    <div className="deck-stack">{behind.map((person,i)=><div key={person.id} className="deck-behind" style={{transform:'translate('+(i+1)*9+'px,'+(i+1)*9+'px) rotate('+(i%2?4:-3)+'deg) scale('+(1-(i+1)*.035)+')',zIndex:2-i}} aria-hidden="true"><img src={candidatePhoto(person)} alt="" draggable={false}/></div>)}<AnimatePresence initial={false} mode="popLayout"><PhotoCard key={active.id} person={active} onRead={read} onSwipe={advance}/></AnimatePresence></div>
    <div className="deck-click-controls"><button disabled={index===0} onClick={()=>advance(-1)}><ArrowLeft size={17}/>上一张</button><span aria-live="polite">{index+1}<small> / {list.length}</small></span><button disabled={index===list.length-1} onClick={()=>advance(1)}>下一张<ArrowRight size={17}/></button></div>
    <nav className="deck-thumbnails" aria-label="直接选择推荐对象">{list.map(person=><button key={person.id} aria-label={"查看 "+person.name} aria-current={person.id===active.id?'true':undefined} onClick={()=>onSelect(person)}><img src={candidatePhoto(person)} alt=""/><span>{person.name}</span></button>)}</nav>
   </aside>
   <motion.section key={active.id} className="deck-detail" aria-label="当前推荐详情" initial={reduced?false:{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?0:.25}}>{children}</motion.section>
  </div>
 </div>;
}
