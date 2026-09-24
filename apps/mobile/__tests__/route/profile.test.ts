import { describe, it, expect } from 'vitest';
import { buildRoute, estimateAirborneSeconds, airborneFromSchedule, cruiseAltitudeM } from '../../src/core/route/profile';
import { haversine, routeLengthKm } from '../../src/core/geo/greatCircle';

const SVO = { lat: 55.9726, lon: 37.4146 };
const AYT = { lat: 36.8987, lon: 30.8005 };
const LHR = { lat: 51.47, lon: -0.4543 };
const JFK = { lat: 40.6413, lon: -73.7781 };

describe('buildRoute', () => {
  it('starts at the origin, ends at the destination, and is timed monotonically', () => {
    const r = buildRoute({ from: SVO, to: AYT });
    const first = r.route[0]!;
    const last = r.route[r.route.length - 1]!;
    expect(haversine(first.lat, first.lon, SVO.lat, SVO.lon)).toBeLessThan(0.5);
    expect(haversine(last.lat, last.lon, AYT.lat, AYT.lon)).toBeLessThan(0.5);
    expect(last.elapsedSeconds).toBe(r.airborneSeconds);
    for (let i = 1; i < r.route.length; i++) {
      expect(r.route[i]!.elapsedSeconds).toBeGreaterThan(r.route[i - 1]!.elapsedSeconds);
    }
  });

  it('covers the great-circle distance and nothing more', () => {
    const r = buildRoute({ from: LHR, to: JFK });
    expect(Math.abs(routeLengthKm(r.route) - r.distanceKm)).toBeLessThan(r.distanceKm * 0.01);
  });

  it('climbs, cruises and descends', () => {
    const r = buildRoute({ from: LHR, to: JFK });
    const alts = r.route.map((p) => p.altitude);
    expect(alts[0]).toBe(0);
    expect(alts[alts.length - 1]).toBe(0);
    expect(Math.max(...alts)).toBe(cruiseAltitudeM(r.distanceKm));
    // Half-way is at cruise.
    expect(alts[Math.floor(alts.length / 2)]).toBe(cruiseAltitudeM(r.distanceKm));
  });

  it('covers little ground in the first minutes, as a climbing aircraft does', () => {
    const r = buildRoute({ from: LHR, to: JFK });
    const tenMin = r.route.find((p) => p.elapsedSeconds >= 600)!;
    const km = haversine(LHR.lat, LHR.lon, tenMin.lat, tenMin.lon);
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(110);
  });

  it('honours a scheduled airborne time', () => {
    const r = buildRoute({ from: SVO, to: AYT, airborneSeconds: 4 * 3600 });
    expect(r.airborneSeconds).toBe(4 * 3600);
  });

  it('keeps sample count bounded on the longest flights', () => {
    const SIN = { lat: 1.3644, lon: 103.9915 };
    const r = buildRoute({ from: SIN, to: JFK });
    expect(r.route.length).toBeLessThan(520);
  });
});

describe('durations', () => {
  it('estimates familiar flights within reason', () => {
    const h = (s: number) => s / 3600;
    expect(h(estimateAirborneSeconds(haversine(SVO.lat, SVO.lon, AYT.lat, AYT.lon)))).toBeGreaterThan(2.8);
    expect(h(estimateAirborneSeconds(haversine(SVO.lat, SVO.lon, AYT.lat, AYT.lon)))).toBeLessThan(3.8);
    expect(h(estimateAirborneSeconds(haversine(LHR.lat, LHR.lon, JFK.lat, JFK.lon)))).toBeGreaterThan(6.5);
    expect(h(estimateAirborneSeconds(haversine(LHR.lat, LHR.lon, JFK.lat, JFK.lon)))).toBeLessThan(7.8);
  });

  it('subtracts taxi from block time but never goes below what physics allows', () => {
    expect(airborneFromSchedule(4 * 3600, 2400)).toBe(4 * 3600 - 18 * 60);
    expect(airborneFromSchedule(600, 2400)).toBeGreaterThan(2 * 3600);
  });
});
