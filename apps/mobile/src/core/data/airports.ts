import type { Airport } from '@skyatlas/shared';
import type { DataAirport, DataLang } from './types';
import { getAirports } from './datasets';

/**
 * Finding an airport the way a passenger thinks of it.
 *
 * People type a city ("Москва", "Tokyo"), a code they saw on a ticket ("SVO"),
 * or part of an airport's name ("Heathrow"). All three should land on the right
 * row within two or three letters, and a hub should outrank a regional strip of
 * the same city.
 */

/** Lowercases and strips diacritics, so "Zürich" matches "zurich" and "Ё" matches "е". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .trim();
}

interface Indexed {
  a: DataAirport;
  keys: string[];
}

let index: Indexed[] | null = null;

function build(): Indexed[] {
  return getAirports().map((a) => ({
    a,
    keys: [a.city, a.n, ...Object.values(a.cl ?? {})].filter(Boolean).map(fold)
  }));
}

export function searchAirports(query: string, limit = 8): DataAirport[] {
  const q = fold(query);
  if (!q) return [];
  if (!index) index = build();

  const scored: Array<{ a: DataAirport; score: number }> = [];
  const upper = query.trim().toUpperCase();
  for (const { a, keys } of index) {
    let score = 0;
    if (a.i === upper) score = 1000;
    else if (a.c === upper) score = 900;
    else {
      for (const k of keys) {
        if (k === q) score = Math.max(score, 600);
        else if (k.startsWith(q)) score = Math.max(score, 400);
        else if (q.length >= 3 && k.split(/[\s-]+/).some((w) => w.startsWith(q))) score = Math.max(score, 250);
        else if (q.length >= 4 && k.includes(q)) score = Math.max(score, 120);
      }
      if (score === 0 && q.length <= 3 && a.i.startsWith(upper)) score = 200;
    }
    if (score > 0) scored.push({ a, score: score + a.s * 30 });
  }
  scored.sort((x, y) => y.score - x.score || x.a.i.localeCompare(y.a.i));
  return scored.slice(0, limit).map((x) => x.a);
}

/** The city name in the reader's language when the dataset has it. */
export function cityName(a: DataAirport | Airport, locale: string): string {
  const lang = locale.slice(0, 2) as DataLang;
  if ('i' in a) return a.cl?.[lang] ?? a.city;
  return a.cityNames?.[lang] ?? a.city;
}

export function toAirport(a: DataAirport): Airport {
  return {
    iata: a.i,
    icao: a.c ?? '',
    name: a.n,
    city: a.city,
    country: a.cc,
    lat: a.lat,
    lon: a.lon,
    tz: a.tz,
    cityNames: a.cl
  };
}
