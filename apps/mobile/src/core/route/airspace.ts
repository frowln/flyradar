import type { DataCountry } from '../data/types';
import { haversine, gcInterpolate } from '../geo/greatCircle';

/**
 * Flying around closed airspace.
 *
 * A great circle is the right answer until it crosses a war zone or a country
 * the airline is banned from — and on some of the busiest routes a passenger
 * takes it does: Moscow to Antalya runs straight over Ukraine, Helsinki to Tokyo
 * straight over Russia. An app that says "below you: Kharkiv" on a flight that
 * went nowhere near it is wrong in the one way this product cannot afford.
 *
 * The closed countries are rasterised onto a half-degree grid, the shortest
 * path around them is found with A*, and the path is pulled tight into a few
 * waypoints joined by great circles — which is roughly how a dispatcher's
 * routing looks on a map.
 */

const RES = 0.5;
const ROWS = Math.round(180 / RES);
const COLS = Math.round(360 / RES);

/** Closed to every civil flight. */
const WAR_ZONES = ['UA', 'XR'];

const EU_AND_ALLIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'NO', 'IS', 'CH', 'LI', 'AL', 'ME', 'MK', 'MD', 'US', 'CA'
];

/** Airlines of Russia and Belarus, by IATA code. */
const RU_BY_CARRIERS = new Set([
  'SU', 'S7', 'U6', 'DP', 'FV', 'UT', 'N4', '5N', 'WZ', 'A4', 'Y7', '7R', 'R3', 'I8', 'ZF', 'EO', 'GH', '6R', 'YC',
  'IO', 'KV', 'J2X', 'B2', 'HZ', '2S', 'YK', 'D2', 'UN', 'ZR'
]);

/**
 * Airlines that still cross Russia freely: Chinese, Middle Eastern, Central and
 * South Asian, Turkish, and others not party to the airspace bans.
 */
const NEUTRAL_CARRIERS = new Set([
  'CA', 'MU', 'CZ', 'HU', '3U', 'MF', 'ZH', 'HO', 'SC', 'FM', 'GS', 'JD', '9C', 'KN', 'EK', 'QR', 'EY', 'TK', 'PC',
  'FZ', 'G9', 'J2', 'HY', 'KC', 'AI', '6E', 'SG', 'UK', 'WY', 'GF', 'SV', 'XY', 'RJ', 'MS', 'ET', 'IR', 'W5', 'OM',
  'KR', 'DV', 'ZM', 'T5', 'HH', '7J', 'VN', 'VJ', 'TG', 'MH', 'SQ', 'GA', 'PR', 'NX', 'BR', 'CI'
]);

/** Which countries a flight must stay out of, by who flies it and where. */
export function closedCountries(opts: { carrier?: string; fromCC: string; toCC: string }): string[] {
  const carrier = opts.carrier?.toUpperCase().slice(0, 2);
  const touchesRussia = ['RU', 'BY'].includes(opts.fromCC) || ['RU', 'BY'].includes(opts.toCC);
  if (carrier && RU_BY_CARRIERS.has(carrier)) return [...WAR_ZONES, ...EU_AND_ALLIES];
  if (carrier && NEUTRAL_CARRIERS.has(carrier)) return WAR_ZONES;
  // No carrier known: a flight to or from Russia is flown by an airline allowed
  // over it; anything else is most likely flown by one that is not.
  if (touchesRussia) return WAR_ZONES;
  return [...WAR_ZONES, 'RU', 'BY'];
}

type Grid = Uint8Array;
const gridCache = new Map<string, Grid>();

const rowOf = (lat: number) => Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / RES)));
const colOf = (lon: number) => ((Math.floor((lon + 180) / RES) % COLS) + COLS) % COLS;
const latOf = (r: number) => -90 + (r + 0.5) * RES;
const lonOf = (c: number) => -180 + (c + 0.5) * RES;

/** Scanline fill of each polygon's cells (even-odd across its rings). */
function rasterise(grid: Grid, country: DataCountry, mark: number) {
  for (const poly of country.g) {
    let minLat = 90;
    let maxLat = -90;
    for (const ring of poly) for (const [, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    for (let r = rowOf(minLat); r <= rowOf(maxLat); r++) {
      const y = latOf(r);
      const xs: number[] = [];
      for (const ring of poly) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]!;
          const [xj, yj] = ring[j]!;
          if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.ceil((xs[k]! + 180) / RES - 0.5);
        const c1 = Math.floor((xs[k + 1]! + 180) / RES - 0.5);
        for (let c = c0; c <= c1; c++) grid[r * COLS + (((c % COLS) + COLS) % COLS)] = mark;
      }
    }
  }
}

/** Blocked cells for a set of closed countries; war zones get a buffer. */
function gridFor(codes: string[], countries: DataCountry[]): Grid {
  const key = [...codes].sort().join(',');
  const cached = gridCache.get(key);
  if (cached) return cached;
  const grid = new Uint8Array(ROWS * COLS);
  const byCode = new Map(countries.map((c) => [c.cc, c]));
  for (const cc of codes) {
    const c = byCode.get(cc);
    if (c) rasterise(grid, c, WAR_ZONES.includes(cc) ? 2 : 1);
  }
  // Every closed country gets a margin: routes keep clear of a border rather
  // than skimming it, and a half-degree grid would otherwise let a path clip a
  // coastline the cell centre happened to miss. War zones get a wider one —
  // the airspace near the front is closed on both sides of the border.
  const buffered = grid.slice();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r * COLS + c]!;
      if (!v) continue;
      const buf = v === 2 ? 3 : 1;
      for (let dr = -buf; dr <= buf; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= ROWS) continue;
        for (let dc = -buf; dc <= buf; dc++) {
          const cc = (((c + dc) % COLS) + COLS) % COLS;
          if (!buffered[rr * COLS + cc]) buffered[rr * COLS + cc] = 1;
        }
      }
    }
  }
  gridCache.set(key, buffered);
  return buffered;
}

type LL = { lat: number; lon: number };

function blockedAt(grid: Grid, p: LL, free: Set<number>): boolean {
  const idx = rowOf(p.lat) * COLS + colOf(p.lon);
  return grid[idx]! > 0 && !free.has(idx);
}

function segmentClear(grid: Grid, a: LL, b: LL, free: Set<number>): boolean {
  const d = haversine(a.lat, a.lon, b.lat, b.lon);
  const steps = Math.max(2, Math.ceil(d / 20));
  for (let i = 0; i <= steps; i++) {
    if (blockedAt(grid, gcInterpolate(a.lat, a.lon, b.lat, b.lon, i / steps), free)) return false;
  }
  return true;
}

/** Minimal binary heap keyed by priority. */
class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  push(item: number, p: number) {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

export interface Detour {
  /** Intermediate waypoints (not including the endpoints). Empty when the great circle is clear. */
  via: LL[];
  /** Length of the planned path over the great-circle distance. */
  ratio: number;
  /** True when a path could not be found and the great circle was kept. */
  approximate: boolean;
}

/**
 * Waypoints that keep a flight out of the given countries.
 *
 * The airports themselves, and a small area around them, are always allowed —
 * a flight has to be able to leave and arrive even from a city near a closed
 * border.
 */
export function planAround(from: LL, to: LL, closed: string[], countries: DataCountry[]): Detour {
  const direct = haversine(from.lat, from.lon, to.lat, to.lon);
  if (closed.length === 0 || direct < 50) return { via: [], ratio: 1, approximate: false };
  const grid = gridFor(closed, countries);

  const free = new Set<number>();
  for (const p of [from, to]) {
    const r0 = rowOf(p.lat);
    const c0 = colOf(p.lon);
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = r0 + dr;
        if (r < 0 || r >= ROWS) continue;
        free.add(r * COLS + (((c0 + dc) % COLS) + COLS) % COLS);
      }
    }
  }

  if (segmentClear(grid, from, to, free)) return { via: [], ratio: 1, approximate: false };

  const start = rowOf(from.lat) * COLS + colOf(from.lon);
  const goal = rowOf(to.lat) * COLS + colOf(to.lon);
  const g = new Float64Array(ROWS * COLS).fill(Infinity);
  const came = new Int32Array(ROWS * COLS).fill(-1);
  const closedSet = new Uint8Array(ROWS * COLS);
  const heap = new Heap();
  g[start] = 0;
  heap.push(start, haversine(from.lat, from.lon, to.lat, to.lon));

  let found = false;
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop()!;
    if (cur === goal) {
      found = true;
      break;
    }
    if (closedSet[cur]) continue;
    closedSet[cur] = 1;
    if (++expanded > 400_000) break;
    const r = Math.floor(cur / COLS);
    const c = cur % COLS;
    const lat = latOf(r);
    const lon = lonOf(c);
    for (let dr = -1; dr <= 1; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= ROWS) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const cc = (((c + dc) % COLS) + COLS) % COLS;
        const n = rr * COLS + cc;
        if (closedSet[n] || (grid[n]! > 0 && !free.has(n))) continue;
        const nlat = latOf(rr);
        const nlon = lonOf(cc);
        const tentative = g[cur]! + haversine(lat, lon, nlat, nlon);
        if (tentative < g[n]!) {
          g[n] = tentative;
          came[n] = cur;
          heap.push(n, tentative + haversine(nlat, nlon, to.lat, to.lon));
        }
      }
    }
  }
  if (!found) return { via: [], ratio: 1, approximate: true };

  const cells: LL[] = [];
  for (let n = goal; n !== -1; n = came[n]!) cells.push({ lat: latOf(Math.floor(n / COLS)), lon: lonOf(n % COLS) });
  cells.reverse();
  cells[0] = from;
  cells[cells.length - 1] = to;

  // Pull the staircase tight: from each anchor, jump to the farthest cell
  // still reachable by a clear great circle.
  const via: LL[] = [];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !segmentClear(grid, cells[i]!, cells[j]!, free)) j--;
    if (j < cells.length - 1) via.push(cells[j]!);
    i = j;
  }

  const pts = [from, ...via, to];
  let length = 0;
  for (let k = 1; k < pts.length; k++) length += haversine(pts[k - 1]!.lat, pts[k - 1]!.lon, pts[k]!.lat, pts[k]!.lon);
  const ratio = length / direct;
  // A detour this long means the flight almost certainly does not exist as
  // modelled (or takes a stop); keep the great circle and say it is approximate.
  if (ratio > 2.2) return { via: [], ratio: 1, approximate: true };
  return { via, ratio, approximate: false };
}
