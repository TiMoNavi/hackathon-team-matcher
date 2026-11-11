"use client";
import { useState } from "react";

import { ArrowUpRight, Bookmark, Check, Compass, MapPin, Sparkles, CalendarDays, Coffee, Leaf, Navigation, Lightbulb, PenTool } from "lucide-react";
import { activities, ideas } from "@/lib/profile-data";
export type Detail = { eyebrow: string; title: string; body: string; tags?: string[] };

export function IdeaArtwork({ type }: { type: string }) {
  if (type === "roam") return <div className="idea-art map-art" aria-hidden="true"><div className="map-streets" /><div className="map-park park-one" /><div className="map-park park-two" /><div className="map-water" /><svg className="map-route" viewBox="0 0 600 270"><path d="M100 200 C130 195 155 195 175 170 S190 120 240 118 S330 140 370 100 S405 75 465 64" /></svg><span className="map-pin pin-one"><Coffee size={16} /></span><span className="map-pin pin-two"><Leaf size={15} /></span><span className="map-pin pin-three"><MapPin size={17} /></span><span className="map-note"><Navigation size={15} />下个转角，有点期待。</span><span className="map-brand">roam<span>漫游地图</span></span><span className="map-direction">N <ArrowUpRight size={17} /></span></div>;
  return <div className="idea-art spark-art" aria-hidden="true"><div className="spark-halo" /><span className="note-card note-back"><PenTool size={15} /><span>一个还没成形的想法</span><i /><i /></span><span className="note-card note-front"><Lightbulb size={22} /><strong>刚才那个想法，<br />我记住了。</strong><span className="note-foot">留住每一次灵光一闪<ArrowUpRight size={14} /></span></span><Sparkles className="note-spark" size={26} strokeWidth={1.3} /><span className="spark-word">a little spark.</span></div>;
}

export function ProfileStories({open,sparse,long}:{open:(detail:Detail)=>void;sparse:boolean;long:boolean}){
 const [saved,setSaved]=useState<string[]>([]);
 const [filter,setFilter]=useState<'ongoing'|'past'>('ongoing');
 const events=sparse?[]:activities.filter(e=>e.status===filter);
 return <>
  <section id="ideas" className="content-section ideas-section" aria-labelledby="ideas-title"><div className="section-heading-row"><div><span className="eyebrow"><span>06</span> IDEAS IN THE MAKING</span><h2 id="ideas-title">想法，<span className="soft-word">正在发生。</span></h2></div><span className="section-aside">当前活动里，发起与参与的想法</span></div>
   {sparse?<div className="empty-content"><Lightbulb size={26}/><p>暂时没有对你可见的想法。</p></div>:<div className="ideas-grid">{ideas.map((idea,index)=><article className={'idea-card idea-card-'+idea.accent} key={idea.id}><div className="idea-cover"><IdeaArtwork type={idea.accent}/><button className={'save-idea '+(saved.includes(idea.id)?'is-saved':'')} aria-label={(saved.includes(idea.id)?'取消收藏':'收藏')+idea.name} aria-pressed={saved.includes(idea.id)} onClick={()=>setSaved(current=>current.includes(idea.id)?current.filter(id=>id!==idea.id):[...current,idea.id])}>{saved.includes(idea.id)?<Check size={18}/>:<Bookmark size={18}/>}</button><span className="idea-art-label">{idea.category}</span></div><div className="idea-body"><div className="idea-meta"><span>{index===0?'发起的想法':'参与的想法'}</span><span><i/>{index===0?'寻找共创':'讨论中'}</span></div><h3>{long&&index===0?'漫游地图 · 每一个值得出发的城市角落':idea.name}</h3><p>{idea.description}</p><div className="idea-bottom"><span className="idea-event">{idea.event}</span><button className="round-link" aria-label={'展开想法：'+idea.name} onClick={()=>open({eyebrow:'想法 · '+idea.event,title:idea.name,body:idea.detail,tags:idea.tags})}><ArrowUpRight size={21}/></button></div></div></article>)}</div>}
   <p className="section-footnote"><span>只展示对观看者可见的想法关系</span><span role="status">{saved.length?'已在本页收藏 '+saved.length+' 个想法':''}</span></p>
  </section>
  <section id="activities" className="content-section activities-section" aria-labelledby="activities-title"><div className="section-heading-row"><div><span className="eyebrow"><span>07</span> PEOPLE, PLACES & MOMENTS</span><h2 id="activities-title">和不同的人，<span className="soft-word">一起在场。</span></h2></div><div className="event-filters" role="group" aria-label="筛选活动"><button aria-pressed={filter==='ongoing'} onClick={()=>setFilter('ongoing')}>正在参加</button><button aria-pressed={filter==='past'} onClick={()=>setFilter('past')}>过去参加<span>布局预览</span></button></div></div>
   <div className="activity-timeline">{events.length?events.map(event=><article className="activity-record" key={event.id}><div className="activity-date"><span>{event.shortDate.split(' ')[0]}</span><strong>{event.shortDate.split(' ')[1]}</strong></div><div className="activity-dot"/><div className="activity-main"><div className="activity-meta"><span className={event.status==='ongoing'?'event-live':'event-finished'}>{event.status==='ongoing'?<><i/>正在参加</>:<><Check size={13}/>历史示例</>}</span><span>{event.role}</span></div><h3>{event.title}</h3><div className="activity-details"><span><CalendarDays size={14}/>{event.date}</span><span><MapPin size={14}/>{event.place}</span></div></div><button className="round-link" aria-label={'查看活动：'+event.title} onClick={()=>open({eyebrow:event.status==='ongoing'?'当前活动':'历史布局预览',title:event.title,body:event.detail,tags:[event.place,event.role]})}><ArrowUpRight size={21}/></button></article>):<div className="empty-content"><Compass size={26}/><p>暂时没有对你可见的活动。</p></div>}</div>
   {filter==='past'&&<p className="section-footnote">历史活动为独立布局示例；当前关系接口仅覆盖当前活动范围。</p>}
  </section>
 </>;
}

export function ActivityHistory({open,sparse}:{open:(detail:Detail)=>void;sparse:boolean}){
 const [filter,setFilter]=useState<'ongoing'|'past'>('ongoing');
 const events=sparse?[]:activities.filter(e=>e.status===filter);
 return (
  <section id="activities" className="activity-history activities-section" aria-labelledby="activities-title"><div className="section-heading-row"><div><span className="eyebrow">ACTIVITIES</span><h3 id="activities-title">参与的活动</h3></div><div className="event-filters" role="group" aria-label="筛选活动"><button aria-pressed={filter==='ongoing'} onClick={()=>setFilter('ongoing')}>正在参加</button><button aria-pressed={filter==='past'} onClick={()=>setFilter('past')}>过去参加<span>布局预览</span></button></div></div>
   <div className="activity-timeline">{events.length?events.map(event=><article className="activity-record" key={event.id}><div className="activity-date"><span>{event.shortDate.split(' ')[0]}</span><strong>{event.shortDate.split(' ')[1]}</strong></div><div className="activity-dot"/><div className="activity-main"><div className="activity-meta"><span className={event.status==='ongoing'?'event-live':'event-finished'}>{event.status==='ongoing'?<><i/>正在参加</>:<><Check size={13}/>历史示例</>}</span><span>{event.role}</span></div><h3>{event.title}</h3><div className="activity-details"><span><CalendarDays size={14}/>{event.date}</span><span><MapPin size={14}/>{event.place}</span></div></div><button className="round-link" aria-label={'查看活动：'+event.title} onClick={()=>open({eyebrow:event.status==='ongoing'?'当前活动':'历史布局预览',title:event.title,body:event.detail,tags:[event.place,event.role]})}><ArrowUpRight size={21}/></button></article>):<div className="empty-content"><Compass size={26}/><p>暂时没有对你可见的活动。</p></div>}</div>
   {filter==='past'&&<p className="section-footnote">历史活动为独立布局示例；当前关系接口仅覆盖当前活动范围。</p>}
  </section>
);
}
