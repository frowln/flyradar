import { createPublicKey, verify, type KeyObject, type webcrypto } from 'node:crypto';

/**
 * Verifies a Sign in with Apple identity token and returns the Apple subject.
 *
 * Linking used to accept the subject as a bare string from the request body.
 * The subject is not a secret — it is a stable identifier that any client which
 * ever saw it can replay — so anyone could claim someone else's account and have
 * their device merged into it. The subject is now only ever read out of a token
 * whose signature, issuer, audience and expiry have been checked against Apple's
 * published keys.
 *
 * Built on node:crypto rather than a JWT library: the checks are few, and each
 * one is visible here instead of behind a permissive default.
 */

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
export const DEFAULT_APPLE_AUDIENCE = 'com.skyatlas.app';

/** Apple rotates its signing keys rarely; a day of caching costs nothing. */
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * A token naming a key we do not hold triggers a refetch, but at most this
 * often — otherwise tokens with invented key ids become a way to make the
 * server hammer Apple.
 */
const UNKNOWN_KID_COOLDOWN_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
/** Real identity tokens are around 1 KB. */
const MAX_TOKEN_LENGTH = 8_192;

export interface AppleJwk extends webcrypto.JsonWebKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
}

export type AppleKeysFetcher = () => Promise<{ keys: AppleJwk[] }>;

export interface AppleIdentity {
  /** Stable per app team; what the account is keyed by. */
  sub: string;
}

/** The token itself is bad: the caller gets a 401. */
export class AppleTokenError extends Error {
  override name = 'AppleTokenError';
}

/** Apple's keys could not be fetched: not the caller's fault, a 503. */
export class AppleKeysUnavailableError extends Error {
  override name = 'AppleKeysUnavailableError';
}

export const fetchAppleKeys: AppleKeysFetcher = async () => {
  const r = await fetch(APPLE_KEYS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) throw new Error(`Apple keys: HTTP ${r.status}`);
  const body = (await r.json()) as { keys?: unknown };
  if (!body || !Array.isArray(body.keys)) throw new Error('Apple keys: malformed response');
  return { keys: body.keys as AppleJwk[] };
};

export interface AppleVerifierOptions {
  /** The app's bundle id — the `aud` Apple puts in tokens issued to it. */
  audience?: string | (() => string);
  fetchKeys?: AppleKeysFetcher;
  now?: () => number;
}

export type AppleVerifier = (identityToken: string) => Promise<AppleIdentity>;

export function createAppleVerifier(options: AppleVerifierOptions = {}): AppleVerifier {
  const fetchKeys = options.fetchKeys ?? fetchAppleKeys;
  const now = options.now ?? Date.now;
  const audienceOf = (): string =>
    typeof options.audience === 'function'
      ? options.audience()
      : (options.audience ?? DEFAULT_APPLE_AUDIENCE);

  let keys = new Map<string, KeyObject>();
  let fetchedAt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> | null = null;

  function refresh(): Promise<void> {
    // Concurrent sign-ins share one fetch rather than each starting their own.
    inflight ??= (async () => {
      try {
        const { keys: jwks } = await fetchKeys();
        const next = new Map<string, KeyObject>();
        for (const jwk of jwks) {
          if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
          if (jwk.alg !== undefined && jwk.alg !== 'RS256') continue;
          try {
            next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
          } catch {
            // One malformed key must not take the others down with it.
          }
        }
        keys = next;
        fetchedAt = now();
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function keyFor(kid: string): Promise<KeyObject> {
    const age = now() - fetchedAt;
    let refreshFailed = false;
    if (age > KEYS_TTL_MS || (!keys.has(kid) && age > UNKNOWN_KID_COOLDOWN_MS)) {
      try {
        await refresh();
      } catch {
        // Keys already held stay usable: an outage at Apple should not stop
        // people signing in with a key that has not changed.
        refreshFailed = true;
      }
    }
    const key = keys.get(kid);
    if (key) return key;
    if (refreshFailed) throw new AppleKeysUnavailableError('Apple signing keys unavailable');
    throw new AppleTokenError('unknown signing key');
  }

  return async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdentity> {
    if (typeof identityToken !== 'string' || identityToken.length > MAX_TOKEN_LENGTH) {
      throw new AppleTokenError('malformed token');
    }
    const parts = identityToken.split('.');
    if (parts.length !== 3) throw new AppleTokenError('malformed token');
    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];

    const header = decodeSegment(encodedHeader);
    // Pinned, never read from the token: "alg": "none" or an HMAC algorithm
    // keyed with the public key are the classic ways around a JWT check.
    if (header['alg'] !== 'RS256') throw new AppleTokenError('unsupported algorithm');
    if (typeof header['kid'] !== 'string') throw new AppleTokenError('missing key id');

    const key = await keyFor(header['kid']);
    const signed = verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      key,
      Buffer.from(encodedSignature, 'base64url')
    );
    if (!signed) throw new AppleTokenError('bad signature');

    // Claims are only trusted once the signature over them has been checked.
    const claims = decodeSegment(encodedPayload);
    if (claims['iss'] !== APPLE_ISSUER) throw new AppleTokenError('wrong issuer');

    const audience = audienceOf();
    const aud = claims['aud'];
    const audiences = Array.isArray(aud) ? aud : [aud];
    if (!audiences.includes(audience)) throw new AppleTokenError('wrong audience');

    const exp = claims['exp'];
    if (typeof exp !== 'number' || exp * 1000 <= now()) throw new AppleTokenError('expired');

    const sub = claims['sub'];
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 255) {
      throw new AppleTokenError('missing subject');
    }
    return { sub };
  };
}

function decodeSegment(segment: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Falls through to the error below.
  }
  throw new AppleTokenError('malformed token');
}

/** The verifier the routes use: Apple's live keys, audience from the environment. */
export const verifyAppleIdentityToken: AppleVerifier = createAppleVerifier({
  audience: () => process.env['APPLE_BUNDLE_ID'] || DEFAULT_APPLE_AUDIENCE
});
