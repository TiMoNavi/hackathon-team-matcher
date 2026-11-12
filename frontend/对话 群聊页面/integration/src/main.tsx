import { createRoot } from "react-dom/client";
import { ChatEntry, BootstrapError } from "./chat-entry";
import { parseBootstrap, parseShellPath } from "./bootstrap";
import "./styles.css";

const element = document.getElementById("matcher-chat-root");
if (element) {
  const root = createRoot(element);
  try {
    const data = document.getElementById("matcher-chat-bootstrap");
    if (!(data instanceof HTMLScriptElement) || data.type !== "application/json") throw new Error("Missing chat bootstrap.");
    const bootstrap = parseBootstrap(JSON.parse(data.textContent || ""), location.origin);
    const route = parseShellPath(location.pathname);
    // C03 never passes CSRF or claimed identity to the UI and makes no API calls.
    root.render(<ChatEntry links={{ home: bootstrap.native_home_url, login: bootstrap.native_login_url }} deepLink={route === "conversation"} />);
  } catch {
    root.render(<BootstrapError />);
  }
  window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
}
