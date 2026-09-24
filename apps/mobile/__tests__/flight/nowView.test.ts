import { describe, it, expect } from 'vitest';
import { whatsOutside } from '../../src/core/flight/nowView';
import { positionNow } from '../../src/core/flight/position';
import { buildRoute } from '../../src/core/route/profile';
import { sightingsAlong, selectSightings, toPOI } from '../../src/core/places/corridor';
import type { OfflinePackage } from '@skyatlas/shared';
import type { DataPlace } from '../../src/core/data/types';

// Northbound along 20°E; a peak 60 km east at 5°N, a city 50 km west at 5°N, a lake overflown at 8°N.
const built = buildRoute({ from: { lat: 0, lon: 20 }, to: { lat: 10, lon: 20 } });
const places: DataPlace[] = [
  { id: 'peak', k: 'mountain', n: 'Peak', lat: 5, lon: 20.55, r: 8, el: 4500 },
  { id: 'town', k: 'city', n: 'Town', lat: 5, lon: 19.55, r: 7, pop: 900_000 },
  { id: 'lake', k: 'lake', n: 'Lake', lat: 8, lon: 20, r: 6, ext: 40, bb: [19.6, 7.6, 20.4, 8.4] }
];
const areas = { lake: [[[[19.6, 7.6], [20.4, 7.6], [20.4, 8.4], [19.6, 8.4]] as [number, number][]]] };
const pois = selectSightings(sightingsAlong(built.route, places, areas), built.airborneSeconds).map(toPOI);
const pkg: OfflinePackage = {
  version: 2,
  flight: {} as OfflinePackage['flight'],
  route: built.route,
  pois,
  generatedAt: ''
};
const takeoff = new Date('2026-03-20T09:00:00Z');
const peakPass = pois.find((p) => p.id === 'peak')!.passAt!;
const lakePass = pois.find((p) => p.id === 'lake')!.passAt!;

describe('whatsOutside', () => {
  it('puts the peak on the right and the town on the left as they come abeam', () => {
    const now = positionNow(built.route, takeoff, new Date(takeoff.getTime() + peakPass * 1000));
    const w = whatsOutside(pkg, now, takeoff);
    expect(w.right.map((x) => x.poi.id)).toContain('peak');
    expect(w.left.map((x) => x.poi.id)).toContain('town');
    expect(w.right.find((x) => x.poi.id === 'peak')!.where).toBe('abeam');
  });

  it('shows the peak ahead before it comes abeam', () => {
    const now = positionNow(built.route, takeoff, new Date(takeoff.getTime() + (peakPass - 900) * 1000));
    const peak = [...whatsOutside(pkg, now, takeoff).right, ...whatsOutside(pkg, now, takeoff).left].find((x) => x.poi.id === 'peak');
    expect(peak?.where).toBe('ahead');
  });

  it('reports the lake below while overflying it', () => {
    const now = positionNow(built.route, takeoff, new Date(takeoff.getTime() + lakePass * 1000));
    expect(whatsOutside(pkg, now, takeoff).below.map((x) => x.poi.id)).toContain('lake');
  });

  it('lists what comes next, soonest first', () => {
    const now = positionNow(built.route, takeoff, new Date(takeoff.getTime() + 60 * 1000));
    const next = whatsOutside(pkg, now, takeoff).next;
    expect(next.length).toBeGreaterThan(0);
    for (let i = 1; i < next.length; i++) expect(next[i]!.at).toBeGreaterThanOrEqual(next[i - 1]!.at);
  });
});
