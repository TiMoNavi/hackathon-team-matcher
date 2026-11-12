import type { CurrentEvent, DiscoveryQuery, OrdinaryDiscoveryReads, ReadResult, ReadFailure } from './contracts';
import { contextMatches, decodeCurrentEvent, failure } from './decode';
import { beginCurrentEventRead, beginDiscoveryRead, beginNextPageRead, beginPersonRead, completeCurrentEventRead, completeDiscoveryRead, completePersonRead, initialDiscoveryState, invalidateContext, type DiscoveryState } from './state';

/** Effects around the existing pure state machine; no storage, timers or model calls. */
export class RecommendationController {
  private state = initialDiscoveryState();
  private listeners = new Set<() => void>();
  private active = true;
  private readonly expected: CurrentEvent;
  constructor(private readonly reads: OrdinaryDiscoveryReads, expected: CurrentEvent, private readonly onAuthorityInvalidated?: () => void) { this.expected = decodeCurrentEvent(expected); }
  snapshot = (): DiscoveryState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(next: DiscoveryState): void {
    if (!this.active || next === this.state) return;
    const previous = this.state; this.state = next; this.listeners.forEach(listener => listener());
    if (next.contextError && next.contextError !== previous.contextError && ['session', 'activity'].includes(next.contextError.invalidation)) this.onAuthorityInvalidated?.();
  }
  activate(): void { if (!this.active) { this.active = true; this.state = invalidateContext(this.state); } }
  // This instance is bound to one identity/current-event snapshot. A query
  // refresh cannot cancel an authoritative denial; disposal ends that scope.
  invalidate(error: ReadFailure): void { this.publish(invalidateContext(this.state, error)); }
  dispose(): void { this.active = false; this.state = invalidateContext(this.state); this.listeners.clear(); }
  private async safe<T>(run: () => Promise<ReadResult<T>>): Promise<ReadResult<T>> {
    try { return await run(); } catch { return { ok: false, error: failure('network', null, 'NETWORK_ERROR', 'The read could not be completed.') }; }
  }
  private async authority(): Promise<ReadResult<CurrentEvent>> {
    const result = await this.safe(() => this.reads.readCurrentEvent());
    if (result.ok && !contextMatches(result.data, this.expected)) return { ok: false, error: failure('http', 409, 'CONTEXT_CHANGED', 'The current activity changed.', result.requestId) };
    return result;
  }
  async refresh(query: DiscoveryQuery = {}): Promise<void> {
    if (!this.active) return;
    const begun = beginCurrentEventRead(this.state); this.publish(begun.state);
    const result = await this.authority();
    if (!this.active) return;
    this.publish(completeCurrentEventRead(this.state, begun.ticket, result));
    if (this.state.contextRequest !== null || this.state.epoch !== begun.ticket.epoch || this.state.contextStatus !== 'ready') return;
    const started = beginDiscoveryRead(this.state, query); this.publish(started.state);
    if (!started.ticket) return;
    const page = await this.safe(() => this.reads.readPage(started.ticket!.context, started.ticket!.query));
    if (!this.active) return;
    this.publish(completeDiscoveryRead(this.state, started.ticket, page));
    if (this.state.list.status === 'ready' && this.state.list.items.length && this.state.detail.status === 'idle') await this.selectPerson(this.state.list.items[0].owner_id);
  }
  async loadMore(): Promise<void> {
    if (!this.active) return;
    const begun = beginNextPageRead(this.state); this.publish(begun.state);
    if (!begun.ticket) return;
    const current = await this.authority();
    const result = current.ok ? await this.safe(() => this.reads.readPage(begun.ticket!.context, begun.ticket!.query)) : current;
    if (!this.active) return;
    this.publish(completeDiscoveryRead(this.state, begun.ticket, result));
  }
  async selectPerson(ownerId: number): Promise<void> {
    if (!this.active) return;
    const begun = beginPersonRead(this.state, ownerId); this.publish(begun.state);
    if (!begun.ticket) return;
    const current = await this.authority();
    const result = current.ok ? await this.safe(() => this.reads.readPerson(begun.ticket!.context, ownerId)) : current;
    if (!this.active) return;
    this.publish(completePersonRead(this.state, begun.ticket, result));
  }
}

export function discoveryErrorText(error: ReadFailure): string {
  if (error.invalidation === 'session') return '登录状态已变化，请重新确认账号后继续。';
  if (error.invalidation === 'activity') return '当前活动或访问资格已变化，请重新确认活动。';
  if (error.invalidation === 'list') return '可见资料已变化，请重新读取当前活动的人选。';
  if (error.kind === 'network') return '连接中断，暂时无法读取人选。这不代表没有合适的人。';
  if (error.kind === 'invalid-response') return '服务返回的资料暂时无法展示，请稍后重新读取。';
  return '暂时无法读取人选，请稍后重试。';
}
