import { destination } from '../flight/telemetry';
import { bearing, haversine } from '../geo/greatCircle';

/**
 * The view from a window, drawn from elevation data.
 *
 * From the aircraft, rays fan out across the window's field of view; along
 * each one the ground is sampled to the horizon. Seen from 11 km a mountain
 * 200 km away sits below the horizon, lowered further by the Earth's
 * curvature (a ray bends with the air, so the usual 4/3 Earth radius is
 * used). The samples are grouped into distance bands and each band's highest
 * point per ray becomes its skyline: drawn far to near, the bands give the
 * layered ridges a passenger actually sees. It works through cloud and at
 * night, because it is computed rather than photographed.
 *
 * Heights are exaggerated (×3.5 by default): at cruise a 3 km range 150 km
 * away spans about a degree, which a phone screen would show as a crease.
 */

export interface PanoramaInput {
  lat: number;
  lon: number;
  altM: number;
  heading: number;
  side: 'left' | 'right';
  heightAt: (lat: number, lon: number) => number | null;
  width: number;
  height: number;
  columns?: number;
  fovDeg?: number;
  /** Degrees above the horizontal at the top of the view, and (negative) at the bottom. */
  topDeg?: number;
  bottomDeg?: number;
  exaggeration?: number;
}

export interface Band {
  near: number;
  far: number;
  /** Screen y of the band's skyline at each column. */
  ridge: number[];
  /** Highest ground under the skyline at each column, m. */
  peak: number[];
  /** Share of this band's samples on open water. */
  water: number;
}

export interface Panorama {
  xs: number[];
  azimuths: number[];
  bands: Band[];
  /** Screen y of the sea-level horizon at the far edge of the view. */
  horizonY: number;
  maxKm: number;
  /** Share of samples with no elevation data at all. */
  missing: number;
  /** For each column, the highest screen y reached nearer than each distance (for occlusion). */
  occlusion: Array<Array<{ d: number; y: number }>>;
}

const R_EFF = 6371 * (4 / 3);

export function viewParams(input: PanoramaInput) {
  const fov = input.fovDeg ?? 100;
  const top = input.topDeg ?? 4;
  const bottom = input.bottomDeg ?? -22;
  const ex = input.exaggeration ?? 3.5;
  const centre = input.heading + (input.side === 'right' ? 90 : -90);
  const altKm = Math.max(0.3, input.altM / 1000);
  // To the sea horizon, plus as far again as a 5 km summit can be seen beyond it.
  const maxKm = Math.min(460, Math.sqrt(2 * R_EFF * altKm) + Math.sqrt(2 * R_EFF * 5));
  return { fov, top, bottom, ex, centre, altKm, maxKm };
}

/** Screen y of something at `distKm` and `elevM`, seen from the window. */
export function screenY(input: PanoramaInput, distKm: number, elevM: number): number {
  const { top, bottom, ex, altKm } = viewParams(input);
  const drop = (distKm * distKm) / (2 * R_EFF);
  const angle = (Math.atan2((Math.max(0, elevM) * ex) / 1000 - altKm - drop, Math.max(0.01, distKm)) * 180) / Math.PI;
  return ((top - angle) / (top - bottom)) * input.height;
}

/** Where a point would be on screen: null if outside the window's field of view or beyond the horizon. */
export function project(input: PanoramaInput, lat: number, lon: number, elevM: number): { x: number; y: number; d: number } | null {
  const { fov, centre, maxKm } = viewParams(input);
  const d = haversine(input.lat, input.lon, lat, lon);
  if (d < 2 || d > maxKm) return null;
  let rel = bearing(input.lat, input.lon, lat, lon) - centre;
  rel = ((rel + 540) % 360) - 180;
  if (Math.abs(rel) > fov / 2) return null;
  return { x: ((rel + fov / 2) / fov) * input.width, y: screenY(input, d, elevM), d };
}

export function panorama(input: PanoramaInput): Panorama {
  const { fov, centre, maxKm } = viewParams(input);
  const n = input.columns ?? 96;
  const BANDS = 16;
  const NEAR = 4;
  const bounds = Array.from({ length: BANDS + 1 }, (_, i) => NEAR * Math.pow(maxKm / NEAR, i / BANDS));
  const distances: number[] = [];
  for (let d = NEAR; d <= maxKm; d *= 1.03) distances.push(d);

  const xs: number[] = [];
  const azimuths: number[] = [];
  const bands: Band[] = bounds.slice(0, -1).map((near, i) => ({
    near,
    far: bounds[i + 1]!,
    ridge: new Array<number>(n).fill(input.height),
    peak: new Array<number>(n).fill(0),
    water: 0
  }));
  const waterCount = new Array<number>(BANDS).fill(0);
  const sampleCount = new Array<number>(BANDS).fill(0);
  const occlusion: Panorama['occlusion'] = [];
  let missing = 0;
  let total = 0;

  for (let c = 0; c < n; c++) {
    const az = centre - fov / 2 + (fov * c) / (n - 1);
    azimuths.push(az);
    xs.push((c / (n - 1)) * input.width);
    let highest = input.height;
    const occ: Array<{ d: number; y: number }> = [];
    let b = 0;
    for (const d of distances) {
      while (b < BANDS - 1 && d > bounds[b + 1]!) b++;
      const [lon, lat] = destination(input.lat, input.lon, az, d);
      const h = input.heightAt(lat, lon);
      total++;
      if (h == null) missing++;
      const elev = h ?? 0;
      const y = screenY(input, d, elev);
      const band = bands[b]!;
      if (y < band.ridge[c]!) {
        band.ridge[c] = y;
        band.peak[c] = elev;
      }
      sampleCount[b]!++;
      if (elev <= 0.5) waterCount[b]!++;
      if (y < highest) highest = y;
      occ.push({ d, y: highest });
    }
    occlusion.push(occ);
  }
  bands.forEach((band, i) => {
    band.water = sampleCount[i] ? waterCount[i]! / sampleCount[i]! : 0;
  });
  return { xs, azimuths, bands, horizonY: screenY(input, maxKm, 0), maxKm, missing: total ? missing / total : 1, occlusion };
}

/** Whether a point at distance `d` and screen height `y` shows above the ground nearer to it in its column. */
export function visible(p: Panorama, x: number, width: number, d: number, y: number, marginPx = 2): boolean {
  const c = Math.max(0, Math.min(p.xs.length - 1, Math.round((x / width) * (p.xs.length - 1))));
  const occ = p.occlusion[c];
  if (!occ) return true;
  let nearer = Infinity;
  for (const o of occ) {
    if (o.d >= d * 0.97) break;
    nearer = o.y;
  }
  return y <= nearer + marginPx;
}
