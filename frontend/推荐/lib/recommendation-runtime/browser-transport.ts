import type { GetRequest, GetTransport } from './contracts';

export interface RecommendationBootstrap { readonly api_base: string; readonly base_path: string }
export type BrowserFetch = (input: string, init: RequestInit) => Promise<Response>;

/** Host-provided paths only. No cross-origin token or browser storage fallback. */
export function createSameOriginDiscoveryTransport(bootstrap: RecommendationBootstrap, origin: string, fetcher: BrowserFetch): GetTransport {
  const safePath = (value: string): URL => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) throw new Error('Invalid host path.');
    const url = new URL(value, origin);
    if (url.origin !== origin || url.search || url.hash || url.username || url.password) throw new Error('Invalid host path.');
    return url;
  };
  const base = safePath(bootstrap.base_path); const api = safePath(bootstrap.api_base);
  if (!base.pathname.endsWith('/matcher/app') || api.pathname !== base.pathname.slice(0, -'/matcher/app'.length) + '/api/v1') throw new Error('Host paths do not agree.');
  return async (request: GetRequest) => {
    if (request.method !== 'GET' || request.credentials !== 'same-origin' || request.cache !== 'no-store' || request.redirect !== 'error') throw new Error('Unsupported transport request.');
    const url = new URL(request.url, origin);
    if (url.origin !== origin || url.hash || url.username || url.password || !new RegExp('^/api/v1/(?:me/current-event|events/[1-9][0-9]*/discovery(?:/people/[1-9][0-9]*)?)$').test(url.pathname)) throw new Error('Unsupported discovery route.');
    const response = await fetcher(api.pathname + url.pathname.slice('/api/v1'.length) + url.search, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    return { status: response.status, contentType: response.headers.get('Content-Type'), body: await response.text() };
  };
}
