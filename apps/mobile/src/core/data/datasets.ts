import type {
  AirportsFile,
  AreasFile,
  CountriesFile,
  DataAirport,
  DataCountry,
  DataPlace,
  MultiPolygon,
  PlacesFile
} from './types';
import type { HistoryFile, HistoryItem, StoriesFile } from '../places/stories';

/**
 * The bundled datasets, loaded once and kept in memory.
 *
 * They ship as asset files (`assets/data/*.skydata`, JSON inside) and are
 * read at startup — six megabytes that would otherwise be compiled into the
 * JavaScript bundle and carried by every update.
 *
 * The app keeps its splash screen up until they are in memory (App.tsx), so
 * the getters can stay synchronous; they throw if called before that. Tests
 * inject their own data with `setDatasetsForTesting` and never load files.
 */

declare const require: (path: string) => number;

let airports: DataAirport[] | null = null;
let airportIndex: Map<string, DataAirport> | null = null;
let places: DataPlace[] | null = null;
let areas: Record<string, MultiPolygon> | null = null;
let countries: DataCountry[] | null = null;
let countryIndex: Map<string, DataCountry> | null = null;
let history: HistoryItem[] | null = null;
const stories = new Map<string, StoriesFile>();

let loading: Promise<void> | null = null;

export function datasetsReady(): boolean {
  return !!(airports && places && areas && countries);
}

/** Starts loading (once) and resolves when every dataset is in memory. */
export function ensureDatasets(): Promise<void> {
  if (datasetsReady()) return Promise.resolve();
  loading ??= (async () => {
    // Imported lazily: it pulls in native modules the core tests cannot load.
    const { readAssetText } = await import('./assetText');
    const read = async <T,>(mod: number) => JSON.parse(await readAssetText(mod)) as T;
    // The requires sit here, not at module level, so nothing is resolved
    // until the data is actually wanted.
    const [a, p, ar, c, h] = await Promise.all([
      read<AirportsFile>(require('../../../assets/data/airports.skydata')),
      read<PlacesFile>(require('../../../assets/data/places.skydata')),
      read<AreasFile>(require('../../../assets/data/areas.skydata')),
      read<CountriesFile>(require('../../../assets/data/countries.skydata')),
      read<HistoryFile>(require('../../../assets/data/history.skydata'))
    ]);
    history = h.items;
    airports = a.airports;
    airportIndex = null;
    places = p.places;
    areas = ar.areas;
    countries = c.countries;
    countryIndex = null;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/**
 * Texts written for SkyAtlas, in one language. Loaded on demand — only the
 * reader's language is ever held in memory — and cached.
 */
export async function loadStories(locale: string): Promise<StoriesFile | null> {
  const lang = locale.slice(0, 2);
  const cached = stories.get(lang);
  if (cached) return cached;
  const mods: Record<string, () => number> = {
    en: () => require('../../../assets/data/stories.en.skydata'),
    ru: () => require('../../../assets/data/stories.ru.skydata'),
    de: () => require('../../../assets/data/stories.de.skydata'),
    fr: () => require('../../../assets/data/stories.fr.skydata'),
    es: () => require('../../../assets/data/stories.es.skydata'),
    ja: () => require('../../../assets/data/stories.ja.skydata')
  };
  const mod = mods[lang];
  if (!mod) return null;
  try {
    const { readAssetText } = await import('./assetText');
    const file = JSON.parse(await readAssetText(mod())) as StoriesFile;
    stories.set(lang, file);
    return file;
  } catch {
    return null;
  }
}

/** Stories already loaded for a language, or null. */
export function storiesFor(locale: string): StoriesFile | null {
  return stories.get(locale.slice(0, 2)) ?? null;
}

export function getHistory(): HistoryItem[] {
  return history ?? [];
}

function need<T>(v: T | null, name: string): T {
  if (!v) throw new Error(`dataset "${name}" not loaded — await ensureDatasets() first`);
  return v;
}

export function getAirports(): DataAirport[] {
  return need(airports, 'airports');
}

export function airportByIata(iata: string): DataAirport | undefined {
  if (!airportIndex) airportIndex = new Map(getAirports().map((a) => [a.i, a]));
  return airportIndex.get(iata.toUpperCase());
}

export function getPlaces(): DataPlace[] {
  return need(places, 'places');
}

export function getAreas(): Record<string, MultiPolygon> {
  return need(areas, 'areas');
}

export function getCountries(): DataCountry[] {
  return need(countries, 'countries');
}

export function countryByCode(cc: string): DataCountry | undefined {
  if (!countryIndex) countryIndex = new Map(getCountries().map((c) => [c.cc, c]));
  return countryIndex.get(cc);
}

export function setDatasetsForTesting(data: {
  airports?: DataAirport[];
  places?: DataPlace[];
  areas?: Record<string, MultiPolygon>;
  countries?: DataCountry[];
  history?: HistoryItem[];
  stories?: StoriesFile[];
}): void {
  if (data.history) history = data.history;
  for (const st of data.stories ?? []) stories.set(st.lang, st);
  if (data.airports) {
    airports = data.airports;
    airportIndex = null;
  }
  if (data.places) places = data.places;
  if (data.areas) areas = data.areas;
  if (data.countries) {
    countries = data.countries;
    countryIndex = null;
  }
}
