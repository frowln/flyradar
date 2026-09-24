import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, sign, createHmac, type KeyObject } from 'node:crypto';
import {
  createAppleVerifier,
  AppleTokenError,
  AppleKeysUnavailableError,
  APPLE_ISSUER,
  type AppleJwk
} from '../src/auth/apple.js';

const AUDIENCE = 'com.skyatlas.app';
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

function keyPair(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } as AppleJwk;
  return { jwk, privateKey };
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function token(
  privateKey: KeyObject,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }
): string {
  const payload = {
    iss: APPLE_ISSUER,
    aud: AUDIENCE,
    sub: '001234.abcdef.0987',
    iat: NOW / 1000 - 60,
    exp: NOW / 1000 + 600,
    ...claims
  };
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

const k1 = keyPair('k1');
const k2 = keyPair('k2');

function verifierWith(keys: AppleJwk[], now = () => NOW) {
  const fetchKeys = vi.fn(async () => ({ keys }));
  return { verify: createAppleVerifier({ audience: AUDIENCE, fetchKeys, now }), fetchKeys };
}

describe('Apple identity token verification', () => {
  it('returns the subject of a genuine token', async () => {
    const { verify } = verifierWith([k1.jwk]);
    await expect(verify(token(k1.privateKey))).resolves.toEqual({ sub: '001234.abcdef.0987' });
  });

  it('accepts an audience list that contains the app', async () => {
    const { verify } = verifierWith([k1.jwk]);
    const t = token(k1.privateKey, { aud: ['other.app', AUDIENCE] });
    await expect(verify(t)).resolves.toMatchObject({ sub: '001234.abcdef.0987' });
  });

  it('rejects a token signed by a key Apple did not publish under that id', async () => {
    const { verify } = verifierWith([k1.jwk]);
    // Signed with k2's private key but claiming to be k1.
    await expect(verify(token(k2.privateKey))).rejects.toThrow(AppleTokenError);
  });

  it('rejects a token whose claims were edited after signing', async () => {
    const { verify } = verifierWith([k1.jwk]);
    const [h, , s] = token(k1.privateKey).split('.');
    const forged = `${h}.${b64({ iss: APPLE_ISSUER, aud: AUDIENCE, sub: 'victim', exp: NOW / 1000 + 600 })}.${s}`;
    await expect(verify(forged)).rejects.toThrow('bad signature');
  });

  it('rejects the wrong issuer', async () => {
    const { verify } = verifierWith([k1.jwk]);
    await expect(verify(token(k1.privateKey, { iss: 'https://evil.example' }))).rejects.toThrow('wrong issuer');
  });

  it('rejects a token issued to another app', async () => {
    const { verify } = verifierWith([k1.jwk]);
    await expect(verify(token(k1.privateKey, { aud: 'com.other.app' }))).rejects.toThrow('wrong audience');
  });

  it('rejects an expired token', async () => {
    const { verify } = verifierWith([k1.jwk]);
    await expect(verify(token(k1.privateKey, { exp: NOW / 1000 - 1 }))).rejects.toThrow('expired');
  });

  it('rejects a token without a subject', async () => {
    const { verify } = verifierWith([k1.jwk]);
    await expect(verify(token(k1.privateKey, { sub: '' }))).rejects.toThrow('missing subject');
  });

  it('refuses "none" and HMAC algorithms regardless of the signature', async () => {
    const { verify } = verifierWith([k1.jwk]);
    const payload = b64({ iss: APPLE_ISSUER, aud: AUDIENCE, sub: 'x', exp: NOW / 1000 + 600 });
    const none = `${b64({ alg: 'none', kid: 'k1' })}.${payload}.`;
    await expect(verify(none)).rejects.toThrow('unsupported algorithm');

    const hsHeader = b64({ alg: 'HS256', kid: 'k1' });
    const mac = createHmac('sha256', JSON.stringify(k1.jwk)).update(`${hsHeader}.${payload}`).digest('base64url');
    await expect(verify(`${hsHeader}.${payload}.${mac}`)).rejects.toThrow('unsupported algorithm');
  });

  it('rejects garbage', async () => {
    const { verify } = verifierWith([k1.jwk]);
    for (const bad of ['', 'abc', 'a.b', 'a.b.c', 'x'.repeat(10_000)]) {
      await expect(verify(bad)).rejects.toThrow(AppleTokenError);
    }
  });

  it('fetches the keys once and serves later tokens from memory', async () => {
    const { verify, fetchKeys } = verifierWith([k1.jwk]);
    await verify(token(k1.privateKey));
    await verify(token(k1.privateKey));
    expect(fetchKeys).toHaveBeenCalledTimes(1);
  });

  it('refetches after a day, and when Apple rotates to a key not yet seen', async () => {
    let clock = NOW;
    const published: AppleJwk[] = [k1.jwk];
    const { verify, fetchKeys } = verifierWith(published, () => clock);

    await verify(token(k1.privateKey));
    expect(fetchKeys).toHaveBeenCalledTimes(1);

    // A new key appears; a token signed with it forces a refresh.
    published.push(k2.jwk);
    clock += 10 * 60 * 1000;
    const rotated = token(k2.privateKey, { exp: clock / 1000 + 600 }, { alg: 'RS256', kid: 'k2' });
    await expect(verify(rotated)).resolves.toBeTruthy();
    expect(fetchKeys).toHaveBeenCalledTimes(2);

    clock += 25 * 60 * 60 * 1000;
    await verify(token(k1.privateKey, { exp: clock / 1000 + 600 }));
    expect(fetchKeys).toHaveBeenCalledTimes(3);
  });

  it('does not refetch on every token naming an unknown key', async () => {
    const { verify, fetchKeys } = verifierWith([k1.jwk]);
    await verify(token(k1.privateKey));
    const unknown = token(k2.privateKey, {}, { alg: 'RS256', kid: 'nope' });
    await expect(verify(unknown)).rejects.toThrow('unknown signing key');
    await expect(verify(unknown)).rejects.toThrow('unknown signing key');
    expect(fetchKeys).toHaveBeenCalledTimes(1);
  });

  it('reports Apple being unreachable as unavailability, not a bad token', async () => {
    const verify = createAppleVerifier({
      audience: AUDIENCE,
      fetchKeys: async () => {
        throw new Error('timeout');
      },
      now: () => NOW
    });
    await expect(verify(token(k1.privateKey))).rejects.toThrow(AppleKeysUnavailableError);
  });
});
