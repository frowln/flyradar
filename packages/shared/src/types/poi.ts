export type POICategory =
  | 'city'
  | 'mountain'
  | 'lake'
  | 'river'
  | 'sea'
  | 'volcano'
  | 'island'
  | 'historic'
  | 'park'
  | 'landmark'
  | 'range'
  | 'desert'
  | 'plateau'
  | 'peninsula'
  | 'glacier'
  | 'region';

export interface POITranslation {
  name: string;
  summary: string;
  facts: string[];
  /** One-line description, e.g. "highest mountain in Europe". */
  tagline?: string;
}

/** Which window a place is seen from, relative to the direction of travel. */
export type PassSide = 'left' | 'right' | 'below';

export interface POI {
  id: string;
  name: string;
  category: POICategory;
  lat: number;
  lon: number;
  elevation?: number;
  population?: number;
  wikiTitle?: string;
  /** Wikidata id — lets the app fetch the article in the reader's language. */
  wikidata?: string;
  summary: string;        // 300-500 word adapted text
  facts: string[];        // 3-5 wow facts
  photos: string[];       // URLs, or file:// once cached for the flight
  /** Credit line for the first photo, when the licence requires one. */
  photoCredit?: string;
  closestApproachKm?: number;
  /** Importance 1–10 (10 = world-famous). */
  rank?: number;
  /** ISO 3166-1 alpha-2 of the country it lies in. */
  country?: string;
  /** Area places (seas, deserts, ranges): rough half-size in km. */
  extentKm?: number;
  /** Where on the route it is closest: seconds after takeoff. */
  passAt?: number;
  /** Seconds after takeoff when it can first / last be seen from cruise. */
  visibleFrom?: number;
  visibleTo?: number;
  /** Which side of the aircraft it lies on at closest approach. */
  side?: PassSide;
  /** Areas flown over: seconds after takeoff when the track enters and leaves the outline. */
  overFrom?: number;
  overTo?: number;
  /** Source of the text: an encyclopedia article, or composed from data alone. */
  textSource?: 'wikipedia' | 'editorial' | 'generated';
  /** Canonical article URL for attribution. */
  sourceUrl?: string;
  /** Language the summary is written in, when it differs from the reader's. */
  textLang?: string;
  /** One-line description in the base language. */
  tagline?: string;
  translations?: {
    en?: POITranslation;
    ru?: POITranslation;
    de?: POITranslation;
    fr?: POITranslation;
    es?: POITranslation;
    ja?: POITranslation;
  };
}
