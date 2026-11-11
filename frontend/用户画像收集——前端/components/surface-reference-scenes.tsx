"use client";
import {useEffect,useRef,useState} from "react";
import {MotionConfig} from "motion/react";
import {Code2,Compass,Lightbulb,Palette,Sparkles,Users,Zap} from "lucide-react";
import {BackgroundBeamsWithCollision} from "./reference-kit/kit-beams";
import {AnimatedBackground} from "./reference-kit/kit-selection";
import {CardsHover,CardHover} from "./reference-kit/kit-cards-hover";
import Radar from "./reference-kit/kit-radar";
import Particles from "./reference-kit/kit-particles";
import {LogoCluster} from "./reference-originals/logo-cluster";
import {IntegrationGrid} from "./reference-originals/integration-grid";
import {OutreachBranches} from "./reference-originals/outreach-branches";
import {ModelWheel} from "./reference-originals/model-wheel";
import {SideFolder} from "./reference-originals/side-folder";
import {EmptyCalendar} from "./reference-originals/empty-calendar";
import {ProjectCard,type ProjectTask} from "./reference-originals/project-card";
import {NotificationStack,type Notice} from "./reference-originals/notification-stack";
import {SmartRecommendation} from "./reference-originals/smart-recommendation";
import {TipsPanel} from "./reference-originals/tips-panel";
import {Skeleton,ShimmerText} from "./reference-originals/shimmer-loader";
import {NumberTicker} from "./reference-originals/number-ticker";
import {TestimonialWall} from "./reference-originals/testimonial-wall";
import {LogoMarquee} from "./reference-originals/logo-marquee";
import {GradientFloor} from "./reference-originals/gradient-floor";
import {GridBackground} from "./reference-originals/grid-background";
import {TiltCard} from "./reference-originals/tilt-card";
import {BlurCrossfade} from "./reference-originals/blur-crossfade";
import "./surface-reference-scenes.css";

const choices=[{id:"build",name:"动手做",text:"把想法做成可以体验的东西",Icon:Code2},{id:"design",name:"想体验",text:"让每一步操作更容易理解",Icon:Palette},{id:"explore",name:"先探索",text:"和不同背景的伙伴聊聊",Icon:Compass}];
const notices:Notice[]=[{id:"a",title:"一个新章节",badge:"示例 1 / 3",text:"先看一张带轨道线稿的提示卡。",pattern:"orbit"},{id:"b",title:"线索正在变清晰",badge:"示例 2 / 3",text:"第二张使用网格线稿，作为章节间的小提示。",pattern:"grid"},{id:"c",title:"准备好遇见同伴",badge:"示例 3 / 3",text:"最后一张使用放射线稿，结束时再重播。",pattern:"rays"}];
const ideas=["我想做一个给朋友互相推荐音乐的小工具。","试试把身边的小麻烦，变成一个周末项目。","如果能和会设计的人一起做点东西就好了。","把一个复杂操作，缩成一个简单按钮。","做一个让第一次见面更自然的活动工具。","想把开源项目的第一步做得更友好。","用 AI 帮我整理散落在笔记里的想法。","先做一个能让三个人真正用起来的版本。","我可以写前端，希望认识愿意聊产品的人。"].map((quote,i)=>({quote,name:"示例 "+String.fromCharCode(65+i),role:"虚构想法片段"}));
const logos=[{name:"开发",svg:<Code2/>},{name:"设计",svg:<Palette/>},{name:"AI",svg:<Sparkles/>},{name:"探索",svg:<Compass/>},{name:"协作",svg:<Users/>},{name:"灵感",svg:<Lightbulb/>},{name:"试验",svg:<Zap/>},{name:"创造",svg:<Code2/>}];
const paletteSets:[string,string,string][]=[["var(--primary)","var(--secondary)","var(--lime)"],["#FF7700","#FF0055","#0073FF"],["var(--secondary)","var(--primary)","var(--night)"]];

function DemoCard(){return <article className="surface-profile"><span className="surface-eyebrow">PROFILE / DEMO</span><div className="surface-avatar">K</div><h2>Kai</h2><p>把一个小想法，做成可以一起体验的东西。</p><div className="surface-pills"><span>React</span><span>Design</span><span>AI</span></div><small>虚构画像 · 仅用于视觉对照</small></article>;}
function LoadingCard(){return <div className="surface-skeleton" aria-label="示例卡片正在生成"><Skeleton width={64} circle/><Skeleton width="55%" height={24}/><Skeleton width="90%"/><Skeleton width="72%"/><div className="surface-pills"><Skeleton width={70} height={28}/><Skeleton width={80} height={28}/></div><ShimmerText>正在整理示例卡片…</ShimmerText></div>;}
function SelectionDemo(){const[selected,setSelected]=useState("build");return <div className="surface-selections"><AnimatedBackground defaultValue={selected} onValueChange={value=>value&&setSelected(value)} className="surface-selection-layer" transition={{type:"spring",stiffness:250,damping:25}}>{choices.map(({id,name,text,Icon})=><button key={id} data-id={id} className="surface-select-card" aria-pressed={selected===id} onFocus={()=>setSelected(id)}><Icon size={25}/><strong>{name}</strong><span>{text}</span></button>)}</AnimatedBackground></div>;}

export default function SurfaceReferenceScene({slug}:{slug:string}){
 const[reduced,setReduced]=useState(false);const[paused,setPaused]=useState(false);const[columns,setColumns]=useState<5|7|9>(7);const[rows,setRows]=useState<1|2>(2);const[hovered,setHovered]=useState<string|null>("build");const[stackRun,setStackRun]=useState(0);const[dismissed,setDismissed]=useState(0);const[notice,setNotice]=useState("");const[loaded,setLoaded]=useState(false);const[count,setCount]=useState(8);const[background,setBackground]=useState("both");const[palette,setPalette]=useState(0);const[speed,setSpeed]=useState(5);const[border,setBorder]=useState("sliding");const[reveal,setReveal]=useState("loading");const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const[tasks,setTasks]=useState<ProjectTask[]>([{id:"idea",label:"写下一句话想法",done:true,assignee:"Kai"},{id:"sketch",label:"画出第一个页面",assignee:"Mika"},{id:"try",label:"邀请一位朋友试用",assignee:"Kai"}]);const[status,setStatus]=useState("progress");
 useEffect(()=>{const m=matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReduced(m.matches);update();m.addEventListener("change",update);return()=>{m.removeEventListener("change",update);if(timer.current)clearTimeout(timer.current);};},[]);
 const off=paused||reduced;
 const stage=<div className="surface-bg-copy"><span className="surface-eyebrow">BACKGROUND / COMPOSITION</span><h1>给故事一点空间。</h1><p>上方留给角色，中间留给引导，色光在下方流动。</p></div>;
 function generate(){if(timer.current)clearTimeout(timer.current);setReveal("working");timer.current=setTimeout(()=>setReveal("ready"),1400);}
 return <MotionConfig reducedMotion="user"><link rel="stylesheet" href="/reference-kit.css"/><div className={"surface-entry surface-"+slug}>
  {["kit-beams","kit-radar","kit-particles"].includes(slug)&&<><div className={"surface-kit-art "+(slug==="kit-beams"?"surface-kit-wide":"")} role="img" aria-label={slug==="kit-beams"?"光束落地装饰":slug==="kit-radar"?"雷达扫描装饰":"粒子波形装饰"}>{off?<img className="surface-still" src={"/reference-static/"+slug+".png"} alt="原版动效的浅色静态帧"/>:slug==="kit-beams"?<BackgroundBeamsWithCollision className="surface-beams"><div className="surface-bg-copy"><span className="surface-eyebrow">COSMIC / ORIGINAL COMPONENT</span><h1>让灵感落地。</h1><p>留意底部的光束与溅散。</p></div></BackgroundBeamsWithCollision>:slug==="kit-radar"?<Radar/>:<Particles/>}</div><div className="surface-controls"><button onClick={()=>setPaused(!paused)} disabled={reduced}>{off?"播放动效":"暂停动效"}</button></div>{off&&<p className="surface-note">静态帧对照；系统减少动态设置优先。</p>}</>}
  {slug==="kit-selection"&&<SelectionDemo/>}
  {slug==="kit-cards-hover"&&<CardsHover value={hovered} onValueChange={setHovered} className="surface-hover-cards">{choices.map(({id,name,text,Icon})=><CardHover key={id} value={id} role="button" tabIndex={0} aria-label={name} aria-pressed={hovered===id} onFocus={()=>setHovered(id)} onClick={()=>setHovered(id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setHovered(id);}}}><Icon size={32}/><h2>{name}</h2><p>{text}</p></CardHover>)}</CardsHover>}
  {slug==="logo-cluster"&&<LogoCluster/>}
  {slug==="integration-grid"&&<><IntegrationGrid columns={columns}/><div className="surface-controls">{([5,7,9] as const).map(n=><button key={n} aria-pressed={columns===n} onClick={()=>setColumns(n)}>{n} 列</button>)}</div></>}
  {slug==="outreach-branches"&&<OutreachBranches/>}
  {slug==="model-wheel"&&<ModelWheel/>}
  {slug==="side-folder"&&<SideFolder/>}
  {slug==="empty-calendar"&&<EmptyCalendar/>}
  {slug==="project-card"&&<ProjectCard title="一个周末的小项目 · 示例" tasks={tasks} onTasksChange={setTasks} status={status} onStatusChange={setStatus} members={[{name:"Kai"},{name:"Mika"}]} hint="悬停或点击展开，试试勾选任务。" action={{label:"查看演示说明",onClick:()=>setNotice("项目、成员和任务均为虚构，修改只留在当前页面。")}}/>}
  {slug==="notification-stack"&&<><NotificationStack key={stackRun} notices={notices} onDismiss={()=>setDismissed(n=>n+1)}/><div className="surface-controls"><button onClick={()=>{setStackRun(n=>n+1);setDismissed(0);}}>重置叠卡</button></div><p role="status" className="surface-note">已关闭 {dismissed} / 3 张示例提示</p></>}
  {slug==="smart-recommendation"&&<SmartRecommendation title="可以怎样开始 · 演示建议" options={[{id:"prototype",label:"先做一个原型",reason:"用可操作的小样快速沟通方向。",signal:0},{id:"talk",label:"先聊一个场景",reason:"明确谁会使用、为什么会使用。",signal:0},{id:"sketch",label:"先画一个流程",reason:"把关键步骤放在一起看。",signal:0}]} onAccept={o=>setNotice("已接受示例："+o.label)} onUndo={()=>setNotice("已撤销示例选择")}/>}
  {slug==="tips-panel"&&<TipsPanel title="可选的小补充 · 演示" tips={[{id:"one",title:"加一个作品线索",description:"让别人更容易理解你做过什么。",action:"体验完成反馈",doneLabel:"已体验",primary:true},{id:"two",title:"补一句期待",description:"说说你希望一起探索的方向。",action:"标记演示完成",doneLabel:"已体验"},{id:"three",title:"看看展示范围",description:"正式产品里需要由本人确认。",action:"体验勾选",doneLabel:"已体验"}]}/>}
  {slug==="shimmer-loader"&&<><BlurCrossfade id={loaded?"ready":"loading"}>{loaded?<DemoCard/>:<LoadingCard/>}</BlurCrossfade><div className="surface-controls"><button onClick={()=>setLoaded(!loaded)}>{loaded?"返回占位状态":"显示示例结果"}</button></div></>}
  {slug==="number-ticker"&&<div className="surface-ticker"><span className="surface-eyebrow">示例条目数量</span><NumberTicker value={count} locale="zh-CN"/><div className="surface-controls"><button onClick={()=>setCount(n=>Math.max(0,n-1))}>减少一条</button><button onClick={()=>setCount(n=>n+1)}>增加一条</button><button onClick={()=>setCount(28)}>跳到 28 条</button></div><p className="surface-note">仅看数字转换，不代表实际资料数量。</p></div>}
  {slug==="testimonial-wall"&&<TestimonialWall items={ideas} columns={3} speed={28} label="虚构想法卡墙，非真实用户评价"/>}
  {slug==="logo-marquee"&&<><LogoMarquee logos={logos} rows={rows} labels="below" speed={35} label="示例兴趣标签带"/><div className="surface-controls"><button aria-pressed={rows===1} onClick={()=>setRows(1)}>单排</button><button aria-pressed={rows===2} onClick={()=>setRows(2)}>双排</button></div></>}
  {slug==="background-composer"&&<><div className="surface-background-stage">{background==="grid"?<GridBackground size={56} speed={8}>{stage}</GridBackground>:background==="floor"?<GradientFloor colors={paletteSets[palette]} speed={speed}>{stage}</GradientFloor>:<GridBackground size={56} speed={8}><GradientFloor colors={paletteSets[palette]} speed={speed}>{stage}</GradientFloor></GridBackground>}</div><div className="surface-controls">{["floor","grid","both"].map((v,i)=><button key={v} aria-pressed={background===v} onClick={()=>setBackground(v)}>{["只看色光","只看网格","组合背景"][i]}</button>)}</div><div className="surface-controls">{["Signalry 主题","原版暖色","夜紫色光"].map((v,i)=><button key={v} aria-pressed={palette===i} onClick={()=>setPalette(i)}>{v}</button>)}<label>形变周期 <select aria-label="色光形变周期" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={3}>3 秒</option><option value={5}>5 秒</option><option value={9}>9 秒</option></select></label></div></>}
  {slug==="border-composer"&&<><div className="surface-controls surface-controls-top">{["sliding","glow","glare"].map((v,i)=><button key={v} aria-pressed={border===v} onClick={()=>setBorder(v)}>{["游走细描边","底部流动光框","反光卡面"][i]}</button>)}</div>{border==="sliding"?<SelectionDemo/>:border==="glow"?<GradientFloor colors={paletteSets[0]} className="surface-rim"><DemoCard/></GradientFloor>:<TiltCard className="surface-tilt"><DemoCard/></TiltCard>}<p className="surface-note">由现有组件与外层样式组合，三种边缘反馈分别观察。</p></>}
  {slug==="card-reveal-scene"&&<><BlurCrossfade id={reveal} duration={650}>{reveal==="ready"?<TiltCard className="surface-tilt"><DemoCard/></TiltCard>:<LoadingCard/>}</BlurCrossfade><div className="surface-controls"><button onClick={generate} disabled={reveal==="working"}>{reveal==="working"?"正在播放演示":"生成示例卡片"}</button><button onClick={()=>{if(timer.current)clearTimeout(timer.current);setReveal("loading");}}>重置</button></div><p className="surface-note">预设入场演示，无真实 AI 生成。</p></>}
  {notice&&<p className="surface-result" role="status">{notice}</p>}
 </div></MotionConfig>;
}

