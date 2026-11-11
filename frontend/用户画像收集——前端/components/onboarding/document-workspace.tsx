"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {List} from "lucide-react";
import {MascotAnchor} from "./experience";
import type {ProfileField} from "@/lib/onboarding/model";

export const fieldTitle=(field:ProfileField)=>field.id==="intro"?"关于我":field.label;
export function DocumentWorkspace({fields,children,toolbar,footer,character=true,title="资料目录"}:{fields:ProfileField[];children:ReactNode;toolbar?:ReactNode;footer?:ReactNode;character?:boolean;title?:string}){
 const root=useRef<HTMLDivElement>(null);const[active,setActive]=useState(fields[0]?.id||"");
 useEffect(()=>{const nodes=root.current?.querySelectorAll<HTMLElement>('[data-field]');if(!nodes?.length)return;const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setActive((visible[0].target as HTMLElement).dataset.field||"");},{rootMargin:'-60px 0px -65% 0px',threshold:0});nodes.forEach(n=>observer.observe(n));return()=>observer.disconnect();},[fields.map(f=>f.id).join('|')]);
 function jump(id:string){setActive(id);const node=Array.from(root.current?.querySelectorAll<HTMLElement>('[data-field]')||[]).find(n=>n.dataset.field===id);node?.scrollIntoView({block:'start',behavior:'instant'});}
 return <div className="document-workspace flow-reader" ref={root}>
  <aside className="document-index"><div className="document-index-heading">{character&&<MascotAnchor mode="reader"/>}<div><span><List size={15}/>{title}</span><small>{fields.length} 段 · {fields.reduce((n,f)=>n+f.value.length,0).toLocaleString()} 字</small></div></div><nav aria-label="资料段落目录">{fields.map(f=><button key={f.id} onClick={()=>jump(f.id)} aria-current={active===f.id?'location':undefined}><span>{fieldTitle(f)}{fields.filter(item=>fieldTitle(item)===fieldTitle(f)).length>1&&f.value.trim()&&<em title={f.value.slice(0,120)}>{f.value.split("\n")[0].slice(0,28)}</em>}</span><small>{f.value.trim()?f.value.length.toLocaleString()+' 字':'待补充'}</small></button>)}</nav><p>逐段阅读，点击正文即可修改。<br/>长内容可以打开专注编辑。</p></aside>
  <div className="document-body">{toolbar&&<div className="document-toolbar">{toolbar}</div>}<div className="document-content">{children}</div>{footer&&<div className="document-savebar">{footer}</div>}</div>
 </div>;
}

