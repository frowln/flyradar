import type { POI } from '@skyatlas/shared';

/**
 * Satellite views shipped with the browser build (scripts/content/satellite.mjs):
 * Copernicus Sentinel-2, a window around each place on the demo routes.
 * They become the first photo of a place's gallery, before any photograph
 * fetched from Wikimedia, because a passenger sees the place from above.
 */

interface Entry {
  /** Date the scene was taken. */
  d: string;
  /** Width of ground shown, km. */
  w: number;
}

const BASE = typeof location === 'undefined' ? '' : location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
let index: Record<string, Entry> = {};
const loading: Promise<void> =
  typeof fetch === 'undefined'
    ? Promise.resolve()
    : fetch(`${BASE}sat/index.json`)
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, Entry>>) : {}))
        .then((data) => {
          index = data;
        })
        .catch(() => {});

export function aerialReady(): Promise<void> {
  return loading;
}

export function withAerial(pois: POI[]): POI[] {
  return pois.map((poi) => {
    const key = poi.wikidata ?? poi.id;
    const e = index[key];
    if (!e || poi.aerial) return poi;
    const credits = poi.photoCredits ?? (poi.photoCredit ? [poi.photoCredit] : []);
    return {
      ...poi,
      aerial: { date: e.d, widthKm: e.w },
      photos: [`${BASE}sat/${key}.jpg`, ...poi.photos],
      photoCredits: [`Copernicus Sentinel-2 · ${e.d}`, ...credits.slice(0, poi.photos.length)],
      photoCredit: poi.photoCredit ?? `Copernicus Sentinel-2 · ${e.d}`
    };
  });
}
