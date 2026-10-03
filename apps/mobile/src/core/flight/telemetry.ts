import type { RoutePoint } from '@skyatlas/shared';
import { haversine, interpolateAlongRoute } from '../geo/greatCircle';
import { getAirports } from '../data/datasets';

/**
 * The numbers a passenger reads off the seat-back screen: ground speed,
 * course, the temperature outside, and the time on the ground below.
 *
 * All of them come from the route and the clock (or a GPS fix), so they work
 * in flight mode. They are estimates and are labelled as such on screen.
 */

/** Ground speed along the route, in km/h, over the minute around `elapsedS`. */
export function groundSpeedKmh(route: RoutePoint[], elapsedS: number): number {
  const end = route[route.length - 1]?.elapsedSeconds ?? 0;
  if (end <= 0) return 0;
  const t0 = Math.max(0, elapsedS - 30);
  const t1 = Math.min(end, elapsedS + 30);
  if (t1 - t0 < 1) return 0;
  const a = interpolateAlongRoute(route, t0);
  const b = interpolateAlongRoute(route, t1);
  return (haversine(a.lat, a.lon, b.lat, b.lon) / (t1 - t0)) * 3600;
}

/**
 * Air temperature outside, from the International Standard Atmosphere:
 * 15 °C at sea level, 6.5 °C colder per kilometre, −56.5 °C from 11 km up.
 * The real figure differs by a few degrees with weather and latitude.
 */
export function outsideTempC(altitudeM: number): number {
  const km = Math.max(0, altitudeM) / 1000;
  return km >= 11 ? -56.5 : 15 - 6.5 * km;
}

/** The eight compass points, for "course SE 142°". */
export const COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type CompassPoint = (typeof COMPASS)[number];

export function compassPoint(heading: number): CompassPoint {
  const h = ((heading % 360) + 360) % 360;
  return COMPASS[Math.round(h / 45) % 8]!;
}

/**
 * The time zone of the ground below: that of the nearest airport. Airports
 * sit where people live, so over land this is the zone a clock down there
 * shows; over open ocean it is the nearest coast's, which is what passengers
 * expect to read.
 */
let grid: Map<string, Array<{ lat: number; lon: number; tz: string }>> | null = null;

function airportGrid() {
  if (grid) return grid;
  grid = new Map();
  for (const a of getAirports()) {
    if (!a.tz) continue;
    const key = `${Math.floor(a.lat / 5)}:${Math.floor(a.lon / 5)}`;
    const list = grid.get(key);
    const item = { lat: a.lat, lon: a.lon, tz: a.tz };
    if (list) list.push(item);
    else grid.set(key, [item]);
  }
  return grid;
}

export function zoneBelow(lat: number, lon: number): string | null {
  let g: ReturnType<typeof airportGrid>;
  try {
    g = airportGrid();
  } catch {
    return null;
  }
  const cy = Math.floor(lat / 5);
  const cx = Math.floor(lon / 5);
  // Widen the search ring until something is found (open ocean needs a few).
  for (let r = 0; r <= 8; r++) {
    let best: { d: number; tz: string } | null = null;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
        const x = ((((cx + dx + 36) % 72) + 72) % 72) - 36;
        for (const a of g.get(`${cy + dy}:${x}`) ?? []) {
          const d = haversine(lat, lon, a.lat, a.lon);
          if (!best || d < best.d) best = { d, tz: a.tz };
        }
      }
    }
    if (best) return best.tz;
  }
  return null;
}

/** Minutes ahead of UTC in a zone at a moment (DST included). */
export function utcOffsetMinutes(tz: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
  } catch {
    return 0;
  }
}

/** "15:40" in a zone. */
export function clockIn(tz: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  } catch {
    return '';
  }
}

/** Destination point from a start, a bearing and a distance (great circle). */
export function destination(lat: number, lon: number, bearingDeg: number, distKm: number): [number, number] {
  const R = 6371;
  const d = distKm / R;
  const b = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(((l2 * 180) / Math.PI + 540) % 360) - 180, (p2 * 180) / Math.PI];
}

/**
 * What one window can see: a sector abeam, from 30° behind the wing to 30°
 * ahead of it on that side, out to `rangeKm`. Longitudes are kept continuous
 * with the aircraft's, so a sector across the date line is not drawn the long
 * way round.
 */
export function viewSector(lat: number, lon: number, heading: number, side: 'left' | 'right', rangeKm: number): [number, number][] {
  const centre = side === 'left' ? heading - 90 : heading + 90;
  const ring: [number, number][] = [[lon, lat]];
  for (let a = -60; a <= 60; a += 6) {
    const [x, y] = destination(lat, lon, centre + a, rangeKm);
    let fx = x;
    while (fx - lon > 180) fx -= 360;
    while (fx - lon < -180) fx += 360;
    ring.push([fx, y]);
  }
  ring.push([lon, lat]);
  return ring;
}

/**
 * How far a passenger at this altitude can usefully see: the geometric
 * horizon (√(2Rh): ~357 km from 10 km) is haze in practice; a city or a range
 * is recognisable to roughly half of it.
 */
export function usefulRangeKm(altitudeM: number): number {
  const horizon = Math.sqrt(2 * 6371 * Math.max(0.3, altitudeM / 1000));
  return Math.round(Math.min(220, horizon * 0.55));
}
