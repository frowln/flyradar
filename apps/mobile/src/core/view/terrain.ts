/**
 * Ground heights around the aircraft, from whichever elevation tiles are at
 * hand: the finest zoom near the aircraft, coarser ones out to the horizon.
 */

export type HeightLoader = (z: number, x: number, y: number) => Promise<Float32Array | null>;

function tileXY(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  const x = ((((lon + 180) % 360) + 360) % 360 / 360) * n * 256;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * 256;
  return [x, y];
}

export class Terrain {
  private tiles = new Map<string, Float32Array | null>();

  constructor(
    private load: HeightLoader,
    /** Zooms available, finest first. */
    private zooms: number[]
  ) {}

  /** Loads the tiles around a point: the finest zoom to ~150 km, coarser ones to `radiusKm`. */
  async prefetch(lat: number, lon: number, radiusKm: number): Promise<void> {
    const wanted: Array<[number, number, number]> = [];
    this.zooms.forEach((z, i) => {
      const r = i === 0 ? Math.min(radiusKm, 150) : radiusKm;
      const dLat = r / 111;
      const dLon = r / (111 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
      const [x0, y0] = tileXY(lat + dLat, lon - dLon, z);
      const [x1, y1] = tileXY(lat - dLat, lon + dLon, z);
      const n = 2 ** z;
      const tx0 = Math.floor(x0 / 256);
      const tx1 = Math.floor(x1 / 256);
      const xs = tx0 <= tx1 ? Array.from({ length: tx1 - tx0 + 1 }, (_, k) => tx0 + k) : [...Array.from({ length: n - tx0 }, (_, k) => tx0 + k), ...Array.from({ length: tx1 + 1 }, (_, k) => k)];
      for (const x of xs) for (let y = Math.max(0, Math.floor(y0 / 256)); y <= Math.min(n - 1, Math.floor(y1 / 256)); y++) wanted.push([z, x, y]);
    });
    await Promise.all(
      wanted
        .filter(([z, x, y]) => !this.tiles.has(`${z}/${x}/${y}`))
        .map(async ([z, x, y]) => {
          const key = `${z}/${x}/${y}`;
          this.tiles.set(key, null);
          this.tiles.set(key, await this.load(z, x, y).catch(() => null));
        })
    );
  }

  /** Metres above sea level, bilinear within the finest tile at hand; null where there is none. */
  heightAt = (lat: number, lon: number): number | null => {
    for (const z of this.zooms) {
      const [px, py] = tileXY(lat, lon, z);
      const tx = Math.floor(px / 256);
      const ty = Math.floor(py / 256);
      const tile = this.tiles.get(`${z}/${tx}/${ty}`);
      if (!tile) continue;
      const fx = Math.min(254.999, Math.max(0, px - tx * 256 - 0.5));
      const fy = Math.min(254.999, Math.max(0, py - ty * 256 - 0.5));
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const ax = fx - ix;
      const ay = fy - iy;
      const at = (x: number, y: number) => tile[y * 256 + x]!;
      return (at(ix, iy) * (1 - ax) + at(ix + 1, iy) * ax) * (1 - ay) + (at(ix, iy + 1) * (1 - ax) + at(ix + 1, iy + 1) * ax) * ay;
    }
    return null;
  };
}
