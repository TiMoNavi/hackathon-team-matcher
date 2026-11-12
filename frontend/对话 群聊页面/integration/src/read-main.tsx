/** Separate opt-in entry. C03 main.tsx does not import this file. */
import { createRoot } from "react-dom/client";
import { BootstrapError } from "./chat-entry";
import { parseReadBootstrap } from "./chat/read-bootstrap.js";
import { createReadController } from "./chat/read-controller.js";
import { parseReadPath } from "./chat/navigation.js";
import { attachReadLifecycle } from "./chat/read-lifecycle.js";
import { ReadEntry } from "./chat/read-entry";
import "./read-styles.css";

const element = document.getElementById("matcher-chat-root");
if (element) {
  const root = createRoot(element);
  try {
    const data = document.getElementById("matcher-chat-bootstrap");
    if (!(data instanceof HTMLScriptElement) || data.type !== "application/json") throw new Error("Missing chat bootstrap.");
    const bootstrap = parseReadBootstrap(JSON.parse(data.textContent || ""), location.origin);
    parseReadPath(location.pathname);
    const controller = createReadController(bootstrap);
    const links = Object.freeze({ home: bootstrap.native_home_url, login: bootstrap.native_login_url, nativeChat: bootstrap.native_chat_url });
    // Do not keep bootstrap identity/CSRF copies in DOM after parsing.
    data.textContent = "";
    const detach = attachReadLifecycle(controller, window, document, () => { element.hidden = true; }, () => location.reload());
    root.render(<ReadEntry controller={controller} links={links} pathname={location.pathname} />);
    if (controller.snapshot().status === "idle") void controller.start(location.pathname).catch(() => { controller.suspend(); });
    window.addEventListener("unload", detach, { once: true });
  } catch { root.render(<BootstrapError />); }
}
