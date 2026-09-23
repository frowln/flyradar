import { OfflineManager } from '@maplibre/maplibre-react-native';
import type { RoutePoint } from '@skyatlas/shared';

/**
 * Offline map tiles.
 *
 * The product's central promise is that it works at cruise with the radio off.
 * That rules out Apple Maps, which has no public offline API, and it rules out
 * any provider that requires a key at render time. OpenFreeMap serves the
 * OpenMapTiles schema for free without a key, and MapLibre can pre-download it.
 */

/** Dark vector style. OpenStreetMap data — attribution is shown on the map. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

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

/**
 * Downloads the map corridor for a flight.
 *
 * Called while the passenger still has Wi-Fi, alongside the rest of the offline
 * package. Reports combined progress so the caller can show one number rather
 * than twelve.
 */
export async function downloadCorridor(
  flightId: string,
  route: RoutePoint[],
  onProgress?: (p: CorridorProgress) => void
): Promise<void> {
  const chunks = segments(route);
  if (chunks.length === 0) return;

  const done = new Array<number>(chunks.length).fill(0);
  const totals = new Array<number>(chunks.length).fill(0);

  await Promise.all(
    chunks.map(
      (chunk, index) =>
        new Promise<void>((resolve, reject) => {
          OfflineManager.createPack(
            {
              mapStyle: MAP_STYLE_URL,
              bounds: bboxFor(chunk),
              minZoom: MIN_ZOOM,
              maxZoom: MAX_ZOOM,
              // Packs are identified by metadata: the API has no name field, and
              // the generated id is not something we can reconstruct later.
              metadata: { flightId, segment: index }
            },
            (_pack, status) => {
              done[index] = status.completedResourceCount ?? 0;
              totals[index] = status.requiredResourceCount ?? 0;
              const completed = done.reduce((a, b) => a + b, 0);
              const total = totals.reduce((a, b) => a + b, 0);
              onProgress?.({
                progress: total > 0 ? completed / total : 0,
                completedTiles: completed,
                totalTiles: total
              });
              if (status.percentage >= 100) resolve();
            },
            (_pack, error) => reject(new Error(String(error)))
          ).catch(reject);
        })
    )
  );
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
