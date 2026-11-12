"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CodeXml, KeyRound, LoaderCircle, LogOut, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AuthShowcase } from "./auth-showcase";
import { GithubImportNotice } from "./github-import-notice";
import type { Bootstrap, Identity } from "../../integration/src/contracts.ts";
import { ApiFailure } from "../../integration/src/http.ts";
import { AuthClient, authFeedback, emailIsValid, githubFailure, githubStartUrl, type AuthCapabilities, type AuthFeedback, type AuthPurpose, type EmailChallenge } from "../../integration/src/auth.ts";

type Challenge = EmailChallenge & { expiresAt: number };
type Busy = "send" | "verify" | "logout" | "github" | null;

// Layout adapts the existing Signalry LoginPage/LoginForm: 400px form, 44px
// inputs, 48px actions, desktop companion panel and a single mobile column.
export function AuthPanel({ bootstrap, identity }: { bootstrap: Bootstrap; identity: Identity | null }) {
  const purpose: AuthPurpose = identity ? "bind" : "login";
  const client = useMemo(() => new AuthClient(bootstrap, location.origin), [bootstrap]);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [capabilityRun, setCapabilityRun] = useState(0);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null);
  const [notice, setNotice] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const pending = useRef(false);
  const navigating = useRef(false);
  const alive = useRef(true);
  const request = useRef<AbortController | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const oauthError = githubFailure(location.search);

  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setCapabilities(null); setCapabilityError(false);
    const timeout = setTimeout(() => controller.abort(), 10000);
    void client.capabilities(controller.signal).then((value) => { if (current) setCapabilities(value); }).catch(() => { if (current) setCapabilityError(true); }).finally(() => clearTimeout(timeout));
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [client, capabilityRun]);
  useEffect(() => {
    if (!challenge && resendAt <= Date.now() && blockedUntil <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, resendAt, blockedUntil]);
  useEffect(() => { if (challenge) codeInput.current?.focus(); }, [challenge?.challenge_id]);

  const remaining = Math.max(0, Math.ceil((Math.max(resendAt, blockedUntil) - now) / 1000));
  const blocked = blockedUntil > now;
  const expired = challenge !== null && challenge.expiresAt <= now;
  const enabled = Boolean(capabilities?.email_available);
  const mutationDisabled = busy !== null || blocked || Boolean(feedback?.registrationUrl);

  async function perform(kind: Exclude<Busy, "github" | null>, operation: (signal: AbortSignal) => Promise<void>) {
    if (pending.current || blockedUntil > Date.now()) return;
    pending.current = true; setBusy(kind); setFeedback(null); setNotice("");
    const controller = new AbortController(); request.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    try { await operation(controller.signal); }
    catch (error) {
      if (!alive.current) return;
      const failure = timedOut ? new ApiFailure(0, "REQUEST_TIMEOUT") : error;
      const next = authFeedback(failure); setFeedback(next);
      if (next.retryAfter) { setNow(Date.now()); setBlockedUntil(Date.now() + next.retryAfter * 1000); }
    } finally { clearTimeout(timeout); if (!navigating.current) { pending.current = false; if (alive.current) setBusy(null); } }
  }
  function send(event?: FormEvent) {
    event?.preventDefault();
    if (!enabled || remaining > 0 || pending.current) return;
    if (!emailIsValid(email.trim())) { setFeedback(authFeedback(new ApiFailure(400, "INVALID_EMAIL"))); emailInput.current?.focus(); return; }
    void perform("send", async (signal) => {
      const receipt = await client.sendEmail(email, purpose, signal);
      if (!alive.current || signal.aborted) return;
      const time = Date.now(); setNow(time); setCode(""); setChallenge({ ...receipt, expiresAt: time + receipt.expires_in * 1000 }); setResendAt(time + receipt.resend_after * 1000);
      setNotice("验证码邮件已提交发送，请查看邮箱。验证码 10 分钟内有效。");
    });
  }
  function verify(event: FormEvent) {
    event.preventDefault();
    if (!enabled || !challenge || expired || pending.current) return;
    if (!/^\d{6}$/.test(code.trim())) { setFeedback(authFeedback(new ApiFailure(400, "INVALID_CODE"))); codeInput.current?.focus(); return; }
    const submittedCode = code.trim(); setCode("");
    void perform("verify", async (signal) => {
      const receipt = await client.verifyEmail(challenge.challenge_id, submittedCode, purpose, signal);
      if (!alive.current || signal.aborted) return;
      setEmail(""); setChallenge(null);
      // A full same-origin navigation obtains the rotated session/CSRF bootstrap.
      navigating.current = true; location.assign(receipt.next_url);
    });
  }
  function github() {
    if (pending.current || !capabilities?.github_available || blocked) return;
    pending.current = true; navigating.current = true; setBusy("github"); setEmail(""); setCode(""); setChallenge(null);
    location.assign(githubStartUrl(bootstrap, purpose));
  }
  function changeEmail() {
    if (pending.current) return;
    setChallenge(null); setCode(""); setNotice(""); setFeedback(null);
    requestAnimationFrame(() => emailInput.current?.focus());
  }
  function logout() {
    void perform("logout", async (signal) => {
      await client.logout(signal);
      if (!alive.current || signal.aborted) return;
      setEmail(""); setCode(""); setChallenge(null); navigating.current = true; location.assign(bootstrap.base_path);
    });
  }

  return <section className="webapp-auth webapp-auth-polished" data-auth-purpose={purpose}>
    <div className="webapp-auth-form-column">
      <div className="webapp-auth-form">
        <div className="webapp-auth-heading"><h1>{identity ? "关联登录方式" : "欢迎来到同频"}</h1><p>{identity ? `当前账号：${identity.nickname?.trim() || "尚未设置昵称"}。选择一种方式，完成验证后关联到这个账号。` : "使用 GitHub 或邮箱验证码登录，继续你的活动旅程。"}</p></div>
        {identity && <GithubImportNotice bootstrap={bootstrap} />}
        {oauthError && <p className="webapp-auth-error" role="alert">{oauthError}</p>}
        {!capabilities && !capabilityError && <p role="status" className="webapp-auth-help">正在读取可用登录方式…</p>}
        {capabilityError && <div className="webapp-auth-feedback" role="alert"><p>暂时无法读取登录方式。</p><Button variant="secondary" onClick={() => setCapabilityRun((value) => value + 1)} className="webapp-auth-small-action"><RefreshCw aria-hidden="true" />重新读取登录方式</Button></div>}
        <div><Button type="button" variant="outline" size="xl" className="webapp-auth-full webapp-auth-github" aria-describedby="webapp-github-help" disabled={!capabilities?.github_available || mutationDisabled} onClick={github}><CodeXml aria-hidden="true" />{busy === "github" ? "正在前往 GitHub…" : identity ? "验证并关联 GitHub" : "使用 GitHub 登录"}</Button>{capabilities && !capabilities.github_available && <p className="webapp-auth-help">GitHub 登录暂时不可用。</p>}<p className="webapp-auth-github-note" id="webapp-github-help">{identity ? "首次关联后会尝试读取公开资料；已有导入记录会保留。" : "首次注册后会尝试读取你的公开资料，供你核对。再次登录不会重复导入。"}</p></div>
        <div className="webapp-auth-divider"><span />邮箱验证码<span /></div>
        {capabilities && !capabilities.email_available && <p className="webapp-auth-help" role="status">邮箱验证码暂时不可用，请稍后重试或选择其他登录方式。</p>}
        <form onSubmit={challenge ? verify : send} noValidate className="webapp-auth-fields" aria-busy={Boolean(busy)}>
          <div className="webapp-auth-field"><label htmlFor="webapp-email">{identity ? "要关联的邮箱" : "邮箱地址"}</label><Input id="webapp-email" ref={emailInput} name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setFeedback(null); }} disabled={Boolean(challenge) || mutationDisabled || !enabled} placeholder="you@example.com" className="webapp-auth-input" aria-describedby="webapp-email-help" /><p className="webapp-auth-help" id="webapp-email-help">{identity ? "验证后将关联到当前账号；已有账号不会自动合并。" : "点击发送后，我们会向这个邮箱发送一次验证码。"}</p></div>
          {challenge && <div className="webapp-auth-field"><label htmlFor="webapp-code">6 位验证码</label><Input id="webapp-code" ref={codeInput} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={mutationDisabled || expired || !enabled} className="webapp-auth-input webapp-auth-code" aria-describedby="webapp-code-help" /><p className="webapp-auth-help" id="webapp-code-help">{expired ? "验证码已过期，请重新发送。" : "请填写最新邮件中的验证码。"}</p></div>}
          {feedback && <div className="webapp-auth-feedback webapp-auth-error" role="alert"><p>{feedback.message}</p>{feedback.retryAfter > 0 && blocked && <p>还需等待 {Math.max(0, Math.ceil((blockedUntil - now) / 1000))} 秒。</p>}{feedback.registrationUrl && <Button asChild variant="secondary" className="webapp-auth-small-action"><a href={feedback.registrationUrl}>补充注册资料<ArrowUpRight aria-hidden="true" /></a></Button>}{feedback.reload && <Button type="button" variant="outline" className="webapp-auth-small-action" onClick={() => location.reload()}>刷新页面</Button>}</div>}
          {notice && <p className="webapp-auth-notice" role="status">{notice}</p>}
          <Button type="submit" size="xl" className="webapp-auth-full" disabled={!enabled || mutationDisabled || (!challenge && remaining > 0) || Boolean(challenge && expired)}>{busy === "send" || busy === "verify" ? <LoaderCircle className="webapp-auth-spinner" aria-hidden="true" /> : challenge ? <KeyRound aria-hidden="true" /> : <Mail aria-hidden="true" />}{busy === "send" ? "正在发送…" : busy === "verify" ? "正在验证…" : challenge ? identity ? "验证并关联邮箱" : "验证并登录" : remaining > 0 ? `${remaining} 秒后可发送` : "发送验证码"}</Button>
          {challenge && <div className="webapp-auth-secondary-actions"><Button type="button" variant="ghost" className="webapp-auth-small-action" disabled={mutationDisabled || !enabled || remaining > 0} onClick={() => send()}>{remaining > 0 ? `${remaining} 秒后可重发` : "重新发送验证码"}</Button><Button type="button" variant="ghost" className="webapp-auth-small-action" disabled={Boolean(busy)} onClick={changeEmail}>修改邮箱</Button></div>}
        </form>
        {identity && <div className="webapp-auth-logout">{logoutConfirm ? <div role="group" aria-label="确认退出登录"><p>确定退出当前账号吗？</p><div className="webapp-auth-secondary-actions"><Button type="button" variant="outline" className="webapp-auth-small-action" disabled={mutationDisabled} onClick={logout}>{busy === "logout" ? "正在退出…" : "确认退出"}</Button><Button type="button" variant="ghost" className="webapp-auth-small-action" disabled={Boolean(busy)} onClick={() => setLogoutConfirm(false)}>继续使用</Button></div></div> : <Button type="button" variant="ghost" className="webapp-auth-small-action" disabled={Boolean(busy)} onClick={() => setLogoutConfirm(true)}><LogOut aria-hidden="true" />退出当前账号</Button>}</div>}
        <p className="webapp-auth-privacy"><ShieldCheck aria-hidden="true" /><span>未确认资料仅自己可见。确认时，由你逐项决定展示范围。</span></p>
        <a className="webapp-auth-native" href={bootstrap.native_login_url}>使用原站登录入口<ArrowUpRight aria-hidden="true" /></a>
      </div>
    </div>
    <AuthShowcase />
  </section>;
}
