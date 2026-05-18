import type { POI, RoutePoint, POICategory } from '@skyatlas/shared';
import { searchAround } from '../external/geonames.js';
import { fetchWikiSummary } from '../external/wikipedia.js';

const CATEGORY_MAP: Record<string, POICategory> = {
  PPL: 'city', PPLA: 'city', PPLA2: 'city', PPLC: 'city',
  MT: 'mountain', MTS: 'mountain', PK: 'mountain',
  LK: 'lake', LKS: 'lake',
  RIVR: 'river', RIV: 'river',
  SEA: 'sea', OCN: 'sea',
  VLC: 'volcano',
  ISL: 'island', ISLS: 'island',
  MNMT: 'historic', CSTL: 'historic', RUIN: 'historic',
  PRK: 'park'
};

const FEATURE_CODES = Object.keys(CATEGORY_MAP);

function extractFacts(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
  return sentences.slice(0, 3);
}

export async function aggregatePOIsForRoute(
  route: RoutePoint[],
  radiusKm = 200
): Promise<POI[]> {
  // Sample every 10th point to reduce API calls
  const samples = route.filter((_, i) => i % 10 === 0);
  const seen = new Set<number>();
  const pois: POI[] = [];

  for (const point of samples) {
    const found = await searchAround(point.lat, point.lon, radiusKm, FEATURE_CODES);

    for (const f of found) {
      if (seen.has(f.geonameId)) continue;
      seen.add(f.geonameId);

      const category = CATEGORY_MAP[f.fcode];
      if (!category) continue;

      const wiki = await fetchWikiSummary(f.name);
      if (!wiki?.extract) continue;

      pois.push({
        id: `gn-${f.geonameId}`,
        name: f.name,
        category,
        lat: parseFloat(f.lat),
        lon: parseFloat(f.lng),
        elevation: f.elevation,
        population: f.population,
        wikiTitle: f.name,
        summary: wiki.extract.slice(0, 800),
        facts: extractFacts(wiki.extract),
        photos: wiki.thumbnail ? [wiki.thumbnail] : []
      });
    }
  }

  return pois;
}
