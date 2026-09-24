import type { Airport, FlightStatus } from '@skyatlas/shared';
import { getJson, type ProviderError } from './http.js';

/**
 * Flight status by number and date, from AeroDataBox.
 *
 * Preferred over AviationStack because it answers for any date — past, today,
 * or a schedule months ahead — where the free AviationStack plan carries only
 * the last few days, and because it gives local times with their offsets and
 * the airports' time zones, which is exactly what a ticket prints.
 *
 * Sold through two marketplaces with different addresses and keys:
 * - RapidAPI (default): `https://aerodatabox.p.rapidapi.com`, headers
 *   `X-RapidAPI-Key` and `X-RapidAPI-Host`.
 * - API.market: `https://prod.api.market/api/v1/aedbx/aerodatabox`, header
 *   `x-api-market-key`. Selected by `AERODATABOX_HOST=prod.api.market`.
 */

const TIMEOUT_MS = 10_000;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';
const API_MARKET_PREFIX = '/api/v1/aedbx/aerodatabox';

export interface AdbTime {
  utc?: string | null;
  local?: string | null;
}

export interface AdbAirport {
  icao?: string | null;
  iata?: string | null;
  name?: string | null;
  shortName?: string | null;
  municipalityName?: string | null;
  location?: { lat: number; lon: number } | null;
  countryCode?: string | null;
  timeZone?: string | null;
}

export interface AdbMovement {
  airport?: AdbAirport | null;
  scheduledTime?: AdbTime | null;
  /** Latest estimate, or the actual time once it happened. */
  revisedTime?: AdbTime | null;
  predictedTime?: AdbTime | null;
  /** Wheels-up or touchdown. */
  runwayTime?: AdbTime | null;
  /** The v1 field names before `scheduledTime` became an object; still seen on some plans. */
  scheduledTimeLocal?: string | null;
  scheduledTimeUtc?: string | null;
  actualTimeLocal?: string | null;
  actualTimeUtc?: string | null;
}

export interface AdbFlight {
  number?: string;
  status?: string;
  codeshareStatus?: string;
  isCargo?: boolean;
  departure?: AdbMovement | null;
  arrival?: AdbMovement | null;
  aircraft?: { model?: string | null; reg?: string | null } | null;
  airline?: { name?: string | null; iata?: string | null; icao?: string | null } | null;
}

export interface AdbConfig {
  url: (path: string) => string;
  headers: Record<string, string>;
}

/** Where and how to ask, or null when no key is configured. */
export function aeroDataBoxConfig(env: NodeJS.ProcessEnv = process.env): AdbConfig | null {
  const key = env['AERODATABOX_KEY'];
  if (!key) return null;
  const raw = (env['AERODATABOX_HOST'] || RAPIDAPI_HOST).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const slash = raw.indexOf('/');
  const host = slash < 0 ? raw : raw.slice(0, slash);
  const path = slash < 0 ? '' : raw.slice(slash);
  if (host === 'api.market' || host.endsWith('.api.market')) {
    const base = `https://${host}${path || API_MARKET_PREFIX}`;
    return { url: (p) => `${base}${p}`, headers: { 'x-api-market-key': key } };
  }
  return {
    url: (p) => `https://${host}${path}${p}`,
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host }
  };
}

/**
 * A provider time as ISO 8601 with its offset.
 *
 * AeroDataBox writes "2026-05-20 10:00+03:00" — a space and no seconds, which
 * `Date.parse` does not promise to read. A time without an offset is refused:
 * it could be any of 26 hours.
 */
export function isoTime(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const offset = m[4] === 'Z' || m[4]!.includes(':') ? m[4]! : `${m[4]!.slice(0, 3)}:${m[4]!.slice(3)}`;
  return `${m[1]}T${m[2]}${m[3] ?? ':00'}${offset}`;
}

/** Local time when given (it carries the offset a ticket shows), else UTC. */
function timeOf(t: AdbTime | null | undefined, legacyLocal?: string | null, legacyUtc?: string | null): string | undefined {
  return isoTime(t?.local) ?? isoTime(t?.utc) ?? isoTime(legacyLocal) ?? isoTime(legacyUtc);
}

const STATUS: Record<string, FlightStatus> = {
  Expected: 'scheduled',
  CheckIn: 'scheduled',
  Boarding: 'boarding',
  GateClosed: 'boarding',
  Departed: 'departed',
  EnRoute: 'departed',
  Approaching: 'departed',
  Arrived: 'landed',
  Delayed: 'delayed',
  Canceled: 'cancelled',
  Diverted: 'diverted'
};

/** "CanceledUncertain" stays unknown: telling a passenger their flight is cancelled on a guess is worse than silence. */
export function statusFromAdb(status: string | undefined): FlightStatus {
  return (status && STATUS[status]) || 'unknown';
}

export function airportFromAdb(a: AdbAirport | null | undefined): Airport | null {
  if (!a?.iata || !a.location || !a.timeZone) return null;
  return {
    iata: a.iata,
    icao: a.icao ?? '',
    name: a.name ?? a.iata,
    city: a.municipalityName ?? a.shortName ?? a.name ?? a.iata,
    country: a.countryCode ?? '',
    lat: a.location.lat,
    lon: a.location.lon,
    tz: a.timeZone
  };
}

function scheduledDeparture(f: AdbFlight): string | undefined {
  const d = f.departure;
  return timeOf(d?.scheduledTime, d?.scheduledTimeLocal, d?.scheduledTimeUtc);
}

/**
 * The one flight a passenger means by this number on this date.
 *
 * Cargo flights are dropped. Codeshares are the same aircraft sold under
 * another airline's number: the operator's own entry wins, and a codeshare
 * entry is used only when it is all there is (the ticket may carry that
 * number). A number that flies two legs in a day answers with the first.
 */
export function pickFlight(rows: AdbFlight[], date: string): AdbFlight | null {
  const usable = rows.filter(
    (f) => !f.isCargo && f.departure?.airport?.iata && f.arrival?.airport?.iata && scheduledDeparture(f)
  );
  const own = usable.filter((f) => f.codeshareStatus !== 'IsCodeshared');
  const pool = own.length ? own : usable;
  const onDate = pool.filter((f) => scheduledDeparture(f)!.slice(0, 10) === date);
  const candidates = onDate.length ? onDate : pool;
  const at = (f: AdbFlight) => Date.parse(scheduledDeparture(f)!);
  return [...candidates].sort((a, b) => at(a) - at(b))[0] ?? null;
}

export interface AdbNormalised {
  originIata: string;
  destinationIata: string;
  /** The provider's own airport records, for airports missing from our table. */
  origin: Airport | null;
  destination: Airport | null;
  airline: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  revisedDeparture?: string;
  revisedArrival?: string;
  actualDeparture?: string;
  aircraftType?: string;
  status: FlightStatus;
}

export function normaliseAdbFlight(f: AdbFlight): AdbNormalised | null {
  const dep = f.departure;
  const arr = f.arrival;
  const scheduledDep = scheduledDeparture(f);
  // Some schedules carry no arrival time at all; the latest estimate will do.
  const scheduledArr =
    timeOf(arr?.scheduledTime, arr?.scheduledTimeLocal, arr?.scheduledTimeUtc) ??
    timeOf(arr?.revisedTime) ??
    timeOf(arr?.predictedTime);
  if (!dep?.airport?.iata || !arr?.airport?.iata || !scheduledDep || !scheduledArr) return null;
  return {
    originIata: dep.airport.iata,
    destinationIata: arr.airport.iata,
    origin: airportFromAdb(dep.airport),
    destination: airportFromAdb(arr.airport),
    airline: f.airline?.name ?? '',
    scheduledDeparture: scheduledDep,
    scheduledArrival: scheduledArr,
    revisedDeparture: timeOf(dep.revisedTime, dep.actualTimeLocal, dep.actualTimeUtc),
    revisedArrival: timeOf(arr.revisedTime, arr.actualTimeLocal, arr.actualTimeUtc) ?? timeOf(arr.predictedTime),
    actualDeparture: timeOf(dep.runwayTime),
    aircraftType: f.aircraft?.model ?? undefined,
    status: statusFromAdb(f.status)
  };
}

export interface AdbLookup {
  flight: AdbNormalised | null;
  /** Set when the provider failed, rather than simply having no such flight. */
  error?: ProviderError;
}

export async function lookupAeroDataBox(
  flightNumber: string,
  date: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<AdbLookup> {
  const config = aeroDataBoxConfig(env);
  if (!config) return { flight: null, error: 'not_configured' };
  const url = config.url(
    `/flights/number/${encodeURIComponent(flightNumber)}/${encodeURIComponent(date)}` +
      '?withAircraftImage=false&withLocation=false&dateLocalRole=Departure'
  );
  const r = await getJson<AdbFlight[]>('AeroDataBox', url, { headers: config.headers, timeoutMs: TIMEOUT_MS });
  // No such flight is 204 (or 404), not an error.
  if (!r.ok) return r.error === 'not_found' ? { flight: null } : { flight: null, error: r.error };
  const rows = Array.isArray(r.body) ? r.body : [];
  const picked = pickFlight(rows, date);
  return { flight: picked ? normaliseAdbFlight(picked) : null };
}
