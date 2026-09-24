import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { composePackage } from '../../src/core/offline/buildPackage';
import { setDatasetsForTesting, airportByIata, getPlaces, getAreas, getCountries } from '../../src/core/data/datasets';
import { whatsOutside } from '../../src/core/flight/nowView';
import { positionNow } from '../../src/core/flight/position';
import { nextGuess } from '../../src/core/flight/guess';

/**
 * Los Angeles–New York crosses the Grand Canyon's outline 50 km from its label
 * point. The corridor called it overflown ("which landmark are you about to
 * fly over?") while the window view, measuring landmarks from their label
 * point, listed it at the same moment as "left, abeam, 79 km".
 */
const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../assets/data', `${name}.skydata`), 'utf8'));
setDatasetsForTesting({
  airports: read('airports').airports,
  places: read('places').places,
  areas: read('areas').areas,
  countries: read('countries').countries
});
const pkg = composePackage(
  { from: airportByIata('LAX')!, to: airportByIata('JFK')!, date: '2026-09-24', departureTime: '11:40', locale: 'en' },
  { places: getPlaces(), areas: getAreas(), countries: getCountries() }
);
const takeoff = new Date(new Date(pkg.flight.scheduledDeparture).getTime() + 10 * 60_000);
const end = pkg.route[pkg.route.length - 1]!.elapsedSeconds;
const canyon = pkg.pois.find((p) => p.name === 'Grand Canyon')!;
const at = (s: number) => positionNow(pkg.route, takeoff, new Date(takeoff.getTime() + s * 1000));
const ids = (xs: Array<{ poi: { id: string } }>) => xs.map((x) => x.poi.id);

describe('a landmark flown over', () => {
  it('is on the route as overflown', () => {
    expect(canyon.side).toBe('below');
    expect(canyon.overFrom).toBeLessThan(canyon.overTo!);
  });

  it('is below — not abeam, not also "next" — while the track is inside it', () => {
    const t = (canyon.overFrom! + canyon.overTo!) / 2;
    const w = whatsOutside(pkg, at(t), takeoff);
    expect(ids(w.below)).toContain(canyon.id);
    expect(ids([...w.left, ...w.right])).not.toContain(canyon.id);
    expect(w.next.map((m) => m.poiId)).not.toContain(canyon.id);
  });

  it('never shows anything the corridor flies over in a side window, at any minute', () => {
    const overflown = new Set(pkg.pois.filter((p) => p.overFrom != null).map((p) => p.id));
    for (let t = 0; t <= end; t += 60) {
      const w = whatsOutside(pkg, at(t), null);
      const sides = ids([...w.left, ...w.right]).filter((id) => overflown.has(id));
      expect(sides, `t=${t}`).toEqual([]);
    }
  });

  it('is guessed before the track enters it, not once already over it', () => {
    const before = nextGuess(pkg, canyon.overFrom! - 5 * 60, {});
    expect(before?.poi.id).toBe(canyon.id);
    expect(before!.inS).toBe(5 * 60);
    expect(nextGuess(pkg, canyon.overFrom! + 60, {})?.poi.id).not.toBe(canyon.id);
  });
});

describe('the timeline of a landmark flown over', () => {
  it('counts down to the moment the track enters it, as the guess does', () => {
    const t = canyon.overFrom! - 5 * 60;
    const next = whatsOutside(pkg, at(t), takeoff).next.find((m) => m.poiId === canyon.id);
    expect(next?.at).toBe(canyon.overFrom);
    expect(nextGuess(pkg, t, {})!.inS).toBe(next!.at - t);
  });
});
