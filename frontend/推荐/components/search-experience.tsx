"use client";
import { motion } from 'motion/react';
import { Check, FileText, ScanSearch, Sparkles, Users, X } from 'lucide-react';
import { ThinkingLoader } from '@/components/affect/thinking-loader-clean';
import { Skeleton, ShimmerText } from '@/components/affect/shimmer-loader';
import { NumberTicker } from '@/components/affect/number-ticker';
import { FrostCloud } from '@/components/illustrations/frost-cloud';
import { Button } from '@/components/ui/button';
export const searchPhases=['确认当前活动','读取演示资料','寻找合作线索','整理推荐理由'];
export function SearchExperience({phase,reduced,onCancel}:{phase:number;reduced:boolean;onCancel:()=>void}) {
  const icons=[Users,FileText,ScanSearch,Sparkles];
  return <motion.div className="search-experience" role="status" aria-label="AI 搜索过程演示" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,filter:reduced?'none':'blur(8px)',scale:reduced?1:1.025}} transition={{duration:reduced?0:.5}}><div className="search-orbit" aria-hidden="true"><i/><i/><i/><FrostCloud background={false} paused={reduced} followPointer={false} className="search-cloud panel-cloud"/></div><span className="simulation-chip">搜索过程演示</span><h2><ShimmerText>AI 正在寻找同频的人</ShimmerText></h2><p>从这个活动里的作品、兴趣和协作节奏，寻找可以接上的一块。</p><ThinkingLoader phases={searchPhases} phase={Math.min(phase,3)} done={phase===4} doneLabel="准备好认识新伙伴了" variant="plain"/><div className="search-progress"><div className="search-progress-label"><span>演示流程进度</span><span><NumberTicker value={phase} locale="zh-CN" duration={300}/> / 4</span></div><div className="search-progress-track" role="progressbar" aria-label="演示流程进度" aria-valuemin={0} aria-valuemax={4} aria-valuenow={phase}><motion.span animate={{scaleX:phase/4}} transition={{duration:reduced?0:.6}}/></div><div className="search-steps">{searchPhases.map((label,i)=>{const Icon=icons[i];return <div key={label} data-state={phase>i?'done':phase===i?'active':'waiting'}><span>{phase>i?<Check size={14}/>:<Icon size={14}/>}</span><small>{label}</small></div>;})}</div></div><div className="search-skeletons" aria-hidden="true">{[0,1,2].map(i=><div key={i}><Skeleton circle width={30}/><span><Skeleton width="85%" height={8}/><Skeleton width="55%" height={6}/></span></div>)}</div><Button variant="ghost" onClick={onCancel} className="cancel-search"><X size={13}/>跳过演示，直接查看</Button></motion.div>;
}
