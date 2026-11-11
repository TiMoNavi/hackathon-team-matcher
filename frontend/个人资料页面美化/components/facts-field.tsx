"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { ArrowUpRight, RotateCw, Sparkles } from 'lucide-react';
import { useMotionPreference } from '@/components/motion-preference';
import { heroPool, sparseIds, type ProfileEntry } from '@/lib/profile-data';

const durations = [12500,14500,13200,15400,13800,16000,14800,14200];
const phases = [.20,.38,.53,.29,.61,.44,.24,.57];
const indents = [0,48,16,68,4,38,12,52];
const widths = [78,69,92,82,67,86,94,76];
function subscribeVisibility(callback: () => void) { document.addEventListener('visibilitychange',callback); return () => document.removeEventListener('visibilitychange',callback); }

/** Signalry/Kit hero14 loop adapted to entry-based horizontal messages.
 * Clip reveals retain undistorted text; lane contents change only when retracted.
 * The backend's repeatable entries determine the pool, not a fixed card count.
 */
export function FactsField({ onOpen, dialogOpen, sparse = false, long = false }: { onOpen:(entry:ProfileEntry)=>void; dialogOpen:boolean; sparse?:boolean; long?:boolean }) {
  const { paused, reduced } = useMotionPreference();
  const visible = useSyncExternalStore(subscribeVisibility,()=>!document.hidden,()=>true);
  const [hovered,setHovered] = useState(false);
  const [focused,setFocused] = useState(false);
  const [inView,setInView] = useState(true);
  const [versions,setVersions] = useState(Array(8).fill(0) as number[]);
  const [batch,setBatch] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const playbacks = useRef<Animation[]>([]);
  const stopped = paused || hovered || focused || dialogOpen || !visible || !inView || sparse;
  const stopRef = useRef(stopped);
  const pool = sparse ? heroPool.filter(e=>sparseIds.has(e.id)) : heroPool;
  const laneCount = Math.min(8,pool.length);

  useLayoutEffect(()=>{
    stopRef.current = stopped;
    for(const animation of playbacks.current) {
      if(stopped) { const time=animation.currentTime; animation.pause(); if(time!==null)animation.currentTime=time; }
      else animation.play();
    }
  },[stopped]);
  useEffect(()=>{
    if(!root.current || reduced || sparse) return;
    const nodes=Array.from(root.current.querySelectorAll<HTMLElement>('.message-strip'));
    const animations=nodes.map((node,i)=>{
      const animation=node.animate([
        {clipPath:'inset(0 100% 0 0 round 14px)',offset:0,easing:'cubic-bezier(.22,.8,.2,1)'},
        {clipPath:'inset(0 0% 0 0 round 14px)',offset:.15},
        {clipPath:'inset(0 0% 0 0 round 14px)',offset:.76,easing:'cubic-bezier(.5,0,.75,.2)'},
        {clipPath:'inset(0 100% 0 0 round 14px)',offset:.92},
        {clipPath:'inset(0 100% 0 0 round 14px)',offset:1},
      ],{duration:durations[i],iterations:Infinity,fill:'both'});
      animation.currentTime=durations[i]*phases[i];
      if(stopRef.current){animation.pause();animation.currentTime=durations[i]*phases[i];}
      return animation;
    });
    playbacks.current=animations;
    const monitor=window.setInterval(()=>{
      const next=animations.map((a,i)=>{
        const time=Number(a.currentTime??0)/durations[i];
        const phase=time%1;
        nodes[i].dataset.phase=phase<.15?'growing':phase<.76?'holding':phase<.92?'retracting':'hidden';
        return Math.floor(time)+(phase>=.94?1:0);
      });
      setVersions(prev=>next.every((v,i)=>prev[i]===v)?prev:next);
    },80);
    return ()=>{window.clearInterval(monitor);animations.forEach(a=>a.cancel());playbacks.current=[];};
  },[reduced,sparse]);
  useEffect(()=>{
    if(!root.current)return;
    const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:.15});
    observer.observe(root.current);return ()=>observer.disconnect();
  },[]);

  return <div className="facts-wrap">
    <div ref={root} className="facts-field" data-testid="facts-field" data-paused={stopped} data-sparse={sparse} data-pool-size={pool.length}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}}>
      <div className="field-spine" aria-hidden="true" />
      {Array.from({length:laneCount},(_,i)=>{
        const choices=pool.filter((_,index)=>index%laneCount===i);
        const entry=choices[((versions[i]??0)+batch)%choices.length];
        return <div className="message-lane" key={i} style={{'--lane-indent':indents[i]+'px','--lane-width':widths[i]+'%'} as CSSProperties}>
          <span className="lane-connector" aria-hidden="true"><i /></span>
          <button className={'message-strip '+(entry.tone?'message-strip--'+entry.tone:'')} data-entry={entry.id} data-lane={i} data-field={entry.field} aria-label={entry.label+'：'+entry.short+'，查看条目'} onClick={()=>onOpen(entry)}>
            <span className="message-label">{entry.label}</span><span className="message-value">{long && entry.id==='project-roam'?'漫游地图 · 从地点收藏到路线规划的完整产品交互与前端原型':entry.short}</span><ArrowUpRight size={15} className="message-arrow" />
          </button>
        </div>;
      })}
      {sparse&&<div className="field-empty"><Sparkles size={20}/><span>资料还在慢慢补充。<br/>先从这几个片段认识她。</span></div>}
    </div>
    <div className="field-caption"><span><i />{reduced?'静态阅读':paused?'已暂停':hovered||focused?'停在这里，慢慢看':'资料在生长，点开一个片段'}<small>{pool.length} 条资料片段</small></span><button onClick={()=>setBatch(n=>n+1)} className="shuffle-facts"><RotateCw size={14}/>换一组</button></div>
  </div>;
}
