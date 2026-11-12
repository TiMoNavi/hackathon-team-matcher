import { createRoot } from "react-dom/client";
import { WebappEntry } from "../../首页/integration/webapp-entry";
import { parseBootstrap } from "./contracts.ts";
import { SessionReader } from "./session.ts";
import "./styles.css";

const root = document.getElementById("matcher-webapp-root");
if (root) {
  try {
    const element = document.getElementById("matcher-webapp-bootstrap");
    if (!(element instanceof HTMLScriptElement) || element.type !== "application/json") throw new Error("Missing bootstrap.");
    const bootstrap = parseBootstrap(JSON.parse(element.textContent || ""), location.origin);
    const reader = new SessionReader(bootstrap);
    createRoot(root).render(<WebappEntry bootstrap={bootstrap} reader={reader} />);
    void reader.refresh();
    window.addEventListener("pagehide", () => reader.dispose(), { once: true });
    // A bfcache page must re-read authorization instead of reviving old data.
    window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
  } catch {
    root.setAttribute("role", "alert");
    root.className = "webapp-bootstrap-error";
    const heading = document.createElement("h1"); heading.textContent = "暂时无法打开这个页面";
    const explanation = document.createElement("p"); explanation.textContent = "页面信息不完整，请刷新后重试。";
    const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "重新加载页面"; retry.addEventListener("click", () => location.reload());
    root.replaceChildren(heading, explanation, retry);
  }
}
