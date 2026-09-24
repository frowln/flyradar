import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  aeroDataBoxConfig,
  isoTime,
  lookupAeroDataBox,
  pickFlight,
  type AdbFlight
} from '../src/external/aerodatabox.js';
import { resetProviderPauses, retryAfterSeconds } from '../src/external/http.js';

const KEY = 'adb-secret-key-123';

/** Shaped like AeroDataBox's FlightContract for SU1234 SVO → LED. */
function adbFlight(over: Partial<AdbFlight> = {}): AdbFlight {
  return {
    number: 'SU 1234',
    status: 'Expected',
    codeshareStatus: 'IsOperator',
    isCargo: false,
    departure: {
      airport: {
        icao: 'UUEE',
        iata: 'SVO',
        name: 'Moscow Sheremetyevo',
        municipalityName: 'Moscow',
        location: { lat: 55.97, lon: 37.41 },
        countryCode: 'RU',
        timeZone: 'Europe/Moscow'
      },
      scheduledTime: { utc: '2026-10-01 07:05Z', local: '2026-10-01 10:05+03:00' },
      revisedTime: { utc: '2026-10-01 07:25Z', local: '2026-10-01 10:25+03:00' }
    },
    arrival: {
      airport: {
        icao: 'ULLI',
        iata: 'LED',
        name: 'Saint Petersburg Pulkovo',
        municipalityName: 'Saint Petersburg',
        location: { lat: 59.8, lon: 30.26 },
        countryCode: 'RU',
        timeZone: 'Europe/Moscow'
      },
      scheduledTime: { utc: '2026-10-01 08:30Z', local: '2026-10-01 11:30+03:00' }
    },
    aircraft: { model: 'Airbus A321', reg: 'VP-BXX' },
    airline: { name: 'Aeroflot', iata: 'SU', icao: 'AFL' },
    ...over
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

let fetchSpy: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetProviderPauses();
  fetchSpy = vi.fn(async () => json([adbFlight()]));
  vi.stubGlobal('fetch', fetchSpy);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  warn.mockRestore();
});

const env = (extra: Record<string, string> = {}) => ({ AERODATABOX_KEY: KEY, ...extra }) as NodeJS.ProcessEnv;

describe('AeroDataBox access', () => {
  it('is off without a key', () => {
    expect(aeroDataBoxConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('defaults to RapidAPI with its two headers', () => {
    const c = aeroDataBoxConfig(env())!;
    expect(c.url('/flights/number/SU1/2026-10-01')).toBe('https://aerodatabox.p.rapidapi.com/flights/number/SU1/2026-10-01');
    expect(c.headers).toEqual({ 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' });
  });

  it('switches to API.market, with its path prefix and header', () => {
    const c = aeroDataBoxConfig(env({ AERODATABOX_HOST: 'prod.api.market' }))!;
    expect(c.url('/flights/number/SU1/2026-10-01')).toBe(
      'https://prod.api.market/api/v1/aedbx/aerodatabox/flights/number/SU1/2026-10-01'
    );
    expect(c.headers).toEqual({ 'x-api-market-key': KEY });
  });

  it('accepts a host written as a URL', () => {
    const c = aeroDataBoxConfig(env({ AERODATABOX_HOST: 'https://aerodatabox.p.rapidapi.com/' }))!;
    expect(c.url('/x')).toBe('https://aerodatabox.p.rapidapi.com/x');
  });
});

describe('AeroDataBox times', () => {
  it('turns its "date time+offset" into ISO 8601 that Date reads', () => {
    expect(isoTime('2026-10-01 10:05+03:00')).toBe('2026-10-01T10:05:00+03:00');
    expect(isoTime('2026-10-01 07:05Z')).toBe('2026-10-01T07:05:00Z');
    expect(isoTime('2026-10-01T10:05:30.000-0500')).toBe('2026-10-01T10:05:30-05:00');
    expect(Date.parse(isoTime('2026-10-01 10:05+03:00')!)).toBe(Date.parse('2026-10-01T07:05:00Z'));
  });

  it('refuses a time without an offset, which could be any of 26 hours', () => {
    expect(isoTime('2026-10-01 10:05')).toBeUndefined();
    expect(isoTime('')).toBeUndefined();
    expect(isoTime(null)).toBeUndefined();
  });
});

describe('choosing the flight', () => {
  it('prefers the operator over a codeshare listing of the same aircraft', () => {
    const codeshare = adbFlight({ codeshareStatus: 'IsCodeshared', airline: { name: 'Partner Air' } });
    expect(pickFlight([codeshare, adbFlight()], '2026-10-01')?.airline?.name).toBe('Aeroflot');
  });

  it('still answers with a codeshare when that is all there is', () => {
    const codeshare = adbFlight({ codeshareStatus: 'IsCodeshared', airline: { name: 'Partner Air' } });
    expect(pickFlight([codeshare], '2026-10-01')?.airline?.name).toBe('Partner Air');
  });

  it('drops cargo, and takes the first of two legs flown under one number', () => {
    const cargo = adbFlight({ isCargo: true });
    const secondLeg = adbFlight({
      departure: { ...adbFlight().departure, scheduledTime: { local: '2026-10-01 14:00+03:00' } }
    });
    const picked = pickFlight([cargo, secondLeg, adbFlight()], '2026-10-01');
    expect(picked?.departure?.scheduledTime?.local).toBe('2026-10-01 10:05+03:00');
    expect(pickFlight([cargo], '2026-10-01')).toBeNull();
  });
});

describe('lookupAeroDataBox', () => {
  it('asks for the number on the local departure date, with the key in a header only', async () => {
    await lookupAeroDataBox('SU1234', '2026-10-01', env());
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://aerodatabox.p.rapidapi.com/flights/number/SU1234/2026-10-01' +
        '?withAircraftImage=false&withLocation=false&dateLocalRole=Departure'
    );
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['X-RapidAPI-Key']).toBe(KEY);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('normalises to local times with offsets, status and aircraft model', async () => {
    const { flight, error } = await lookupAeroDataBox('SU1234', '2026-10-01', env());
    expect(error).toBeUndefined();
    expect(flight).toMatchObject({
      originIata: 'SVO',
      destinationIata: 'LED',
      airline: 'Aeroflot',
      scheduledDeparture: '2026-10-01T10:05:00+03:00',
      scheduledArrival: '2026-10-01T11:30:00+03:00',
      revisedDeparture: '2026-10-01T10:25:00+03:00',
      aircraftType: 'Airbus A321',
      status: 'scheduled'
    });
    expect(flight?.origin).toMatchObject({ iata: 'SVO', tz: 'Europe/Moscow', lat: 55.97, country: 'RU' });
  });

  it('maps the provider statuses the app cares about', async () => {
    for (const [raw, status] of [
      ['EnRoute', 'departed'],
      ['Arrived', 'landed'],
      ['Canceled', 'cancelled'],
      ['CanceledUncertain', 'unknown'],
      ['Delayed', 'delayed'],
      ['Boarding', 'boarding']
    ] as const) {
      fetchSpy.mockResolvedValueOnce(json([adbFlight({ status: raw })]));
      expect((await lookupAeroDataBox('SU1234', '2026-10-01', env())).flight?.status, raw).toBe(status);
    }
  });

  it('treats 204 and 404 as "no such flight", not as a failure', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await lookupAeroDataBox('XX999', '2026-10-01', env())).toEqual({ flight: null });
    fetchSpy.mockResolvedValueOnce(json({ message: 'Flight not found' }, 404));
    expect(await lookupAeroDataBox('XX999', '2026-10-01', env())).toEqual({ flight: null });
  });

  it('pauses after a 429 for the Retry-After, without asking again meanwhile', async () => {
    fetchSpy.mockResolvedValueOnce(json({ message: 'Too many requests' }, 429, { 'retry-after': '30' }));
    expect((await lookupAeroDataBox('SU1234', '2026-10-01', env())).error).toBe('rate_limited');
    expect((await lookupAeroDataBox('SU1234', '2026-10-01', env())).error).toBe('rate_limited');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a refused key and a timeout as such', async () => {
    fetchSpy.mockResolvedValueOnce(json({ message: 'Invalid API key' }, 401));
    expect((await lookupAeroDataBox('SU1234', '2026-10-01', env())).error).toBe('unauthorized');
    fetchSpy.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    expect((await lookupAeroDataBox('SU1234', '2026-10-01', env())).error).toBe('timeout');
    fetchSpy.mockRejectedValueOnce(new TypeError(`fetch failed for https://x/?key=${KEY}`));
    expect((await lookupAeroDataBox('SU1234', '2026-10-01', env())).error).toBe('unreachable');
  });

  it('never writes the key to the logs', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError(`fetch failed for https://x/?key=${KEY}`));
    await lookupAeroDataBox('SU1234', '2026-10-01', env());
    fetchSpy.mockResolvedValueOnce(json({}, 500));
    await lookupAeroDataBox('SU1234', '2026-10-01', env());
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });

  it('does nothing without a key', async () => {
    expect(await lookupAeroDataBox('SU1234', '2026-10-01', {} as NodeJS.ProcessEnv)).toEqual({
      flight: null,
      error: 'not_configured'
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Retry-After', () => {
  it('reads seconds and HTTP dates, with a bounded default', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(retryAfterSeconds('30', now)).toBe(30);
    expect(retryAfterSeconds('Thu, 24 Sep 2026 12:02:00 GMT', now)).toBe(120);
    expect(retryAfterSeconds(null, now)).toBe(60);
    expect(retryAfterSeconds('86400', now)).toBe(900);
  });
});
