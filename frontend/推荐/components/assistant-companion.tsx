"use client";
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { FrostCloud } from '@/components/illustrations/frost-cloud';
import { TextReveal } from '@/components/affect/text-reveal';
import type { Person } from '@/lib/people';
export function AssistantCompanion({person,index,hidden,paused,onOpen}:{person:Person;index:number;hidden:boolean;paused:boolean;onOpen:()=>void}) {
  const remarks=[person.name+'想找能一起把原型做出来的搭档。你们可以先聊一个具体场景。',person.chapters[0][1].title+'，这可能是你们能接上的一块。',person.chapters[2][0].title+'。具体时段，值得再问问 TA。'];
  return <div className="assistant-companion" data-hidden={hidden} data-paused={paused}><AnimatePresence mode="wait"><motion.button key={person.id+index%3} className="companion-bubble" onClick={onOpen} initial={{opacity:0,y:14,scale:.9}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.96}} transition={{type:'spring',stiffness:230,damping:22}}><span className="bubble-eyebrow"><Sparkles size={12}/>同频的小观察<span>演示</span></span><TextReveal as="span" text={remarks[index%3]} by="char" stagger={12} duration={350}/><span className="bubble-action">展开聊聊<ArrowUpRight size={12}/></span></motion.button></AnimatePresence><button className="companion-character" onClick={onOpen} aria-label="和右下角 AI 助手聊聊"><FrostCloud background={false} paused={paused} followPointer={!paused} className="corner-cloud panel-cloud" label="同频小助手"/><span>我在这里</span></button></div>;
}
