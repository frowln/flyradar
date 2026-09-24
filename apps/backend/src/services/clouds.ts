import { peekCached, storeCached } from '../cache/remember.js';
import { fetchCloudSeries, type CloudSeries } from '../external/openMeteo.js';
import type { ProviderError } from '../external/http.js';

/**
 * Cloud cover at points along a route, each at the hour the aircraft is there.
 *
 * Answers are kept per quarter-degree cell and hour for an hour: two flights
 * over the same sky at the same time, or the same flight asked about twice,
 * cost one forecast between them. A quarter degree (~25 km) is finer than the
 * cloud fields of the global models behind the forecast.
 */

export interface CloudQuery {
  lat: number;
  lon: number;
  /** ISO time the aircraft is expected there. */
  at: string;
}

export interface CloudAnswer {
  at: string;
  /** Percent, 0–100; null where the forecast does not reach. */
  cloud: number | null;
  low: number | null;
  mid: number | null;
}

type Cover = Omit<CloudAnswer, 'at'>;

const GRID_DEG = 0.25;
const TTL_S = 3600;
const HOUR_MS = 3_600_000;
/** The forecast runs 16 days ahead, counting today; the recent past is still served. */
const AHEAD_DAYS = 15;
const BEHIND_DAYS = 2;
const NOTHING: Cover = { cloud: null, low: null, mid: null };

function snap(v: number): number {
  return Math.round(v / GRID_DEG) * GRID_DEG;
}

export function cellOf(lat: number, lon: number): { lat: number; lon: number } {
  const wrapped = ((((snap(lon) + 180) % 360) + 360) % 360) - 180;
  return { lat: Math.max(-90, Math.min(90, snap(lat))), lon: wrapped };
}

const cellKey = (c: { lat: number; lon: number }) => `${c.lat.toFixed(2)}:${c.lon.toFixed(2)}`;
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function percent(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
}

/** The hour of a series nearest to `hourMs`, or nothing when the series does not cover it. */
export function coverAt(s: CloudSeries, hourMs: number): Cover {
  if (!s.time.length) return NOTHING;
  const target = hourMs / 1000;
  const i = Math.round((target - s.time[0]!) / 3600);
  const idx = Math.max(0, Math.min(s.time.length - 1, i));
  if (Math.abs(s.time[idx]! - target) > 5400) return NOTHING;
  return { cloud: percent(s.cloud[idx]), low: percent(s.low[idx]), mid: percent(s.mid[idx]) };
}

export async function cloudsAlong(
  points: CloudQuery[],
  now: Date = new Date()
): Promise<{ points: CloudAnswer[] } | { error: ProviderError }> {
  const earliest = now.getTime() - BEHIND_DAYS * 86_400_000;
  const latest = Date.parse(`${utcDate(now.getTime())}T23:59:59Z`) + AHEAD_DAYS * 86_400_000;

  const asks = points.map((p) => {
    const t = Date.parse(p.at);
    const inRange = Number.isFinite(t) && t >= earliest && t <= latest;
    const cell = cellOf(p.lat, p.lon);
    const hourMs = Math.round(t / HOUR_MS) * HOUR_MS;
    return { at: p.at, inRange, cell, hourMs, key: `clouds:${cellKey(cell)}:${hourMs / HOUR_MS}` };
  });

  const known = new Map<string, Cover>();
  const keys = [...new Set(asks.filter((a) => a.inRange).map((a) => a.key))];
  const peeked = await Promise.all(keys.map((k) => peekCached<Cover>(k)));
  keys.forEach((k, i) => peeked[i] && known.set(k, peeked[i]!));

  const missing = asks.filter((a) => a.inRange && !known.has(a.key));
  if (missing.length) {
    const cells = [...new Map(missing.map((a) => [cellKey(a.cell), a.cell])).values()];
    const hours = missing.map((a) => a.hourMs);
    const fetched = await fetchCloudSeries(cells, utcDate(Math.min(...hours)), utcDate(Math.max(...hours)));
    if (!fetched.ok) return { error: fetched.error };
    const byCell = new Map(cells.map((c, i) => [cellKey(c), fetched.series[i]!]));
    const fresh = new Map<string, Cover>();
    for (const a of missing) {
      if (!fresh.has(a.key)) fresh.set(a.key, coverAt(byCell.get(cellKey(a.cell))!, a.hourMs));
    }
    // In parallel: with Redis unreachable each write waits out its timeout.
    await Promise.all([...fresh].map(([k, cover]) => (known.set(k, cover), storeCached(k, cover, TTL_S))));
  }

  return { points: asks.map((a) => ({ at: a.at, ...(a.inRange ? (known.get(a.key) ?? NOTHING) : NOTHING) })) };
}
