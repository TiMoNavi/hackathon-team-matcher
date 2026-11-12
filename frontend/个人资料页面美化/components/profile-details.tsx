"use client";
// Composition of Shadcn UI Kit accordion7 + form-layout3's label/content rows.
import { useState } from 'react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { ArrowUpRight, ChevronDown, Code2, Fingerprint, GraduationCap, LockKeyhole, MapPin, Sparkles, Timer, UserRound } from 'lucide-react';
import { Accordion,AccordionContent,AccordionItem } from '@/components/ui/accordion';
import { Card,CardContent,CardHeader,CardTitle,CardDescription,CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toDetail,type Detail,type ProfileEntry } from '@/lib/profile-data';
const groups=[
 {id:'basic',title:'基本信息与方向',sub:'身份、城市、方向与沟通语言',icon:UserRound,fields:['headline','city','timezone','role','direction','interest','language']},
 {id:'skills',title:'能力与协作',sub:'技能、合作期待与沟通习惯',icon:Code2,fields:['skill','seeking','collaboration_preference','communication_preference']},
 {id:'background',title:'教育与经历',sub:'教育、成果与本人选择分享的背景',icon:GraduationCap,fields:['education','award','work_experience']},
 {id:'event',title:'本次活动投入',sub:'周末造物场 · 目标、角色与可用时间',icon:Timer,fields:[]},
];
export function ProfileDetails({entries,sparse,open,onRequest}:{entries:ProfileEntry[];sparse:boolean;open:(detail:Detail)=>void;onRequest:()=>void}){
 const [expanded,setExpanded]=useState<string[]>(['skills','background']);
 return <section id="details" className="content-section details-section" aria-labelledby="details-title" data-source="shadcnuikit/accordion7+form-layout3">
  <div className="section-heading-row"><div><span className="eyebrow"><span>02</span> THE DETAILS</span><h2 id="details-title">再了解一点，<span className="soft-word">具体的她。</span></h2></div><span className="section-aside"><LockKeyhole size={14}/>部分资料仅好友可见</span></div>
  <div className="details-layout">
   <Card className="details-card gap-0 py-0 shadow-none"><CardHeader className="border-b py-6"><div className="details-card-title"><CardTitle>个人资料</CardTitle><span className="details-view-label"><UserRound size={13}/>访客视角</span></div><CardDescription>按类别展开，查看她愿意分享的资料。</CardDescription></CardHeader>
    <CardContent className="px-6 py-0"><Accordion className="rounded-none border-none" type="multiple" value={expanded} onValueChange={setExpanded}>
     {groups.map(group=>{const rows=entries.filter(e=>group.id==='event'?e.scope==='event':e.scope==='global'&&group.fields.includes(e.field)).sort((a,b)=>group.id==='event'?0:group.fields.indexOf(a.field)-group.fields.indexOf(b.field));return <AccordionItem className="profile-detail-group data-open:bg-transparent!" value={group.id} key={group.id}>
       <AccordionPrimitive.Header className="flex"><AccordionPrimitive.Trigger className="detail-group-trigger focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center justify-between rounded-md py-5 text-left text-sm font-medium transition-all outline-none focus-visible:ring-[3px] [&[data-state=open]>svg]:rotate-180"><span className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="detail-group-icon flex size-10 shrink-0 items-center justify-center rounded-full border"><group.icon className="opacity-70" size={17}/></span><span className="flex min-w-0 flex-col space-y-1"><span className="detail-group-name">{group.title}</span><span className="text-muted-foreground text-sm font-normal detail-group-sub">{group.sub}</span></span></span><ChevronDown aria-hidden="true" className="pointer-events-none shrink-0 opacity-60 transition-transform duration-200" size={17}/></AccordionPrimitive.Trigger></AccordionPrimitive.Header>
       <AccordionContent className="detail-group-content text-muted-foreground pb-5"><dl className="detail-list">{rows.map(entry=><div className="detail-list-row grid gap-2 md:grid-cols-[9rem_minmax(0,1fr)] md:items-start md:gap-8" key={entry.id} id={'entry-'+entry.id} data-field={entry.field}><dt>{entry.label}</dt><dd><button onClick={()=>open(toDetail(entry))}><span>{entry.short}</span><ArrowUpRight size={14}/></button>{entry.field==='skill'&&<small>熟练度为本人自评</small>}</dd></div>)}
         {!rows.length&&<div className="details-empty">暂时没有可展示的条目。</div>}
         {!sparse&&group.id==='skills'&&<RestrictedRow label="更多个人偏好"/>}
         {!sparse&&group.id==='background'&&<RestrictedRow label="工作与个人背景"/>}
       </dl></AccordionContent>
     </AccordionItem>})}
    </Accordion></CardContent>
    <CardFooter className="details-card-foot border-t"><LockKeyhole size={13}/><p>好友可见资料由本人决定；联系方式仍需单独授权。</p></CardFooter>
   </Card>
   <aside className="details-aside"><Card className="visitor-note-card"><CardHeader><span className="visitor-note-icon"><Fingerprint size={28} strokeWidth={1.3}/></span><CardTitle>先了解，再认识。</CardTitle><CardDescription>可见资料已经足够开启一段对话。其他部分，留给彼此熟悉之后。</CardDescription></CardHeader><CardContent><div className="visibility-key"><span className="visibility-dot"/>可见资料<span>当前可读</span></div><div className="visibility-key"><LockKeyhole size={13}/>好友可见<span>由本人设置</span></div><div className="visibility-key"><MapPin size={13}/>活动资料<span>按活动范围</span></div></CardContent><CardFooter><Button onClick={onRequest} className="w-full" size="xl"><Sparkles size={16}/>AI 代写好友申请<ArrowUpRight size={16}/></Button></CardFooter></Card><p className="privacy-preview-note">当前为独立的权限样式演示。</p></aside>
  </div>
 </section>;
}
function RestrictedRow({label}:{label:string}){return <div className="detail-list-row restricted-row grid gap-2 md:grid-cols-[9rem_minmax(0,1fr)] md:items-start md:gap-8" data-visibility="friends"><dt>{label}</dt><dd><div className="privacy-placeholder" aria-hidden="true"><i/><i/><i/></div><span className="privacy-lock"><LockKeyhole size={13}/>仅好友可见</span><span className="sr-only">此部分没有对当前访客开放。</span></dd></div>}
