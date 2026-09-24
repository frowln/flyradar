import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closedCountries, planAround } from '../../src/core/route/airspace';
import { buildRoute } from '../../src/core/route/profile';
import { countriesAlong, distinctCountries } from '../../src/core/places/countries';
import type { CountriesFile } from '../../src/core/data/types';

const countries = (JSON.parse(readFileSync(join(__dirname, '../../assets/data/countries.skydata'), 'utf8')) as CountriesFile).countries;

const SVO = { lat: 55.9726, lon: 37.4146 };
const AYT = { lat: 36.8987, lon: 30.8005 };
const AER = { lat: 43.4499, lon: 39.9566 };
const LHR = { lat: 51.47, lon: -0.4543 };
const JFK = { lat: 40.6413, lon: -73.7781 };
const HEL = { lat: 60.3172, lon: 24.9633 };
const NRT = { lat: 35.772, lon: 140.3929 };

function crossed(from: typeof SVO, to: typeof SVO, closed: string[]) {
  const d = planAround(from, to, closed, countries);
  const route = buildRoute({ from, to, via: d.via }).route;
  return { d, route, cc: distinctCountries(countriesAlong(route, countries)) };
}

describe('closedCountries', () => {
  it('closes Ukraine and Crimea to everyone', () => {
    expect(closedCountries({ fromCC: 'DE', toCC: 'TR', carrier: 'TK' })).toEqual(expect.arrayContaining(['UA', 'XR']));
  });
  it('closes Europe and North America to Russian carriers', () => {
    const c = closedCountries({ fromCC: 'RU', toCC: 'TR', carrier: 'SU' });
    expect(c).toContain('PL');
    expect(c).toContain('US');
    expect(c).not.toContain('RU');
  });
  it('closes Russia to a flight that does not touch it when the carrier is unknown', () => {
    expect(closedCountries({ fromCC: 'FI', toCC: 'JP' })).toContain('RU');
    expect(closedCountries({ fromCC: 'FI', toCC: 'JP', carrier: 'CA' })).not.toContain('RU');
  });
});

describe('planAround', () => {
  it('keeps a transatlantic great circle as it is', () => {
    const d = planAround(LHR, JFK, closedCountries({ fromCC: 'GB', toCC: 'US' }), countries);
    expect(d.via).toEqual([]);
    expect(d.ratio).toBe(1);
  });

  it('routes Moscow–Antalya around Ukraine and Crimea', () => {
    const { d, cc } = crossed(SVO, AYT, closedCountries({ fromCC: 'RU', toCC: 'TR' }));
    expect(d.via.length).toBeGreaterThan(0);
    expect(cc).not.toContain('UA');
    expect(cc).not.toContain('XR');
    expect(cc[0]).toBe('RU');
    expect(cc[cc.length - 1]).toBe('TR');
    expect(d.ratio).toBeLessThan(1.5);
  });

  it('keeps Moscow–Sochi clear of the Ukrainian border', () => {
    const { cc } = crossed(SVO, AER, closedCountries({ fromCC: 'RU', toCC: 'RU' }));
    expect(cc).not.toContain('UA');
  });

  it('takes a European carrier from Helsinki to Tokyo around Russia', () => {
    const { d, cc } = crossed(HEL, NRT, closedCountries({ fromCC: 'FI', toCC: 'JP', carrier: 'AY' }));
    expect(d.approximate).toBe(false);
    expect(cc).not.toContain('RU');
    expect(d.ratio).toBeLessThan(1.6);
  });
});

describe('planAround with endpoints in closed airspace', () => {
  const SVO_RU = { ...SVO, cc: 'RU' };
  const JFK_US = { ...JFK, cc: 'US' };
  const LHR_GB = { ...LHR, cc: 'GB' };
  // Boryspil is not in the airport data (Ukraine is closed); a flight can still be composed to it by hand.
  const KBP_UA = { lat: 50.345, lon: 30.895, cc: 'UA' };
  const FRA_DE = { lat: 50.027, lon: 8.558, cc: 'DE' };
  const KGD_RU = { lat: 54.89, lon: 20.593, cc: 'RU' };

  /**
   * JFK sits on the coast, so its free zone reaches the open Atlantic and the
   * search used to "find" an Aeroflot route over the Arctic into New York — a
   * confident detour for a flight that cannot exist.
   */
  it('does not invent a legal detour to a country closed to the carrier', () => {
    const closed = closedCountries({ carrier: 'SU', fromCC: 'RU', toCC: 'US' });
    expect(planAround(SVO_RU, JFK_US, closed, countries)).toEqual({ via: [], ratio: 1, approximate: true });
    expect(planAround(SVO_RU, LHR_GB, closedCountries({ carrier: 'SU', fromCC: 'RU', toCC: 'GB' }), countries).approximate).toBe(true);
  });

  it('calls any flight to or from a war zone approximate, in either direction', () => {
    const out = planAround(FRA_DE, KBP_UA, closedCountries({ carrier: 'LH', fromCC: 'DE', toCC: 'UA' }), countries);
    const back = planAround(KBP_UA, FRA_DE, closedCountries({ carrier: 'LH', fromCC: 'UA', toCC: 'DE' }), countries);
    expect(out.approximate).toBe(true);
    expect(back.approximate).toBe(true);
  });

  /**
   * Kaliningrad is walled in by closed countries for a Russian carrier. A*
   * could only prove that by exhausting the reachable world (seconds on a
   * phone); the pocket fill proves it from the small side.
   */
  it('reports a walled-in destination as approximate', () => {
    const closed = closedCountries({ carrier: 'SU', fromCC: 'RU', toCC: 'RU' });
    expect(planAround(SVO_RU, KGD_RU, closed, countries).approximate).toBe(true);
  });

  it('still plans ordinary detours for airports given with their country', () => {
    const d = planAround({ ...HEL, cc: 'FI' }, { ...NRT, cc: 'JP' }, closedCountries({ fromCC: 'FI', toCC: 'JP', carrier: 'AY' }), countries);
    expect(d.approximate).toBe(false);
    expect(d.via.length).toBeGreaterThan(0);
  });
});

describe('airspace avoided by everyone', () => {
  it('keeps every flight out of North Korea and Syria', () => {
    for (const carrier of [undefined, 'LH', 'TK', 'SU', 'CA']) {
      const c = closedCountries({ fromCC: 'DE', toCC: 'KR', carrier });
      expect(c).toEqual(expect.arrayContaining(['KP', 'SY']));
    }
  });
  it('lets Hong Kong carriers cross Russia', () => {
    expect(closedCountries({ fromCC: 'US', toCC: 'HK', carrier: 'CX' })).not.toContain('RU');
  });
});
