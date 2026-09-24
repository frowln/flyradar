/**
 * One way to call a paid data provider.
 *
 * Every provider fails in the same few ways — too slow, over quota, key
 * refused, gone — and each used to handle them differently or not at all.
 * Here they become a small closed set of reasons the routes can pass on, with
 * three rules:
 *
 * - Every request has a deadline. A provider that accepts the connection and
 *   says nothing would otherwise hold the passenger's request open for minutes.
 * - A 429 pauses that provider for its Retry-After. Asking again at once only
 *   burns quota and gets refused again; meanwhile callers answer from cache.
 * - Nothing that can carry a key is logged: not the URL (keys travel in query
 *   strings), not the headers, not the error text of a failed fetch.
 */

export type ProviderError =
  | 'not_configured'
  | 'not_found'
  | 'rate_limited'
  | 'unauthorized'
  | 'timeout'
  | 'unreachable'
  | 'bad_response'
  | `http_${number}`;

export type JsonResult<T> =
  | { ok: true; status: number; body: T | null }
  | { ok: false; error: ProviderError; status?: number };

/** Transient failures: worth answering from a stale cache rather than not at all. */
export function isTransient(error: string | undefined): boolean {
  return (
    error === 'rate_limited' ||
    error === 'timeout' ||
    error === 'unreachable' ||
    error === 'bad_response' ||
    /^http_5\d\d$/.test(error ?? '')
  );
}

const DEFAULT_PAUSE_S = 60;
const MAX_PAUSE_S = 15 * 60;

const pausedUntil = new Map<string, number>();

/** Seconds to wait, from a Retry-After of seconds or an HTTP date. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number {
  if (!header) return DEFAULT_PAUSE_S;
  const s = Number(header);
  const seconds = Number.isFinite(s) ? s : (Date.parse(header) - now) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_PAUSE_S;
  return Math.min(MAX_PAUSE_S, Math.ceil(seconds));
}

export function isPaused(provider: string, now = Date.now()): boolean {
  return (pausedUntil.get(provider) ?? 0) > now;
}

/** For tests: forget every pause. */
export function resetProviderPauses(): void {
  pausedUntil.clear();
}

export interface GetJsonOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
}

export async function getJson<T>(provider: string, url: string, opts: GetJsonOptions): Promise<JsonResult<T>> {
  if (isPaused(provider)) return { ok: false, error: 'rate_limited' };
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { Accept: 'application/json', ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs)
    });
  } catch (e) {
    // The name only: a fetch error's message and cause can quote the URL.
    const name = e instanceof Error ? e.name : 'Error';
    const error = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
    console.warn(`[${provider}] ${error} (${name})`);
    return { ok: false, error };
  }

  if (r.status === 429) {
    const pause = retryAfterSeconds(r.headers.get('retry-after'));
    pausedUntil.set(provider, Date.now() + pause * 1000);
    console.warn(`[${provider}] rate limited, pausing ${pause} s`);
    return { ok: false, error: 'rate_limited', status: 429 };
  }
  if (r.status === 401 || r.status === 403) {
    console.warn(`[${provider}] key refused: HTTP ${r.status}`);
    return { ok: false, error: 'unauthorized', status: r.status };
  }
  if (r.status === 404) return { ok: false, error: 'not_found', status: 404 };
  if (r.status === 204) return { ok: true, status: 204, body: null };
  if (!r.ok) {
    console.warn(`[${provider}] HTTP ${r.status}`);
    return { ok: false, error: `http_${r.status}`, status: r.status };
  }

  try {
    const text = await r.text();
    return { ok: true, status: r.status, body: text ? (JSON.parse(text) as T) : null };
  } catch {
    console.warn(`[${provider}] unreadable response`);
    return { ok: false, error: 'bad_response', status: r.status };
  }
}
