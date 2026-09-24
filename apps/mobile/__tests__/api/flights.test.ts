import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../../src/core/settings', () => ({
  settings: { getDeviceToken: () => 'dev_test', setDeviceToken: () => {} }
}));
vi.mock('../../src/core/random', () => ({ randomId: () => 'dev_random' }));
const signRequest = vi.fn((..._args: unknown[]) => null);
vi.mock('../../src/core/crypto/sign', () => ({ signRequest: (...args: unknown[]) => signRequest(...args) }));

const flight = {
  id: 'SU1234-2026-10-01',
  flightNumber: 'SU1234',
  airline: 'Aeroflot',
  origin: { iata: 'SVO', icao: 'UUEE', name: 'Sheremetyevo', city: 'Moscow', country: 'RU', lat: 55.97, lon: 37.41, tz: 'Europe/Moscow' },
  destination: { iata: 'LED', icao: 'ULLI', name: 'Pulkovo', city: 'Saint Petersburg', country: 'RU', lat: 59.8, lon: 30.26, tz: 'Europe/Moscow' },
  scheduledDeparture: '2026-10-01T10:05:00+03:00',
  scheduledArrival: '2026-10-01T11:30:00+03:00',
  localDate: '2026-10-01',
  status: 'scheduled'
};

/** The module as a build with, or without, a server URL sees it. */
async function load(url: string) {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_API_URL', url);
  return import('../../src/core/api/flights');
}

const reply = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  signRequest.mockClear();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('without a server', () => {
  it('answers null to everything and sends nothing', async () => {
    const api = await load('');
    expect(await api.lookupFlight('SU1234', '2026-10-01')).toBeNull();
    expect(await api.fetchTrack('SU1234')).toBeNull();
    expect(await api.fetchClouds([{ lat: 1, lon: 1, at: '2026-10-01T10:00:00Z' }])).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('with a server', () => {
  it('looks a flight up by a normalised number and date', async () => {
    const api = await load('https://api.test');
    fetchSpy.mockReturnValue(reply(flight));
    expect(await api.lookupFlight(' su 1234 ', '2026-10-01')).toEqual(flight);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/flights/lookup');
    expect(JSON.parse(init.body as string)).toEqual({ flightNumber: 'SU1234', date: '2026-10-01' });
  });

  it('answers null, never throws, on a miss, an outage or nonsense', async () => {
    const api = await load('https://api.test');
    fetchSpy.mockReturnValueOnce(reply({ error: 'Flight not found', availableDates: [] }, 404));
    expect(await api.lookupFlight('SU1234', '2026-10-01')).toBeNull();
    fetchSpy.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await api.lookupFlight('SU1234', '2026-10-01')).toBeNull();
    expect(await api.lookupFlight('SU-12:34', '2026-10-01')).toBeNull();
    expect(await api.lookupFlight('SU1234', 'tomorrow')).toBeNull();
    fetchSpy.mockReturnValueOnce(reply({ unexpected: true }));
    expect(await api.lookupFlight('SU1234', '2026-10-01')).toBeNull();
  });

  it('fetches the recent track, signing the path without its query string', async () => {
    const api = await load('https://api.test');
    const track = { points: [[37.41, 55.97, 0, 0], [30.26, 59.8, 0, 4800]], flownOn: '2026-09-22', from: 'SVO', to: 'LED' };
    fetchSpy.mockReturnValue(reply(track));
    expect(await api.fetchTrack('su1234')).toEqual(track);
    expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.test/flights/track?number=SU1234');
    expect(signRequest).toHaveBeenCalledWith('GET', '/flights/track', 'dev_test', '');
    fetchSpy.mockReturnValue(reply({ error: 'No recent track' }, 404));
    expect(await api.fetchTrack('SU1234')).toBeNull();
  });

  it('fetches clouds for up to sixty points, and only a complete answer', async () => {
    const api = await load('https://api.test');
    const points = [
      { lat: 55.97, lon: 37.41, at: '2026-10-01T07:15:00.000Z' },
      { lat: 57, lon: 35, at: '2026-10-01T07:30:00.000Z' }
    ];
    fetchSpy.mockReturnValueOnce(reply({ points: points.map((p) => ({ at: p.at, cloud: 80, low: 10, mid: 5 })) }));
    expect(await api.fetchClouds(points)).toHaveLength(2);
    expect(JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ points });
    fetchSpy.mockReturnValueOnce(reply({ points: [] }));
    expect(await api.fetchClouds(points)).toBeNull();
    expect(await api.fetchClouds(Array.from({ length: 61 }, () => points[0]!))).toBeNull();
  });

  it('fills the add-flight form from a looked-up flight in local time', async () => {
    const api = await load('https://api.test');
    expect(api.formFromFlight(flight as never)).toEqual({
      fromIata: 'SVO',
      toIata: 'LED',
      date: '2026-10-01',
      departureTime: '10:05',
      arrivalTime: '11:30'
    });
  });
});
