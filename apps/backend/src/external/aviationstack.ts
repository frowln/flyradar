import { outboundFetch } from './outbound.js';

/** Long enough for the proxied route in development, short enough to fail a lookup visibly. */
const TIMEOUT_MS = 10_000;

export interface AviationStackFlight {
  flight_date?: string;
  flight_status?: string;
  airline: { name: string; iata: string };
  flight: { iata: string };
  departure: { iata: string; scheduled: string; actual?: string };
  arrival: { iata: string; scheduled: string };
  aircraft?: { iata?: string };
}

export interface LookupResult {
  flight: AviationStackFlight | null;
  /** Dates the API did return, so the caller can say what is available. */
  availableDates: string[];
  /** Set when the API refused rather than simply having no match. */
  error?: string;
}

/**
 * One flight, on one date.
 *
 * `flight_date` is deliberately **not** sent to the API: it is a paid-plan
 * parameter, and asking for it on the free plan returns
 * `function_access_restricted` for every request, which the old code turned into
 * an indistinguishable "flight not found". The free plan does return the last
 * few days for a flight number and stamps each with its own `flight_date`, so
 * the filtering happens here instead. The cost is reach, not correctness: a
 * flight three weeks out is not in the response at all, and the caller is told
 * which dates were.
 */
export async function lookupFlightDetailed(
  flightNumber: string,
  date: string
): Promise<LookupResult> {
  const key = process.env['AVIATIONSTACK_KEY'];
  if (!key) {
    console.warn('AVIATIONSTACK_KEY not set');
    return { flight: null, availableDates: [], error: 'not_configured' };
  }
  try {
    // https, not http: the request carries the API key, and it may travel
    // through a proxy that has no business reading it.
    const url =
      `https://api.aviationstack.com/v1/flights` +
      `?access_key=${key}&flight_iata=${encodeURIComponent(flightNumber)}&limit=20`;
    const r = await outboundFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const j = (await r.json().catch(() => null)) as any;

    // AviationStack answers plan and key problems with HTTP 200 as often as with
    // an error code, always in this envelope. Swallowing it is how a blocked key
    // and an unknown flight became the same 404 for weeks.
    const apiError = j?.error?.code as string | undefined;
    if (apiError) {
      console.warn(`AviationStack refused: ${apiError} — ${j.error.message ?? ''}`);
      return { flight: null, availableDates: [], error: apiError };
    }
    if (!r.ok) {
      console.warn(`AviationStack HTTP ${r.status}`);
      return { flight: null, availableDates: [], error: `http_${r.status}` };
    }

    const rows = (j?.data ?? []) as AviationStackFlight[];
    const availableDates = [...new Set(rows.map((f) => f.flight_date).filter(Boolean))] as string[];
    const match = rows.find((f) => f.flight_date === date) ?? null;
    return { flight: match, availableDates };
  } catch (e) {
    console.warn('AviationStack unreachable:', e instanceof Error ? e.message : e);
    return { flight: null, availableDates: [], error: 'unreachable' };
  }
}

/** Back-compatible shape for callers that only need the flight. */
export async function lookupFlight(
  flightNumber: string,
  date: string
): Promise<AviationStackFlight | null> {
  return (await lookupFlightDetailed(flightNumber, date)).flight;
}
