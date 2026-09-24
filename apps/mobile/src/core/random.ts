import * as Crypto from 'expo-crypto';

/** 128 random bits as hex, from the platform's secure generator. */
export function randomId(prefix = ''): string {
  const bytes = Crypto.getRandomBytes(16);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `${prefix}${hex}`;
}
