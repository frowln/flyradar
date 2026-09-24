import type { FlightRecord, Passport } from './types';

/** Folds the flight log into the passport. `continentOf` maps a country code to its continent. */
export function buildPassport(records: FlightRecord[], continentOf: (cc: string) => string | undefined): Passport {
  const countries: string[] = [];
  const landed: string[] = [];
  const airports = new Set<string>();
  const lines: Passport['lines'] = {};
  const placeCat = new Map<string, string>();
  const spottedIds = new Set<string>();
  let distanceKm = 0;
  let airborneS = 0;
  let longestS = 0;
  let nightFlights = 0;
  let sunrises = 0;
  let sunsets = 0;
  let guessed = 0;

  const ordered = [...records].sort((a, b) => a.takeoffAt.localeCompare(b.takeoffAt));
  for (const r of ordered) {
    distanceKm += r.distanceKm;
    airborneS += r.airborneS;
    longestS = Math.max(longestS, r.airborneS);
    if (r.night) nightFlights++;
    if (r.sunrise) sunrises++;
    if (r.sunset) sunsets++;
    guessed += r.guessed ?? 0;
    airports.add(r.from);
    airports.add(r.to);
    for (const cc of r.countries) if (!countries.includes(cc)) countries.push(cc);
    for (const cc of [r.fromCC, r.toCC]) {
      if (cc && !landed.includes(cc)) landed.push(cc);
      if (cc && !countries.includes(cc)) countries.push(cc);
    }
    for (const l of r.lines) lines[l] = (lines[l] ?? 0) + 1;
    for (const p of r.passed) placeCat.set(p.id, p.cat);
    for (const id of r.spotted) spottedIds.add(id);
  }

  const byCategory: Passport['byCategory'] = {};
  for (const [id, cat] of placeCat) {
    const k = cat as keyof Passport['byCategory'];
    const tally = byCategory[k] ?? { passed: 0, spotted: 0 };
    tally.passed++;
    if (spottedIds.has(id)) tally.spotted++;
    byCategory[k] = tally;
  }

  const continents = Array.from(
    new Set(countries.map(continentOf).filter((c): c is string => !!c && c !== 'Antarctica' && c !== 'Seven seas (open ocean)'))
  );

  return {
    flights: records.length,
    distanceKm,
    airborneS,
    longestS,
    countries,
    landed,
    continents,
    airports: Array.from(airports),
    lines,
    places: placeCat.size,
    spotted: spottedIds.size,
    guessed,
    byCategory,
    nightFlights,
    sunrises,
    sunsets
  };
}

export function categoryCount(p: Passport, ...cats: Array<keyof Passport['byCategory']>): number {
  return cats.reduce((n, c) => n + (p.byCategory[c]?.passed ?? 0), 0);
}
