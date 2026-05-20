export type POICategory =
  | 'city' | 'mountain' | 'lake' | 'river' | 'sea' | 'volcano'
  | 'island' | 'historic' | 'park' | 'landmark';

export interface POITranslation {
  name: string;
  summary: string;
  facts: string[];
}

export interface POI {
  id: string;
  name: string;
  category: POICategory;
  lat: number;
  lon: number;
  elevation?: number;
  population?: number;
  wikiTitle?: string;
  summary: string;        // 300-500 word adapted text
  facts: string[];        // 3-5 wow facts
  photos: string[];       // URLs
  closestApproachKm?: number;
  translations?: {
    ru?: POITranslation;
    de?: POITranslation;
    fr?: POITranslation;
    es?: POITranslation;
    ja?: POITranslation;
  };
}
