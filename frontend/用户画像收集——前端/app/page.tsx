"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, CheckCheck, ChevronDown, Code2, Compass, FileText, Fingerprint, Lightbulb, MessageCircle, Moon, Pause, Play, RotateCcw, Send, ShieldCheck, Sparkles, Sun, WandSparkles, X } from "lucide-react";
import { VoiceOrb, type VoiceOrbState } from "@/components/affectui/voice-orb";
import { Button } from "@/components/affectui/button-clean";
import { SegmentedControl } from "@/components/affectui/segmented-control-clean";
import { TextArea } from "@/components/affectui/text-area-clean";
import { ThinkingLoader } from "@/components/affectui/thinking-loader-clean";
import { ThinkingState, type ThinkingStep } from "@/components/affectui/thinking-state-clean";
import { AIAnswer } from "@/components/affectui/ai-answer-clean";
import { Dropzone } from "@/components/affectui/dropzone-clean";
import { TextReveal } from "@/components/affectui/text-reveal";

type Stage = "start" | "thinking" | "profile" | "chat";
const stages: { value: Stage; label: string; icon: React.ReactNode; controls: string }[] = [
  { value: "start", label: "认识你", icon: <Fingerprint size={16} />, controls: "preview-panel" },
  { value: "thinking", label: "整理中", icon: <Sparkles size={16} />, controls: "preview-panel" },
  { value: "profile", label: "画像卡", icon: <Code2 size={16} />, controls: "preview-panel" },
  { value: "chat", label: "聊想法", icon: <MessageCircle size={16} />, controls: "preview-panel" },
];
const copy: Record<Stage, { title: string; description: string; note: string }> = {
  start: { title: "你好，未来的队友。", description: "带上你做过的事、擅长的事，还有那些未完成的想法。\n我们从一点点线索开始，慢慢认识你。", note: "不必从一张空白表格开始" },
  thinking: { title: "把你的闪光点，串起来。", description: "从经历到能力，从兴趣到期待。\n整理的每一步，都让你看得见。", note: "让等待也有清晰的回应" },
  profile: { title: "这张卡片，有点像你吗？", description: "让别人看到你能做什么，也看到你想做什么。\n你可以修改每一处，再决定如何介绍自己。", note: "你的介绍，最终由你决定" },
  chat: { title: "好想法，从聊一聊开始。", description: "不需要一份完整的计划。\n先说说那个让你有点兴奋的念头。", note: "一句话，也可以是一个开始" },
};
const phases = ["正在读取示例资料", "正在整理能力与经历", "正在准备可修改的卡片"];
const steps: ThinkingStep[] = [
  { kind: "search", label: "已选用演示资料", sources: [{ label: "示例介绍.txt" }, { label: "示例项目" }] },
  { kind: "step", label: "归纳技术、作品和合作偏好" },
  { kind: "step", label: "准备一张可以修改的画像卡" },
];
const suggestions = ["把想法做成产品", "一起做 AI 应用", "认识不同领域的人"];

function StillOrb() {
  // Static projection of the same Fibonacci sphere used by AffectUI VoiceOrb.
  return <svg className="still-orb" viewBox="0 0 220 220" role="img" aria-label="AI 引导形象，静止模式">
    {Array.from({ length: 320 }, (_, i) => {
      const y = 1 - i / 319 * 2;
      const radius = Math.sqrt(1 - y * y);
      const a = Math.PI * (3 - Math.sqrt(5)) * i;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      return <circle key={i} cx={110 + x * 76} cy={110 + y * 76} r={z > 0 ? 1.4 : 1} opacity={0.15 + (z + 1) * 0.34} fill="currentColor" />;
    })}
  </svg>;
}

export default function PreviewPage() {
  const [stage, setStage] = useState<Stage>("start");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [reduced, setReduced] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const [intro, setIntro] = useState("");
  const [phase, setPhase] = useState(0);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [run, setRun] = useState(0);
  const [nickname, setNickname] = useState("Kai");
  const [headline, setHeadline] = useState("喜欢把小想法，做成能用的小产品。");
  const [skills, setSkills] = useState(["React", "TypeScript", "交互设计"]);
  const [visibility, setVisibility] = useState("authenticated");
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [answer, setAnswer] = useState("如果只用一个周末，你最想做出什么？\n\n可以从一个具体的小麻烦开始，也可以聊聊你希望认识什么样的伙伴。");
  const [streaming, setStreaming] = useState(false);
  const [toast, setToast] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLElement>(null);
  const motionOff = reduced || systemReduced;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReduced(media.matches);
    const update = () => setSystemReduced(media.matches);
    media.addEventListener("change", update);
    try {
      setTheme(localStorage.getItem("profile-preview-theme") === "dark" ? "dark" : "light");
      setReduced(localStorage.getItem("profile-preview-motion") === "reduced");
    } catch { /* The preview also works without persistent storage. */ }
    setReady(true);
    return () => { media.removeEventListener("change", update); timers.current.forEach(clearTimeout); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.motion = motionOff ? "reduced" : "full";
    if (motionOff) document.getAnimations().forEach(animation => animation.cancel());
    try { localStorage.setItem("profile-preview-theme", theme); localStorage.setItem("profile-preview-motion", reduced ? "reduced" : "full"); } catch { /* Optional preferences only. */ }
  }, [theme, reduced, systemReduced, ready, motionOff]);

  function notify(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }
  function cancelPending() { timers.current.forEach(clearTimeout); timers.current = []; setStreaming(false); }
  function later(callback: () => void, delay: number) { timers.current.push(setTimeout(callback, delay)); }
  function startPreview() {
    cancelPending(); setStage("thinking"); setRunning(true); setFailed(false); setPhase(0); setRun(n => n + 1);
    later(() => setPhase(1), 850);
    later(() => setPhase(2), 1850);
    later(() => { setRunning(false); }, 3000);
  }
  function chooseStage(value: Stage) {
    cancelPending(); setRunning(false); setFailed(false);
    if (value === "thinking") startPreview();
    else setStage(value);
  }
  function simulateFailure() { cancelPending(); setRunning(false); setFailed(true); }
  function sendMessage(value: string) {
    const clean = value.trim();
    if (!clean || streaming) return;
    cancelPending(); setStage("chat"); setLastPrompt(clean); setPrompt(""); setAnswer(""); setStreaming(true);
    const response = "先把范围缩小一点，我们可以一起确认三件事。\n\n- 谁会遇到你说的这个问题？\n- 一个周末能做出哪一小部分？\n- 你希望伙伴带来什么能力？\n\n你想先从哪一件聊起？";
    for (let end = 6; end < response.length + 6; end += 6) {
      const position = Math.min(end, response.length);
      later(() => { setAnswer(response.slice(0, position)); if (position === response.length) setStreaming(false); }, 350 + end * 12);
    }
  }
  const orbState: VoiceOrbState = running ? "thinking" : streaming ? "speaking" : "idle";
  const body = copy[stage];

  return (
    <div className="preview-shell">
      <div className="atmosphere" aria-hidden="true"><div className="background-grid" /><div className="light-cloud cloud-one" /><div className="light-cloud cloud-two" /></div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="同频，返回预览首页"><span className="brand-mark"><span /><span /><span /></span><span className="brand-word">CoLab<span className="brand-cn">同频</span></span></a>
        <span className="preview-label"><span />关键元素预览</span>
        <div className="header-actions">
          <Button variant="ghost" className="icon-control" aria-label={motionOff ? "开启动画" : "减少动态效果"} title={systemReduced ? "跟随系统减少动态效果" : motionOff ? "开启动画" : "减少动态效果"} aria-pressed={motionOff} disabled={systemReduced} onClick={() => setReduced(!reduced)} icon={motionOff ? <Play size={18} /> : <Pause size={18} />} />
          <Button variant="ghost" className="icon-control" aria-label={theme === "light" ? "切换到夜间模式" : "切换到浅色模式"} onClick={() => setTheme(theme === "light" ? "dark" : "light")} icon={theme === "light" ? <Moon size={18} /> : <Sun size={18} />} />
        </div>
      </header>

      <main className="main-stage">
        <div className="stage-intro">
          <div className="orb-scene">
            <div className="orb-halo" aria-hidden="true" />
            <div className="orb-visual" aria-hidden="true">{motionOff ? <StillOrb /> : <VoiceOrb state={orbState} size={210} dots={680} interactive={false} label={false} />}</div>
            <span className="orb-status" role="status"><span className={running || streaming ? "status-dot busy" : "status-dot"} />{failed ? "随时可以再试一次" : running ? "正在整理示例" : streaming ? "正在输出演示回复" : "我在，慢慢来"}</span>
          </div>
          <div className="intro-copy" key={stage}>
            <h1>{body.title}</h1>
            <p className="stage-description">{body.description}</p>
          </div>
        </div>

        <div className="stage-navigation">
          <SegmentedControl<Stage> options={stages} value={stage} onChange={chooseStage} kind="tabs" variant="tray" fullWidth aria-label="切换关键元素预览" className="stage-tabs" />
        </div>

        <section ref={panel} id="preview-panel" className={"interaction-panel panel-" + stage} role="tabpanel" aria-label={stages.find(item => item.value === stage)?.label} tabIndex={0}>
          {stage === "start" && <div className="entry-content content-enter">
            <div className="panel-heading"><span className="mini-icon"><Fingerprint size={18} /></span><span>从一小段介绍开始</span><span className="quiet-tag">无需填满</span></div>
            <TextArea label="你最近在做什么？" placeholder="比如：我是个喜欢设计的前端，最近想做一个 AI 小工具……" value={intro} onChange={event => setIntro(event.target.value)} minRows={2} maxRows={5} maxLength={600} onSubmitShortcut={startPreview} className="intro-input" />
            <div className="suggestions" aria-label="试用一句话介绍">{suggestions.map(text => <Button key={text} variant="secondary" size="sm" className="suggestion" onClick={() => setIntro(text)}>{text}</Button>)}</div>
            <div className="entry-actions"><span className="helper"><ShieldCheck size={15} />本页输入只留在当前页面</span><Button className="primary-action" iconRight={<ArrowRight size={17} />} onClick={startPreview}>{intro.trim() ? "试试整理成卡片" : "用示例体验一下"}</Button></div>
            <details className="upload-disclosure"><summary><FileText size={15} />或者，从已有资料开始<ChevronDown size={15} /></summary><div className="upload-content"><p>拖入一个文件，体验上传反馈。这里只演示进度，不读取文件内容，也不会上传。</p><Dropzone accept={[".pdf", ".docx", ".txt", ".md"]} maxSize={10 * 1024 * 1024} hint="PDF / DOCX / TXT / MD · 演示限制 10 MB · 仅本地反馈" onUpload={async (_file, progress) => { for (let i = 1; i <= 5; i++) { await new Promise(resolve => setTimeout(resolve, 180)); progress(i / 5); } }} /></div></details>
          </div>}

          {stage === "thinking" && <div className="processing-content content-enter">
            <div className="panel-heading"><span className="mini-icon"><Sparkles size={18} /></span><span>一点点线索，慢慢变清晰</span><span className="quiet-tag">进度演示</span></div>
            {failed ? <div className="failure-state" role="alert"><span className="failure-icon"><RotateCcw size={22} /></span><h2>这次整理停住了</h2><p>这是失败状态演示。你的输入还在，可以重试或先看看示例卡片。</p></div> : <><ThinkingLoader key={"loader" + run} phases={phases} phase={phase} done={!running} doneLabel="示例整理完成" className="main-loader" /><ThinkingState key={"steps" + run} steps={steps} stepMs={650} doneLabel="演示步骤已播放完" className="process-trail" /><p className="simulation-note">预设过程演示，不代表真实资料分析。</p></>}
            <div className="entry-actions"><Button variant="ghost" icon={<RotateCcw size={15} />} onClick={startPreview}>重新播放</Button>{running ? <Button variant="secondary" onClick={simulateFailure}>试试失败状态</Button> : <Button className="primary-action" iconRight={<ArrowRight size={17} />} onClick={() => chooseStage("profile")}>看看示例画像</Button>}</div>
          </div>}

          {stage === "profile" && <div className="profile-content content-enter">
            <div className="panel-heading"><span className="mini-icon"><CheckCheck size={18} /></span><span>一张介绍自己的小卡片</span><span className="quiet-tag">虚构示例</span></div>
            <div className="persona-header"><div className="avatar">{nickname.charAt(0) || "K"}<span><Sparkles size={12} /></span></div><div className="persona-identity"><label htmlFor="nickname">怎么称呼你</label><input id="nickname" value={nickname} maxLength={32} onChange={event => setNickname(event.target.value)} /><p>开发者 · 喜欢设计与 AI</p></div><span className="editable-badge">可编辑</span></div>
            <label className="field-label" htmlFor="headline">一句话介绍</label><input id="headline" className="headline-field" value={headline} maxLength={160} onChange={event => setHeadline(event.target.value)} />
            <div className="profile-block"><span className="field-label">我能带来的</span><div className="skill-chips">{skills.map(skill => <button key={skill} type="button" onClick={() => setSkills(skills.filter(item => item !== skill))} aria-label={"移除技能 " + skill}>{skill}<X size={12} /></button>)}{skills.length < 3 && <button className="restore-skill" onClick={() => setSkills(["React", "TypeScript", "交互设计"])}>恢复示例</button>}</div></div>
            <div className="persona-interest"><Lightbulb size={18} /><div><span>想一起探索</span><p>{intro || "把一个有趣的 AI 点子，做成第一个能用的版本。"}</p></div></div>
            <div className="visibility-control"><label htmlFor="visibility"><ShieldCheck size={15} />这条介绍的展示范围</label><select id="visibility" value={visibility} onChange={event => setVisibility(event.target.value)}><option value="authenticated">所有登录用户可见</option><option value="friends">好友可见</option><option value="private">仅自己可见</option></select></div>
            <div className="entry-actions"><span className="helper">只调整示例，不保存正式资料</span><Button className="primary-action" iconRight={<ArrowRight size={17} />} onClick={() => chooseStage("chat")}>接着聊聊想法</Button></div>
          </div>}

          {stage === "chat" && <div className="chat-content content-enter">
            <div className="panel-heading"><span className="mini-icon"><Lightbulb size={18} /></span><span>让一个小念头，往前走一步</span><span className="quiet-tag">预设回复</span></div>
            {lastPrompt && <div className="user-message"><span>你</span><p>{lastPrompt}</p></div>}
            <div className="assistant-label"><span className="assistant-mark"><Sparkles size={12} /></span>同频助手<span>演示</span></div>
            <div aria-live="polite" aria-busy={streaming} className="answer-wrap"><AIAnswer key={lastPrompt || "welcome"} answer={answer} sources={[]} streaming={streaming} animate={false} onStop={() => { cancelPending(); notify("已停止演示回复"); }} onCopy={async text => { try { await navigator.clipboard.writeText(text); notify("已复制回复"); } catch { notify("复制失败，可以手动选择文字"); } }} className="chat-answer" /></div>
            <div className="chat-composer"><TextArea label="说说你的想法" placeholder="我想做一个……" value={prompt} onChange={event => setPrompt(event.target.value)} minRows={2} maxRows={5} maxLength={800} onSubmitShortcut={() => sendMessage(prompt)} /><div className="composer-actions"><span>Ctrl / ⌘ + Enter 发送</span><Button className="send-action" disabled={!prompt.trim() || streaming} onClick={() => sendMessage(prompt)} aria-label="发送想法" icon={<Send size={16} />} /></div></div>
            {!lastPrompt && <div className="suggestions chat-suggestions"><Button variant="secondary" size="sm" onClick={() => sendMessage("想做一个帮独立开发者整理用户反馈的工具")}>一个还没想清楚的 AI 点子</Button><Button variant="secondary" size="sm" onClick={() => sendMessage("我想加入别人的项目，贡献前端和设计")}>我想加入别人的项目</Button></div>}
          </div>}
        </section>

        <div className="stage-footnote"><span className="fine-line" /><span>{body.note}</span><span className="fine-line" /></div>
        <a className="below-link" href="#selected-elements">看看这一页选了哪些元素<ArrowDown size={14} /></a>
      </main>

      <section className="elements-section" id="selected-elements" aria-labelledby="elements-heading">
        <div className="elements-heading"><div><span className="eyebrow">少一点填写，多一点回应</span><TextReveal as="h2" text="每一步，都有一点温度。" by="char" stagger={22} duration={350} /></div><p>选取 AffectUI 的关键交互，放进同一个引导场景。<br />你可以切换上方状态，感受它们如何一起工作。</p></div>
        <div className="elements-grid">
          <div className="element-feature element-wide"><div className="feature-icon"><Compass size={22} /></div><h3>一个会回应的引导伙伴</h3><p>等待时轻轻呼吸，整理时收束成环，输出时泛起波纹。保留安静的陪伴感，也让状态变化看得见。</p><div className="component-tags"><span>Voice Orb</span><span>Thinking Loader</span></div></div>
          <div className="element-feature element-narrow"><div className="feature-icon"><WandSparkles size={22} /></div><h3>输入少一点，确认多一点</h3><p>从短介绍、快捷选项到可编辑卡片，让用户一步步补充自己的故事。</p><div className="component-tags"><span>Text Area</span><span>AI Answer</span></div></div>
        </div>
        <details className="source-details"><summary>组件来源与本页边界<ChevronDown size={15} /></summary><p>本页复用 9 个 AffectUI 组件，使用 Signalry 原版主题变量与字体。资料、处理进度、角色卡和回复均为演示；没有连接登录、上传、AI 或推荐服务。文件选择只显示本地反馈，不读取文件内容。输入和修改在刷新后清空，只有主题和动态偏好会记住。</p><p className="component-inventory">Voice Orb / Thinking Loader / Thinking State / AI Answer / Text Area / Dropzone / Segmented Control / Button / Text Reveal</p></details>
      </section>
      <footer className="page-footer"><span className="footer-brand">CoLab<span>同频</span></span><span>先认识彼此，再一起做点什么。</span><span className="footer-demo">交互演示 · 不连接 AI 服务</span></footer>
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  );
}
