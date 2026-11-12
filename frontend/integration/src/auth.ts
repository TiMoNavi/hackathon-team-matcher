import { object, sameOriginUrl, type Bootstrap } from "./contracts.ts";
import { ApiFailure, getJson, postJson, type Fetcher } from "./http.ts";

export type AuthPurpose = "login" | "bind";
export type AuthCapabilities = Readonly<{ email_available: boolean; github_available: boolean }>;
export type EmailChallenge = Readonly<{ challenge_id: string; expires_in: 600; resend_after: 60 }>;
export type AuthReceipt = Readonly<{ authenticated: true; bound: boolean; next_url: string }>;
export type AuthFeedback = Readonly<{ message: string; reload: boolean; retryAfter: number; registrationUrl: "/user/registration" | null }>;

export function parseAuthCapabilities(value: unknown): AuthCapabilities {
  if (!object(value) || typeof value.email_available !== "boolean" || typeof value.github_available !== "boolean") throw new Error("Invalid auth capabilities.");
  return { email_available: value.email_available, github_available: value.github_available };
}
export function parseEmailChallenge(value: unknown): EmailChallenge {
  if (!object(value) || typeof value.challenge_id !== "string" || !/^challenge-[a-f0-9]{48}$/.test(value.challenge_id) || value.expires_in !== 600 || value.resend_after !== 60) throw new Error("Invalid email challenge.");
  return { challenge_id: value.challenge_id, expires_in: 600, resend_after: 60 };
}
export function safeAuthNext(value: unknown, bootstrap: Bootstrap, origin: string): string {
  const next = sameOriginUrl(value, origin);
  if (value !== bootstrap.base_path || next.pathname !== bootstrap.base_path || next.search || next.hash) throw new Error("Invalid auth destination.");
  return next.pathname;
}
export function parseAuthReceipt(value: unknown, purpose: AuthPurpose, bootstrap: Bootstrap, origin: string): AuthReceipt {
  if (!object(value) || value.authenticated !== true || value.bound !== (purpose === "bind")) throw new Error("Invalid authentication receipt.");
  return { authenticated: true, bound: value.bound, next_url: safeAuthNext(value.next_url, bootstrap, origin) };
}
export function parseLogoutReceipt(value: unknown): { authenticated: false } {
  if (!object(value) || value.authenticated !== false) throw new Error("Invalid logout receipt.");
  return { authenticated: false };
}
export function emailIsValid(value: string): boolean {
  return value.length > 3 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function githubStartUrl(bootstrap: Bootstrap, purpose: AuthPurpose): string {
  const query = new URLSearchParams({ intent: purpose, return_to: bootstrap.base_path });
  return `${bootstrap.api_base}/auth/github/start?${query}`;
}

// One shared gate prevents double-clicks and concurrent send/verify/logout.
// Every mutation still requires an explicit UI action. No email/code is retained
// by this client after the request finishes, and no request is automatically retried.
export class AuthClient {
  private pending = false;
  private readonly bootstrap: Bootstrap;
  private readonly origin: string;
  private readonly fetcher: Fetcher;
  constructor(bootstrap: Bootstrap, origin: string, fetcher: Fetcher = fetch) { this.bootstrap = bootstrap; this.origin = origin; this.fetcher = fetcher; }
  async capabilities(signal: AbortSignal): Promise<AuthCapabilities> {
    return (await getJson(`${this.bootstrap.api_base}/auth/capabilities`, parseAuthCapabilities, signal, this.fetcher)).data;
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending) throw new ApiFailure(409, "CLIENT_REQUEST_PENDING");
    this.pending = true;
    try { return await operation(); } finally { this.pending = false; }
  }
  async sendEmail(email: string, purpose: AuthPurpose, signal: AbortSignal): Promise<EmailChallenge> {
    if (!emailIsValid(email.trim())) throw new ApiFailure(400, "INVALID_EMAIL");
    return this.exclusive(async () => (await postJson(this.bootstrap, "/auth/email-codes", { email: email.trim(), purpose, return_to: this.bootstrap.base_path }, parseEmailChallenge, signal, this.fetcher, 202)).data);
  }
  async verifyEmail(challengeId: string, code: string, purpose: AuthPurpose, signal: AbortSignal): Promise<AuthReceipt> {
    if (!/^challenge-[a-f0-9]{48}$/.test(challengeId) || !/^\d{6}$/.test(code)) throw new ApiFailure(400, "INVALID_CODE");
    return this.exclusive(async () => (await postJson(this.bootstrap, "/auth/email/verify", { challenge_id: challengeId, code }, (data) => parseAuthReceipt(data, purpose, this.bootstrap, this.origin), signal, this.fetcher)).data);
  }
  async logout(signal: AbortSignal): Promise<void> {
    await this.exclusive(async () => { await postJson(this.bootstrap, "/auth/logout", {}, parseLogoutReceipt, signal, this.fetcher); });
  }
}

export function authFeedback(error: unknown): AuthFeedback {
  const failure = error instanceof ApiFailure ? error : new ApiFailure(0, "NETWORK_ERROR");
  const messages: Record<string, string> = {
    INVALID_EMAIL: "请输入有效的邮箱地址。",
    INVALID_CODE: "请输入邮件中的 6 位验证码，并检查是否正确。",
    CHALLENGE_INVALID: "验证码不正确或已失效，请检查邮件中的验证码。",
    CHALLENGE_USED: "这份验证码已使用。请刷新确认登录状态，或重新获取验证码。",
    CHALLENGE_EXPIRED: "验证码已过期，请重新获取。",
    IDENTITY_CONFLICT: "这个登录方式已关联其他账号，无法关联到当前账号。",
    ACCOUNT_UNAVAILABLE: "当前账号暂时不可用，请从原站确认账号状态。",
    AUTH_LOGIN_FAILED: "未能完成登录，请刷新页面后重试。",
    AUTHENTICATION_REQUIRED: "登录状态已失效，请刷新页面重新登录。",
    AUTH_UNAVAILABLE: "这个登录方式暂时不可用，请稍后重试。",
    MAIL_DELIVERY_FAILED: "邮件暂时未能投递，请稍后重新发送。",
    RATE_LIMITED: "操作过于频繁，请等待后再试。",
    INVALID_REQUEST: "页面防护信息或请求已失效，请刷新后再试。",
    NETWORK_ERROR: "尚未确认请求结果。请先检查邮箱或刷新登录状态，再决定是否重试。",
    REQUEST_TIMEOUT: "请求等待时间较长，结果尚未确认。请先检查邮箱或刷新登录状态。",
    INVALID_RESPONSE: "未能确认服务返回的结果，请刷新页面后检查状态。",
    CLIENT_REQUEST_PENDING: "上一项操作仍在处理中，请稍候。",
    REGISTRATION_REQUIRED: "邮箱已验证，还需补充注册资料。完成后才能进入账号。",
  };
  const retry = object(failure.details) ? failure.details.retry_after : undefined;
  const retryAfter = failure.status === 429 ? Number.isSafeInteger(retry) && Number(retry) > 0 && Number(retry) <= 86400 ? Number(retry) : 60 : 0;
  const reload = ["INVALID_REQUEST", "AUTHENTICATION_REQUIRED", "AUTH_LOGIN_FAILED", "CHALLENGE_USED", "INVALID_RESPONSE", "REQUEST_TIMEOUT", "NETWORK_ERROR"].includes(failure.code);
  const registrationUrl = failure.status === 409 && failure.code === "REGISTRATION_REQUIRED" && object(failure.details) && failure.details.next_url === "/user/registration" ? "/user/registration" : null;
  const knownMessage = Object.hasOwn(messages, failure.code) && (failure.code !== "REGISTRATION_REQUIRED" || registrationUrl) ? messages[failure.code] : null;
  return { message: knownMessage || (failure.status === 429 ? messages.RATE_LIMITED : failure.status >= 500 ? "登录服务暂时不可用，请稍后重试。" : "这次操作未完成，请检查后重试。"), reload, retryAfter, registrationUrl };
}

export function githubFailure(search: string): string | null {
  const allowed: Record<string, string> = { cancelled: "你已取消 GitHub 授权，可以重新选择登录方式。", failed: "GitHub 登录未完成，请重试或选择邮箱验证码。", identity_conflict: "这个 GitHub 身份已关联其他账号，无法关联到当前账号。", account_unavailable: "当前账号暂时不可用，请从原站确认账号状态。", registration_required: "这个 GitHub 身份尚未完成注册，请从原站继续注册。", unavailable: "GitHub 登录暂时不可用，请稍后重试。" };
  const code = new URLSearchParams(search).get("auth_error");
  return code && Object.hasOwn(allowed, code) ? allowed[code] : null;
}
