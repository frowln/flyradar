import type { FlightTrack } from '@skyatlas/shared';
import { getJson, type ProviderError } from './http.js';
import { simplifyTrack, type TrackPoint } from '../services/simplifyTrack.js';

/**
 * The path a flight number actually flew recently, from the official
 * Flightradar24 API (fr24api.flightradar24.com).
 *
 * Most flight numbers fly the same way day after day — around the same closed
 * airspace, along the same oceanic tracks. Last Tuesday's track is therefore a
 * far better guess at tomorrow's path than any great circle.
 *
 * Two calls: the flight summary for the number over the past week (to find the
 * most recent completed flight), then that flight's track. Both are billed in
 * credits, which is why the caller caches the result for a day.
 *
 * Field names follow the API's v1 schema as published in Flightradar24's own
 * client (github.com/Flightradar24/fr24api-mcp, src/types.ts). Everything that
 * reads them is in `latestCompleted`, `trackPoints` and `toFlightTrack`.
 */

const BASE = 'https://fr24api.flightradar24.com/api';
const TIMEOUT_MS = 12_000;
const LOOKBACK_DAYS = 7;
const FT_TO_M = 0.3048;
const MAX_POINTS = 150;
/** Fewer points than this is a fragment (coverage gap, early loss of signal), not a route. */
const MIN_POINTS = 10;

export interface Fr24Summary {
  fr24_id: string;
  flight?: string | null;
  orig_icao?: string | null;
  orig_iata?: string | null;
  dest_icao?: string | null;
  dest_iata?: string | null;
  dest_icao_actual?: string | null;
  dest_iata_actual?: string | null;
  datetime_takeoff?: string | null;
  datetime_landed?: string | null;
  flight_ended?: boolean | null;
}

export interface Fr24TrackPoint {
  timestamp: string;
  lat: number;
  lon: number;
  /** Feet. */
  alt: number;
}

export interface Fr24Tracks {
  fr24_id: string;
  tracks: Fr24TrackPoint[];
}

/** "2026-09-24T10:00:00Z" — the format the API documents, without milliseconds. */
export function fr24Time(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function diverted(r: Fr24Summary): boolean {
  return !!r.dest_icao && !!r.dest_icao_actual && r.dest_icao_actual !== r.dest_icao;
}

/** Completed flights that landed where they were going, newest first. */
export function latestCompleted(rows: Fr24Summary[]): Fr24Summary[] {
  return rows
    .filter((r) => r.fr24_id && r.datetime_takeoff && r.datetime_landed && r.flight_ended !== false && !diverted(r))
    .sort((a, b) => Date.parse(b.datetime_takeoff!) - Date.parse(a.datetime_takeoff!));
}

/**
 * The airborne part of a recorded track as `[lon, lat, altitude m, seconds
 * after takeoff]`, in time order. Taxiing is cut at the summary's takeoff and
 * landing times; without them, at the first and last point off the ground.
 */
export function trackPoints(raw: Fr24TrackPoint[], takeoff?: string | null, landed?: string | null): TrackPoint[] {
  const timed = raw
    .map((p) => ({ ...p, t: Date.parse(p.timestamp) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90)
    .sort((a, b) => a.t - b.t);
  const up = Date.parse(takeoff ?? '');
  const down = Date.parse(landed ?? '');
  const airborne = timed.filter((p) =>
    Number.isFinite(up) && Number.isFinite(down) ? p.t >= up && p.t <= down : p.alt > 0
  );
  if (!airborne.length) return [];
  const t0 = Number.isFinite(up) ? up : airborne[0]!.t;
  const out: TrackPoint[] = [];
  for (const p of airborne) {
    const t = Math.max(0, Math.round((p.t - t0) / 1000));
    // Two fixes in one second add nothing but a zero-length step.
    if (out.length && out[out.length - 1]![3] === t) continue;
    out.push([round(p.lon, 4), round(p.lat, 4), Math.max(0, Math.round((p.alt || 0) * FT_TO_M)), t]);
  }
  return out;
}

export function toFlightTrack(summary: Fr24Summary, raw: Fr24TrackPoint[]): FlightTrack | null {
  const points = trackPoints(raw, summary.datetime_takeoff, summary.datetime_landed);
  if (points.length < MIN_POINTS) return null;
  return {
    points: simplifyTrack(points, MAX_POINTS),
    flownOn: new Date(Date.parse(summary.datetime_takeoff!)).toISOString().slice(0, 10),
    from: summary.orig_iata ?? summary.orig_icao ?? '',
    to: summary.dest_iata ?? summary.dest_icao ?? ''
  };
}

/** The list a response carries, whether bare or wrapped in `data`. */
function rowsOf<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const data = (body as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return data as T[];
  return body && typeof body === 'object' ? [body as T] : [];
}

export interface TrackLookup {
  track: FlightTrack | null;
  error?: ProviderError;
}

export async function fetchRecentTrack(
  flightNumber: string,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date()
): Promise<TrackLookup> {
  const key = env['FR24_API_KEY'];
  if (!key) return { track: null, error: 'not_configured' };
  const headers = { Authorization: `Bearer ${key}`, 'Accept-Version': 'v1' };

  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const summary = await getJson<unknown>(
    'FR24',
    `${BASE}/flight-summary/full?flights=${encodeURIComponent(flightNumber)}` +
      `&flight_datetime_from=${fr24Time(from)}&flight_datetime_to=${fr24Time(now)}&sort=desc&limit=10`,
    { headers, timeoutMs: TIMEOUT_MS }
  );
  if (!summary.ok) return summary.error === 'not_found' ? { track: null } : { track: null, error: summary.error };

  // The newest flight, and one more in case its track is a fragment.
  for (const flight of latestCompleted(rowsOf<Fr24Summary>(summary.body)).slice(0, 2)) {
    const r = await getJson<unknown>('FR24', `${BASE}/flight-tracks?flight_id=${encodeURIComponent(flight.fr24_id)}`, {
      headers,
      timeoutMs: TIMEOUT_MS
    });
    if (!r.ok) {
      if (r.error === 'not_found') continue;
      return { track: null, error: r.error };
    }
    const tracks = rowsOf<Fr24Tracks>(r.body).find((t) => Array.isArray(t?.tracks));
    const track = tracks ? toFlightTrack(flight, tracks.tracks) : null;
    if (track) return { track };
  }
  return { track: null };
}

function round(n: number, dp: number): number {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
}
