import { tileBytes } from '../map/demPack.web';

/** Elevation tiles shipped with the browser build, decoded to metres. */
export async function loadHeights(z: number, x: number, y: number): Promise<Float32Array | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  try {
    const bytes = await tileBytes(z, x, y);
    if (!bytes) return null;
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, 256, 256).data;
    const out = new Float32Array(256 * 256);
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4]! * 256 + px[i * 4 + 1]! + px[i * 4 + 2]! / 256 - 32768;
    return out;
  } catch {
    return null;
  }
}

/** Zooms the build carries, finest first (the corridors to 6, the world to 3). */
export const DEM_ZOOMS = [6, 5, 4, 3];
