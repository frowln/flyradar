import { sha256 } from 'js-sha256';

const HMAC_SECRET = process.env['EXPO_PUBLIC_AUTH_HMAC_SECRET'] ?? '';

export interface SignedHeaders {
  'X-Timestamp': string;
  'X-Signature': string;
}

export function signRequest(
  method: string,
  path: string,
  deviceToken: string,
  body: string
): SignedHeaders | null {
  if (!HMAC_SECRET) return null;
  const ts = Date.now();
  const payload = `${method.toUpperCase()}\n${path}\n${ts}\n${deviceToken}\n${body}`;
  const sig = sha256.hmac(HMAC_SECRET, payload);
  return { 'X-Timestamp': String(ts), 'X-Signature': sig };
}
