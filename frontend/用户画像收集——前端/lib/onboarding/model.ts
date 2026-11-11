export type Visibility = "authenticated" | "friends" | "private";
export type Audience = "self" | "authenticated" | "friends";
export type Phase = "sources" | "profile" | "idea" | "match";
export type Source = { id: string; kind: "resume" | "github" | "text" | "website"; label: string; sample: boolean; text?: string; status: "ready" | "selected" | "failed" };
export type ProfileField = { id: string; label: string; value: string; visibility: Visibility; origin: string };
export type Idea = { id: string; kind: "build" | "join"; title: string; description: string; audience: string; firstStep: string; help: string; visibility: Visibility; revision: number; status: "draft" | "ready"; messages: { role: "user" | "assistant"; text: string }[] };
export type Job = { id: string; kind: Phase; status: "running" | "failed" | "succeeded" | "cancelled"; cursor: number; target?: string; revision?: number; eventId: string | null };
export type ActivityPlan = { role: string; time: string; discoverable: boolean };
export type Draft = { version: 1; step: number; reached: number; skippedSources: boolean; sources: Source[]; fields: ProfileField[]; answers: Record<string,string>; question: number; profileConfirmed: boolean; ideas: Idea[]; activeIdea: string | null; eventId: string | null; activities: Record<string,ActivityPlan>; job: Job | null; savedFinal: boolean; completed: boolean; resultMode: "recommendation" | "browse"; matches: string[]; pendingFriends: string[]; shortlisted?: string[]; followedIdeas: string[]; discussionRequests: string[]; settings: { sourceFailure: boolean; matchOutcome: "normal" | "empty" | "failed" }; updatedAt: string | null; inputs: { sourceText: string; website: string; ideaText: string; ideaKind: "build" | "join"; chats: Record<string,string> } };
export const STORAGE_KEY = "team-matcher-onboarding-v1";
export const VISIBILITIES: { value: Visibility; label: string }[] = [{value:"authenticated",label:"所有登录用户"},{value:"friends",label:"仅好友"},{value:"private",label:"仅自己"}];
export const EVENTS = [{id:"demo-weekend",name:"周末造物场",label:"周末造物场 · 示例活动"},{id:"demo-open",name:"开源共创夜",label:"开源共创夜 · 示例活动"}];
export const CHAPTERS = [{name:"认识你",start:1,end:3},{name:"了解你的偏好",start:4,end:5},{name:"让想法成形",start:6,end:8},{name:"遇见同频者",start:9,end:10}];
export const STEPS = ["提供资料","整理信息","初步核对","补充偏好","确认画像","讲讲想法","完善想法","最后确认","本活动寻找","遇见同伴"];
export const QUESTIONS = [
 {id:"communication",label:"合作时，你更习惯怎样沟通？",reason:"经历里看不到的小习惯，往往决定合作是否舒服。",field:"沟通方式",options:["先写下来，异步交流","定期短会，一起讨论","边做边聊，及时反馈"]},
 {id:"approach",label:"遇见一个新点子，你通常先做什么？",reason:"不用选最正确的答案，选最像你的那一个。",field:"做事方式",options:["做个小样，试试看","先把问题和需求想清楚","找几个伙伴碰一碰"]},
 {id:"partners",label:"你希望在这里遇见怎样的伙伴？",reason:"这会成为你介绍自己的一部分，之后仍可修改。",field:"合作期待",options:["技能互补，能一起做东西","对同一个问题好奇","乐于分享，也愿意尝试"]}
];
export const JOB_STEPS:Record<Phase,string[]> = {sources:["接收资料线索","整理经历与技能","准备待核对条目"],profile:["合并已确认的资料","加入你的合作偏好","准备逐条可见性预览"],idea:["保留你的原始想法","整理目标与第一步","生成可编辑的草稿"],match:["确认示例活动上下文","查找本活动的示例卡片","整理可以开始的对话"]};
export type Match = {id:string;eventId:string;kind:"person"|"idea";name:string;role:string;initial:string;tags:string[];description:string;reason:string;question:string;contribution:string};
export const MATCHES:Match[] = [
 {id:"demo-lin",eventId:"demo-weekend",kind:"person",name:"林予",role:"交互设计师",initial:"L",tags:["交互设计","快速原型"],description:"喜欢把模糊的想法画成能讨论的原型，最近在研究线下协作体验。",reason:"这张示例卡展示设计与实现之间可能的互补。",question:"可以从哪个具体场景开始验证？",contribution:"愿意一起梳理体验与做原型；投入时间仍需当面确认。"},
 {id:"demo-chen",eventId:"demo-weekend",kind:"person",name:"陈一",role:"全栈开发者",initial:"C",tags:["TypeScript","AI 应用"],description:"想在一个周末完成小而可用的作品，对协作工具很感兴趣。",reason:"示例方向接近协作工具，可以交流实现边界。",question:"第一版只保留哪一个功能？",contribution:"可以讨论前后端实现；是否加入项目由本人决定。"},
 {id:"demo-idea",eventId:"demo-weekend",kind:"idea",name:"灵感留声机",role:"想法草稿",initial:"I",tags:["线下活动","知识整理"],description:"把活动结束后的零散想法，变成一张大家能继续补充的行动卡。",reason:"这张示例想法可以作为交流问题和验证方式的起点。",question:"如何在活动结束后让讨论继续？",contribution:"希望一起研究信息整理和轻量交互。"},
 {id:"demo-open-luo",eventId:"demo-open",kind:"person",name:"洛可",role:"开源贡献者",initial:"K",tags:["开源","开发者体验"],description:"想让第一次参与开源的人更容易找到可以动手的小任务。",reason:"这是开源共创夜内唯一一张演示卡，不从其他活动补数。",question:"新人贡献的第一步有什么阻碍？",contribution:"愿意交流文档、社区引导和小工具。"}
];
export function createDraft():Draft {return {version:1,step:1,reached:1,skippedSources:false,sources:[],fields:[],answers:{},question:0,profileConfirmed:false,ideas:[],activeIdea:null,eventId:"demo-weekend",activities:{},job:null,savedFinal:false,completed:false,resultMode:"recommendation",matches:[],pendingFriends:[],followedIdeas:[],discussionRequests:[],settings:{sourceFailure:false,matchOutcome:"normal"},updatedAt:null,inputs:{sourceText:"",website:"",ideaText:"",ideaKind:"build",chats:{}}};}
export function newId(prefix:string){return prefix+"-"+globalThis.crypto.randomUUID();}
export function getField(draft:Draft,id:string){return draft.fields.find(f=>f.id===id)?.value||"";}
export function fieldVisible(field:ProfileField,audience:Audience){return audience==="self"||field.visibility==="authenticated"||(audience==="friends"&&field.visibility==="friends");}
export function visibleFields(draft:Draft,audience:Audience){return draft.fields.filter(f=>f.value.trim()&&fieldVisible(f,audience));}
export function setField(draft:Draft,id:string,value:string,label?:string):Draft {const found=draft.fields.find(f=>f.id===id);const field:ProfileField=found?{...found,value}:{id,label:label||id,value,visibility:"authenticated",origin:"本人填写"};return {...draft,fields:found?draft.fields.map(f=>f.id===id?field:f):[...draft.fields,field],profileConfirmed:false,savedFinal:false,completed:false,matches:[]};}
export function sampleFields():ProfileField[]{return [{id:"name",label:"昵称",value:"小夏"},{id:"intro",label:"一句话介绍",value:"我喜欢把还说不清的点子，慢慢变成大家可以一起试用的小产品。最近在关注线下活动中的协作：人们在现场聊得很投入，活动结束后，很多有意思的讨论却散落在不同的群聊和笔记里。\n\n我通常会先把问题画出来，再做一个能点击的原型。比起一次把功能想得很完整，我更愿意邀请真实参与者试一试，听他们描述哪里有帮助、哪里让人困惑。\n\n这次想认识愿意一起观察问题、分享不成熟想法的伙伴。开发者、设计师、组织者都可以，重要的是我们愿意一起动手。"},{id:"role",label:"我的角色",value:"前端开发者"},{id:"skill-react",label:"技能",value:"React"},{id:"skill-ts",label:"技能",value:"TypeScript"},{id:"skill-proto",label:"技能",value:"交互原型"},{id:"project",label:"作品线索",value:"曾在一个周末活动里，和朋友一起尝试做记录灵感的小工具。最初只有一张可以共同编辑的页面，大家在上面留下问题、草图和想继续讨论的方向。\n\n我的主要工作是整理交互流程、完成前端原型，并记录参与者试用时提出的问题。我们发现，让用户快速补上一句话，比要求他们一开始写完整计划更容易延续讨论。\n\n这还只是一次小范围尝试，并没有证明产品需求已经成立。后续希望把活动后的回访也接起来，看看哪些想法真的会继续。"}].map(f=>({...f,visibility:"authenticated",origin:"示例资料 · 待本人确认"}));}
export function sourceFields(draft:Draft):ProfileField[]{if(draft.fields.length)return draft.fields;if(draft.sources.some(s=>s.sample))return sampleFields();const text=draft.sources.find(s=>s.kind==="text"&&s.text?.trim())?.text?.trim();return text?[{id:"intro",label:"一句话介绍",value:text,visibility:"authenticated",origin:"自述原文摘录 · 未经 AI 分析"}]:[];}
export function mergeAnswers(draft:Draft):Draft {const keep=draft.fields.filter(f=>!QUESTIONS.some(q=>f.id==="answer-"+q.id));const added=QUESTIONS.flatMap(q=>{const value=draft.answers[q.id];if(!value)return [];const old=draft.fields.find(f=>f.id==="answer-"+q.id);return [{id:"answer-"+q.id,label:q.field,value,visibility:old?.visibility||"authenticated",origin:"本人选择"} as ProfileField];});return {...draft,fields:[...keep,...added],profileConfirmed:false,savedFinal:false,completed:false};}
export function makeIdea(description:string,kind:"build"|"join"):Idea{return {id:newId("idea"),kind,title:description.trim().split(/[。！\n]/)[0].slice(0,80),description:description.trim(),audience:"",firstStep:"",help:"",visibility:"private",revision:0,status:"draft",messages:[]};}
export function validIdea(idea:Idea){return Boolean(idea.description.trim()&&idea.title.trim());}
export function activityPlan(draft:Draft):ActivityPlan{return draft.activities[draft.eventId||""]||{role:"",time:"",discoverable:false};}
export function changeEvent(draft:Draft,eventId:string|null):Draft{return {...draft,eventId,matches:[],savedFinal:false,completed:false,job:draft.job?.kind==="match"?{...draft.job,status:"cancelled"}:draft.job};}
export function startJob(draft:Draft,kind:Phase,target?:string):Draft{const idea=draft.ideas.find(i=>i.id===target);return {...draft,job:{id:newId("job"),kind,status:"running",cursor:0,eventId:draft.eventId,target,revision:idea?.revision}};}
export function finishJob(draft:Draft,id:string):Draft{const job=draft.job;if(!job||job.id!==id||job.status!=="running")return draft;let next:Draft={...draft,job:{...job,cursor:3,status:"succeeded" as const}};
 if(job.kind==="sources"){next={...next,fields:sourceFields(draft),step:3,reached:Math.max(draft.reached,3)};}
 if(job.kind==="profile")next=mergeAnswers(next);
 if(job.kind==="idea"){const idea=draft.ideas.find(i=>i.id===job.target);if(!idea||idea.revision!==job.revision)return {...draft,job:{...job,status:"cancelled"}};next={...next,ideas:draft.ideas.map(i=>i.id===job.target?{...i,status:"ready"}:i)};}
 if(job.kind==="match"){if(job.eventId!==draft.eventId||!draft.eventId)return {...draft,job:{...job,status:"cancelled"}};next={...next,matches:draft.settings.matchOutcome==="empty"?[]:MATCHES.filter(m=>m.eventId===draft.eventId).map(m=>m.id),step:10,reached:10,resultMode:"recommendation"};}
 return next;
}
function record(value: unknown): value is Record<string, unknown> {
 return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
const stringValue = (value: unknown): value is string => typeof value === "string";
const nullableString = (value: unknown) => value === null || stringValue(value);
const integerBetween = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const stringMap = (value: unknown) => record(value) && Object.values(value).every(stringValue);
const stringArray = (value: unknown) => Array.isArray(value) && value.every(stringValue);
const visibilityValue = (value: unknown) => VISIBILITIES.some(v => v.value === value);
const uniqueIds = (values: {id: unknown}[]) => new Set(values.map(v => v.id)).size === values.length;

// Browser storage is untrusted input. Reject incomplete records without destroying them.
export function validateDraft(value: unknown): value is Draft {
 if (!record(value)) return false;
 const d = value;
 if (d.version !== 1 || !integerBetween(d.step, 1, 10) || !integerBetween(d.reached, d.step as number, 10) || !integerBetween(d.question, 0, QUESTIONS.length - 1)) return false;
 if (![d.skippedSources, d.profileConfirmed, d.savedFinal, d.completed].every(v => typeof v === "boolean")) return false;
 if (!nullableString(d.activeIdea) || !nullableString(d.eventId) || !nullableString(d.updatedAt) || !["recommendation", "browse"].includes(d.resultMode as string)) return false;
 if (!Array.isArray(d.fields) || !d.fields.every(f => record(f) && [f.id, f.label, f.value, f.origin].every(stringValue) && visibilityValue(f.visibility)) || !uniqueIds(d.fields)) return false;
 if (!Array.isArray(d.sources) || !d.sources.every(s => record(s) && [s.id, s.label].every(stringValue) && ["resume", "github", "text", "website"].includes(s.kind as string) && typeof s.sample === "boolean" && ["ready", "selected", "failed"].includes(s.status as string) && (s.text === undefined || stringValue(s.text))) || !uniqueIds(d.sources)) return false;
 if (!Array.isArray(d.ideas) || !d.ideas.every(i => record(i) && [i.id, i.title, i.description, i.audience, i.firstStep, i.help].every(stringValue) && ["build", "join"].includes(i.kind as string) && ["draft", "ready"].includes(i.status as string) && visibilityValue(i.visibility) && integerBetween(i.revision, 0) && Array.isArray(i.messages) && i.messages.every(m => record(m) && ["user", "assistant"].includes(m.role as string) && stringValue(m.text))) || !uniqueIds(d.ideas)) return false;
 if (d.activeIdea !== null && !d.ideas.some(i => i.id === d.activeIdea)) return false;
 if (!stringMap(d.answers) || !record(d.activities) || !Object.values(d.activities).every(a => record(a) && stringValue(a.role) && stringValue(a.time) && typeof a.discoverable === "boolean")) return false;
 if (!record(d.settings) || typeof d.settings.sourceFailure !== "boolean" || !["normal", "empty", "failed"].includes(d.settings.matchOutcome as string)) return false;
 if (!record(d.inputs) || ![d.inputs.sourceText, d.inputs.website, d.inputs.ideaText].every(stringValue) || !["build", "join"].includes(d.inputs.ideaKind as string) || !stringMap(d.inputs.chats)) return false;
 if (![d.matches, d.pendingFriends, d.followedIdeas, d.discussionRequests].every(stringArray)) return false;
 if (d.shortlisted !== undefined && !stringArray(d.shortlisted)) return false;
 if (d.job !== null) {
  const job = d.job;
  if (!record(job) || !stringValue(job.id) || !["sources", "profile", "idea", "match"].includes(job.kind as string) || !["running", "failed", "succeeded", "cancelled"].includes(job.status as string) || !integerBetween(job.cursor, 0, 3) || !nullableString(job.eventId) || (job.target !== undefined && !stringValue(job.target)) || (job.revision !== undefined && !integerBetween(job.revision, 0))) return false;
  if (job.kind === "idea" && (!stringValue(job.target) || !integerBetween(job.revision, 0))) return false;
 }
 return true;
}
