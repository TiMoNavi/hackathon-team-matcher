import { parseCurrentEvent, parseIdentity, type Bootstrap, type CurrentEvent, type Identity } from "./contracts.ts";
import { ApiFailure, getJson, type Fetcher } from "./http.ts";

export type EventState =
  | { status: "idle" | "loading" | "unselected" }
  | { status: "selected"; value: CurrentEvent }
  | { status: "forbidden" | "conflict" | "error"; error: ApiFailure };
export type SessionState =
  | { status: "loading" | "signed_out"; identity: null; event: { status: "idle" } }
  | { status: "forbidden" | "error"; identity: null; event: { status: "idle" }; error: ApiFailure }
  | { status: "ready"; identity: Identity; event: EventState };

export class SessionReader {
  private state: SessionState = { status: "loading", identity: null, event: { status: "idle" } };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private controller: AbortController | null = null;
  private disposed = false;
  private readonly bootstrap: Bootstrap;
  private readonly fetcher: Fetcher;
  constructor(bootstrap: Bootstrap, fetcher: Fetcher = fetch) { this.bootstrap = bootstrap; this.fetcher = fetcher; }
  snapshot = (): SessionState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(state: SessionState) { this.state = state; this.listeners.forEach((listener) => listener()); }
  dispose() { this.disposed = true; this.epoch++; this.controller?.abort(); this.listeners.clear(); }
  async refresh(): Promise<void> {
    if (this.disposed) return;
    const epoch = ++this.epoch; this.controller?.abort();
    const controller = new AbortController(); this.controller = controller;
    const active = () => !this.disposed && epoch === this.epoch;
    this.publish({ status: "loading", identity: null, event: { status: "idle" } });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const me = await getJson(`${this.bootstrap.api_base}/me`, parseIdentity, controller.signal, this.fetcher);
      if (!active() || controller.signal.aborted) return;
      this.publish({ status: "ready", identity: me.data, event: { status: "loading" } });
      try {
        const event = await getJson(`${this.bootstrap.api_base}/me/current-event`, parseCurrentEvent, controller.signal, this.fetcher);
        if (active() && !controller.signal.aborted) this.publish({ status: "ready", identity: me.data, event: { status: "selected", value: event.data } });
      } catch (error) {
        if (!active()) return;
        if (controller.signal.aborted && !timedOut) return;
        const failure = timedOut ? new ApiFailure(0, "REQUEST_TIMEOUT", true) : error instanceof ApiFailure ? error : new ApiFailure(0, "NETWORK_ERROR", true);
        if (failure.status === 401) this.publish({ status: "signed_out", identity: null, event: { status: "idle" } });
        else if (failure.status === 409 && failure.code === "CURRENT_EVENT_REQUIRED") this.publish({ status: "ready", identity: me.data, event: { status: "unselected" } });
        else this.publish({ status: "ready", identity: me.data, event: { status: failure.status === 403 ? "forbidden" : failure.status === 409 ? "conflict" : "error", error: failure } });
      }
    } catch (error) {
      if (!active() || controller.signal.aborted && !timedOut) return;
      const failure = timedOut ? new ApiFailure(0, "REQUEST_TIMEOUT", true) : error instanceof ApiFailure ? error : new ApiFailure(0, "NETWORK_ERROR", true);
      if (failure.status === 401) this.publish({ status: "signed_out", identity: null, event: { status: "idle" } });
      else this.publish({ status: failure.status === 403 ? "forbidden" : "error", identity: null, event: { status: "idle" }, error: failure });
    } finally { clearTimeout(timeout); }
  }
}
