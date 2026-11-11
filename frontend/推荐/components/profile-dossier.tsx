"use client";
import { useState } from 'react';
import { ArrowUpRight, CheckCheck, FileText, Fingerprint, Layers3, List, MapPin, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/kit/table';
import { CoverFlow } from '@/components/affect/cover-flow';
import { ProjectCard } from '@/components/affect/project-card-clean';
import { ProgressTracker } from '@/components/affect/progress-tracker-clean';
import { NotificationStack } from '@/components/affect/notification-stack';
import { TextReveal } from '@/components/affect/text-reveal';
import { NumberTicker } from '@/components/affect/number-ticker';
import { ProjectArt } from '@/components/showcase-board';
import { ProfileInsightGraph } from '@/components/profile-insight-graph';
import { showcaseFor, type ShowcaseItem } from '@/lib/showcase';
import { profileDimensions } from '@/lib/profile-analysis';
import type { Person } from '@/lib/people';

export function ProfileDossier({person,onOpen,onAsk}:{person:Person;onOpen:(item:ShowcaseItem)=>void;onAsk:(message:string)=>void}) {
  const items = showcaseFor(person);
  const dimensions = profileDimensions(person);
  const [view,setView] = useState('list');
  const [selected,setSelected] = useState<string|null>(null);
  return <section id="person-details" className="profile-dossier" aria-labelledby="dossier-heading">
    <div className="dossier-heading" id="dossier-heading">
      <div><span className="section-kicker"><Fingerprint size={15}/>再往下，认识完整的 TA</span>
        <TextReveal as="h2" text={person.name+'，以及 TA 认真做过的事。'} by="char" stagger={24}/>
        <p>做过什么、想做什么、想找谁一起做，都在这里。</p>
      </div>
      <span className="dossier-count"><NumberTicker value={items.length} locale="zh-CN"/>个资料切片<small>本次活动的演示资料</small></span>
    </div>
    <div className="dossier-overview"><span>{person.role}</span><span><MapPin size={14}/>{person.city}</span><span>{person.chapters[2][0].title}</span></div>
    <Tabs value={view} onValueChange={setView} className="dossier-tabs">
      <TabsList aria-label="查看资料的方式">
        <TabsTrigger value="list"><List size={15}/>资料列表</TabsTrigger>
        <TabsTrigger value="projects"><Layers3 size={15}/>作品浏览</TabsTrigger>
        <TabsTrigger value="experience"><FileText size={15}/>经历与贡献</TabsTrigger>
      </TabsList>
      <TabsContent value="list">
        {/* Shadcn UI Kit product-list-card1: horizontal image/content/action rows. */}
        <Card className="profile-list-card"><CardContent className="profile-list-content">
          <ul className="profile-list">{items.map((item,i)=><li key={item.id} className="profile-list-row">
            <span className="profile-list-number">{String(i+1).padStart(2,'0')}</span>
            <div className="profile-list-art"><ProjectArt kind={item.art} compact/></div>
            <div className="profile-list-copy"><span className="profile-list-kind">{item.kind}</span><h3>{item.title}</h3><p>{item.description}</p><span className="dossier-source"><CheckCheck size={13}/>{item.source}</span></div>
            <button className="profile-list-open" onClick={()=>onOpen(item)} aria-label={'查看资料：'+item.title}><ArrowUpRight size={19}/></button>
          </li>)}</ul>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="projects"><div className="portfolio-showroom"><CoverFlow key={person.id} items={items.map(item=>({id:item.id,title:item.title,subtitle:item.kind,cover:<ProjectArt kind={item.art}/>}))} itemWidth={300} itemHeight={200} angle={35} reflection={false} defaultIndex={0} onSelect={item=>{const found=items.find(i=>i.id===item.id);if(found)onOpen(found);}} aria-label={person.name+'的作品与想法'}/></div></TabsContent>
      <TabsContent value="experience"><div className="experience-timeline relative space-y-12"><div className="bg-border absolute top-2 bottom-0 left-[7px] w-px md:left-[120px]"/>{[
        {phase:'做过的事',title:person.chapters[0][2].title,text:person.chapters[0][2].detail,tags:['作品经历',person.tags[0]]},
        {phase:'擅长的部分',title:person.chapters[0][0].title,text:person.chapters[0][0].detail,tags:person.tags},
        {phase:'这一次想做',title:person.chapters[2][1].title,text:person.chapters[2][1].detail,tags:['周末造物场',person.chapters[2][0].note]},
      ].map(entry=><div key={entry.phase} className="grid gap-8 md:grid-cols-[120px_1fr] md:gap-0"><div className="text-muted-foreground hidden pt-1 pr-8 text-right text-sm md:block">{entry.phase}</div><div className="relative pl-8 md:pl-12"><div className="bg-primary ring-background absolute top-2 left-[3px] size-2.5 rounded-full ring-4 md:left-[-5px]"/><div className="text-muted-foreground mb-2 text-sm md:hidden">{entry.phase}</div><h3>{entry.title}</h3><p>{entry.text}</p><div className="timeline-tags">{entry.tags.map(tag=><Badge key={tag} variant="outline">{tag}</Badge>)}</div></div></div>)}<p className="timeline-note">演示资料未包含学校、任职时间和完整履历。</p></div></TabsContent>
    </Tabs>
    <Separator className="dossier-divider"/>
    <div className="analysis-heading"><div><span className="section-kicker"><Sparkles size={15}/>从资料到合作的可能</span><h2>先聊这几件事，再决定一起做。</h2><p>能贡献什么、想法往哪走、时间能否碰上，把线索和待确认的地方放在一起。</p></div></div>
    <ProfileInsightGraph person={person} dimensions={dimensions} selected={selected} onSelect={setSelected} onAsk={onAsk}/>
    <div className="analysis-table-wrap">
      <div className="analysis-table-caption"><h3>五个维度，看看怎么合作</h3><span>依据来自演示资料 · 建议为预写内容</span></div>
      {/* Shadcn UI Kit table6: grouped header, evidence rows and trailing actions. */}
      <Table className="dimension-table"><TableHeader><TableRow><TableHead>维度</TableHead><TableHead>资料里已有的线索</TableHead><TableHead>可以怎样一起做</TableHead><TableHead>聊之前，还要确认</TableHead><TableHead><span className="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody>{dimensions.map((d,i)=><TableRow key={d.id} data-selected={selected===d.id||undefined} data-dimension={d.id}>
          <TableCell data-label="维度"><button className="dimension-select" aria-pressed={selected===d.id} onClick={()=>setSelected(selected===d.id?null:d.id)}><span>0{i+1}</span>{d.label}</button></TableCell>
          <TableCell data-label="资料依据"><strong>{d.evidence}</strong><small>{d.source}</small></TableCell>
          <TableCell data-label="合作建议">{d.suggestion}</TableCell>
          <TableCell data-label="待确认"><span className={d.pending?'pending-evidence':''}>{d.confirm}</span></TableCell>
          <TableCell><button className="dimension-ask" onClick={()=>onAsk('关于'+person.name+'的'+d.label+'，'+d.confirm+'，怎么开口问？')} aria-label={'问 AI：'+d.label}><ArrowUpRight size={17}/></button></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
    <div className="conversation-preparation">
      <div><span className="section-kicker">留个自然的开场</span><NotificationStack key={person.id} className="conversation-notes" notices={person.chapters.map((group,i)=>({id:person.id+i,badge:'可以问问 TA',title:group[3].title,text:group[3].detail,pattern:'orbit',action:{label:'和 AI 琢磨这句话',onClick:()=>onAsk(group[3].title)}}))}/></div>
      <ProgressTracker key={'progress-'+person.id} className="reading-checklist" title="聊之前，我想确认" steps={[{id:'work',label:'看过 TA 的作品与想法'},{id:'schedule',label:'了解彼此能投入的时段'},{id:'opener',label:'找到一个具体的开场话题'}]}/>
    </div>
    <div className="try-together"><div><span className="section-kicker"><Sparkles size={15}/>聊得来，就一起试试</span><h2>第一步，可以很小。</h2><p>选一个场景，分好手上的事，做一个能亲手试的版本。</p><Button onClick={()=>onAsk('帮我想一个和'+person.name+'聊项目的开场')} className="dossier-ask">和 AI 想个开场<ArrowUpRight size={16}/></Button></div><ProjectCard key={'plan-'+person.id} className="collaboration-plan" title="一起做个能试的小版本" tasks={[{id:'topic',label:'选一个都感兴趣的具体场景'},{id:'split',label:'聊清各自能贡献的部分'},{id:'time',label:'约定第一次一起动手的时间'}]} statuses={[{id:'thinking',label:'先想一想',tone:'violet'},{id:'trying',label:'准备试试',tone:'blue'},{id:'ready',label:'已对齐',tone:'green'}]} status="thinking" trigger="click" defaultOpen hint="本地试想清单，刷新后重置" action={{label:'向助手聊聊这份清单',onClick:()=>onAsk('怎么把这个小版本的范围收小一点？')}}/></div>
    <p className="dossier-boundary">这里只展示当前活动的演示资料。AI 分析是交流参考，具体经历、安排和分工仍由双方确认。</p>
  </section>;
}
