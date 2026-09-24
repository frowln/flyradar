import { Platform } from 'react-native';
import { settings } from '../settings';
import { signRequest } from '../crypto/sign';
import { randomId } from '../random';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? '';

/**
 * Whether a backend is configured at all.
 *
 * The app is complete without one: flights are prepared on the phone from
 * bundled data. A server adds richer packages and the social layer, and only
 * when this build was pointed at one.
 */
export const API_ENABLED = BASE_URL.length > 0;

/**
 * How long any single request may hang before it is abandoned.
 *
 * `fetch` has no timeout of its own: a request to a host that accepts no
 * connection sits there until the OS gives up, which can be minutes. Every
 * screen that loads data showed a spinner for exactly that long — and this is an
 * app used at eleven kilometres, where "no signal" is the normal case, not the
 * edge one. Twelve seconds is long enough for a slow cabin connection and short
 * enough that the offline state appears while the passenger is still looking.
 */
const TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * The server's whole error body.
     *
     * Carrying only the message threw away the parts that tell the passenger
     * what to do — "flight not found" alone is a dead end, while the dates the
     * provider does have turn it into an instruction.
     */
    public body: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Distinct from ApiError: the server never answered, it did not refuse. */
export class ApiTimeoutError extends Error {
  constructor(path: string) {
    super(`Request to ${path} timed out after ${TIMEOUT_MS} ms`);
    this.name = 'ApiTimeoutError';
  }
}

function getDeviceToken(): string {
  let token = settings.getDeviceToken();
  if (!token) {
    token = randomId('dev_');
    settings.setDeviceToken(token);
  }
  return token;
}

function buildHeaders(method: string, path: string, bodyStr: string): Record<string, string> {
  const token = getDeviceToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    // The social layer resolves an account from this; the bearer token stays
    // for request signing, which is a separate concern.
    'X-Device-Id': token,
    'X-Platform': Platform.OS
  };
  // The server verifies the path without its query string, so that is what is
  // signed; signing `/flights/track?number=…` whole would fail every such GET.
  const signed = signRequest(method, path.split('?')[0]!, token, bodyStr);
  if (signed) {
    headers['X-Timestamp'] = signed['X-Timestamp'];
    headers['X-Signature'] = signed['X-Signature'];
  }
  return headers;
}

/**
 * The one request path. Every verb signs, times out and reports errors alike.
 *
 * `post` and `get` used to carry their own copies of this and had already
 * drifted apart — `get` never parsed the server's error message, and neither
 * could be given a timeout without being fixed twice.
 */
async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const bodyStr = body === undefined ? '' : JSON.stringify(body);
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: buildHeaders(method, path, bodyStr),
      signal: control.signal,
      ...(body === undefined ? {} : { body: bodyStr })
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({ error: 'Unknown error' }))) as {
        error?: string;
        [k: string]: unknown;
      };
      throw new ApiError(r.status, err.error ?? `HTTP ${r.status}`, err);
    }
    return (await r.json()) as T;
  } catch (e) {
    // An abort here is ours: the only thing that aborts these requests is the
    // timer above. Reported as a timeout so callers can tell a silent network
    // from a server that answered.
    if (e instanceof Error && e.name === 'AbortError') throw new ApiTimeoutError(path);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  post<T>(path: string, body: unknown): Promise<T> {
    return send<T>('POST', path, body);
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    return send<T>('PATCH', path, body);
  },

  put<T>(path: string, body: unknown): Promise<T> {
    return send<T>('PUT', path, body);
  },

  del<T>(path: string): Promise<T> {
    return send<T>('DELETE', path);
  },

  get<T>(path: string): Promise<T> {
    return send<T>('GET', path);
  }
};
