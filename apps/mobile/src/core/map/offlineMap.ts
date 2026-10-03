import { OfflineManager } from '@maplibre/maplibre-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { RoutePoint } from '@skyatlas/shared';

/**
 * Offline map tiles.
 *
 * The product's central promise is that it works at cruise with the radio off.
 * That rules out Apple Maps, which has no public offline API, and it rules out
 * any provider that requires a key at render time. OpenFreeMap serves the
 * OpenMapTiles schema for free without a key, and MapLibre can pre-download it.
 */

/**
 * Day: a coloured atlas — forests, ice, sand, water — over Natural Earth's
 * shaded relief. Night: the dark chart, which does not light up a sleeping
 * cabin. Both are OpenFreeMap styles on OpenStreetMap data; attribution is
 * shown on the map.
 */
export const MAP_STYLE_DAY = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_STYLE_NIGHT = 'https://tiles.openfreemap.org/styles/dark';

/**
 * Natural Earth II shaded relief: green lowlands, brown uplands, white ice.
 * The day style already draws these tiles, but faintly; the map draws them
 * again, stronger, from the same addresses — so the corridor pack that stores
 * them for the style serves them offline too.
 */
export const RELIEF_TILES = 'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png';

/**
 * Elevation for hill shading: AWS Terrain Tiles (Terrarium encoding), free and
 * keyless. An offline pack only stores what its style names, so these are
 * downloaded as files for the corridor and drawn from the phone, in the air
 * and on the ground alike.
 */
const DEM_REMOTE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DEM_DIR = `${FileSystem.documentDirectory ?? ''}dem/`;
export const DEM_TILES = `${DEM_DIR}{z}/{x}/{y}.png`;
/** Past 7 the shading is overzoomed from 7, which still reads well at cruise. */
export const DEM_MAX_ZOOM = 7;
const DEM_MIN_ZOOM = 3;
/** Degrees either side of the track: past the horizon from 11 km. */
const DEM_MARGIN_DEG = 1.5;

/**
 * Zoom range packaged for a flight.
 *
 * Nothing below 2 is useful (the whole planet is one tile) and nothing above 6
 * is legible from 11 km — but each extra level quadruples the download. Six is
 * where a coastline still reads and a corridor still fits in tens of megabytes.
 */
const MIN_ZOOM = 2;
const MAX_ZOOM = 6;

/** Degrees of margin either side of the track. ~2° is 220 km — past the horizon. */
const CORRIDOR_MARGIN_DEG = 2;

/**
 * How many segments a route is split into.
 *
 * One bounding box around a long-haul route would cover a quarter of the planet
 * and download most of it. Splitting into segments and packing each one turns
 * that into a corridor: the download scales with the length of the flight rather
 * than with the area its endpoints happen to span.
 */
const SEGMENTS = 12;

export interface CorridorProgress {
  /** 0–1 across the whole corridor, not per segment. */
  progress: number;
  completedTiles: number;
  totalTiles: number;
}

function bboxFor(points: RoutePoint[]): [number, number, number, number] {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const m = CORRIDOR_MARGIN_DEG;
  // MapLibre bounds are [west, south, east, north].
  return [
    Math.max(-180, minLon - m),
    Math.max(-90, minLat - m),
    Math.min(180, maxLon + m),
    Math.min(90, maxLat + m)
  ];
}

/**
 * Splits the route into segments, skipping any that cross the antimeridian.
 *
 * A segment spanning the date line produces a bounding box that wraps the whole
 * globe, so those are packed as two boxes rather than one enormous one.
 */
function segments(route: RoutePoint[]): RoutePoint[][] {
  if (route.length < 2) return [];
  const size = Math.ceil(route.length / SEGMENTS);
  const out: RoutePoint[][] = [];
  for (let i = 0; i < route.length; i += size) {
    // Overlap by one point so consecutive boxes meet rather than leave a seam.
    const chunk = route.slice(i, Math.min(route.length, i + size + 1));
    if (chunk.length < 2) continue;

    const crosses = chunk.some(
      (p, idx) => idx > 0 && Math.abs(p.lon - chunk[idx - 1]!.lon) > 180
    );
    if (crosses) {
      out.push(chunk.filter((p) => p.lon >= 0));
      out.push(chunk.filter((p) => p.lon < 0));
    } else {
      out.push(chunk);
    }
  }
  return out.filter((c) => c.length >= 2);
}

/** Slippy-map tile of a point. */
function tileOf(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const clampedLat = Math.max(-85.05, Math.min(85.05, lat));
  const r = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((((lon + 180) % 360) + 360) % 360 / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

/** The elevation tiles a corridor needs, as "z/x/y". */
export function demTilesFor(route: RoutePoint[], margin = DEM_MARGIN_DEG): string[] {
  const keys = new Set<string>();
  for (let z = DEM_MIN_ZOOM; z <= DEM_MAX_ZOOM; z++) {
    // The window view looks to the horizon, ~400 km out; coarse tiles cover it cheaply.
    const m = z <= 5 ? Math.max(margin, 4) : margin;
    for (const p of route) {
      const [x0, y0] = tileOf(p.lat + m, p.lon - m, z);
      const [x1, y1] = tileOf(p.lat - m, p.lon + m, z);
      const n = 2 ** z;
      // Across the date line the west edge has a larger x than the east.
      const xs = x0 <= x1 ? Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i) : [...Array.from({ length: n - x0 }, (_, i) => x0 + i), ...Array.from({ length: x1 + 1 }, (_, i) => i)];
      for (const x of xs) for (let y = y0; y <= y1; y++) keys.add(`${z}/${x}/${y}`);
    }
  }
  return [...keys];
}

/** Downloads the elevation tiles of a corridor that are not on the phone yet. */
export async function downloadRelief(route: RoutePoint[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const keys = demTilesFor(route);
  let done = 0;
  const queue = [...keys];
  const worker = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      const dest = `${DEM_DIR}${key}.png`;
      try {
        const info = await FileSystem.getInfoAsync(dest);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(dest.slice(0, dest.lastIndexOf('/')), { intermediates: true }).catch(() => {});
          const [z, x, y] = key.split('/');
          // Foreground: a tile is a few kilobytes, fetched while the app is
          // open. iOS background sessions failed every tile on the simulator
          // ("unknown error") and add a system round trip on a phone.
          const res = await FileSystem.downloadAsync(DEM_REMOTE.replace('{z}', z!).replace('{x}', x!).replace('{y}', y!), dest, {
            sessionType: FileSystem.FileSystemSessionType.FOREGROUND
          });
          if (res.status !== 200) await FileSystem.deleteAsync(dest, { idempotent: true });
        }
      } catch {
        // A missing tile is a flat patch on the map, not a failed flight.
      }
      onProgress?.(++done, keys.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

/**
 * Downloads the map corridor for a flight.
 *
 * Called while the passenger still has Wi-Fi, alongside the rest of the offline
 * package: the day and night styles for each segment of the route, and the
 * elevation that shades its mountains. Reports combined progress so the caller
 * can show one number rather than twenty-five.
 */
export async function downloadCorridor(
  flightId: string,
  route: RoutePoint[],
  onProgress?: (p: CorridorProgress) => void
): Promise<void> {
  const chunks = segments(route);
  if (chunks.length === 0) return;
  const styles = [MAP_STYLE_DAY, MAP_STYLE_NIGHT];
  const jobs = chunks.flatMap((chunk, segment) => styles.map((mapStyle) => ({ chunk, segment, mapStyle })));

  const done = new Array<number>(jobs.length + 1).fill(0);
  const totals = new Array<number>(jobs.length + 1).fill(0);
  const report = () => {
    const completed = done.reduce((a, b) => a + b, 0);
    const total = totals.reduce((a, b) => a + b, 0);
    onProgress?.({ progress: total > 0 ? completed / total : 0, completedTiles: completed, totalTiles: total });
  };

  await Promise.all([
    ...jobs.map(
      ({ chunk, segment, mapStyle }, index) =>
        new Promise<void>((resolve, reject) => {
          OfflineManager.createPack(
            {
              mapStyle,
              bounds: bboxFor(chunk),
              minZoom: MIN_ZOOM,
              maxZoom: MAX_ZOOM,
              // Packs are identified by metadata: the API has no name field, and
              // the generated id is not something we can reconstruct later.
              metadata: { flightId, segment, style: mapStyle === MAP_STYLE_DAY ? 'day' : 'night' }
            },
            (_pack, status) => {
              done[index] = status.completedResourceCount ?? 0;
              totals[index] = status.requiredResourceCount ?? 0;
              report();
              if (status.percentage >= 100) resolve();
            },
            (_pack, error) => reject(new Error(String(error)))
          ).catch(reject);
        })
    ),
    downloadRelief(route, (d, total) => {
      done[jobs.length] = d;
      totals[jobs.length] = total;
      report();
    })
  ]);
}

const belongsTo = (pack: { metadata?: Record<string, unknown> }, flightId: string) =>
  pack.metadata?.['flightId'] === flightId;

/** True when at least part of this flight's corridor is on the device. */
export async function hasCorridor(flightId: string): Promise<boolean> {
  const packs = await OfflineManager.getPacks();
  return packs.some((p) => belongsTo(p, flightId));
}

/** Frees the corridor once a flight is behind the passenger. */
export async function deleteCorridor(flightId: string): Promise<void> {
  const packs = await OfflineManager.getPacks();
  await Promise.all(
    packs.filter((p) => belongsTo(p, flightId)).map((p) => OfflineManager.deletePack(p.id))
  );
}
