"use client";
import { useEffect, useRef, useState } from "react";
import { Code2, Palette, Sparkles, Users, WandSparkles, Zap } from "lucide-react";
import { GlowCloud } from "./reference-originals/glow-cloud";
import { GlassFolder } from "./reference-originals/glass-folder";
import { IntegrationBeam } from "./reference-originals/integration-beam";
import { IntegrationFlow } from "./reference-originals/integration-flow";
import { AgentTeam } from "./reference-originals/agent-team";
import { ProjectFlow } from "./reference-originals/project-flow";
import { LayerStack } from "./reference-originals/layer-stack";
import { CoverFlow } from "./reference-originals/cover-flow";
import { TeamInvite } from "./reference-originals/team-invite";
import { BlurCrossfade } from "./reference-originals/blur-crossfade";
import { TiltCard } from "./reference-originals/tilt-card";
import { GradientText } from "./reference-originals/gradient-text";
import { TextReveal } from "./reference-originals/text-reveal";
import { GridBackground } from "./reference-originals/grid-background";
import { DecisionCard, type Decision } from "./reference-originals/decision-card";
import { AgentTrail, type TrailStep } from "./reference-originals/agent-trail";
import { WritingAssistant } from "./reference-originals/writing-assistant";
import { PromptLibrary, type PromptTemplate } from "./reference-originals/prompt-library";
import { TagInput } from "./reference-originals/tag-input";
import { Dropzone } from "./reference-originals/dropzone";
import "./expanded-reference-scenes.css";

const avatar = (letter: string, fill: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="30" fill="'+fill+'"/><text x="60" y="77" text-anchor="middle" font-family="sans-serif" font-size="48" fill="white">'+letter+'</text></svg>');
const avatars: [{src:string;name:string},{src:string;name:string},{src:string;name:string}] = [{src:avatar("K","#5B3DF5"),name:"Kai · 示例"},{src:avatar("M","#6E6C7E"),name:"Mika · 示例"},{src:avatar("J","#16122B"),name:"Jun · 示例"}];
const questions: Decision[] = [
  {id:"role",task:"合作偏好 · 演示 1 / 3",question:"你更想怎样参与一个项目？",options:[{id:"build",title:"把东西做出来",summary:"开发、实现和迭代"},{id:"design",title:"把体验想清楚",summary:"设计、研究和表达"},{id:"explore",title:"先一起探索",summary:"方向还没定，可以边做边聊"}]},
  {id:"pace",task:"合作偏好 · 演示 2 / 3",question:"你偏好的合作节奏是什么？",options:[{id:"sprint",title:"周末集中冲刺"},{id:"steady",title:"每周推进一点"},{id:"flexible",title:"先聊聊再决定"}]},
  {id:"meet",task:"合作偏好 · 演示 3 / 3",question:"这次最希望遇到哪种伙伴？",options:[{id:"complement",title:"能力互补的伙伴"},{id:"interest",title:"兴趣相近的朋友"},{id:"open",title:"都想认识一下"}]},
];
const snippets = ["先给我一点线索。", "你做过的项目、喜欢的方向，都可以成为我们认识你的起点。", "画像准备好了。\n接下来，你可以逐项修改，再决定如何介绍自己。"];
const coverNames=["AI 试验室","周末小工具","城市探索","设计练习","开源积木","新的想法"];
const coverIcons=[<Sparkles key="a"/>,<Zap key="b"/>,<Users key="c"/>,<Palette key="d"/>,<Code2 key="e"/>,<WandSparkles key="f"/>];
const coverItems=coverNames.map((title,i)=>({id:i,title,subtitle:"示例作品 · 仅体验卡片动效",cover:<div className={"sample-cover cover-tone-"+i}><span className="sample-cover-number">0{i+1}</span>{coverIcons[i]}<strong>{title}</strong><small>DEMO / EXPLORATION</small></div>}));
const templates: PromptTemplate[] =[{id:"intro",title:"介绍自己",category:"认识你",body:"I enjoy {skills} and want to explore {goal}.",variables:{skills:{description:"擅长或喜欢的事",default:"building small apps"},goal:{description:"想探索的方向"}}},{id:"idea",title:"说一个想法",category:"聊想法",body:"I want to help {people} solve {problem} with {idea}.",variables:{people:{description:"想帮助谁"},problem:{description:"遇到什么问题"},idea:{description:"一个初步想法"}}},{id:"team",title:"寻找同伴",category:"找伙伴",body:"I can bring {skills}. I would love to meet someone who enjoys {interest}.",variables:{skills:{description:"你能贡献什么"},interest:{description:"希望对方喜欢什么"}}}];

export default function ExpandedReferenceScene({slug,dark}:{slug:string;dark:boolean}) {
  const [cloudColor,setCloudColor]=useState<"blue"|"orange">("blue");
  const [snippet,setSnippet]=useState(0);
  const [gridDirection,setGridDirection]=useState<"diagonal"|"up"|"right">("diagonal");
  const [openQuestions,setOpenQuestions]=useState(questions);
  const [answers,setAnswers]=useState<string[]>([]);
  const [tags,setTags]=useState(["React","交互设计"]);
  const [result,setResult]=useState("");
  const [trailMode,setTrailMode]=useState(1);
  const [playing,setPlaying]=useState(false);
  const [started,setStarted]=useState<number>();
  const resetButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{setStarted(Date.now());},[trailMode]);
  useEffect(()=>{if(!playing)return;const id=setInterval(()=>setTrailMode(value=>{if(value>=4){setPlaying(false);return value;}return value+1;}),2000);return()=>clearInterval(id);},[playing]);
  const done=trailMode===4;
  const steps:TrailStep[]=[
    {id:"read",title:"读取示例资料",state:trailMode===0?"running":"done",status:"读取中",startedAt:started,duration:1200},
    {id:"organize",title:"整理能力与项目",state:trailMode===0?"pending":trailMode===1?"running":trailMode===3?"failed":"done",status:"整理中",startedAt:started,duration:1800,substeps:[{title:"提取项目线索",state:"done",detail:"示例资料"},{title:"归纳技能标签",state:trailMode===1?"running":"done",detail:"演示"},{title:"形成待核对卡片",state:trailMode===1?"pending":"done"}]},
    {id:"review",title:"交给本人核对",state:done?"done":trailMode===2?"waiting":"pending",gate:true},
  ];
  const note=<p className="scene-demo-note">交互与数据均为演示，不连接 AI 或外部账号。</p>;
  return <div className={"expanded-scene expanded-"+slug}>
    {slug==="glow-cloud"&&<><GlowCloud color={cloudColor} className="scene-cloud"/><div className="scene-controls"><button onClick={()=>setCloudColor("blue")} aria-pressed={cloudColor==="blue"}>蓝色角色</button><button onClick={()=>setCloudColor("orange")} aria-pressed={cloudColor==="orange"}>橙色角色</button></div></>}
    {slug==="glass-folder"&&<div className="original-light-stage"><GlassFolder/></div>}
    {slug==="integration-beam"&&<IntegrationBeam/>}
    {slug==="integration-flow"&&<IntegrationFlow/>}
    {slug==="agent-team"&&<AgentTeam prompt="让一个周末的想法，长出三种分工。" members={[{role:"开发 · 示例",avatar:avatars[0].src},{role:"设计 · 示例",avatar:avatars[1].src},{role:"探索 · 示例",avatar:avatars[2].src}]}/>}
    {slug==="project-flow"&&<ProjectFlow theme={dark?"dark":"light"}/>}
    {slug==="layer-stack"&&<LayerStack items={[{title:"做过的项目",hint:"作品",icon:"database"},{title:"能贡献的能力",hint:"技能",icon:"bolt"},{title:"想探索的方向",hint:"兴趣",icon:"spark"},{title:"合作的方式",hint:"偏好",icon:"plug"},{title:"希望遇见的人",hint:"伙伴",icon:"pulse"}]}/>}
    {slug==="cover-flow"&&<><CoverFlow aria-label="示例作品卡片" items={coverItems} itemWidth={250} itemHeight={300} onSelect={item=>setResult("当前选择："+item.title+"（示例作品）")}/><p className="scene-result" role="status">{result||"拖动卡片，或用左右方向键；点击中间卡片选择。"}</p></>}
    {slug==="team-invite"&&<TeamInvite avatars={avatars}/>}
    {slug==="blur-crossfade"&&<div className="scene-panel"><div className="scene-kicker">局部换场演示</div><div aria-live="polite"><BlurCrossfade id={snippet}><h1 className="scene-message">{snippets[snippet]}</h1></BlurCrossfade></div><div className="scene-controls">{snippets.map((_,i)=><button key={i} aria-pressed={snippet===i} onClick={()=>setSnippet(i)}>第 {i+1} 段</button>)}</div></div>}
    {slug==="tilt-card"&&<TiltCard className="scene-profile-tilt" maxTilt={12}><div className="sample-profile"><div className="scene-kicker">PROFILE / DEMO</div><div className="sample-avatar">K</div><h1>Kai</h1><p>喜欢把小想法做成小产品。</p><div className="sample-profile-tags"><span>React</span><span>Design</span><span>AI</span></div><span className="sample-profile-foot">示例画像卡 · 展示动效</span></div></TiltCard>}
    {slug==="gradient-text"&&<div className="scene-typography"><span className="scene-kicker">FLOWING COLOR</span><h1>一起做点<GradientText>有趣的事。</GradientText></h1><p>原版 Gradient Text 的首次扫入与持续流动。</p></div>}
    {slug==="text-reveal"&&<div className="scene-typography"><span className="scene-kicker">A NEW CHAPTER</span><TextReveal text="你好，未来的队友。" as="h1" by="char" stagger={70} duration={650}/><p>点击外层「重新播放」再看一次。</p></div>}
    {slug==="grid-background"&&<GridBackground direction={gridDirection} size={56} className="scene-grid"><h1>Ideas take shape.</h1><div className="scene-controls">{(["diagonal","up","right"] as const).map((value,i)=><button key={value} aria-pressed={gridDirection===value} onClick={()=>setGridDirection(value)}>{["斜向","向上","向右"][i]}</button>)}</div></GridBackground>}
    {slug==="decision-card"&&<div className="scene-form"><div className="scene-kicker">逐题交互 · 三道示例问题</div><DecisionCard decisions={openQuestions} labels={{needsYou:"想了解你",later:"稍后再答",show:"展开",own:"也可以用自己的话说"}} onDecide={(id,answer)=>{const q=questions.find(q=>q.id===id);const text=typeof answer==="string"?answer:answer.text||q?.options?.find(o=>o.id===answer.option)?.title||"已选择";setAnswers(list=>[...list,text]);setOpenQuestions(list=>list.filter(q=>q.id!==id));if(openQuestions.length===1)requestAnimationFrame(()=>resetButton.current?.focus());}}/>{answers.length>0&&<div className="scene-answer-list" role="status">{answers.map((answer,i)=><p key={i}>已选择：{answer}</p>)}</div>}<div className="scene-controls"><button ref={resetButton} onClick={()=>{setOpenQuestions(questions);setAnswers([]);}}>重新答题</button></div>{note}</div>}
    {slug==="agent-trail"&&<div className="scene-form"><AgentTrail title="把资料整理成一张画像卡 · 演示" steps={steps}/><div className="scene-controls">{["读取","整理","待确认","失败","完成"].map((label,i)=><button key={label} aria-pressed={trailMode===i} onClick={()=>{setPlaying(false);setTrailMode(i);}}>{label}</button>)}<button onClick={()=>{setTrailMode(0);setPlaying(true);}} disabled={playing}>播放状态演示</button></div>{note}</div>}
    {slug==="writing-assistant"&&<div className="scene-form"><WritingAssistant name="CoLab Demo" tagline="原版动效 · 预设回复 · 模拟语音" greeting="想一起做点什么？" suggestions={["把我的想法整理一下","还没想好，从哪里开始？"]} speech="simulate" dictation="I want to build a small weekend project with a new teammate." respond={()=>"这是一段预设回复。 可以先确定一个具体的人、 一个小问题， 再想想一个周末能做出什么。 你可以继续输入，体验原版的回复动效。"}/><p className="scene-demo-note">麦克风仅模拟转写，不录音；回复不来自真实模型。</p></div>}
    {slug==="prompt-library"&&<><PromptLibrary title="一句话起步 · 演示" templates={templates} useLabel="使用这句话" onUse={prompt=>setResult(prompt)}/><p className="scene-result" role="status">{result?"已生成示例句子："+result:"只补空位，查看下方句子如何实时拼好。"}</p></>}
    {slug==="tag-input"&&<div className="scene-form"><h1 className="scene-small-title">给已有技能补几个标签</h1><TagInput label="技能与兴趣（演示）" value={tags} onChange={setTags} max={8} placeholder="输入关键词，按 Enter" hint="可以粘贴 React, TypeScript, AI；重复值会闪烁提示。"/><div className="scene-controls"><button onClick={()=>setTags(["React","交互设计"])}>恢复示例标签</button></div>{note}</div>}
    {slug==="dropzone"&&<div className="scene-form"><Dropzone autoplay accept={[".pdf",".txt",".md",".docx"]} maxSize={10*1024*1024} hint="本地演示 · 不上传、不读取文件内容 · 最大 10 MB" onUpload={async(_file,progress)=>{for(let i=1;i<=5;i++){await new Promise(resolve=>setTimeout(resolve,250));progress(i/5);}}}/><p className="scene-demo-note">预设文件队列与进度演示；可选择本地文件观察交互。</p></div>}
  </div>;
}

