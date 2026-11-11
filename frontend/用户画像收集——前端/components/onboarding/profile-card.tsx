"use client";
import {Check,FileText,LockKeyhole,UserRound} from "lucide-react";
import type {ReactNode} from "react";
import {getField,visibleFields,type Audience,type Draft} from "@/lib/onboarding/model";
import {Card,CardContent} from "./kit-card";

// Composition adapted from Shadcn UI Kit card9 (cover + identity + body).
// Editing stays paragraph-based; the marketing metrics and follow action are omitted.
export function ProfileCardSurface({draft,mode,audience="self",children}:{draft:Draft;mode:"review"|"edit"|"read";audience?:Audience;children:ReactNode}){
 const fields=visibleFields(draft,audience);
 const name=audience==="self"?getField(draft,"name"):fields.find(f=>f.id==="name")?.value;
 return <Card className="profile-sheet" data-component-source="shadcnuikit/card9">
  <div className="profile-sheet-cover" aria-hidden="true"><div/><div/><div/></div>
  <CardContent className="profile-sheet-header">
   <div className="profile-sheet-avatar">{name?<span>{Array.from(name)[0]}</span>:<UserRound size={29}/>}</div>
   <div className="profile-sheet-status">{draft.profileConfirmed?<Check size={14}/>:<FileText size={14}/>}<span>{draft.profileConfirmed?"已确认的资料":mode==="review"?"等你核对的草稿":"正在编辑你的资料"}</span></div>
   <h2>{name||"从一个称呼开始"}</h2>
   <p>{mode==="read"?"让完整的经历和想法，成为别人认识你的开始。":"像写一份自我介绍。每一段都可以展开、修改。"}</p>
   <div className="profile-sheet-meta"><span>{fields.filter(f=>f.value.trim()).length} 段资料</span><span><LockKeyhole size={13}/>{mode==="review"?"核对后再确认":audience==="self"?"你决定每段的可见范围":"仅展示当前视角允许的内容"}</span></div>
  </CardContent>
  <CardContent className="profile-sheet-content">{children}</CardContent>
 </Card>;
}
