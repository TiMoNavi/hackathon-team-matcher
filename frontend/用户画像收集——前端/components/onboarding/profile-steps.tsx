"use client";
import {useEffect,useLayoutEffect,useRef,useState,type Dispatch,type SetStateAction} from "react";
import {ArrowRight,Check,Edit3,FileText,Github,Globe,LockKeyhole,Plus,SkipForward,Sparkles,Trash2,Upload,X} from "lucide-react";
import {Button} from "../affectui/button-clean";
import {GlassFolder} from "../reference-originals/glass-folder";
import {DocumentWorkspace} from "./document-workspace";
import {DocumentText} from "./document-text";
import {getField,newId,QUESTIONS,setField,VISIBILITIES,visibleFields,type Audience,type Draft,type ProfileField,type Source,type Visibility} from "@/lib/onboarding/model";
import {Answer,AssistantMessage,Composer,LongText,PlanMode,QuestionText,ReaderCompanion,UserMessage,scrollConversationToLatest,useThinking} from "./experience";
export type Update=(fn:(d:Draft)=>Draft)=>void;

export function SourceStep({draft,update,onStart,onSkip,onDefer,notify}:{draft:Draft;update:Update;onStart:(sample?:boolean)=>void;onSkip:()=>void;onDefer:()=>void;notify:(s:string)=>void}){
 const input=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null);const[dragging,setDragging]=useState(false);
 const text=draft.inputs.sourceText,url=draft.inputs.website;
 function add(source:Source){update(d=>({...d,sources:[...d.sources.filter(s=>s.id!==source.id),source]}));}
 function files(items:FileList|File[]|null){if(!items)return;for(const f of Array.from(items)){if(!/\.(pdf|docx|txt|md)$/i.test(f.name)){notify("请选择 PDF、DOCX、TXT 或 Markdown 文件。");continue;}if(f.size>10*1024*1024){notify("此本地预览最多选择 10 MB 的文件。");continue;}add({id:newId("file"),kind:"resume",label:f.name,sample:false,status:"selected"});}if(input.current)input.current.value="";}
 function github(){const url=process.env.NEXT_PUBLIC_GITHUB_AUTH_URL;if(url){window.location.assign(url);return;}dialog.current?.showModal();}
 return <div className="flow-source"><div className="flow-source-heading"><span>资料可选，按你的节奏来</span><button onClick={onDefer}>暂时跳过 <ArrowRight size={15}/></button></div>
  <div className="flow-entry-grid">
   <section className={"flow-entry-card"+(dragging?" is-dragging":"")} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);files(e.dataTransfer.files);}}>
    <div className="flow-entry-art"><GlassFolder/></div><h2>从一份简历开始</h2><p>把做过的事交给小同。<br/>你只需要看看，哪里还不够像你。</p>
    <Button variant="secondary" icon={<Upload size={17}/>} onClick={()=>input.current?.click()}>选择简历文件</Button><small>也可拖入 · PDF / DOCX / TXT / MD</small>
   </section>
   <section className="flow-entry-card flow-github-card"><div className="flow-entry-art"><span className="flow-github-logo"><Github size={48}/></span></div><h2>从 GitHub 认识你</h2><p>登录并连接你的公开作品。<br/>经历和技能，不用再写一遍。</p><Button icon={<Github size={18}/>} onClick={github} aria-label="GitHub 登录并导入"><span className="flow-github-label-full">GitHub 登录并导入</span><span className="flow-github-label-short" aria-hidden="true">GitHub 登录</span></Button><small>只读取公开资料，不访问私有仓库</small></section>
  </div>
  <input ref={input} type="file" aria-label="选择简历文件" accept=".pdf,.docx,.txt,.md" multiple onChange={e=>files(e.target.files)} className="guide-file-input"/>
  {draft.sources.length>0&&<ul className="guide-source-list" aria-label="已选择的资料">{draft.sources.map(s=><li key={s.id}><FileText size={17}/><span><b>{s.label}</b><small>{s.sample?"示例来源":s.kind==="text"?"自述原文":"仅记录文件或网址，尚未解析"}</small></span><button aria-label={"移除资料 "+s.label} onClick={()=>update(d=>({...d,sources:d.sources.filter(v=>v.id!==s.id)}))}><X size={16}/></button></li>)}</ul>}
  <details className="flow-source-more"><summary><Plus size={15}/>也可以粘贴一段介绍，或提供个人网站</summary><div><LongText id="source-text" label="粘贴介绍或完整经历" value={text} onChange={sourceText=>update(d=>({...d,inputs:{...d.inputs,sourceText}}))} placeholder="几句话或一整段经历都可以，保留原来的段落。"/><Button variant="secondary" size="sm" disabled={!text.trim()} onClick={()=>{add({id:"self-text",kind:"text",label:"我的自述",text:text.trim(),sample:false,status:"ready"});update(d=>({...d,inputs:{...d.inputs,sourceText:""}}));}}>加入这段介绍</Button><label htmlFor="source-website">个人网站</label><div className="guide-inline-input"><input id="source-website" type="url" value={url} onChange={e=>update(d=>({...d,inputs:{...d.inputs,website:e.target.value}}))} placeholder="https://your-site.com"/><Button variant="secondary" disabled={!url.trim()} onClick={()=>{try{const u=new URL(url);if(!["http:","https:"].includes(u.protocol))throw Error();add({id:newId("url"),kind:"website",label:u.href,sample:false,status:"selected"});update(d=>({...d,inputs:{...d.inputs,website:""}}));}catch{notify("请输入完整的 http 或 https 网址。");}}}>加入网址</Button></div></div></details>
  <div className="flow-entry-actions">{draft.sources.length>0&&<Button iconRight={<ArrowRight size={17}/>} onClick={()=>onStart()}>开始整理这些资料</Button>}<Button variant="secondary" className="flow-skip-all" icon={<SkipForward size={17}/>} onClick={onDefer}>什么都不填，先去看看</Button></div>
  <div className="flow-entry-secondary"><button onClick={onSkip}>我想直接填写</button><span>或</span><button onClick={()=>onStart(true)}><Sparkles size={14}/>先用示例体验</button></div>
  <p className="guide-help"><LockKeyhole size={13}/>本机预览。资料由你确认后，才成为你的介绍。</p>
  <dialog ref={dialog} className="guide-dialog flow-auth-dialog" aria-labelledby="github-title"><button className="guide-dialog-close" aria-label="关闭 GitHub 登录" onClick={()=>dialog.current?.close()}><X size={18}/></button><Github size={38}/><h2 id="github-title">使用 GitHub 登录</h2><p>正式接入后，将前往 GitHub 完成身份验证，再读取本人公开介绍与项目资料。</p><p className="flow-auth-note">当前预览尚未连接登录服务，不会请求你的账号或令牌。可以先体验导入后的流程。</p><div className="guide-actions"><Button onClick={()=>{dialog.current?.close();onStart(true);}}>使用示例继续</Button><Button variant="secondary" onClick={()=>dialog.current?.close()}>返回</Button></div></dialog>
 </div>;
}

function ReadableField({field,onChange,onDelete,privacy=true}:{field:ProfileField;onChange:(patch:Partial<ProfileField>)=>void;onDelete?:()=>void;privacy?:boolean}){
 const label=field.id==="intro"?"关于我":field.label;
 const[editing,setEditing]=useState(!field.value);const section=useRef<HTMLElement>(null),requestedFocus=useRef(false);
 function beginEditing(){requestedFocus.current=true;setEditing(true);}
 useLayoutEffect(()=>{if(!editing||!requestedFocus.current)return;const node=section.current;if(!node)return;requestedFocus.current=false;node.querySelector<HTMLElement>("textarea,input")?.focus({preventScroll:true});window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-24,behavior:"instant"});},[editing]);
 return <section className={"flow-document-field"+(editing?" is-editing":"")} data-field={field.id} ref={section}>
  <header><h3>{label}</h3><div>{privacy&&<select aria-label={field.label+" "+(field.label==="技能"?field.value:"")+"的展示范围"} value={field.visibility} onChange={e=>onChange({visibility:e.target.value as Visibility})}>{VISIBILITIES.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select>}<button aria-label={(editing?"完成修改 ":"编辑 ")+label} onClick={()=>editing?setEditing(false):beginEditing()}>{editing?<Check size={15}/>:<Edit3 size={14}/>}<span>{editing?"完成修改":"编辑这一段"}</span></button>{onDelete&&<button aria-label={"删除条目 "+label+" "+field.value} onClick={onDelete}><Trash2 size={14}/></button>}</div></header>
  {editing?(field.id==="name"?<input id="profile-name" aria-label={label} className="document-name-input" maxLength={80} value={field.value} onChange={e=>onChange({value:e.target.value})} placeholder="怎么称呼你？"/>:<DocumentText id={"field-"+field.id} label={label} value={field.value} onChange={value=>onChange({value})} minRows={5} hideLabel placeholder="可以写完整的经历、背景和过程，保留你原来的段落。"/>):field.value?<div className="document-readable" role="button" tabIndex={0} aria-label={"点击编辑 "+label} onClick={beginEditing} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();beginEditing();}}}><p className={field.id==="name"?"flow-document-name":"flow-prose"}>{field.value}</p></div>:<button className="flow-add-paragraph" onClick={beginEditing}><Plus size={14}/>写下{label}</button>}

 </section>;
}
const defaultFields:ProfileField[]=[{id:"name",label:"怎么称呼你",value:"",visibility:"authenticated",origin:"本人填写"},{id:"intro",label:"关于我",value:"",visibility:"authenticated",origin:"本人填写"},{id:"role",label:"我擅长的与想探索的",value:"",visibility:"authenticated",origin:"本人填写"}];
export const editableFields=(draft:Draft)=>!draft.fields.length?defaultFields:draft.fields.some(f=>f.id==="name")?draft.fields:[defaultFields[0],...draft.fields];
export function ProfileEditor({draft,update,privacy=true}:{draft:Draft;update:Update;privacy?:boolean}){
 const[newLabel,setNewLabel]=useState("作品与经历");
 const fields=editableFields(draft);
 function change(field:ProfileField,patch:Partial<ProfileField>){update(d=>{const base=editableFields(d);const next={...d,fields:base.some(f=>f.id===field.id)?base:[...base,field]};return {...next,fields:next.fields.map(f=>f.id===field.id?{...f,...patch}:f),profileConfirmed:false,savedFinal:false,completed:false,matches:[]};});}
 return <div className="flow-profile-editor" aria-label="逐条编辑资料" data-testid="profile-preview">{fields.map(f=><ReadableField key={f.id} field={f} privacy={privacy} onChange={patch=>change(f,patch)} onDelete={f.id==="name"?undefined:()=>update(d=>({...d,fields:editableFields(d).filter(v=>v.id!==f.id),profileConfirmed:false,savedFinal:false,completed:false}))}/>)}<div className="flow-document-add"><select aria-label="新条目类型" value={newLabel} onChange={e=>setNewLabel(e.target.value)}>{["关于我","作品与经历","技能","合作偏好","我擅长的与想探索的","联系方式"].map(v=><option key={v}>{v}</option>)}</select><Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={()=>update(d=>({...d,fields:[...editableFields(d),{id:newId("field"),label:newLabel,value:"",visibility:"authenticated",origin:"本人填写"}],profileConfirmed:false,savedFinal:false,completed:false}))}>补充一段</Button></div></div>;
}
export function ReviewStep({draft,update,onNext,notify}:{draft:Draft;update:Update;onNext:()=>void;notify:(s:string)=>void}){
 return <DocumentWorkspace fields={editableFields(draft)} toolbar={<><span>核对资料，点击段落直接编辑</span><small>只有称呼必填</small></>} footer={<><span><LockKeyhole size={14}/>内容先留在你的草稿里</span><Button iconRight={<ArrowRight size={17}/>} onClick={()=>{if(!getField(draft,"name").trim()){notify("先留一个称呼，或者返回首页选择「什么都不填，先去看看」。");document.getElementById("profile-name")?.focus();return;}onNext();}}>这些信息正确，继续</Button></>}><ProfileEditor draft={draft} update={update} privacy={false}/></DocumentWorkspace>;
}

export function PreferencesStep({draft,update,onFinish}:{draft:Draft;update:Update;onFinish:()=>void;reduced?:boolean}){
 const q=QUESTIONS[draft.question],key="preference-"+q.id;const text=draft.inputs.chats[key]||"";const thinking=useThinking(q.id);const bottom=useRef<HTMLDivElement>(null);
 useEffect(()=>{scrollConversationToLatest(bottom.current);},[draft.question,thinking]);
 function answer(value:string){update(d=>({...d,answers:{...d.answers,[q.id]:value.trim()},inputs:{...d.inputs,chats:{...d.inputs.chats,[key]:""}},profileConfirmed:false,savedFinal:false,completed:false,question:Math.min(d.question+1,QUESTIONS.length-1)}));if(draft.question===QUESTIONS.length-1)onFinish();}
 return <section className="flow-conversation flow-preferences"><div className="flow-conversation-heading"><span>聊聊合作中的你</span><span>{draft.question+1} / {QUESTIONS.length}</span></div><div className="flow-thread" role="log" aria-label="偏好引导对话">{QUESTIONS.slice(0,draft.question).map(previous=><div key={previous.id}><AssistantMessage><p className="flow-question-text">{previous.label}</p></AssistantMessage><UserMessage>{draft.answers[previous.id]||"这题先跳过"}</UserMessage></div>)}<AssistantMessage active thinking={thinking}>{draft.question===0&&<p className="flow-prose flow-muted">经历之外，我还想了解你怎样和别人一起做事。最多聊三个问题，不确定的就跳过。</p>}<QuestionText text={q.label}/><p className="flow-question-reason">{q.reason}</p></AssistantMessage>{!thinking&&<div className="flow-reply-suggestions">{q.options.map(option=><button key={option} onClick={()=>{update(d=>({...d,inputs:{...d.inputs,chats:{...d.inputs.chats,[key]:option}}}));document.getElementById("preference-chat")?.focus();}}>{option}</button>)}</div>}<div ref={bottom}/></div><Composer id="preference-chat" value={text} onChange={value=>update(d=>({...d,inputs:{...d.inputs,chats:{...d.inputs.chats,[key]:value}}}))} onSend={()=>answer(text)} disabled={thinking} label="发送偏好回答" placeholder="像聊天一样说就好，长一点也没关系……" tools={<PlanMode items={QUESTIONS.map(q=>q.field)} completed={draft.question}/>}><button onClick={()=>answer("")}>这题先跳过 <ArrowRight size={13}/></button></Composer></section>;
}
export function AudienceSwitch({value,onChange}:{value:Audience;onChange:(v:Audience)=>void}){return <div className="flow-audience-switch" aria-label="画像预览视角">{([{id:"self",name:"我的视角"},{id:"authenticated",name:"其他登录用户"},{id:"friends",name:"好友"}] as const).map(o=><button key={o.id} aria-pressed={value===o.id} onClick={()=>onChange(o.id)}>{o.name}</button>)}</div>;}
export function ProfilePreview({draft,audience}:{draft:Draft;audience:Audience;reduced?:boolean}){
 const fields=visibleFields(draft,audience),name=fields.find(f=>f.id==="name");
 return <article className="flow-profile-document" data-testid="profile-preview"><div className="flow-document-identity" data-field="name"><span className="flow-identity-mark">{name?.value.slice(0,1)||"·"}</span><div><h2>{name?.value||"昵称未在此视角展示"}</h2><span>{draft.profileConfirmed?"本人已确认":"等待你确认"}</span></div></div>{fields.filter(f=>f.id!=="name").map(f=><section className="flow-document-field" data-field={f.id} key={f.id}><h3>{f.id==="intro"?"关于我":f.label}</h3><p className="flow-prose">{f.value}</p></section>)}{!fields.length&&<p className="flow-empty-note">这个视角没有可展示的资料。</p>}</article>;
}
export function ProfileStep({draft,update,audience,setAudience,onSave}:{draft:Draft;update:Update;audience:Audience;setAudience:Dispatch<SetStateAction<Audience>>;onSave:()=>void;reduced?:boolean}){
 return <DocumentWorkspace fields={audience==="self"?editableFields(draft):visibleFields(draft,audience)} toolbar={<><AudienceSwitch value={audience} onChange={setAudience}/><span>每段资料分别决定给谁看</span></>} footer={<><span><LockKeyhole size={14}/>原始资料不公开，登录邮箱不自动展示</span><Button onClick={onSave} iconRight={<ArrowRight size={17}/>}>保存我的资料</Button></>}>
 {audience==="self"?<ProfileEditor draft={draft} update={update}/>:<ProfilePreview draft={draft} audience={audience}/>}
 </DocumentWorkspace>;
}
