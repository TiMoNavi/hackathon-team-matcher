import type { ReadController } from "./read-controller.js";

type EventHost = Pick<Window, "addEventListener" | "removeEventListener">;
type DocumentHost = Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState" | "hasFocus">;

/** Clear the DOM synchronously before React's next render, then discard all
 * volatile state. A resumed page obtains a new PHP bootstrap and CSRF token. */
export function attachReadLifecycle(controller: ReadController, host: EventHost, document: DocumentHost, conceal: () => void, reload: () => void): () => void {
  let suspended = false;
  let closed = false;
  let requestedReload = false;
  const suspend = () => {
    if (closed) return;
    conceal(); suspended = true; controller.suspend();
  };
  const resume = () => {
    if (!closed && suspended && !requestedReload && document.visibilityState === "visible" && document.hasFocus()) { requestedReload = true; reload(); }
  };
  const visibility = () => { if (document.visibilityState !== "visible") suspend(); else resume(); };
  const pageShow = (event: Event) => { if ((event as PageTransitionEvent).persisted) { suspend(); resume(); } };
  host.addEventListener("blur", suspend); host.addEventListener("focus", resume);
  host.addEventListener("pagehide", suspend); host.addEventListener("pageshow", pageShow);
  document.addEventListener("visibilitychange", visibility);
  if (document.visibilityState !== "visible" || !document.hasFocus()) suspend();
  return () => {
    closed = true; host.removeEventListener("blur", suspend); host.removeEventListener("focus", resume);
    host.removeEventListener("pagehide", suspend); host.removeEventListener("pageshow", pageShow);
    document.removeEventListener("visibilitychange", visibility); controller.dispose();
  };
}
