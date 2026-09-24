import { request as httpRequest, type IncomingMessage, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import type { Socket } from 'node:net';

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
 *
 * The tunnel is an HTTP CONNECT built on node:http rather than undici's
 * ProxyAgent. undici was never a declared dependency — it resolved only because
 * the mobile app's tooling happened to hoist it — so a backend-only install
 * (the Docker image) could not even load this module.
 */
const PROXIED_HOSTS = ['api.aviationstack.com', 'aviationstack.com'];

function proxyUrl(): URL | null {
  const raw = process.env['OUTBOUND_PROXY_URL'];
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export function isProxied(url: string): boolean {
  if (!proxyUrl()) return false;
  try {
    return PROXIED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** `fetch`, sent through the proxy when the host needs it. */
export function outboundFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const proxy = proxyUrl();
  if (!proxy || !isProxied(url)) return fetch(url, init);
  return fetchViaConnect(new URL(url), proxy, init);
}

export function proxyStatus(): { configured: boolean; hosts: string[] } {
  const configured = Boolean(proxyUrl());
  return { configured, hosts: configured ? PROXIED_HOSTS : [] };
}

/**
 * One request through an HTTP CONNECT tunnel.
 *
 * TLS is negotiated with the real host *through* the tunnel, so the proxy sees
 * only ciphertext — the API key in the query string never reaches it.
 */
export async function fetchViaConnect(target: URL, proxy: URL, init: RequestInit = {}): Promise<Response> {
  const signal = init.signal ?? undefined;
  const secure = target.protocol === 'https:';
  const port = target.port || (secure ? '443' : '80');
  const authority = `${target.hostname}:${port}`;

  const socket = await new Promise<Socket>((resolve, reject) => {
    const connect = httpRequest({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: authority,
      headers: {
        host: authority,
        ...(proxy.username
          ? {
              'proxy-authorization': `Basic ${Buffer.from(
                `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`
              ).toString('base64')}`
            }
          : {})
      },
      signal
    });
    connect.once('connect', (res, tunnel) => {
      if (res.statusCode === 200) return resolve(tunnel);
      tunnel.destroy();
      reject(new Error(`proxy refused CONNECT ${authority}: HTTP ${res.statusCode}`));
    });
    connect.once('error', reject);
    connect.end();
  });

  const res = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = (secure ? httpsRequest : httpRequest)(
      target,
      {
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        signal,
        // No agent: with one, Node would open its own socket and ignore this.
        createConnection: () =>
          secure ? tlsConnect({ socket, servername: target.hostname }) : socket
      },
      resolve
    );
    request.once('error', (e) => {
      socket.destroy();
      reject(e);
    });
    request.end(typeof init.body === 'string' ? init.body : undefined);
  });

  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  const status = res.statusCode ?? 502;
  // A Response with these statuses may not carry a body at all.
  const body = [101, 204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
  return new Response(body, { status, headers: toHeaders(res.headers) });
}

function toHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
  }
  return headers;
}
