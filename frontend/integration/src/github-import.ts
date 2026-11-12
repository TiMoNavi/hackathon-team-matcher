import { object, type Bootstrap } from "./contracts.ts";
import { ApiFailure, getJson, type Fetcher } from "./http.ts";

const receiptStates = ["not_requested", "pending", "running", "succeeded", "failed", "skipped_existing", "revoked", "unavailable"] as const;
export type GithubImportState = typeof receiptStates[number] | "superseded";
export type GithubImportReceipt = Readonly<{ state: typeof receiptStates[number]; source_id: string | null }>;
export type GithubImportView = Readonly<{ state: GithubImportState }>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function parseGithubImportReceipt(value: unknown): GithubImportReceipt {
  if (!object(value) || !receiptStates.includes(value.state as typeof receiptStates[number])
    || !(value.source_id === null || typeof value.source_id === "string" && uuid.test(value.source_id))
    || value.source_id !== null && !["succeeded", "failed"].includes(String(value.state))
    || value.state === "succeeded" && value.source_id === null) throw new Error("Invalid import receipt.");
  return { state: value.state as GithubImportReceipt["state"], source_id: value.source_id as string | null };
}

export function parseGithubSourceProgress(value: unknown, sourceId: string): GithubImportView {
  if (!object(value) || value.source_id !== sourceId || value.id !== sourceId || value.kind !== "github"
    || !object(value.progress) || value.progress.schema_version !== 1 || value.progress.percent !== null) throw new Error("Invalid GitHub source progress.");
  const state = value.progress.state;
  const states: Record<string, GithubImportState> = { ready: "succeeded", reading_source: "running", failed: "failed", revoked: "revoked", superseded: "superseded" };
  if (typeof state !== "string" || !Object.hasOwn(states, state)) throw new Error("Invalid source state.");
  if (value.status === "deleted") return { state: "revoked" };
  if (!["ready", "running", "failed"].includes(String(value.status))) throw new Error("Invalid source status.");
  if (state === "ready" && value.status !== "ready") throw new Error("Inconsistent source state.");
  return { state: states[state] };
}

/** Two compact, owner-only GETs at most. Reads never import, retry or call a model. */
export async function readGithubImport(bootstrap: Bootstrap, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<GithubImportView> {
  const receipt = (await getJson(bootstrap.api_base + "/auth/github/import-status", parseGithubImportReceipt, signal, fetcher)).data;
  if (receipt.source_id === null) return { state: receipt.state };
  const id = receipt.source_id;
  try {
    return (await getJson(bootstrap.api_base + "/me/profile/sources/" + id + "/progress", (value) => parseGithubSourceProgress(value, id), signal, fetcher)).data;
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) return { state: "revoked" };
    throw error;
  }
}

export const githubImportCopy: Record<GithubImportState, { title: string; description: string }> = {
  not_requested: { title: "", description: "" },
  pending: { title: "GitHub 资料尚待读取", description: "已记录首次导入请求，目前还没有读取结果。刷新状态不会重新导入。" },
  running: { title: "GitHub 资料读取尚未完成", description: "暂未收到完成结果。你可以稍后查看状态，或继续整理自己的资料。" },
  succeeded: { title: "GitHub 公开资料已读取", description: "可以前往资料页核对并选择内容。读取成功不代表画像已生成或资料已确认。" },
  failed: { title: "GitHub 资料未能读取", description: "这不影响本次登录。你可以在资料页主动重试，也可以上传简历或手动填写。" },
  skipped_existing: { title: "已保留原有 GitHub 导入记录", description: "这次登录没有重新读取资料。需要更新时，请在资料页主动操作。" },
  revoked: { title: "GitHub 来源已不可用", description: "来源已删除、关联已解除或授权发生变化。旧结果不会继续显示，请前往资料页确认。" },
  unavailable: { title: "GitHub 资料状态暂不可用", description: "暂时无法读取已授权的来源状态。可以稍后重新查看，不会自动重试导入。" },
  superseded: { title: "GitHub 资料已变化", description: "请前往资料页核对当前来源。较早的读取结果不会当作最新资料使用。" },
};
