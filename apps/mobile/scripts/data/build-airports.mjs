#!/usr/bin/env node
/**
 * Builds assets/data/airports.json (AirportsFile).
 *
 * - Airport list, ICAO/IATA, type, coordinates, municipality: OurAirports
 *   (public domain). Kept: an IATA code, scheduled_service = yes, and type
 *   large_airport (s=3), medium_airport (s=2) or small_airport (s=1).
 * - IANA time zone: mwgg/Airports (MIT), matched by ICAO, then IATA; airports
 *   it does not know take the zone of the nearest airport it does (same
 *   country first).
 * - City name and its translations: the Natural Earth populated place
 *   (public domain) within 40 km whose name matches the municipality (or the
 *   city mwgg gives) on ASCII-folded spelling; exact spellings of cities over
 *   1M people are accepted up to 80 km out (Domodedovo → Moscow, Narita → Tokyo).
 *
 * Requires countries.json (run build-countries.mjs first).
 *
 * Run: node scripts/data/build-airports.mjs [--refresh]
 */
import { readFileSync } from 'node:fs';
import {
  CountryLocator,
  GridIndex,
  MWGG_URL,
  OURAIRPORTS_URL,
  cleanName,
  download,
  fold,
  loadNEGeoJSON,
  neCityAliases,
  neCityNames,
  parseCSV,
  readJSON,
  round,
  similarNames,
  today,
  writeOutput,
} from './lib.mjs';

const SIZE = { large_airport: 3, medium_airport: 2, small_airport: 1 };

/**
 * Disputed areas are regions of their own in countries.json (Crimea XR,
 * Western Sahara EH, Kosovo XK, Northern Cyprus XC, Somaliland XS …); an
 * airport inside one takes its code instead of the state OurAirports assigns
 * (Ercan: CY → XC, Hargeisa: SO → XS), so its stamp matches the map.
 */
const isDisputedRegion = (cc) => cc === 'EH' || /^X[A-Z]$/.test(cc);
const CITY_MATCH_KM = 40;
const BIG_CITY_MATCH_KM = 80;
const BIG_CITY_POP = 1_000_000;

/**
 * Zones renamed in recent tzdata releases → their long-standing names, which
 * every tz database (old Android ICU included) still resolves as links.
 */
const TZ_COMPAT = {
  'Europe/Kyiv': 'Europe/Kiev',
  'America/Nuuk': 'America/Godthab',
  'Pacific/Kanton': 'Pacific/Enderbury',
};

/**
 * Airports the source places in a zone across the border: the clock is the
 * same, but the zone below is read by country (src/core/flight/telemetry.ts).
 */
/**
 * Russian city names the sources lack, for Russian airports (Minvody showed
 * as "Mineralnyye Vody" in a Russian interface).
 */
const RU_CITY = {
  'ARH': 'Архангельск',
  'BQG': 'Богородское',
  'BVJ': 'Бованенково',
  'CSH': 'Соловецкие острова',
  'DEE': 'Южно-Курильск',
  'DPT': 'Депутатский',
  'EKS': 'Шахтёрск',
  'EYK': 'Белоярский',
  'IGT': 'Сунжа',
  'ITU': 'Курильск',
  'KPW': 'Кепервеем',
  'KVM': 'Марково',
  'LDG': 'Лешуконское',
  'MJY': 'Мотыгино',
  'MQJ': 'Хонуу',
  'MRV': 'Минеральные Воды',
  'NZG': 'Нижнеангарск',
  'OGZ': 'Беслан',
  'OVS': 'Советский',
  'PYJ': 'Полярный',
  'SBT': 'Сабетта',
  'SUK': 'Батагай-Алыта',
  'TLY': 'Пластун',
  'VAQ': 'Ванавара',
  'VEO': 'Северо-Енисейский'
};

const TZ_FIX = {
  YXX: 'America/Vancouver', // Abbotsford, BC — listed as Los Angeles
  YAM: 'America/Toronto', // Sault Ste. Marie, ON — listed as Detroit
};

function validTz(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "Paris (Roissy-en-France, Val-d'Oise)" → ["Paris", "Roissy-en-France", "Val-d'Oise"]. */
function municipalityParts(m) {
  const s = cleanName(m);
  if (!s) return [];
  const main = s.replace(/\(.*?\)/g, ' ');
  const inner = [...s.matchAll(/\(([^)]*)\)/g)].map((x) => x[1]);
  const parts = [];
  for (const chunk of [main, ...inner]) {
    for (const p of chunk.split(/[,/]| - /)) {
      const t = cleanName(p);
      if (t) parts.push(t);
    }
  }
  return parts;
}

function main() {
  console.log('build-airports');
  const rows = parseCSV(readFileSync(download(OURAIRPORTS_URL, 'airports.csv'), 'utf8'));
  const mwgg = Object.values(readJSON(download(MWGG_URL, 'mwgg-airports.json')));
  const countries = CountryLocator.load();
  const places = loadNEGeoJSON('ne_10m_populated_places').map((f) => f.properties);
  const countryNames = new Set(
    loadNEGeoJSON('ne_10m_admin_0_countries').flatMap((f) => [fold(f.properties.name), fold(f.properties.name_en)]),
  );

  const mwByIcao = new Map(mwgg.map((a) => [a.icao, a]));
  const mwByIata = new Map(mwgg.filter((a) => a.iata).map((a) => [a.iata, a]));
  const mwIndex = new GridIndex(mwgg.filter((a) => validTz(a.tz)), (a) => [a.lon, a.lat]);

  const placeInfo = new Map(places.map((p) => [p, { aliases: neCityAliases(p), names: neCityNames(p, countryNames) }]));
  const placeIndex = new GridIndex(places, (p) => [p.longitude, p.latitude]);

  const selected = rows.filter(
    (r) => /^[A-Z]{3}$/.test(r.iata_code) && r.scheduled_service === 'yes' && SIZE[r.type],
  );

  // One airport per IATA code: the larger type wins.
  const byIata = new Map();
  for (const r of selected) {
    const cur = byIata.get(r.iata_code);
    if (!cur || SIZE[r.type] > SIZE[cur.type]) byIata.set(r.iata_code, r);
  }

  let tzDirect = 0;
  let tzNearest = 0;
  let cityMatched = 0;
  const airports = [];
  const regionCodes = [];
  for (const r of byIata.values()) {
    const lat = Number(r.latitude_deg);
    const lon = Number(r.longitude_deg);
    const icao = [r.icao_code, r.gps_code, r.ident].find((x) => /^[A-Z]{4}$/.test(x ?? ''));

    // --- time zone
    let mw = (icao && mwByIcao.get(icao)) || mwByIata.get(r.iata_code);
    if (mw && Math.hypot(mw.lat - lat, (mw.lon - lon) * Math.cos((lat * Math.PI) / 180)) > 1) mw = null;
    let tz = mw && validTz(mw.tz) ? mw.tz : null;
    if (tz) tzDirect++;
    else {
      // Nearest known airport, preferably in the same country (zones stop at borders).
      const near = mwIndex.within(lon, lat, 800);
      tz = (near.find(({ item }) => item.country === r.iso_country) ?? near[0] ?? mwIndex.nearest(lon, lat, 5000))?.item.tz ?? null;
      tzNearest++;
    }
    tz = TZ_FIX[r.iata_code] ?? TZ_COMPAT[tz] ?? tz;
    if (!validTz(tz)) throw new Error(`${r.iata_code}: no valid time zone`);

    // --- city: first candidate spelling that matches a nearby Natural Earth place.
    // Exact (folded) spellings beat fuzzy ones; a big city may be matched
    // exactly a bit farther out (Domodedovo → Moscow, Narita → Tokyo).
    const candidates = [...municipalityParts(r.municipality), cleanName(mw?.city)].filter(Boolean);
    const nearby = placeIndex.within(lon, lat, BIG_CITY_MATCH_KM);
    let match = null;
    for (const cand of candidates) {
      const f = fold(cand);
      const exact = nearby.find(
        ({ item, km }) =>
          (km <= CITY_MATCH_KM || item.pop_max >= BIG_CITY_POP) && placeInfo.get(item).aliases.includes(f),
      );
      const hit =
        exact ??
        nearby.find(({ item, km }) => km <= CITY_MATCH_KM && placeInfo.get(item).aliases.some((a) => similarNames(a, f)));
      if (hit) {
        match = hit.item;
        break;
      }
    }
    let city;
    let cl;
    if (match) {
      const info = placeInfo.get(match).names;
      city = info.n;
      cl = info.l;
      cityMatched++;
    } else {
      // No municipality anywhere: "Fakarava Airport" → "Fakarava".
      city =
        candidates[0] ??
        cleanName(r.name).replace(/\s+(International\s+)?(Airport|Airfield|Aerodrome|Airstrip|Air Base)$/i, '');
    }

    const a = { i: r.iata_code };
    if (icao) a.c = icao;
    a.n = cleanName(r.name);
    a.city = city;
    if (RU_CITY[r.iata_code] && !cl?.ru) cl = { ...(cl ?? {}), ru: RU_CITY[r.iata_code] };
    if (cl) a.cl = cl;
    const region = countries.locate(lon, lat);
    a.cc = region && isDisputedRegion(region) ? region : r.iso_country;
    if (a.cc !== r.iso_country) regionCodes.push(`${a.i} ${r.iso_country}→${a.cc}`);
    a.lat = round(lat, 3);
    a.lon = round(lon, 3);
    a.tz = tz;
    a.s = SIZE[r.type];
    airports.push(a);
  }
  airports.sort((x, y) => x.i.localeCompare(y.i));

  writeOutput('airports.json', {
    version: 1,
    source: `OurAirports (public domain), mwgg/Airports time zones (MIT), Natural Earth city names (public domain); built ${today()}`,
    airports,
  });
  const bySize = airports.reduce((m, a) => ({ ...m, [a.s]: (m[a.s] || 0) + 1 }), {});
  console.log(
    `  ${airports.length} airports (s3 ${bySize[3]}, s2 ${bySize[2]}, s1 ${bySize[1]}); ` +
      `tz direct ${tzDirect}, nearest ${tzNearest}; city matched to Natural Earth ${cityMatched}`,
  );
  if (regionCodes.length) console.log(`  in disputed regions: ${regionCodes.join(', ')}`);
}

main();
