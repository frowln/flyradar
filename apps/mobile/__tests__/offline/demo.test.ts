import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setDatasetsForTesting } from '../../src/core/data/datasets';

vi.mock('../../src/core/offline/packageStore', () => ({ savePackage: async () => {} }));
vi.mock('../../src/core/places/wiki', () => ({ enrichWithWikipedia: async (p: unknown) => p }));
vi.mock('../../src/core/flight/controller', () => ({ takeOff: async () => {} }));
const { demoRoute, daylitThroughout, planned } = await import('../../src/core/offline/demo');

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../assets/data', `${name}.skydata`), 'utf8'));
setDatasetsForTesting({ airports: read('airports').airports, countries: read('countries').countries });

describe('the demo flight', () => {
  it('flies the home route when it is day there', () => {
    // 09:00 UTC in late September: noon in Moscow, 11:00 in Zürich.
    const morning = new Date('2026-09-24T09:00:00Z');
    expect(demoRoute('ru', morning)).toEqual(['SVO', 'AER']);
    expect(demoRoute('en', morning)).toEqual(['ZRH', 'FCO']);
  });

  it('flies somewhere in daylight at any hour of the year', () => {
    const dark: string[] = [];
    for (const day of ['2026-03-20', '2026-06-21', '2026-09-24', '2026-12-21']) {
      for (let h = 0; h < 24; h++) {
        const now = new Date(`${day}T${String(h).padStart(2, '0')}:30:00Z`);
        const [a, b] = demoRoute('ru', now);
        if (!daylitThroughout(planned(a, b)!, now)) dark.push(`${day} ${h}:30 ${a}-${b}`);
      }
    }
    expect(dark).toEqual([]);
  });

  it('leaves Moscow for daylight elsewhere on an autumn evening', () => {
    const [from] = demoRoute('ru', new Date('2026-09-24T21:30:00Z'));
    expect(from).not.toBe('SVO');
  });
});
