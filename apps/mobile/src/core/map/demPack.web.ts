import maplibregl from 'maplibre-gl';

/**
 * Elevation tiles shipped with the browser build (public/dem/, made by
 * scripts/preview/fetch-dem.mjs): Terrarium PNGs at dem/{z}/{x}/{y}.png and an
 * index of which exist, so a missing tile is cut from its ancestor instead of
 * requested. Used by the web map (as a dem:// protocol) and by the window view.
 */

interface DemIndex {
  maxzoom: number;
  tiles: string[];
}

let index: Promise<Set<string> | null> | null = null;
const cache = new Map<string, Promise<ArrayBuffer | null>>();

/**
 * Where the build is served from, taken once at load: screens change the
 * address later (/flight/…), and a relative URL would then point inside it.
 */
export const BASE = typeof location === 'undefined' ? '' : location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');

function demIndex(): Promise<Set<string> | null> {
  index ??= fetch(`${BASE}dem/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<DemIndex>) : null))
    .then((i) => (i ? new Set(i.tiles) : null))
    .catch(() => null);
  return index;
}

export async function tileBytes(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const key = `${z}/${x}/${y}`;
  const idx = await demIndex();
  if (!idx?.has(key)) return null;
  let c = cache.get(key);
  if (!c) {
    c = fetch(`${BASE}dem/${key}.png`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    cache.set(key, c);
  }
  const buf = await c;
  // A copy: the map takes ownership of what it is given.
  return buf ? buf.slice(0) : null;
}

/**
 * A tile the build does not carry, cut from the nearest ancestor it does.
 * Heights are decoded, interpolated bilinearly and encoded again: Terrarium
 * packs a height into the RGB bytes, so scaling the image itself would either
 * blend bytes into heights that never existed (smoothing) or show blocks
 * (nearest neighbour).
 */
export async function fromAncestor(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  for (let up = 1; up <= z; up++) {
    const pz = z - up;
    const px = x >> up;
    const py = y >> up;
    const bytes = await tileBytes(pz, px, py);
    if (!bytes) continue;
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const src = new OffscreenCanvas(256, 256);
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.drawImage(img, 0, 0);
    const from = sctx.getImageData(0, 0, 256, 256).data;
    const height = (i: number) => from[i]! * 256 + from[i + 1]! + from[i + 2]! / 256 - 32768;
    const scale = 1 / (1 << up);
    const ox = (x - (px << up)) * 256 * scale;
    const oy = (y - (py << up)) * 256 * scale;
    const out = new OffscreenCanvas(256, 256);
    const octx = out.getContext('2d');
    if (!octx) return null;
    const img2 = octx.createImageData(256, 256);
    const to = img2.data;
    for (let j = 0; j < 256; j++) {
      const fy = Math.min(255, oy + (j + 0.5) * scale - 0.5);
      const y0 = Math.max(0, Math.floor(fy));
      const y1 = Math.min(255, y0 + 1);
      const ty = Math.max(0, fy - y0);
      for (let i = 0; i < 256; i++) {
        const fx = Math.min(255, ox + (i + 0.5) * scale - 0.5);
        const x0 = Math.max(0, Math.floor(fx));
        const x1 = Math.min(255, x0 + 1);
        const tx = Math.max(0, fx - x0);
        const h =
          (height((y0 * 256 + x0) * 4) * (1 - tx) + height((y0 * 256 + x1) * 4) * tx) * (1 - ty) +
          (height((y1 * 256 + x0) * 4) * (1 - tx) + height((y1 * 256 + x1) * 4) * tx) * ty;
        const v = h + 32768;
        const k = (j * 256 + i) * 4;
        to[k] = Math.floor(v / 256);
        to[k + 1] = Math.floor(v) % 256;
        to[k + 2] = Math.floor((v - Math.floor(v)) * 256);
        to[k + 3] = 255;
      }
    }
    octx.putImageData(img2, 0, 0);
    return (await out.convertToBlob({ type: 'image/png' })).arrayBuffer();
  }
  return null;
}

let protocolAdded = false;
/**
 * Registers dem:// for elevation and glyphs:// for the map's label fonts. The
 * fonts ship as base64 inside JSON (atlas/fonts/<font>/<range>.json): the
 * host serves a fixed list of file types, and protobuf is not on it.
 */
export function addDemProtocol(): void {
  if (protocolAdded) return;
  protocolAdded = true;
  maplibregl.addProtocol('dem', async (params) => {
    const m = /dem:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error('bad tile address');
    const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const data = (await tileBytes(z, x, y)) ?? (await fromAncestor(z, x, y));
    if (!data) throw new Error('no elevation here');
    return { data };
  });
  maplibregl.addProtocol('glyphs', async (params) => {
    const m = /glyphs:\/\/([^/]+)\/(\d+-\d+)/.exec(params.url);
    if (!m) throw new Error('bad glyph address');
    const res = await fetch(`${BASE}atlas/fonts/${m[1]}/${m[2]}.json`);
    if (!res.ok) throw new Error('no glyphs');
    const { pbf } = (await res.json()) as { pbf: string };
    const bin = atob(pbf);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { data: data.buffer };
  });
}

