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

/**
 * Lazy access to the bundled datasets.
 *
 * The files are a few megabytes of JSON; parsing them at launch would cost a
 * visible delay on every cold start for a feature used a few times a year. They
 * load on first use — when a flight is being added — and stay in memory after.
 *
 * Tests inject their own data through `setDatasetsForTesting`, so nothing here
 * needs a bundler to be exercised.
 */

declare const require: (path: string) => unknown;

let airports: DataAirport[] | null = null;
let airportIndex: Map<string, DataAirport> | null = null;
let places: DataPlace[] | null = null;
let areas: Record<string, MultiPolygon> | null = null;
let countries: DataCountry[] | null = null;
let countryIndex: Map<string, DataCountry> | null = null;

export function getAirports(): DataAirport[] {
  if (!airports) {
    airports = (require('../../../assets/data/airports.json') as AirportsFile).airports;
  }
  return airports;
}

export function airportByIata(iata: string): DataAirport | undefined {
  if (!airportIndex) {
    airportIndex = new Map(getAirports().map((a) => [a.i, a]));
  }
  return airportIndex.get(iata.toUpperCase());
}

export function getPlaces(): DataPlace[] {
  if (!places) {
    places = (require('../../../assets/data/places.json') as PlacesFile).places;
  }
  return places;
}

export function getAreas(): Record<string, MultiPolygon> {
  if (!areas) {
    areas = (require('../../../assets/data/areas.json') as AreasFile).areas;
  }
  return areas;
}

export function getCountries(): DataCountry[] {
  if (!countries) {
    countries = (require('../../../assets/data/countries.json') as CountriesFile).countries;
  }
  return countries;
}

export function countryByCode(cc: string): DataCountry | undefined {
  if (!countryIndex) {
    countryIndex = new Map(getCountries().map((c) => [c.cc, c]));
  }
  return countryIndex.get(cc);
}

export function setDatasetsForTesting(data: {
  airports?: DataAirport[];
  places?: DataPlace[];
  areas?: Record<string, MultiPolygon>;
  countries?: DataCountry[];
}): void {
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
