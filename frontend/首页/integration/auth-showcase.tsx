"use client";
import { ArrowDown, CodeXml, FileCheck2, ShieldCheck, UsersRound } from "lucide-react";
import "./auth-presentation.css";

/** Composes Signalry's existing LoginShowcase with the homepage's soft card layers. */
export function AuthShowcase() {
  return <aside className="webapp-auth-aside webapp-auth-showcase" aria-label="账号与资料说明">
    <div className="webapp-auth-aside-grid" aria-hidden="true" />
    <div className="auth-showcase-intro"><span className="auth-showcase-symbol" aria-hidden="true"><UsersRound /></span><h2>你的下一个队友，<br />也在找你。</h2><p>带着你的经历与想法，<br />在同一场活动里，认识合拍的人。</p></div>
    <div className="auth-showcase-journey" aria-label="首次 GitHub 注册后的资料流程">
      <div className="auth-showcase-card auth-showcase-source"><span className="auth-showcase-step-icon"><CodeXml aria-hidden="true" /></span><div><h3>从你已有的作品开始</h3><p>首次注册后，读取本人的 GitHub 公开资料</p></div></div>
      <div className="auth-showcase-connector" aria-hidden="true"><ArrowDown /></div>
      <div className="auth-showcase-card auth-showcase-review"><span className="auth-showcase-step-icon"><FileCheck2 aria-hidden="true" /></span><div><h3>把经历整理成介绍</h3><p>核对资料，再选择想展示的技能与项目</p></div><span className="auth-showcase-review-label">由你确认</span></div>
    </div>
    <div className="auth-showcase-assurance"><ShieldCheck aria-hidden="true" /><p>只读取公开来源。<br /><span>未确认的资料保留在本人编辑区。</span></p></div>
  </aside>;
}
