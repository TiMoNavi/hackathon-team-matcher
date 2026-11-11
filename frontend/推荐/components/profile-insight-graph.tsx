"use client";
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { Code2, Compass, Users, Clock3, MessageCircle, Sparkles, ArrowUpRight } from 'lucide-react';
import { AgentGraph, type GraphNode } from '@/components/affect/agent-graph-clean';
import { useMotionPreference } from '@/components/motion-preference';
import type { ProfileDimension } from '@/lib/profile-analysis';
import type { Person } from '@/lib/people';

const icons = [Code2, Compass, Users, Clock3, MessageCircle];
export function ProfileInsightGraph({ person, dimensions, selected, onSelect, onAsk }: {
  person: Person; dimensions: ProfileDimension[]; selected: string | null;
  onSelect: (id: string | null) => void; onAsk: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: .25 });
  const { paused } = useMotionPreference();
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (paused || !visible || selected) return;
    const timer = setInterval(() => { if (!document.hidden) setBeat(n => n + 1); }, 3600);
    return () => clearInterval(timer);
  }, [paused, visible, selected]);
  const active = dimensions.find(d => d.id === selected) ?? dimensions[beat % dimensions.length];
  const nodes: GraphNode[] = [
    {id:'profile',name:person.name,kind:'agent',lead:true,icon:<Sparkles/>,detail:'合作线索',doing:'从已展示的资料，看看可以从哪里开始交流。'},
    ...dimensions.map((d,i) => {const Icon=icons[i];return {id:d.id,name:d.label,kind:'tool' as const,icon:<Icon/>,doing:d.evidence+'。'+d.suggestion};}),
  ];
  return <div className="profile-insight" ref={ref} data-beat={beat}>
    <AgentGraph className="profile-graph" title="把合作线索连起来" nodes={nodes}
      edges={dimensions.map(d => ['profile',d.id])} presentation paused={paused || !visible}
      calls={beat ? [{id:'illustration-'+beat,from:'profile',to:active.id,status:'ok',at:beat*3600}] : []}
      now={beat*3600} height={354} onSelect={node => onSelect(node && node.id !== 'profile' ? node.id : null)}/>
    <div className="insight-reading" data-dimension={active.id}>
      <span className="section-kicker"><Sparkles size={15}/>AI 合作线索 · 预写演示</span>
      <h3>{active.label}</h3><p className="insight-evidence">{active.evidence}</p>
      <div className="insight-suggestion"><span>可以从这里聊</span><p>{active.suggestion}</p></div>
      <p className="insight-confirm"><MessageCircle size={15}/><span>{active.confirm}</span></p>
      <button className="insight-ask" onClick={()=>onAsk('帮我和'+person.name+'聊聊'+active.label+'：'+active.confirm)}>帮我想个问法<ArrowUpRight size={16}/></button>
      <span className="insight-footnote">点图中的节点，查看资料依据与待确认项。</span>
    </div>
  </div>;
}
