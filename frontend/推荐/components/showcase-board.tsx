"use client";
import { useId } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Clock3, Code2, Headphones, Leaf, MapPin, MousePointer2, Sparkles, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NumberTicker } from '@/components/affect/number-ticker';
import { BlurCrossfade } from '@/components/effects/blur-crossfade';
import { hangingFor, showcaseFor, type ShowcaseItem } from '@/lib/showcase';
import type { Person } from '@/lib/people';

export function ProjectArt({ kind, compact = false }: { kind: ShowcaseItem['art']; compact?: boolean }) {
  const uid = useId().replace(/:/g, '');
  return <div className={'project-art art-' + kind + (compact ? ' is-compact' : '')} aria-hidden="true">
    {kind === 'route' && <><div className="map-grid" /><svg viewBox="0 0 440 180" preserveAspectRatio="xMidYMid slice"><path className="route-shadow" d="M22 150 C100 145 60 65 150 80 S265 165 300 85 S370 80 415 20"/><path className="route-line" d="M22 150 C100 145 60 65 150 80 S265 165 300 85 S370 80 415 20"/><circle cx="150" cy="80" r="7" className="map-point"/><circle cx="300" cy="85" r="7" className="map-point"/></svg><span className="map-label map-label-a"><MapPin size={12}/>找个安静的小店</span><span className="map-label map-label-b">沿着河边走走<Leaf size={12}/></span><span className="mini-cursor"><MousePointer2 size={17}/>Xiaoman</span></>}
    {kind === 'interface' && <div className="mini-browser"><div className="mini-browser-top"><i/><i/><i/><span>一个顺手的界面</span></div><div className="mini-browser-body"><span className="mini-avatar"/><div><b>今天，想去哪里？</b><span/><span/></div><div className="mini-widget"><Sparkles size={22}/><span>想到，就出发</span></div></div></div>}
    {kind === 'sound' && <><div className="sound-orbit"/><div className="sound-bars">{[22,48,76,40,94,130,84,108,56,93,66,34,52,20].map((h,i)=><i key={i} style={{height:h+'px',animationDelay:(i*.11)+'s'}}/>)}</div><span className="art-caption"><Headphones size={12}/>把一段日常，留在作品里</span></>}
    {kind === 'notes' && <><div className="idea-note note-one"><span>一个小念头</span><b>如果我们<br/>一起试试呢？</b><Star size={21}/></div><div className="idea-note note-two"><span>从这里开始</span><b>想法 → 原型</b><svg viewBox="0 0 140 55"><path d="M5 37Q30 2 60 27T128 20M111 10L128 20L112 33"/></svg></div><span className="paperclip"/></>}
    {kind === 'care' && <><div className="care-rings"><i/><i/><i/></div><div className="care-message"><span className="care-dot"/><div><b>今天也好好在一起</b><span>有空一起做点喜欢的事</span></div><span className="care-heart">♡</span></div></>}
    {kind === 'experiment' && <><svg className="experiment-orbits" viewBox="0 0 400 180"><defs><linearGradient id={uid}><stop stopColor="var(--primary)"/><stop offset="1" stopColor="var(--lime)"/></linearGradient></defs><ellipse cx="200" cy="90" rx="140" ry="54"/><ellipse cx="200" cy="90" rx="140" ry="54" transform="rotate(35 200 90)"/><ellipse cx="200" cy="90" rx="140" ry="54" transform="rotate(-35 200 90)"/><circle cx="200" cy="90" r="25" fill={'url(#'+uid+')'} /></svg><span className="experiment-label">想象力 + 一点代码</span></>}
  </div>;
}

export function HangingTags({ person, onOpen, paused }: { person: Person; paused: boolean; onOpen: (title: string, detail: string, trigger: HTMLButtonElement) => void }) {
  const icons = { place: MapPin, code: Code2, spark: Sparkles, clock: Clock3, leaf: Leaf };
  return <div className="hanging-garland" data-paused={paused}><svg viewBox="0 0 800 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 14 Q400 92 800 14"/>{[55,210,400,580,745].map((x,i)=><circle key={x} cx={x} cy={i===0||i===4?24:i===2?53:44} r="3" style={{animationDelay:i*.6+'s'}}/>)}</svg><div className="hanging-items">{hangingFor(person).map((tag,i)=>{const Icon=icons[tag.icon as keyof typeof icons];return <motion.button key={person.id+tag.text} className={'hanging-tag tag-'+i} initial={{opacity:0,y:-20,rotate:-12}} animate={{opacity:1,y:0,rotate:0}} transition={{type:'spring',stiffness:180,damping:13,delay:i*.09}} onClick={(e)=>onOpen(tag.text,tag.detail,e.currentTarget)}><span className="tag-thread"/><span className="tag-plaque"><Icon size={13}/>{tag.text}<i/></span></motion.button>;})}</div></div>;
}

const slots = [
  {left:'0%',top:92,width:'60%',height:300,rotate:-2.5,z:7,opacity:1},
  {left:'61%',top:130,width:'39%',height:260,rotate:3.5,z:6,opacity:1},
  {left:'4%',top:16,width:'30.5%',height:220,rotate:-6,z:3,opacity:1},
  {left:'35%',top:2,width:'30.5%',height:220,rotate:1.5,z:2,opacity:1},
  {left:'66%',top:28,width:'30.5%',height:210,rotate:7,z:1,opacity:1},
  {left:'48%',top:28,width:'30%',height:190,rotate:0,z:0,opacity:0},
];
export function ShowcaseBoard({ person, index, onSelect, onOpen, paused, reduced, compact=false, onReading }: { person: Person; index: number; onSelect: (index:number)=>void; onOpen: (item:ShowcaseItem,trigger:HTMLButtonElement)=>void; paused:boolean; reduced:boolean; compact?:boolean; onReading:(value:boolean)=>void }) {
  const items=showcaseFor(person);
  return <div className="showcase-board" data-paused={paused} data-index={index} data-person={person.id}>
    <div className="board-heading"><span><Sparkles size={14}/>TA 的世界，比一张简历丰富</span><span><NumberTicker value={index+1} locale="en-US" duration={400}/> / {items.length}</span></div>
    <div className="project-deck" onFocusCapture={()=>onReading(true)} onBlurCapture={(e)=>{if(!e.currentTarget.contains(e.relatedTarget as Node))onReading(false);}} aria-label="双排动态项目卡">
      <AnimatePresence initial={false}>{items.map((item,i)=>{const rank=(i-index+items.length)%items.length;const slot=slots[rank];return <motion.article key={person.id+item.id} className={'showcase-card rank-'+rank} data-rank={rank} data-item={item.id} aria-hidden={rank===5||undefined} inert={rank===5||undefined} layout={!reduced} style={{left:slot.left,top:slot.top*(compact?.83:1),width:slot.width,height:slot.height*(compact?.83:1),zIndex:slot.z}} initial={reduced?false:{opacity:0,x:-85,y:35,scale:.8,rotate:-8}} animate={{rotate:reduced?0:slot.rotate,opacity:slot.opacity,x:0,y:0,scale:rank===5?.9:1}} exit={{opacity:0,scale:.9,y:20}} transition={reduced?{duration:0}:{type:'spring',stiffness:145,damping:23,mass:.85}} onMouseEnter={()=>{if(rank<2)onReading(true);}} onMouseLeave={(e)=>onReading(e.currentTarget.closest(".project-deck")?.contains(document.activeElement)??false)}>
        <button className="project-label" onClick={()=>onSelect(i)} tabIndex={rank===5?-1:0} aria-label={'把'+item.kind+'切到前排'} aria-pressed={rank===0}><span className="project-label-dot"/>{item.kind}{rank>1?<ArrowUpRight size={13}/>:<span className="card-sequence">0{i+1}</span>}</button>
        <div className="project-surface" aria-hidden={rank>1||undefined} inert={rank>1||undefined}><ProjectArt kind={item.art} compact={rank===1}/><div className="project-copy"><p>{item.subtitle}</p><h3>{item.title}</h3><div className="project-card-bottom"><div>{item.tags.map(tag=><Badge variant="secondary" key={tag}>{tag}</Badge>)}</div><button aria-label={'展开项目：'+item.title} onClick={(e)=>onOpen(item,e.currentTarget)}><ArrowUpRight size={17}/></button></div></div></div>
      </motion.article>;})}</AnimatePresence>
    </div>
    <div className="deck-caption"><span className="deck-dots">{items.map((item,i)=><button key={item.id} aria-label={'展示'+item.kind} aria-pressed={i===index} onClick={()=>onSelect(i)}><i/></button>)}</span><BlurCrossfade id={index} duration={320} blur={4} morph="none"><span>{items[index].kind} · {items[index].tags.join(' / ')}</span></BlurCrossfade><span className="peek-hint">点后排标签，把它带到眼前<ArrowUpRight size={12}/></span></div>
  </div>;
}
