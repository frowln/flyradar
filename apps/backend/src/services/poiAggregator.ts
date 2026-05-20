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

// Hardcoded famous POIs worldwide for demo mode
const DEMO_POIS: Omit<POI, 'id'>[] = [
  { name: 'Mount Everest', category: 'mountain', lat: 27.9881, lon: 86.9250, elevation: 8849, summary: 'The highest mountain on Earth, standing at 8,849 meters above sea level on the border between Nepal and Tibet.', facts: ['It grows about 4mm taller every year due to tectonic plates.', 'The summit is technically in the jet stream.', 'Over 300 climbers have died on its slopes.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Mount_Everest_as_seen_from_Drukair2_PLW_edit.jpg/640px-Mount_Everest_as_seen_from_Drukair2_PLW_edit.jpg'] },
  { name: 'Grand Canyon', category: 'landmark', lat: 36.0544, lon: -112.1401, summary: 'A steep-sided canyon carved by the Colorado River in Arizona. 446 km long, up to 29 km wide, and over 1,800m deep.', facts: ['It took 5-6 million years to form.', 'Visible from space.', 'Hosts over 1,737 known plant species.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Grand_Canyon_view_from_Pima_Point_2010.jpg/640px-Grand_Canyon_view_from_Pima_Point_2010.jpg'] },
  { name: 'Lake Baikal', category: 'lake', lat: 53.5587, lon: 108.1650, elevation: 456, summary: "The world's deepest and oldest freshwater lake, holding 20% of Earth's unfrozen freshwater.", facts: ['Depth: 1,642 meters — deeper than 5 Eiffel Towers stacked.', '25-30 million years old.', 'Home to the Baikal seal, found nowhere else on Earth.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/LakeBaikalNW.jpg/640px-LakeBaikalNW.jpg'] },
  { name: 'Mont Blanc', category: 'mountain', lat: 45.8326, lon: 6.8652, elevation: 4810, summary: 'The highest mountain in the Alps and Western Europe at 4,810 meters.', facts: ['First climbed in 1786 by Jacques Balmat and Michel Paccard.', 'Three countries meet near its summit: France, Italy, Switzerland.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Mont_Blanc_oct_2004.JPG/640px-Mont_Blanc_oct_2004.JPG'] },
  { name: 'Sahara Desert', category: 'landmark', lat: 23.4162, lon: 25.6628, summary: 'The largest hot desert on Earth, covering 9.2 million km² across northern Africa — larger than the contiguous USA.', facts: ['Temperature can swing from 50°C day to 0°C night.', 'Was a lush savanna 6,000 years ago.', 'Holds enough sand to bury Europe.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Algeria_5897-Tassili_Wedding.jpg/640px-Algeria_5897-Tassili_Wedding.jpg'] },
  { name: 'Niagara Falls', category: 'landmark', lat: 43.0962, lon: -79.0377, summary: 'Massive waterfalls on the US-Canada border. 168,000 m³ of water plunge over the edge every minute.', facts: ['Formed 12,000 years ago after the last Ice Age.', 'Has been crossed by tightrope walkers since 1859.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/3Falls_Niagara.jpg/640px-3Falls_Niagara.jpg'] },
  { name: 'Mount Fuji', category: 'volcano', lat: 35.3606, lon: 138.7274, elevation: 3776, summary: "Japan's iconic stratovolcano, sacred mountain, and UNESCO World Heritage Site.", facts: ["Last erupted in 1707 — still classified as active.", 'Visible from Tokyo on clear days.', 'Climbed by 300,000 people each year.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/MtFuji_FujiCity.jpg/640px-MtFuji_FujiCity.jpg'] },
  { name: 'Iceland', category: 'island', lat: 64.9631, lon: -19.0208, summary: 'Volcanic island nation in the North Atlantic, famous for glaciers, geysers, and northern lights.', facts: ['Has more volcanoes per square km than anywhere on Earth.', 'Population: ~380,000 — fewer than most cities.', 'No mosquitoes anywhere on the island.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Kirkjufell_north_view_in_summer.jpg/640px-Kirkjufell_north_view_in_summer.jpg'] },
  { name: 'Greenland Ice Sheet', category: 'landmark', lat: 72.0000, lon: -40.0000, summary: "The second-largest ice body on Earth, covering 1.7 million km² of Greenland.", facts: ['Average thickness: 1,500m. Maximum: 3,400m.', 'Contains 8% of all freshwater on Earth.', 'If it melted, sea levels would rise 7.4 meters globally.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Greenland_42.74746W_71.57394N.jpg/640px-Greenland_42.74746W_71.57394N.jpg'] },
  { name: 'Caspian Sea', category: 'sea', lat: 41.6555, lon: 50.6629, summary: "The world's largest enclosed inland body of water — technically a lake by some definitions.", facts: ['Larger than Germany.', "90% of the world's caviar comes from here.", 'Below sea level — surface is at -28m.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/MapNorthCaspian.png/640px-MapNorthCaspian.png'] },
  { name: 'Black Sea', category: 'sea', lat: 43.4137, lon: 34.2998, summary: 'An inland sea between Europe and Asia, with unique dead deep waters and rich marine life on the surface.', facts: ['Below 200m, the water is anoxic — almost no life.', 'Ancient shipwrecks survive perfectly in its lifeless deep.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/BlackSea-NASA.jpg/640px-BlackSea-NASA.jpg'] },
  { name: 'Ural Mountains', category: 'mountain', lat: 60.0000, lon: 60.0000, summary: 'A 2,500 km mountain range separating Europe from Asia, running from the Arctic Ocean to Kazakhstan.', facts: ['Among the oldest mountains on Earth — formed 250-300 million years ago.', 'Rich in minerals: gold, platinum, gems.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Polar_Urals.jpg/640px-Polar_Urals.jpg'] },
  { name: 'Atlas Mountains', category: 'mountain', lat: 31.0500, lon: -7.9100, summary: 'A 2,500km mountain range across Morocco, Algeria, and Tunisia. Home to the Berber people for millennia.', facts: ['Highest peak: Toubkal at 4,167m.', 'Source of the name "Atlas" — from Greek myth.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Atlas_Mountains_GD.jpg/640px-Atlas_Mountains_GD.jpg'] },
  { name: 'Bosphorus Strait', category: 'river', lat: 41.1167, lon: 29.0667, summary: 'The narrow strait that splits Istanbul between Europe and Asia, connecting the Black Sea to the Sea of Marmara.', facts: ['Only 700 meters wide at its narrowest.', 'Over 48,000 ships pass through annually.', 'Two intercontinental bridges span it.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Bosphorus_aerial_view.jpg/640px-Bosphorus_aerial_view.jpg'] },
  { name: 'Volga River', category: 'river', lat: 56.0000, lon: 47.0000, summary: "Europe's longest river at 3,531 km, flowing through Russia from the Valdai Hills to the Caspian Sea.", facts: ['Drains an area larger than India.', 'Home to 70+ fish species including the beluga sturgeon.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Volga_river_in_Volgograd_oblast_2.jpg/640px-Volga_river_in_Volgograd_oblast_2.jpg'] }
];

const DEG = Math.PI / 180;

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dφ = (lat2 - lat1) * DEG;
  const dλ = (lon2 - lon1) * DEG;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dλ / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function generateDemoPOIs(route: RoutePoint[], radiusKm = 600): POI[] {
  const found: POI[] = [];
  const seen = new Set<string>();
  for (const point of route.filter((_, i) => i % 5 === 0)) {
    for (const dpoi of DEMO_POIS) {
      const d = distKm(point.lat, point.lon, dpoi.lat, dpoi.lon);
      if (d <= radiusKm && !seen.has(dpoi.name)) {
        seen.add(dpoi.name);
        found.push({ ...dpoi, id: `demo-${dpoi.name.replace(/\s+/g, '-').toLowerCase()}` } as POI);
      }
    }
  }
  return found.slice(0, 20);
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
    // Skip GeoNames API call if no credentials configured
    if (!process.env['GEONAMES_USER']) break;

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

  // Fall back to demo POIs when no credentials or aggregation returned nothing
  if (pois.length === 0 && !process.env['GEONAMES_USER']) {
    return generateDemoPOIs(route);
  }

  return pois;
}
