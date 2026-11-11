"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Moon, RotateCcw, Search, Sun, X } from "lucide-react";
import { referenceItems, referenceGroups } from "@/lib/reference-catalog";
import "@/app/references/references.css";
import "./reference-browser.css";

export default function ReferenceBrowser(){
  const [selected,setSelected]=useState("background-composer");
  const [group,setGroup]=useState("全部");
  const [query,setQuery]=useState("");
  const [dark,setDark]=useState(false);
  const [replay,setReplay]=useState(0);
  useEffect(()=>{const p=new URLSearchParams(location.search);const id=p.get("scene");if(referenceItems.some(item=>item.id===id))setSelected(id!);},[]);
  const current=referenceItems.find(item=>item.id===selected)!;
  const newCount=referenceItems.filter(item=>item.isNew).length;
  const priorityCount=referenceItems.filter(item=>item.recommended).length;
  const filtered=referenceItems.filter(item=>(group==="全部"||group==="本轮新增"&&item.isNew||group==="优先看"&&item.recommended||item.group===group)&&[item.name,item.id,item.title,item.useAt,item.group].some(text=>text.toLowerCase().includes(query.trim().toLowerCase())));
  const source="/references/view/"+current.id+"?theme="+(dark?"dark":"light");
  function choose(id:string){setSelected(id);const u=new URL(location.href);u.searchParams.set("scene",id);history.replaceState(null,"",u);}
  return <main className={"reference-page reference-expanded"+(dark?" reference-dark":"")}>
    <header className="reference-top"><div><span className="reference-wordmark">AffectUI + Kit</span><span className="reference-tagline">本轮新增 {newCount} 组 / 共 {referenceItems.length} 组</span></div><button className="reference-icon" aria-label={dark?"切换浅色":"切换夜间"} onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button></header>
    <div className="reference-filterbar"><nav aria-label="按用途筛选" className="reference-groups">{referenceGroups.map(value=><button key={value} aria-pressed={group===value} onClick={()=>setGroup(value)}>{value}</button>)}</nav><div className="reference-search"><Search size={16}/><input aria-label="搜索组件或阶段" placeholder="搜索组件、效果或阶段" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清空搜索" onClick={()=>setQuery("")}><X size={15}/></button>}</div></div>
    <div className="reference-list-heading"><span>{group} · {filtered.length} 组</span><span>本轮 19 个原版部件＋3 个组合方案；优先参考 {priorityCount} 组。</span></div>
    <nav className="reference-tabs reference-catalog-grid" aria-label="选择参考场景">{filtered.map(item=><button key={item.id} aria-pressed={item.id===selected} onClick={()=>choose(item.id)}><span className="reference-card-name">{item.name}{item.isNew&&<small>新增</small>}</span><span className="reference-card-meta">{item.id}{item.mode==="composition"?" · 组合":item.provider==="Shadcn UI Kit"?" · Kit":""}</span><span className="reference-card-use">{item.useAt}</span></button>)}</nav>
    {filtered.length===0&&<div className="reference-empty" role="status">没有符合条件的组件。<button onClick={()=>{setQuery("");setGroup("全部");}}>查看全部 {referenceItems.length} 组</button></div>}
    <section className="reference-context"><div><span className="reference-type">{current.group} / {current.type}{current.recommended?" · 优先参考":""}</span><h1>{current.title}</h1><p>{current.detail}</p><p className="reference-limit"><strong>适用：</strong>{current.useAt}。{current.limit}</p></div><div className="reference-actions"><button onClick={()=>setReplay(n=>n+1)}><RotateCcw size={15}/>重新播放</button><a href={source} target="_blank" rel="noreferrer">全屏体验<ArrowUpRight size={15}/></a><a href={current.url} target="_blank" rel="noreferrer">{current.mode==="composition"?"基础组件":current.provider==="Shadcn UI Kit"?"来源站点":"官方原页"}<ArrowUpRight size={15}/></a></div></section>
    <iframe key={current.id+replay} src={source} title={current.name+"原版交互预览"} className="reference-frame"/>
    <footer className="reference-footer">AffectUI 与 Shadcn UI Kit 原版部件，以及单独标明的组合方案。正式产品仍遵循 Signalry，十阶段业务不变。上传、AI 回复、处理进度和语音均为本地模拟。</footer>
  </main>;
}

