'use client';
// Adapted from Kit event-calendar1 AgendaView: grouped days, event rows, selection.
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { type ScheduleItem } from '@/lib/event-data';
export function AgendaView({day,events,onEventSelect,saved=[]}:{day:number;events:ScheduleItem[];onEventSelect:(event:ScheduleItem)=>void;saved?:string[]}){
 const days=[{day,events:events.filter(e=>e.day===day)}].filter(d=>d.events.length);
 if(!days.length)return <div className="empty-state"><CalendarDays/><h3>日程还在准备中</h3><p>安排发布后，会在这里与你见面。</p></div>;
 return <div className="agenda-view mx-auto flex w-full flex-col gap-8">
 {days.map(({day,events:dayEvents})=><section key={day} className="flex flex-col gap-3"><div className="agenda-date flex items-center gap-3"><span>11 月 {day} 日 · {day===14?'星期六':'星期日'}</span><Separator className="flex-1"/><span className="agenda-timezone">北京时间</span></div><div className="agenda-items">{dayEvents.map(item=><button key={item.id} className={'agenda-item '+(item.id==='s4'?'agenda-featured':'')} onClick={()=>onEventSelect(item)} data-testid={'schedule-'+item.id}><span className="agenda-time"><strong>{item.time}</strong><span>{item.end}</span></span><span className="agenda-track"><i/></span><span className="agenda-event"><span className="agenda-event-heading"><strong>{item.title}</strong>{saved.includes(item.id)&&<span className="saved-tag">已标记参加</span>}</span><span className="agenda-event-meta"><MapPin size={13}/>{item.location}<span className="meta-dot">·</span>{item.type}</span></span><ChevronRight size={18}/></button>)}</div></section>)}
 </div>
}
