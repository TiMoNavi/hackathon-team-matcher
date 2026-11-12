"use client";
// Shadcn UI Kit blog-card1 composed with the existing local illustrations.
import { useState } from 'react';
import { ArrowUpRight, Bookmark, Check } from 'lucide-react';
import { Card,CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar,AvatarFallback,AvatarImage } from '@/components/ui/avatar';
import { Tabs,TabsContent,TabsList,TabsTrigger } from '@/components/ui/tabs';
import { IdeaArtwork,ActivityHistory } from '@/components/profile-stories';
import { ideas,toDetail,type Detail,type ProfileEntry } from '@/lib/profile-data';
export function ProfileWork({entries,sparse,long,noPhoto,open}:{entries:ProfileEntry[];sparse:boolean;long:boolean;noPhoto:boolean;open:(detail:Detail)=>void}){
 const [saved,setSaved]=useState<string[]>([]);
 const projects=entries.filter(e=>e.field==='project');
 const cards=[...(!sparse?ideas.map(idea=>({id:'idea-'+idea.id,kind:'ideas',title:idea.name,label:'参与的想法',description:idea.description,meta:idea.tags[0],image:idea.accent,detail:{eyebrow:'想法 · '+idea.event,title:idea.name,body:idea.detail,tags:idea.tags}})):[]),...projects.map((p,i)=>{const v=p.value as {title:string;contribution:string;outcome:string};return{id:p.id,kind:'projects',title:v.title,label:'项目经历',description:v.contribution+'。'+v.outcome+'。',meta:'产品设计 / 原型',image:i?'spark':'roam',detail:toDetail(p)};})];
 return <section id="work" className="content-section work-section" aria-labelledby="work-title" data-source="shadcnuikit/blog-card1">
  <div className="section-heading-row"><div><span className="eyebrow"><span>03</span> IDEAS & WORK</span><h2 id="work-title">她在想什么，<span className="soft-word">也做了什么。</span></h2></div><span className="section-aside">从想法，到实际贡献</span></div>
  <Tabs defaultValue="all" className="work-tabs"><div className="work-tab-row"><TabsList aria-label="浏览想法与项目"><TabsTrigger value="all">全部<span>{cards.length}</span></TabsTrigger><TabsTrigger value="ideas">想法<span>{sparse?0:ideas.length}</span></TabsTrigger><TabsTrigger value="projects">项目<span>{projects.length}</span></TabsTrigger></TabsList><span>想法与项目分别记录</span></div>
   {['all','ideas','projects'].map(filter=><TabsContent value={filter} key={filter}><div className="work-card-grid">{cards.filter(c=>filter==='all'||c.kind===filter).map((card,i)=><Card key={card.id} className="work-card max-w-2xl overflow-hidden p-0 shadow-none" id={card.kind==='projects'?'entry-'+card.id:undefined}>
    <div className="work-card-inner flex flex-col sm:flex-row"><button type="button" className="work-card-cover relative aspect-video w-full" aria-label={'查看'+card.title+'的'+card.label} onClick={()=>open(card.detail)}><IdeaArtwork type={card.image}/><span className={'work-kind '+(card.kind==='projects'?'work-kind-project':'')}>{card.label}</span></button><div className="work-card-body flex min-w-0 flex-col justify-between p-6"><CardContent className="space-y-4 p-0"><div className="work-title-line"><h3 className="text-2xl">{long&&i===0?'漫游地图 · 城市收藏与路线规划的完整构想':card.title}</h3><button type="button" className="work-bookmark" aria-label={(saved.includes(card.id)?'取消收藏':'收藏')+card.label+'：'+card.title} aria-pressed={saved.includes(card.id)} onClick={()=>setSaved(s=>s.includes(card.id)?s.filter(id=>id!==card.id):[...s,card.id])}>{saved.includes(card.id)?<Check size={17}/>:<Bookmark size={17}/>}</button></div><p className="text-muted-foreground text-sm">{card.description}</p><div className="work-card-footer flex flex-col justify-between gap-4"><div className="flex items-center gap-3"><Avatar className="size-8">{!noPhoto&&<AvatarImage src="/images/portrait.jpg" alt=""/>}<AvatarFallback>林</AvatarFallback></Avatar><div className="space-y-1"><p className="text-sm leading-none font-medium">林知夏</p><span className="text-muted-foreground text-xs">{card.meta}</span></div></div><Button variant="outline" size="sm" className="w-auto" onClick={()=>open(card.detail)}>{card.kind==='ideas'?'看这个想法':'看项目贡献'}<ArrowUpRight size={14}/></Button></div></CardContent></div></div>
   </Card>)}</div>{!cards.filter(c=>filter==='all'||c.kind===filter).length&&<div className="empty-content"><p>暂时没有对你可见的{filter==='projects'?'项目':filter==='ideas'?'想法':'想法或项目'}。</p></div>}</TabsContent>)}
  </Tabs><p className="section-footnote"><span>只展示当前观看者有权查看的内容</span><span role="status">{saved.length?'已在本页收藏 '+saved.length+' 项':''}</span></p>
  <ActivityHistory open={open} sparse={sparse}/>
 </section>;
}
