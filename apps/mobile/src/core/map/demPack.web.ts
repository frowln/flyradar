import maplibregl from 'maplibre-gl';

/**
 * Elevation tiles shipped with the browser build (public/dem/, made by
 * scripts/preview/fetch-dem.mjs): an index and a few packed files, read once
 * and sliced per tile. Used by the web map (as a dem:// protocol) and by the
 * window view.
 */


interface DemIndex {
  chunks: number;
  maxzoom: number;
  tiles: Record<string, [number, number, number]>;
}

let index: Promise<DemIndex | null> | null = null;
const chunks = new Map<number, Promise<ArrayBuffer>>();

/**
 * Where the build is served from, taken once at load: screens change the
 * address later (/flight/…), and a relative URL would then point inside it.
 */
export const BASE = typeof location === 'undefined' ? '' : location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');

function demIndex(): Promise<DemIndex | null> {
  index ??= fetch(`${BASE}dem/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<DemIndex>) : null))
    .catch(() => null);
  return index;
}

function chunk(i: number): Promise<ArrayBuffer> {
  let c = chunks.get(i);
  if (!c) {
    c = fetch(`${BASE}dem/pack-${i}.bin`).then((r) => r.arrayBuffer());
    chunks.set(i, c);
  }
  return c;
}

export async function tileBytes(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const idx = await demIndex();
  const at = idx?.tiles[`${z}/${x}/${y}`];
  if (!at) return null;
  const buf = await chunk(at[0]);
  return buf.slice(at[1], at[1] + at[2]);
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
}

