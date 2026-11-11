"use client";
import {useEffect,useRef,useState} from "react";
import {Check,FileText,Maximize2,Minimize2} from "lucide-react";
import {TextArea} from "../affectui/text-area-clean";

// AffectUI TextArea supplies autosizing, labels and native text editing.
// In document mode it grows with the full text; focus mode has one scrolling editor.
export function DocumentText({id,label,value,onChange,placeholder,minRows=4,hideLabel=false}:{id:string;label:string;value:string;onChange:(value:string)=>void;placeholder?:string;minRows?:number;hideLabel?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),selection=useRef({start:0,end:0});const[focused,setFocused]=useState(false);
 function openFocus(){const input=document.getElementById(id) as HTMLTextAreaElement|null;selection.current={start:input?.selectionStart||0,end:input?.selectionEnd||0};setFocused(true);}
 useEffect(()=>{if(!focused){dialog.current?.close();return;}dialog.current?.showModal();const editor=dialog.current?.querySelector("textarea");editor?.focus({preventScroll:true});editor?.setSelectionRange(selection.current.start,selection.current.end);const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=overflow;};},[focused]);
 return <div className="document-text">
  <div className="document-text-tools">{!hideLabel&&<label htmlFor={id}>{label}</label>}<span>{value.length.toLocaleString()} / 20,000</span><button type="button" onClick={openFocus} aria-label={'专注编辑 '+label}><Maximize2 size={14}/>专注编辑</button></div>
  <TextArea id={id} aria-label={label} className="document-text-input" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} minRows={minRows} maxRows={20000} maxLength={20000}/>
  <dialog ref={dialog} className="document-focus" aria-labelledby={id+'-focus-title'} onCancel={()=>setFocused(false)} onClose={()=>setFocused(false)}>
   <header><div><FileText size={18}/><h2 id={id+'-focus-title'}>{label}</h2></div><button type="button" onClick={()=>setFocused(false)}><Minimize2 size={16}/>返回资料</button></header>
   {focused&&<TextArea id={id+'-focus'} aria-label={'专注编辑 '+label} className="document-focus-input" value={value} onChange={e=>onChange(e.target.value)} minRows={12} maxRows={20000} maxLength={20000}/>}
   <footer><span>{value.length.toLocaleString()} 字 · 保留原文和换行</span><span><Check size={13}/>修改同步到当前草稿</span></footer>
  </dialog>
 </div>;
}
