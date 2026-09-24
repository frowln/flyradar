import type { POI, POICategory, PassSide, RoutePoint } from '@skyatlas/shared';
import type { DataPlace, MultiPolygon } from '../data/types';
import { crossTrackKm, alongTrackKm, haversine } from '../geo/greatCircle';
import { bboxContains, pointInMulti } from '../geo/polygon';
import { KIND_WEIGHT, horizonKm, isArea, recognitionRangeKm } from './visibility';

/**
 * Choosing what to show on a flight.
 *
 * Every place is measured against the actual path: how close the aircraft gets,
 * on which side, at what moment, and for how long it is in view. Only then is
 * anything ranked — so a famous place 300 km off-track loses to a lesser one
 * the passenger will actually see, and a flight of any length gets places spread
 * across all of it rather than bunched over one well-mapped country.
 */

/** Closer than this to the track, a place is under the aircraft rather than to one side. */
const BELOW_KM = 8;

/** Grid cell size for the spatial index, degrees. */
const CELL = 2;

export interface Sighting {
  place: DataPlace;
  /** Closest approach to the track, km (0 when overflown). */
  distanceKm: number;
  side: PassSide;
  /** Seconds after takeoff at closest approach. */
  passAt: number;
  visibleFrom: number;
  visibleTo: number;
  /** Areas only: the stretch of the flight spent inside the outline. */
  overFrom?: number;
  overTo?: number;
  score: number;
}

interface Grid {
  cells: Map<string, DataPlace[]>;
  areas: DataPlace[];
}

const gridCache = new WeakMap<DataPlace[], Grid>();

function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
}

function gridFor(places: DataPlace[]): Grid {
  const cached = gridCache.get(places);
  if (cached) return cached;
  const cells = new Map<string, DataPlace[]>();
  const areas: DataPlace[] = [];
  for (const p of places) {
    // Large areas are tested against the route directly; indexing them by their
    // label point would miss a flight that crosses the far side of a desert.
    if (p.bb && (p.ext ?? 0) > 60) {
      areas.push(p);
      continue;
    }
    const key = cellKey(p.lat, p.lon);
    const list = cells.get(key);
    if (list) list.push(p);
    else cells.set(key, [p]);
  }
  const grid = { cells, areas };
  gridCache.set(places, grid);
  return grid;
}

/** Cheap planar distance, good enough to find the nearest route sample before refining. */
function approxKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  let dLon = Math.abs(lon2 - lon1);
  if (dLon > 180) dLon = 360 - dLon;
  const x = dLon * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * 111.2;
}

function candidatesNearRoute(route: RoutePoint[], grid: Grid): Set<DataPlace> {
  const found = new Set<DataPlace>();
  const seenCells = new Set<string>();
  const reach = 280; // km — beyond the longest recognition range
  for (const pt of route) {
    const dLat = reach / 111;
    const dLon = reach / (111 * Math.max(0.1, Math.cos((pt.lat * Math.PI) / 180)));
    for (let la = Math.floor((pt.lat - dLat) / CELL); la <= Math.floor((pt.lat + dLat) / CELL); la++) {
      for (let lo = Math.floor((pt.lon - dLon) / CELL); lo <= Math.floor((pt.lon + dLon) / CELL); lo++) {
        // Longitude cells wrap at the antimeridian.
        const wrapped = ((((lo * CELL + 180) % 360) + 360) % 360) - 180;
        const key = `${la}:${Math.floor(wrapped / CELL)}`;
        if (seenCells.has(key)) continue;
        seenCells.add(key);
        for (const p of grid.cells.get(key) ?? []) found.add(p);
      }
    }
  }
  return found;
}

/** Nearest approach of a point place to the route, refined against the neighbouring legs. */
function measurePoint(place: DataPlace, route: RoutePoint[]): Omit<Sighting, 'score'> | null {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < route.length; i++) {
    const d = approxKm(route[i]!.lat, route[i]!.lon, place.lat, place.lon);
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  if (best > 320) return null;

  // Refine on the leg either side of the nearest sample.
  let distance = haversine(route[bi]!.lat, route[bi]!.lon, place.lat, place.lon);
  let passAt = route[bi]!.elapsedSeconds;
  let signed = 0;
  for (const [ai, bj] of [
    [bi - 1, bi],
    [bi, bi + 1]
  ] as const) {
    const a = route[ai];
    const b = route[bj];
    if (!a || !b) continue;
    const legKm = haversine(a.lat, a.lon, b.lat, b.lon);
    if (legKm < 0.01) continue;
    const along = alongTrackKm(place.lat, place.lon, a.lat, a.lon, b.lat, b.lon);
    if (along < 0 || along > legKm) continue;
    const xt = crossTrackKm(place.lat, place.lon, a.lat, a.lon, b.lat, b.lon);
    if (Math.abs(xt) <= distance) {
      distance = Math.abs(xt);
      signed = xt;
      passAt = a.elapsedSeconds + (along / legKm) * (b.elapsedSeconds - a.elapsedSeconds);
    }
  }
  if (signed === 0) {
    const a = route[Math.max(0, bi - 1)]!;
    const b = route[Math.min(route.length - 1, bi + 1)]!;
    signed = crossTrackKm(place.lat, place.lon, a.lat, a.lon, b.lat, b.lon);
  }

  const range = recognitionRangeKm(place);
  let from = passAt;
  let to = passAt;
  for (let i = 0; i < route.length; i++) {
    const pt = route[i]!;
    const limit = Math.min(range, horizonKm(pt.altitude) * 0.9);
    if (approxKm(pt.lat, pt.lon, place.lat, place.lon) <= limit) {
      from = Math.min(from, pt.elapsedSeconds);
      to = Math.max(to, pt.elapsedSeconds);
    }
  }

  return {
    place,
    distanceKm: distance,
    side: distance < BELOW_KM ? 'below' : signed > 0 ? 'right' : 'left',
    passAt: Math.round(passAt),
    visibleFrom: Math.round(from),
    visibleTo: Math.round(to)
  };
}

/** Area places: overflown when the track enters the outline, otherwise the nearest edge. */
function measureArea(
  place: DataPlace,
  route: RoutePoint[],
  outline: MultiPolygon | undefined
): Omit<Sighting, 'score'> | null {
  const bb = place.bb;
  if (!bb) return measurePoint(place, route);
  const range = recognitionRangeKm(place);
  const margin = range / 111;

  let insideFrom = -1;
  let insideTo = -1;
  let bestRun: [number, number] | null = null;
  let nearest = Infinity;
  let nearestAt = 0;
  let nearestSigned = 0;
  let visibleFrom = Infinity;
  let visibleTo = -Infinity;

  for (let i = 0; i < route.length; i++) {
    const pt = route[i]!;
    if (!bboxContains(bb, pt.lon, pt.lat, margin)) {
      if (insideFrom >= 0) {
        if (!bestRun || insideTo - insideFrom > bestRun[1] - bestRun[0]) bestRun = [insideFrom, insideTo];
        insideFrom = -1;
      }
      continue;
    }
    const inside =
      bboxContains(bb, pt.lon, pt.lat) &&
      (outline ? pointInMulti(pt.lon, pt.lat, outline) : haversine(pt.lat, pt.lon, place.lat, place.lon) < (place.ext ?? 0) * 0.6);

    if (inside) {
      if (insideFrom < 0) insideFrom = pt.elapsedSeconds;
      insideTo = pt.elapsedSeconds;
      nearest = 0;
      visibleFrom = Math.min(visibleFrom, pt.elapsedSeconds);
      visibleTo = Math.max(visibleTo, pt.elapsedSeconds);
      continue;
    }
    if (insideFrom >= 0) {
      if (!bestRun || insideTo - insideFrom > bestRun[1] - bestRun[0]) bestRun = [insideFrom, insideTo];
      insideFrom = -1;
    }

    // Distance to the outline's nearest vertex — outlines are simplified to a
    // few km, so this is as precise as the data it is measured against.
    let d = Infinity;
    let vLat = place.lat;
    let vLon = place.lon;
    if (outline) {
      for (const poly of outline) {
        for (const [lon, lat] of poly[0] ?? []) {
          const dd = approxKm(pt.lat, pt.lon, lat, lon);
          if (dd < d) {
            d = dd;
            vLat = lat;
            vLon = lon;
          }
        }
      }
    } else {
      d = Math.max(0, haversine(pt.lat, pt.lon, place.lat, place.lon) - (place.ext ?? 0) * 0.6);
    }
    if (d <= range) {
      visibleFrom = Math.min(visibleFrom, pt.elapsedSeconds);
      visibleTo = Math.max(visibleTo, pt.elapsedSeconds);
    }
    if (d < nearest) {
      nearest = d;
      nearestAt = pt.elapsedSeconds;
      const a = route[Math.max(0, i - 1)]!;
      const b = route[Math.min(route.length - 1, i + 1)]!;
      nearestSigned = crossTrackKm(vLat, vLon, a.lat, a.lon, b.lat, b.lon);
    }
  }
  if (insideFrom >= 0 && (!bestRun || insideTo - insideFrom > bestRun[1] - bestRun[0])) {
    bestRun = [insideFrom, insideTo];
  }

  if (bestRun) {
    return {
      place,
      distanceKm: 0,
      side: 'below',
      passAt: Math.round(bestRun[0] + Math.min(600, (bestRun[1] - bestRun[0]) / 2)),
      visibleFrom: Math.round(visibleFrom),
      visibleTo: Math.round(visibleTo),
      overFrom: Math.round(bestRun[0]),
      overTo: Math.round(bestRun[1])
    };
  }
  if (!Number.isFinite(nearest) || nearest > range) return null;
  return {
    place,
    distanceKm: nearest,
    side: nearestSigned > 0 ? 'right' : 'left',
    passAt: Math.round(nearestAt),
    visibleFrom: Math.round(Math.min(visibleFrom, nearestAt)),
    visibleTo: Math.round(Math.max(visibleTo, nearestAt))
  };
}

function scoreOf(s: Omit<Sighting, 'score'>): number {
  const range = recognitionRangeKm(s.place);
  const proximity = s.distanceKm === 0 ? 1 : Math.max(0.12, 1 - Math.pow(s.distanceKm / range, 1.4));
  const importance = Math.pow(Math.max(1, Math.min(10, s.place.r)), 1.7);
  return importance * proximity * KIND_WEIGHT[s.place.k];
}

/** Every place that can be seen from this route, measured and scored. */
export function sightingsAlong(
  route: RoutePoint[],
  places: DataPlace[],
  areas: Record<string, MultiPolygon>
): Sighting[] {
  if (route.length < 2) return [];
  const grid = gridFor(places);
  const out: Sighting[] = [];

  for (const place of candidatesNearRoute(route, grid)) {
    const m = place.bb && isArea(place.k) ? measureArea(place, route, areas[place.id]) : measurePoint(place, route);
    if (!m) continue;
    if (m.distanceKm > recognitionRangeKm(place)) continue;
    out.push({ ...m, score: scoreOf(m) });
  }

  // Large areas: a cheap bbox test against the route before measuring.
  for (const place of grid.areas) {
    const bb = place.bb!;
    const margin = recognitionRangeKm(place) / 111;
    if (!route.some((pt) => bboxContains(bb, pt.lon, pt.lat, margin))) continue;
    const m = measureArea(place, route, areas[place.id]);
    if (m) out.push({ ...m, score: scoreOf(m) });
  }

  return out;
}

export interface SelectOptions {
  /** Hard cap on places for the whole flight. */
  max?: number;
  /** Places near the endpoints to always keep (origin and destination cities). */
  pinned?: string[];
}

/**
 * Picks a well-spread, varied set.
 *
 * Greedy by score, with two brakes: a quota per quarter-hour of flight, so a
 * long overwater stretch does not leave the rest of the flight starved; and a
 * soft penalty for every place of the same kind already chosen, so a flight over
 * a plain of cities still surfaces the one river and the one lake.
 */
export function selectSightings(all: Sighting[], airborneSeconds: number, opts: SelectOptions = {}): Sighting[] {
  const hours = airborneSeconds / 3600;
  const max = opts.max ?? Math.max(14, Math.min(140, Math.round(10 + hours * 12)));
  const bucketS = 15 * 60;
  const buckets = Math.max(1, Math.ceil(airborneSeconds / bucketS));
  const perBucket = Math.max(2, Math.ceil((max / buckets) * 2.2));

  const chosen: Sighting[] = [];
  const perKind = new Map<string, number>();
  const perSlot = new Map<number, number>();
  const pinned = new Set(opts.pinned ?? []);
  const names: Array<{ n: string; lat: number; lon: number }> = [];

  const isDuplicate = (s: Sighting) =>
    names.some((x) => x.n === s.place.n.toLowerCase() && haversine(x.lat, x.lon, s.place.lat, s.place.lon) < 60);

  const take = (s: Sighting) => {
    chosen.push(s);
    perKind.set(s.place.k, (perKind.get(s.place.k) ?? 0) + 1);
    const slot = Math.floor(s.passAt / bucketS);
    perSlot.set(slot, (perSlot.get(slot) ?? 0) + 1);
    names.push({ n: s.place.n.toLowerCase(), lat: s.place.lat, lon: s.place.lon });
  };

  for (const s of all) if (pinned.has(s.place.id)) take(s);

  // The long tail of the dataset — hamlets, hillocks, ponds — is noise from a
  // window unless it is directly underneath.
  const pool = all.filter((s) => !pinned.has(s.place.id) && (s.place.r >= 3 || (s.distanceKm === 0 && s.place.r >= 2)));
  while (chosen.length < max && pool.length > 0) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i]!;
      const slot = Math.floor(s.passAt / bucketS);
      if ((perSlot.get(slot) ?? 0) >= perBucket) continue;
      const val = s.score / (1 + 0.18 * (perKind.get(s.place.k) ?? 0));
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const [s] = pool.splice(bestIdx, 1);
    if (!s || isDuplicate(s)) continue;
    take(s);
  }

  return chosen.sort((a, b) => a.passAt - b.passAt);
}

const KIND_TO_CATEGORY: Record<DataPlace['k'], POICategory> = {
  city: 'city',
  mountain: 'mountain',
  volcano: 'volcano',
  range: 'range',
  desert: 'desert',
  plateau: 'plateau',
  lake: 'lake',
  river: 'river',
  sea: 'sea',
  island: 'island',
  peninsula: 'peninsula',
  glacier: 'glacier',
  region: 'region',
  landmark: 'landmark'
};

/** A selected place as a card, before any text has been fetched for it. */
export function toPOI(s: Sighting): POI {
  const p = s.place;
  const translations: NonNullable<POI['translations']> = {};
  for (const [lang, name] of Object.entries(p.l ?? {})) {
    if (name) translations[lang as keyof typeof translations] = { name, summary: '', facts: [] };
  }
  return {
    id: p.id,
    name: p.n,
    category: KIND_TO_CATEGORY[p.k],
    lat: p.lat,
    lon: p.lon,
    elevation: p.el,
    population: p.pop,
    wikidata: p.wd,
    rank: p.r,
    country: p.cc,
    extentKm: p.ext,
    summary: '',
    facts: [],
    photos: [],
    closestApproachKm: Math.round(s.distanceKm),
    passAt: s.passAt,
    visibleFrom: s.visibleFrom,
    visibleTo: s.visibleTo,
    overFrom: s.overFrom,
    overTo: s.overTo,
    side: s.side,
    textSource: 'generated',
    translations
  };
}
