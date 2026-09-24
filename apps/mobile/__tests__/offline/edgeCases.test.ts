import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { composePackage, type BuildRequest } from '../../src/core/offline/buildPackage';
import { setDatasetsForTesting, airportByIata, getPlaces, getAreas, getCountries } from '../../src/core/data/datasets';
import { distinctCountries } from '../../src/core/places/countries';
import { localDate } from '../../src/core/time/zones';

// Real datasets, loaded once: these are edge cases of the data as much as of the code.
const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../assets/data', `${name}.skydata`), 'utf8'));
setDatasetsForTesting({
  airports: read('airports').airports,
  places: read('places').places,
  areas: read('areas').areas,
  countries: read('countries').countries
});
const data = { places: getPlaces(), areas: getAreas(), countries: getCountries() };

function compose(from: string, to: string, extra: Partial<BuildRequest> = {}) {
  return composePackage(
    { from: airportByIata(from)!, to: airportByIata(to)!, date: '2026-06-21', departureTime: '10:00', locale: 'en', ...extra },
    data
  );
}
const airborne = (pkg: ReturnType<typeof compose>) => pkg.route[pkg.route.length - 1]!.elapsedSeconds;

describe('composePackage across the date line', () => {
  it('reads an arrival on the previous local date as the same flight, not one a day longer', () => {
    // Apia is 24 hours ahead of Pago Pago: a 40-minute hop lands "yesterday".
    const pkg = compose('APW', 'PPG', { departureTime: '10:00', arrivalTime: '10:40' });
    expect(airborne(pkg)).toBeLessThan(3600);
    expect(localDate(new Date(pkg.flight.scheduledArrival), 'Pacific/Pago_Pago')).toBe('2026-06-20');
  });

  it('uses the ticket on a morning Auckland–Honolulu flight instead of discarding it', () => {
    const pkg = compose('AKL', 'HNL', { departureTime: '05:00', arrivalTime: '15:30' });
    // 8 h 30 block less taxi.
    expect(airborne(pkg)).toBe(8.5 * 3600 - 18 * 60);
  });

  it('still lands the next day westbound', () => {
    const pkg = compose('HNL', 'NRT', { departureTime: '10:50', arrivalTime: '14:40' });
    expect(localDate(new Date(pkg.flight.scheduledArrival), 'Asia/Tokyo')).toBe('2026-06-22');
    expect(airborne(pkg)).toBeGreaterThan(8 * 3600);
    expect(airborne(pkg)).toBeLessThan(9 * 3600);
  });
});

describe('composePackage from coastal airports', () => {
  /**
   * Haneda, Changi, Hamad and Logan (72 of the large airports) lie on reclaimed
   * land or the shore, outside the simplified country outline. A Tokyo–Osaka
   * flight took off from "nowhere" and announced "entering Japan" a minute later.
   */
  it('does not announce entering the country a domestic flight took off from', () => {
    for (const [a, b] of [['HND', 'ITM'], ['BOS', 'DCA'], ['KIX', 'HND']]) {
      const pkg = compose(a!, b!);
      expect(pkg.countries![0]!.enterAt, `${a}-${b}`).toBe(0);
      expect(pkg.moments!.filter((m) => m.kind === 'border'), `${a}-${b}`).toEqual([]);
    }
  });

  it('counts the countries of coastal origins and destinations', () => {
    expect(distinctCountries(compose('SIN', 'SYD').countries!)[0]).toBe('SG');
    const doh = distinctCountries(compose('DOH', 'AKL').countries!);
    expect(doh[0]).toBe('QA');
    expect(doh[doh.length - 1]).toBe('NZ');
    const back = distinctCountries(compose('AKL', 'DOH').countries!);
    expect(back[back.length - 1]).toBe('QA');
  });
});

describe('composePackage in closed airspace', () => {
  it('marks a Russian carrier to New York as approximate rather than a legal detour', () => {
    const pkg = compose('SVO', 'JFK', { flightNumber: 'SU100' });
    expect(pkg.routeKind).toBe('approximate');
    expect(pkg.route.length).toBeGreaterThan(2);
  });

  it('builds a Lufthansa flight to Tokyo around Russia', () => {
    const pkg = compose('FRA', 'NRT', { flightNumber: 'LH716' });
    expect(pkg.routeKind).toBe('detour');
    expect(distinctCountries(pkg.countries!)).not.toContain('RU');
  });
});

describe('composePackage places', () => {
  it('only calls a place overflown when it has an outline to be inside', () => {
    const areas = getAreas();
    for (const [a, b, fn] of [['LAX', 'JFK', undefined], ['FRA', 'NRT', 'LH716'], ['CDG', 'FCO', undefined]]) {
      const pkg = compose(a!, b!, { flightNumber: fn });
      for (const p of pkg.pois.filter((p) => p.overFrom != null)) {
        expect(areas[p.id], `${a}-${b} ${p.name} (${p.category})`).toBeDefined();
      }
      expect(pkg.pois.filter((p) => p.category === 'river' && p.overFrom != null)).toEqual([]);
    }
  });
});
