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
