import * as FileSystem from 'expo-file-system/legacy';
import UPNG from 'upng-js';
import { DEM_TILES } from '../map/offlineMap';

/**
 * Elevation tiles on the phone: the Terrarium PNGs downloaded with each
 * flight's corridor (src/core/map/offlineMap.ts), decoded to metres.
 */

function decodeTerrarium(rgba: Uint8Array): Float32Array {
  const out = new Float32Array(256 * 256);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]! * 256 + rgba[i * 4 + 1]! + rgba[i * 4 + 2]! / 256 - 32768;
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]!) << 18) | (B64.indexOf(clean[i + 1]!) << 12) | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export async function loadHeights(z: number, x: number, y: number): Promise<Float32Array | null> {
  const path = DEM_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = fromBase64(b64);
    const img = UPNG.decode(bytes.buffer as ArrayBuffer);
    if (img.width !== 256 || img.height !== 256) return null;
    return decodeTerrarium(new Uint8Array(UPNG.toRGBA8(img)[0]!));
  } catch {
    return null;
  }
}

/** Zooms the phone keeps, finest first. */
export const DEM_ZOOMS = [7, 6, 5, 4, 3];
