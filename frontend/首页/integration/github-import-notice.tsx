"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, CodeXml, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import type { Bootstrap } from "../../integration/src/contracts.ts";
import { ApiFailure } from "../../integration/src/http.ts";
import { githubImportCopy, readGithubImport, type GithubImportView } from "../../integration/src/github-import.ts";
import "./auth-presentation.css";

export function GithubImportNotice({ bootstrap }: { bootstrap: Bootstrap }) {
  const profileUrl = bootstrap.api_base.slice(0, -"/api/v1".length) + "/matcher-user-profile/editor/index";
  const [view, setView] = useState<GithubImportView | null>(null);
  const [run, setRun] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"session" | "read" | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setLoading(true); setView(null); setError(null);
    const timeout = setTimeout(() => controller.abort(), 10000);
    void readGithubImport(bootstrap, controller.signal).then((next) => { if (current) setView(next); })
      .catch((failure) => { if (current) setError(failure instanceof ApiFailure && [401, 403].includes(failure.status) ? "session" : "read"); })
      .finally(() => { clearTimeout(timeout); if (current) setLoading(false); });
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [bootstrap, run]);
  if (!loading && view?.state === "not_requested") return null;
  const copy = view ? githubImportCopy[view.state] : null;
  return <section className="github-import-notice" aria-label="GitHub 资料导入状态" data-import-state={loading ? "loading" : error || view?.state}>
    <span className="github-import-symbol" aria-hidden="true">{view?.state === "succeeded" ? <Check /> : <CodeXml />}</span>
    <div className="github-import-content" aria-live="polite">
      <h2>{loading ? "正在确认 GitHub 资料状态" : error ? "暂时无法确认资料状态" : copy?.title}</h2>
      <p>{loading ? "只读取已保存的状态，请稍候。" : error === "session" ? "当前登录或授权已变化，请刷新页面确认。" : error ? "可以重新读取状态。这个操作不会重新导入资料。" : copy?.description}</p>
      {!loading && <div className="github-import-actions">
        {error === "session" ? <Button variant="outline" className="webapp-auth-small-action" onClick={() => location.reload()}>刷新页面</Button> : <>
          <Button asChild variant="outline" className="webapp-auth-small-action"><a href={profileUrl}>前往资料页<ArrowUpRight aria-hidden="true" /></a></Button>
          <Button variant="ghost" className="webapp-auth-small-action" onClick={() => setRun((value) => value + 1)}><RefreshCw aria-hidden="true" />重新读取状态</Button>
        </>}
      </div>}
    </div>
  </section>;
}
