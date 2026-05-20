import type { POI, RoutePoint, POICategory } from '@skyatlas/shared';
import { searchAround } from '../external/geonames.js';
import { fetchWikiSummary } from '../external/wikipedia.js';

const CATEGORY_MAP: Record<string, POICategory> = {
  // Only major populated places — admin seats, capitals
  PPLA: 'city', PPLA2: 'city', PPLC: 'city',
  // Natural prominent
  MT: 'mountain', MTS: 'mountain', PK: 'mountain',
  LK: 'lake', LKS: 'lake',
  RIVR: 'river', RIV: 'river',
  SEA: 'sea', OCN: 'sea',
  VLC: 'volcano',
  ISL: 'island', ISLS: 'island',
  // Historic/cultural
  MNMT: 'historic', CSTL: 'historic', RUIN: 'historic',
  PRK: 'park'
};

const MIN_CITY_POPULATION = 50000;

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
  { name: 'Volga River', category: 'river', lat: 56.0000, lon: 47.0000, summary: "Europe's longest river at 3,531 km, flowing through Russia from the Valdai Hills to the Caspian Sea.", facts: ['Drains an area larger than India.', 'Home to 70+ fish species including the beluga sturgeon.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Volga_river_in_Volgograd_oblast_2.jpg/640px-Volga_river_in_Volgograd_oblast_2.jpg'] },
  // === Major cities ===
  { name: 'New York City', category: 'city', lat: 40.7128, lon: -74.0060, population: 8336000, summary: "The largest city in the United States, an iconic global hub for finance, culture, and immigration.", facts: ['Has 472 subway stations — the most in the world.', 'More than 800 languages are spoken here.', 'Times Square sees 360,000 visitors daily.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/NYC_wideangle_south_from_Top_of_the_Rock.jpg/640px-NYC_wideangle_south_from_Top_of_the_Rock.jpg'] },
  { name: 'Los Angeles', category: 'city', lat: 34.0522, lon: -118.2437, population: 3979000, summary: 'The entertainment capital of the world and second-largest US city, sprawling along the Pacific coast.', facts: ['Larger by area than Singapore and Hong Kong combined.', 'Home to 75 active film studios.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/LA_Skyline_Mountains2.jpg/640px-LA_Skyline_Mountains2.jpg'] },
  { name: 'Chicago', category: 'city', lat: 41.8781, lon: -87.6298, population: 2716000, summary: 'A major Midwestern city on Lake Michigan, birthplace of the skyscraper and deep-dish pizza.', facts: ['Reversed the flow of its own river in 1900.', 'Has 26 miles of public lakefront.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/2010-03-03_2400x3000_chicago_lakefront_at_night.jpg/640px-2010-03-03_2400x3000_chicago_lakefront_at_night.jpg'] },
  { name: 'Denver', category: 'city', lat: 39.7392, lon: -104.9903, population: 727000, elevation: 1609, summary: 'The Mile-High City — Denver sits exactly 5,280 feet (1 mile) above sea level.', facts: ['Has 300 days of sunshine a year.', 'Lower atmospheric pressure means food cooks differently here.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Denver_skyline.jpg/640px-Denver_skyline.jpg'] },
  { name: 'Moscow', category: 'city', lat: 55.7558, lon: 37.6173, population: 12500000, summary: "Russia's vast capital, a 870-year-old city of golden domes, Soviet architecture, and the Red Square.", facts: ["The Kremlin is the world's largest medieval fortress still in use.", 'Moscow Metro stations are decorated like underground palaces.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Moscow_July_2011-7a.jpg/640px-Moscow_July_2011-7a.jpg'] },
  { name: 'Saint Petersburg', category: 'city', lat: 59.9311, lon: 30.3609, population: 5400000, summary: "Russia's imperial capital from 1713-1918, built on 42 islands across the Neva River delta.", facts: ['Has 342 bridges.', 'During summer "white nights" the sky never gets dark.', 'The Hermitage holds 3 million artworks.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Spb_06-2017_img20_Hermitage_from_Palace_Bridge.jpg/640px-Spb_06-2017_img20_Hermitage_from_Palace_Bridge.jpg'] },
  { name: 'London', category: 'city', lat: 51.5074, lon: -0.1278, population: 8982000, summary: 'The capital of England — 2,000 years of history, Big Ben, the Thames, and the financial heart of Europe.', facts: ['The London Underground opened in 1863 — the worldʼs oldest.', '300 languages spoken daily.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Palace_of_Westminster%2C_London_-_Feb_2007.jpg/640px-Palace_of_Westminster%2C_London_-_Feb_2007.jpg'] },
  { name: 'Paris', category: 'city', lat: 48.8566, lon: 2.3522, population: 2161000, summary: 'The "City of Light" — fashion capital, art mecca, Eiffel Tower, and Seine river.', facts: ['Has 1,803 bakeries.', 'The Eiffel Tower grows 15cm in summer heat.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/640px-Tour_Eiffel_Wikimedia_Commons.jpg'] },
  { name: 'Tokyo', category: 'city', lat: 35.6762, lon: 139.6503, population: 13929000, summary: "The world's most populous metropolitan area — futuristic, neon-lit, and impeccably organized.", facts: ['Has 158 Michelin-starred restaurants — more than any other city.', 'Shibuya Crossing sees 2,500 people cross at every green light.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Skyscrapers_of_Shinjuku_2009_January.jpg/640px-Skyscrapers_of_Shinjuku_2009_January.jpg'] },
  { name: 'Dubai', category: 'city', lat: 25.2048, lon: 55.2708, population: 3380000, summary: "A city in the desert that built itself in 50 years — home of the Burj Khalifa, the world's tallest building.", facts: ['Burj Khalifa is 828m tall — twice the Empire State Building.', '25% of the world\'s construction cranes were once here.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Dubai_at_evening.jpg/640px-Dubai_at_evening.jpg'] },
  { name: 'Singapore', category: 'city', lat: 1.3521, lon: 103.8198, population: 5685000, summary: 'A sovereign city-state in Southeast Asia — wealthy, multicultural, and impossibly clean.', facts: ['Gum is illegal here.', 'Has 4 official languages: English, Mandarin, Malay, Tamil.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Marina_Bay_Sands_in_the_evening_-_20101120.jpg/640px-Marina_Bay_Sands_in_the_evening_-_20101120.jpg'] },
  { name: 'Hong Kong', category: 'city', lat: 22.3193, lon: 114.1694, population: 7500000, summary: "One of Asia's busiest financial centers, dense skyscrapers meeting tropical mountains and harbors.", facts: ['Has more skyscrapers than any other city — 9,000+.', 'Public transport is so good 90% of trips use it.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Hong_Kong_Island_Skyline_2009.jpg/640px-Hong_Kong_Island_Skyline_2009.jpg'] },
  { name: 'Beijing', category: 'city', lat: 39.9042, lon: 116.4074, population: 21540000, summary: 'The 3,000-year-old capital of China, home to the Forbidden City and Tiananmen Square.', facts: ['The Forbidden City has 9,999 rooms.', 'Has the busiest subway system in the world.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Forbidden_City_Beijing_Shenwumen_Gate.JPG/640px-Forbidden_City_Beijing_Shenwumen_Gate.JPG'] },
  { name: 'Istanbul', category: 'city', lat: 41.0082, lon: 28.9784, population: 15460000, summary: 'The only city on two continents — splits Europe and Asia across the Bosphorus.', facts: ['Was the capital of three empires: Roman, Byzantine, Ottoman.', 'Has 3,000+ mosques.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Istanbul_panorama_and_skyline.jpg/640px-Istanbul_panorama_and_skyline.jpg'] },
  { name: 'Rome', category: 'city', lat: 41.9028, lon: 12.4964, population: 2873000, summary: 'The Eternal City — 2,800 years of empire, art, and gelato. Capital of Italy.', facts: ['Has more fountains than any city in the world: 2,000+.', 'Tossing coins in the Trevi nets €1 million/year (donated to charity).'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Vue_aerienne_du_Colisee_a_Rome.jpg/640px-Vue_aerienne_du_Colisee_a_Rome.jpg'] },
  { name: 'Madrid', category: 'city', lat: 40.4168, lon: -3.7038, population: 3266000, summary: "Spain's vibrant capital — Europe's highest capital city at 650m, famous for tapas, museums, and nightlife.", facts: ['Home to the Prado, one of the great art museums of the world.', 'People here eat dinner at 10pm.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Madrid_-_07.jpg/640px-Madrid_-_07.jpg'] },
  { name: 'Berlin', category: 'city', lat: 52.5200, lon: 13.4050, population: 3645000, summary: 'Germany\'s capital — a city defined by the Wall that once divided it, now a hub of art, history, and techno music.', facts: ['Has more bridges than Venice.', '180 museums.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Berlin_-_Reichstag_-_Side_view.jpg/640px-Berlin_-_Reichstag_-_Side_view.jpg'] },
  // === Mountains and natural ===
  { name: 'Andes Mountains', category: 'mountain', lat: -32.6532, lon: -70.0109, elevation: 6961, summary: "The world's longest continental mountain range, stretching 7,000 km along South America's western coast.", facts: ['Aconcagua is the tallest at 6,961m — highest outside Asia.', 'Source of the potato.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Aconcagua_north.jpg/640px-Aconcagua_north.jpg'] },
  { name: 'Rocky Mountains', category: 'mountain', lat: 39.5501, lon: -105.7821, elevation: 4401, summary: 'A 4,800 km mountain range stretching from New Mexico to British Columbia.', facts: ['Highest peak Mount Elbert at 4,401m.', 'Continental Divide runs along the spine.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/RockiesfromCalgary.jpg/640px-RockiesfromCalgary.jpg'] },
  { name: 'Caucasus Mountains', category: 'mountain', lat: 42.4500, lon: 43.6500, elevation: 5642, summary: 'The mountain range between the Black and Caspian Seas, dividing Europe and Asia.', facts: ['Mount Elbrus at 5,642m is Europe\'s highest peak.', 'Home to 50+ distinct languages.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Mount_Elbrus.jpg/640px-Mount_Elbrus.jpg'] },
  { name: 'Mediterranean Sea', category: 'sea', lat: 35.0000, lon: 18.0000, summary: 'The sea between Europe, Africa, and Asia — cradle of Western civilization.', facts: ['Connects to the Atlantic via the 14-km Strait of Gibraltar.', '5,000+ Mediterranean islands.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sa_Calobra_R-15.jpg/640px-Sa_Calobra_R-15.jpg'] },
  { name: 'Red Sea', category: 'sea', lat: 22.0000, lon: 38.0000, summary: 'A narrow sea between Africa and the Arabian peninsula, famous for coral reefs and the Suez Canal.', facts: ['One of the saltiest seas — 4.1% salinity.', 'Connects to the Mediterranean via the Suez Canal.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Red_Sea_-_Egypt.jpg/640px-Red_Sea_-_Egypt.jpg'] },
  { name: 'Pyramids of Giza', category: 'historic', lat: 29.9792, lon: 31.1342, summary: 'The Great Pyramid is the only remaining wonder of the ancient world, built 4,500 years ago.', facts: ['Built from 2.3 million limestone blocks.', 'Was the tallest man-made structure for 3,800 years.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg'] },
  { name: 'Great Wall of China', category: 'historic', lat: 40.4319, lon: 116.5704, summary: 'Series of fortifications built across northern China over 2,000+ years. Total length: 21,196 km.', facts: ['NOT actually visible from the Moon (despite the myth).', 'Took 2,000+ years to build.'], photos: ['https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/640px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg'] }
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
  radiusKm = 200,
  locale = 'en'
): Promise<POI[]> {
  if (!process.env['GEONAMES_USER']) {
    return [];  // demo fallback handled below
  }
  const samples = route.filter((_, i) => i % 10 === 0);

  // Parallel GeoNames calls
  const geoResults = await Promise.all(
    samples.map((p) => searchAround(p.lat, p.lon, radiusKm, FEATURE_CODES))
  );

  // Dedupe + filter
  const seen = new Set<number>();
  const candidates: Array<{ entry: typeof geoResults[0][0]; category: POICategory }> = [];
  for (const found of geoResults) {
    for (const f of found) {
      if (seen.has(f.geonameId)) continue;
      seen.add(f.geonameId);
      const category = CATEGORY_MAP[f.fcode];
      if (!category) continue;
      if (category === 'city' && (f.population ?? 0) < MIN_CITY_POPULATION) continue;
      candidates.push({ entry: f, category });
    }
  }

  // Limit to top 30 candidates to bound Wikipedia load
  const top = candidates.slice(0, 30);

  // Parallel Wikipedia fetches — try locale first, fall back to English
  const wikis = await Promise.all(
    top.map(async (c) => {
      if (locale !== 'en') {
        const localized = await fetchWikiSummary(c.entry.name, locale);
        if (localized?.extract) return localized;
      }
      return fetchWikiSummary(c.entry.name, 'en');
    })
  );

  const pois: POI[] = [];
  for (let i = 0; i < top.length; i++) {
    const { entry: f, category } = top[i];
    const wiki = wikis[i];
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

  // Use demo POIs only when GeoNames was not configured (no key) AND aggregation returned nothing
  if (pois.length === 0 && !process.env['GEONAMES_USER']) {
    return generateDemoPOIs(route);
  }
  return pois;
}
