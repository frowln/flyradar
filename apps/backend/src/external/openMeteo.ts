import { getJson, type ProviderError } from './http.js';

/**
 * Hourly cloud cover from the Open-Meteo forecast API.
 *
 * Without `OPEN_METEO_KEY` the free host is used — which Open-Meteo licenses
 * for non-commercial use only. A paid key switches to the commercial host
 * (`customer-api.open-meteo.com`, key in the `apikey` parameter). One request
 * carries every location: the API takes comma-separated coordinate lists and
 * answers with one series per location.
 */

const TIMEOUT_MS = 8_000;
const FREE_HOST = 'api.open-meteo.com';
const COMMERCIAL_HOST = 'customer-api.open-meteo.com';
const HOURLY = 'cloud_cover,cloud_cover_low,cloud_cover_mid';

export interface CloudSeries {
  /** Unix seconds, one per hour. */
  time: number[];
  cloud: Array<number | null>;
  low: Array<number | null>;
  mid: Array<number | null>;
}

interface RawLocation {
  hourly?: {
    time?: number[];
    cloud_cover?: Array<number | null>;
    cloud_cover_low?: Array<number | null>;
    cloud_cover_mid?: Array<number | null>;
  };
}

export function openMeteoUrl(
  cells: Array<{ lat: number; lon: number }>,
  startDate: string,
  endDate: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const key = env['OPEN_METEO_KEY'];
  const params = new URLSearchParams({
    latitude: cells.map((c) => c.lat).join(','),
    longitude: cells.map((c) => c.lon).join(','),
    hourly: HOURLY,
    timeformat: 'unixtime',
    timezone: 'GMT',
    start_date: startDate,
    end_date: endDate
  });
  if (key) params.set('apikey', key);
  return `https://${key ? COMMERCIAL_HOST : FREE_HOST}/v1/forecast?${params}`;
}

/** One series per requested location, in request order. */
export function seriesFrom(body: unknown, count: number): CloudSeries[] | null {
  const locations = (Array.isArray(body) ? body : [body]) as RawLocation[];
  if (locations.length !== count) return null;
  const series: CloudSeries[] = [];
  for (const l of locations) {
    const h = l?.hourly;
    if (!h || !Array.isArray(h.time)) return null;
    series.push({ time: h.time, cloud: h.cloud_cover ?? [], low: h.cloud_cover_low ?? [], mid: h.cloud_cover_mid ?? [] });
  }
  return series;
}

export type CloudFetch = { ok: true; series: CloudSeries[] } | { ok: false; error: ProviderError };

export async function fetchCloudSeries(
  cells: Array<{ lat: number; lon: number }>,
  startDate: string,
  endDate: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CloudFetch> {
  const r = await getJson<unknown>('Open-Meteo', openMeteoUrl(cells, startDate, endDate, env), { timeoutMs: TIMEOUT_MS });
  if (!r.ok) return { ok: false, error: r.error };
  const series = seriesFrom(r.body, cells.length);
  if (!series) {
    console.warn('[Open-Meteo] unexpected response shape');
    return { ok: false, error: 'bad_response' };
  }
  return { ok: true, series };
}
