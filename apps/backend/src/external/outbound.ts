import { ProxyAgent } from 'undici';

/**
 * Outbound HTTP that can leave the country.
 *
 * AviationStack answers every request from a Russian IP with a Cloudflare block
 * page, so flight lookup — the entry point of the whole product — cannot work
 * from the development machine at all. `OUTBOUND_PROXY_URL` points at a proxy
 * outside Russia (an SSH tunnel to the Frankfurt box in development; unset in
 * production, where the backend already runs there).
 *
 * The proxy is applied per host rather than globally on purpose. Wikipedia and
 * Wikimedia are reachable directly and supply the prose on every place card;
 * routing them through one tunnel would mean a dead tunnel takes out the whole
 * product instead of a single endpoint.
 */
const PROXIED_HOSTS = ['api.aviationstack.com', 'aviationstack.com'];

const proxyUrl = process.env['OUTBOUND_PROXY_URL'];
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;

export function isProxied(url: string): boolean {
  if (!proxyAgent) return false;
  try {
    return PROXIED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** `fetch`, sent through the proxy when the host needs it. */
export function outboundFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isProxied(url)) return fetch(url, init);
  // `dispatcher` is undici's own option; Node's global fetch forwards it.
  return fetch(url, { ...init, dispatcher: proxyAgent } as RequestInit);
}

export function proxyStatus(): { configured: boolean; hosts: string[] } {
  return { configured: Boolean(proxyAgent), hosts: proxyAgent ? PROXIED_HOSTS : [] };
}
