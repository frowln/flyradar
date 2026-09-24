#!/usr/bin/env node
/**
 * Builds assets/data/places.json (PlacesFile) and assets/data/areas.json
 * (AreasFile) from Natural Earth 1:10m layers (public domain):
 *
 *   populated_places                  → city (+ research stations as landmark)   ne-pp-
 *   geography_regions_elevation_points → mountain / volcano (+ passes, depressions) ne-pk-
 *   geography_regions_polys / _points → range, desert, plateau, peninsula,
 *                                        island, region, landmark …               ne-rg-
 *   geography_marine_polys            → sea (oceans, seas, gulfs, straits …)      ne-mr-
 *   lakes                             → lake                                       ne-lk-
 *   rivers_lake_centerlines (.shp)    → river (label + extent only, no outline)   ne-rv-
 *   glaciated_areas (named)           → glacier                                    ne-gl-
 *
 * Every place with `bb` except rivers has its simplified outline in areas.json.
 * Importance `r` is documented in README.md ("Importance"). Requires
 * countries.json (for `cc`), so run build-countries.mjs first.
 *
 * Run: node scripts/data/build-places.mjs [--refresh]
 */
import {
  CountryLocator,
  bbox,
  bboxAntimeridianSafe,
  clamp,
  cleanName,
  eachCoord,
  extentKm,
  fold,
  haversineKm,
  lineLengthKm,
  lineMidpoint,
  loadNEGeoJSON,
  loadNEShapefile,
  localNames,
  multiPolygonAreaKm2,
  neCityNames,
  openRing,
  pointInBBox,
  pointInMultiPolygon,
  polygonAreaKm2,
  polylabel,
  ringAreaKm2,
  round,
  simplifyMultiPolygon,
  slug,
  today,
  toMultiPolygon,
  wikidataId,
  writeOutput,
} from './lib.mjs';

// ---------------------------------------------------------------------------
// Importance (see README "Importance")
// ---------------------------------------------------------------------------

/** Natural Earth rank → 1..10. scalerank 0 is the most important; labelled at world zoom (≤2) adds 1. */
const rankScore = (scalerank, minLabel) => clamp(9 - (scalerank ?? 9) + (minLabel != null && minLabel <= 2 ? 1 : 0), 1, 10);
const cityRankScore = (scalerank) => clamp(10 - (scalerank ?? 10), 1, 10);
const popScore = (pop) =>
  pop >= 15e6 ? 9 : pop >= 7e6 ? 8 : pop >= 3e6 ? 7 : pop >= 1e6 ? 6 : pop >= 5e5 ? 5 : pop >= 2.5e5 ? 4 : pop >= 1e5 ? 3 : pop >= 3e4 ? 2 : 1;
const elevationScore = (el) =>
  el >= 8000 ? 8 : el >= 7000 ? 7 : el >= 6000 ? 6 : el >= 5000 ? 5 : el >= 4000 ? 4 : el >= 3000 ? 3 : el >= 1500 ? 2 : 1;
const areaScore = (km2) => clamp(Math.round(1.2 * Math.log10(Math.max(km2, 1)) - 0.6), 1, 9);
const lengthScore = (km) => clamp(Math.round(2 * Math.log10(Math.max(km, 1)) - 1), 1, 8);
/** Extent-based features: the NE rank may lift r at most 3 above what their size says. */
const sizedScore = (q, m) => clamp(Math.min(Math.max(q, m), m + 3), 1, 10);

/** World-famous features Natural Earth's ranks underrate: r = 10. [kind, folded English name] */
const FAMOUS = [
  ['mountain', 'mount everest'],
  ['mountain', 'k2'],
  ['mountain', 'mont blanc'],
  ['mountain', 'matterhorn'],
  ['volcano', 'mount kilimanjaro'],
  ['volcano', 'mount fuji'],
  ['volcano', 'mount vesuvius'],
  ['volcano', 'mount etna'],
  ['desert', 'sahara'],
  ['desert', 'gobi desert'],
  ['range', 'alps'],
  ['range', 'himalayas'],
  ['range', 'andes'],
  ['range', 'rocky mountains'],
  ['sea', 'mediterranean sea'],
  ['sea', 'caspian sea'],
  ['lake', 'lake baikal'],
  ['lake', 'dead sea'],
  ['river', 'amazon'],
  ['river', 'nile'],
  ['landmark', 'great barrier reef'],
  ['landmark', 'niagara falls'],
  ['landmark', 'victoria falls'],
  ['landmark', 'iguacu falls'],
  ['landmark', 'grand canyon'],
  ['island', 'greenland'],
];
const FAMOUS_KEYS = new Set(FAMOUS.map(([k, n]) => `${k}:${n}`));

// ---------------------------------------------------------------------------
// Layer mappings
// ---------------------------------------------------------------------------

const RENAME = {
  // 6,934 m at 35.17° N, 77.83° E is Shahi Kangri; Saser Kangri is ~7,670 m.
  'ne-pk-1159105763': { n: 'Shahi Kangri', drop: ['ja'] },
  // Filed as a plateau at 56.6° N, 112° E: the highlands north-east of Baikal,
  // not the range along the Amur watershed.
  'ne-rg-1730072981': { n: 'Stanovoy Highlands', drop: ['es'] }
};

const REGION_KIND = {
  'Range/mtn': 'range',
  Foothills: 'range',
  Desert: 'desert',
  Plateau: 'plateau',
  'Pen/cape': 'peninsula',
  Peninsula: 'peninsula',
  Isthmus: 'peninsula',
  Island: 'island',
  'Island group': 'island',
  Lake: 'lake',
  Gorge: 'landmark',
  Coast: 'region',
  Geoarea: 'region',
  Plain: 'region',
  Delta: 'region',
  Basin: 'region',
  Valley: 'region',
  Lowland: 'region',
  Tundra: 'region',
  Wetlands: 'region',
  Depression: 'region',
  // Continent, Dragons-be-here: skipped
};

const REGION_POINT_KIND = {
  island: 'island',
  'island group': 'island',
  cape: 'landmark',
  waterfall: 'landmark',
  plain: 'region',
  // pole: skipped (the magnetic poles are 2005 estimates and have moved since)
};

/**
 * Natural Earth has no volcano class; these peaks in its elevation layer are
 * volcanoes (plus any name containing "volcano", "volcán", "vulkan", "sopka").
 */
const VOLCANOES = new Set(
  [
    'mount kilimanjaro', 'mount karisimbi', 'mount cameroon', 'pico basile', 'emi koussi', 'mount elgon',
    'mount kenya', 'mount oku', 'pico de sao tome', 'kartala', 'piton des neiges', 'pico do fogo', 'teide',
    'mount erebus', 'mount takahe', 'mount sidley', 'mount fuji', 'sakurajima', 'mount unzen', 'mount iwate',
    'mount kuju', 'asahi dake', 'koryaksky', 'damavand', 'mount sabalan', 'mount taftan', 'mount ararat',
    'erciyes dagi', 'mount aragats', 'baekdu mountain', 'hallasan', 'tambora', 'gunung semeru', 'gunung merapi',
    'gunung cereme', 'krakatoa', 'mount kerinci', 'mount kanlaon', 'pinatubo', 'rinjani', 'mount apo', 'ulawun',
    'mount elbrus', 'mount vesuvius', 'mount etna', 'puy de sancy', 'hvannadalshnukur', 'beerenberg', 'mount pico',
    'mount shasta', 'mount hood', 'mount rainier', 'mount baker', 'mount redoubt', 'mount katmai', 'aniakchak',
    'mount vsevidof', 'mount cleveland', 'colima', 'pico de orizaba', 'popocatepetl', 'mauna kea', 'haleakala',
    'soufriere hills', 'mount pelee', 'la soufriere', 'mount scenery', 'mount misery', 'ojos del salado',
    'nevado del ruiz', 'llullaillaco', 'nevado sajama', 'aucanquilcha', 'coropuna', 'galeras', 'tronador',
    'domuyo', 'mount ruapehu', 'mount taranaki', 'mount balbi', 'mont ross', 'big ben', 'silisili',
  ].map(fold),
);
const VOLCANO_WORD = /\b(volcano|volcan|vulkan|vulcano|sopka)\b/;

/** One-word river names that read as adjectives on their own ("Yellow", "Grande"). */
const GENERIC_RIVER_NAMES = new Set([
  'yellow', 'red', 'white', 'black', 'blue', 'green', 'snake', 'peace', 'slave', 'orange', 'grande', 'negro',
  'salt', 'big', 'little', 'pearl', 'milk', 'powder', 'wind', 'tongue', 'xi', 'nu', 'za', 'madison',
]);

// ---------------------------------------------------------------------------
// Outline simplification per layer (tuned to the areas.json budget)
// ---------------------------------------------------------------------------

/** Tolerance = feature size (deg) / DETAIL, clamped. Higher DETAIL = more vertices. */
const DETAIL = { rg: 200, mr: 200, lk: 120, gl: 60 };
const MIN_TOL = 0.01;
const MAX_TOL = 0.1;

function outlineFor(mp, layer, sizeKm) {
  const sizeDeg = (sizeKm * 2) / 111;
  const tolerance = clamp(sizeDeg / DETAIL[layer], MIN_TOL, MAX_TOL);
  const total = multiPolygonAreaKm2(mp);
  const largest = Math.max(...mp.map((p) => ringAreaKm2(openRing(p[0]))));
  // Drop islets / holes that are negligible at the feature's scale.
  const minOuter = Math.min(largest, Math.max(3, total * 0.002));
  const minHole = Math.max(15, total * 0.01);
  return simplifyMultiPolygon(mp, {
    tolerance,
    decimals: 2,
    fineTolerance: 0.002,
    keepRing: (ring, isOuter) => ringAreaKm2(ring) >= (isOuter ? minOuter : minHole),
  });
}

// ---------------------------------------------------------------------------
// Builders per layer. Each returns candidate places with private `_` fields.
// ---------------------------------------------------------------------------

function nameOf(p) {
  const en = cleanName(p.name_en);
  const n = cleanName(p.name);
  let out = en || n;
  if (out && out === out.toUpperCase() && /[A-Z]{3}/.test(out)) {
    out = out.toLowerCase().replace(/(^|[\s\-(’'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }
  // "horn of Africa" → "Horn of Africa"
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

function cities(countryNames) {
  const out = [];
  for (const { properties: p, geometry } of loadNEGeoJSON('ne_10m_populated_places')) {
    const cls = p.featurecla;
    const station = /Scientific station|Meteorological Station/.test(cls);
    const historic = cls === 'Historic place';
    const capital = /^Admin-0 capital/.test(cls) || p.adm0cap === 1;
    const pop = p.pop_max > 0 ? p.pop_max : 0;
    if (!station && !historic && !(pop >= 100_000 || capital || p.scalerank <= 7)) continue;
    const [lon, lat] = geometry.coordinates;
    const names = neCityNames(p, countryNames);
    const kind = station || historic ? 'landmark' : 'city';
    const q = cityRankScore(p.scalerank);
    let r = kind === 'city' ? Math.max(q, popScore(pop)) : clamp(q - 1, 1, 10);
    if (capital) r = Math.max(r, 6);
    out.push({
      id: `ne-pp-${p.ne_id}`,
      k: kind,
      n: names.n,
      l: names.l,
      lat,
      lon,
      r,
      pop: kind === 'city' && pop ? pop : undefined,
      wd: names.wd,
      _iso: p.iso_a2,
      _adm0: p.adm0_a3,
    });
  }
  return out;
}

function peaks() {
  const out = [];
  for (const { properties: p, geometry } of loadNEGeoJSON('ne_10m_geography_regions_elevation_points')) {
    const n = nameOf(p);
    if (!n) continue;
    const cls = p.featurecla;
    let k;
    if (cls === 'mountain' || cls === 'spot elevation') {
      const f = fold(n);
      k = VOLCANOES.has(f) || VOLCANO_WORD.test(f) ? 'volcano' : 'mountain';
    } else if (cls === 'depression') k = 'region';
    else if (cls === 'pass' || cls === 'plateau') k = 'landmark';
    else continue;
    const [lon, lat] = geometry.coordinates;
    const el = Number.isFinite(p.elevation) ? Math.round(p.elevation) : undefined;
    const q = p.scalerank <= 7 ? rankScore(p.scalerank) : 1;
    const peak = k === 'mountain' || k === 'volcano';
    out.push({
      id: `ne-pk-${p.ne_id}`,
      k,
      n,
      l: localNames(p, n),
      lat,
      lon,
      r: peak && el != null ? Math.max(q, elevationScore(el)) : q,
      el: peak ? el : undefined,
      wd: wikidataId(p.wikidataid),
    });
  }
  return out;
}

/**
 * Merge features of one layer that are the same thing: same key (wikidata id,
 * else name) and within `km` of each other, so two different "Lake George"s
 * stay apart while the pieces of the Pacific or of an ice sheet come together.
 */
function groupFeatures(features, keyOf, km = 300) {
  // `km` may also be a function of the key.
  const groups = new Map();
  for (const f of features) {
    const key = keyOf(f.properties);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const out = [];
  for (const [key, group] of groups) {
    if (group.length === 1) {
      out.push(group);
      continue;
    }
    // Union-find over features whose bboxes, grown by `km`, overlap.
    const reach = typeof km === 'function' ? km(key) : km;
    const boxes = group.map((f) => grow(bbox(f.geometry.coordinates), reach));
    const parent = group.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const lonOverlap = (a[0] <= b[2] && b[0] <= a[2]) || a[0] <= -180 || b[0] <= -180 || a[2] >= 180 || b[2] >= 180;
        if (lonOverlap && a[1] <= b[3] && b[1] <= a[3]) parent[find(i)] = find(j);
      }
    }
    const clusters = new Map();
    group.forEach((f, i) => {
      const root = find(i);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(f);
    });
    out.push(...clusters.values());
  }
  return out;
}

/** Area place from a group of polygon features of one layer. */
function areaPlace(group, { layer, kind, name, idOf, q }) {
  const polygons = group.flatMap((f) => toMultiPolygon(f.geometry));
  if (!polygons.length) return null;
  // The largest feature supplies names and ids.
  const main = group
    .map((f) => ({ f, a: multiPolygonAreaKm2(toMultiPolygon(f.geometry)) }))
    .sort((x, y) => y.a - x.a)[0].f.properties;
  const areaKm2 = multiPolygonAreaKm2(polygons);
  const sizeKm = extentKm(polygons);
  const g = outlineFor(polygons, layer, sizeKm);
  if (!g.length) return null;
  g.sort((a, b) => polygonAreaKm2(b) - polygonAreaKm2(a));
  const sizeDeg = (sizeKm * 2) / 111;
  const [lon, lat] = polylabel(g[0], clamp(sizeDeg / 200, 0.002, 0.2));
  const n = name(main);
  return {
    id: idOf(main),
    k: kind(main),
    n,
    l: localNames(main, n),
    lat,
    lon,
    r: sizedScore(q(main), areaScore(areaKm2)),
    wd: wikidataId(main.wikidataid),
    ext: Math.max(1, Math.round(sizeKm)),
    bb: bboxAntimeridianSafe(g, 2),
    _area: g,
    _areaKm2: areaKm2,
  };
}

function regions() {
  const out = [];
  const features = loadNEGeoJSON('ne_10m_geography_regions_polys').filter((f) => REGION_KIND[f.properties.featurecla]);
  const groups = groupFeatures(features, (p) => `${p.featurecla}:${wikidataId(p.wikidataid) ?? fold(nameOf(p))}`);
  for (const group of groups) {
    const place = areaPlace(group, {
      layer: 'rg',
      // NE files the Iberian Peninsula under Plateau.
      kind: (p) => (/\bPeninsula\b/.test(nameOf(p)) ? 'peninsula' : REGION_KIND[p.featurecla]),
      name: nameOf,
      idOf: (p) => `ne-rg-${p.ne_id}`,
      q: (p) => rankScore(p.scalerank, p.min_label),
    });
    if (place) out.push(place);
  }
  for (const { properties: p, geometry } of loadNEGeoJSON('ne_10m_geography_regions_points')) {
    const k = REGION_POINT_KIND[p.featurecla];
    const n = nameOf(p);
    if (!k || !n) continue;
    const [lon, lat] = geometry.coordinates;
    out.push({
      id: `ne-rg-${p.ne_id}`,
      k,
      n,
      l: localNames(p, n),
      lat,
      lon,
      r: rankScore(p.scalerank, p.min_zoom),
      wd: wikidataId(p.wikidataid),
    });
  }
  return out;
}

function marine() {
  const features = loadNEGeoJSON('ne_10m_geography_marine_polys').filter((f) => nameOf(f.properties));
  const groups = groupFeatures(features, (p) => wikidataId(p.wikidataid) ?? fold(nameOf(p)));
  const out = [];
  for (const group of groups) {
    const place = areaPlace(group, {
      layer: 'mr',
      kind: (p) => (p.featurecla === 'reef' ? 'landmark' : 'sea'),
      name: nameOf,
      idOf: (p) => `ne-mr-${p.ne_id}`,
      q: (p) => rankScore(p.scalerank, p.min_label),
    });
    if (!place) continue;
    place._marineRiver = group[0].properties.featurecla === 'river';
    out.push(place);
  }
  return out;
}

const LAKE_WORD = /\b(lake|lago|lac|lagoa|ozero|loch|lough|sea|reservoir|dam|pan|salar|laguna|see|meer|nuur|nur|hu|co)\b/i;

function lakeName(p) {
  const en = cleanName(p.name_en);
  const n = cleanName(p.name);
  // Natural Earth's name_en often drops the "Lake" ("Ladoga" for "Lake Ladoga").
  if (en && LAKE_WORD.test(en)) return en;
  if (n && en && fold(n).includes(fold(en))) return n;
  return en || n;
}

function lakes() {
  const features = loadNEGeoJSON('ne_10m_lakes').filter((f) => cleanName(f.properties.name));
  const groups = groupFeatures(features, (p) => wikidataId(p.wikidataid) ?? fold(p.name));
  const out = [];
  for (const group of groups) {
    const place = areaPlace(group, {
      layer: 'lk',
      kind: () => 'lake',
      name: lakeName,
      idOf: (p) => `ne-lk-${p.ne_id}`,
      q: (p) => rankScore(p.scalerank, p.min_label),
    });
    if (place) out.push(place);
  }
  return out;
}

function glaciers() {
  const features = loadNEGeoJSON('ne_10m_glaciated_areas').filter((f) => cleanName(f.properties.name));
  for (const f of features) f.properties.name = f.properties.name.replace(/Icefiled/, 'Icefield');
  const groups = groupFeatures(features, (p) => fold(p.name));
  const out = [];
  for (const group of groups) {
    const place = areaPlace(group, {
      layer: 'gl',
      kind: () => 'glacier',
      name: (p) => cleanName(p.name),
      idOf: (p) => `ne-gl-${slug(p.name)}`,
      q: (p) => rankScore(p.scalerank),
    });
    if (place) out.push(place);
  }
  return out;
}

function riverName(p) {
  const n = cleanName(p.name);
  if (n && /^R[ií]o /.test(n)) return n;
  const en = cleanName(p.name_en) || n;
  if (en && GENERIC_RIVER_NAMES.has(fold(en))) return `${en} River`;
  return en;
}

function rivers() {
  const features = loadNEShapefile('10m_physical', 'ne_10m_rivers_lake_centerlines').filter(
    (f) => f.properties.featurecla === 'River' && cleanName(f.properties.name) && f.geometry,
  );
  // One wikidata id = one river (segments can be far apart across lakes);
  // rivers known only by name must be close to be the same river.
  let groups = groupFeatures(
    features,
    (p) => wikidataId(p.wikidataid) ?? `name:${fold(p.name)}`,
    (key) => (key.startsWith('name:') ? 50 : 1000),
  );
  // Same English name and touching lines → one river (NE sometimes splits one river across ids).
  const endpoints = (g) =>
    g.flatMap((f) => f.geometry.coordinates.flatMap((line) => [line[0], line[line.length - 1]]));
  const touches = (a, b) => {
    const eb = endpoints(b);
    return endpoints(a).some(([x1, y1]) => eb.some(([x2, y2]) => haversineKm(y1, x1, y2, x2) < 5));
  };
  const merged = [];
  for (const g of groups) {
    const key = fold(riverName(g[0].properties));
    const into = merged.find((m) => m.key === key && touches(m.group, g));
    if (into) into.group.push(...g);
    else merged.push({ key, group: [...g] });
  }
  groups = merged.map((m) => m.group);

  const out = [];
  for (const group of groups) {
    const scalerank = Math.min(...group.map((f) => f.properties.scalerank));
    if (scalerank > 6) continue;
    const parts = group.flatMap((f) => f.geometry.coordinates.map((line) => ({ line, p: f.properties })));
    const lengths = parts.map(({ line }) => lineLengthKm(line));
    const total = lengths.reduce((s, x) => s + x, 0);
    if (total < 30) continue;
    const longest = parts[lengths.indexOf(Math.max(...lengths))];
    const main = longest.p;
    const [lon, lat] = lineMidpoint(longest.line);
    const n = riverName(main);
    const minLabel = Math.min(...group.map((f) => f.properties.min_label ?? 99));
    out.push({
      id: `ne-rv-${main.ne_id}`,
      k: 'river',
      n,
      l: localNames(main, n),
      lat,
      lon,
      r: sizedScore(rankScore(scalerank, minLabel), lengthScore(total)),
      wd: wikidataId(main.wikidataid),
      ext: Math.max(1, Math.round(total / 2)),
      bb: bboxAntimeridianSafe(
        parts.map((x) => x.line),
        2,
      ),
      _line: parts.map((x) => x.line),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Country codes
// ---------------------------------------------------------------------------

function sampleCoords(coords, max = 60) {
  const all = [...eachCoord(coords)];
  if (all.length <= max) return all;
  const step = all.length / max;
  return Array.from({ length: max }, (_, i) => all[Math.floor(i * step)]);
}

/** The country owning ≥ 90 % of the country-outline vertices inside an area's outline. */
function countryInside(place, loc) {
  const counts = new Map();
  let total = 0;
  const [w, s, e, n] = place.bb;
  for (const c of loc.countries) {
    if (c.bb[0] > e || c.bb[2] < w || c.bb[1] > n || c.bb[3] < s) continue;
    for (const [lon, lat] of eachCoord(c.g)) {
      if (!pointInBBox(lon, lat, place.bb) || !pointInMultiPolygon(lon, lat, place._area)) continue;
      counts.set(c.cc, (counts.get(c.cc) || 0) + 1);
      total++;
    }
  }
  if (total < 3) return undefined;
  const [best, k] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return k >= 0.9 * total ? best : undefined;
}

/**
 * Country for a place: point-in-polygon for points. For extents, the label
 * point plus up to 60 outline / line vertices are looked up; a country is
 * assigned when it holds ≥ 90 % of the samples that fall on land and at least
 * half of all samples fall on land (coastline vertices often land just
 * offshore of the simplified country outline). Island groups, outlined by
 * mostly-sea hulls, are matched the other way round (countryInside). Seas get none.
 */
function assignCountry(place, loc, ccFromIso) {
  if (place.k === 'sea') return undefined;
  if (place._area || place._line) {
    const samples = [[place.lon, place.lat], ...sampleCoords(place._area ?? place._line)];
    const counts = new Map();
    let onLand = 0;
    for (const [lon, lat] of samples) {
      const cc = loc.locate(lon, lat);
      if (!cc) continue;
      onLand++;
      counts.set(cc, (counts.get(cc) || 0) + 1);
    }
    if (onLand >= 0.5 * samples.length) {
      const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return n >= 0.9 * onLand ? best : undefined;
    }
    // Island groups are outlined by hulls that are mostly sea: look the other
    // way round, at which countries' outline vertices fall inside the hull.
    return place.k === 'island' && place._area ? countryInside(place, loc) : undefined;
  }
  // Points on a border or coast can fall just outside the ~1 km outlines.
  const near = place.k === 'city' || place.k === 'island' || place.k === 'landmark' ? 15 : 10;
  return loc.locateNear(place.lon, place.lat, near) ?? ccFromIso(place) ?? undefined;
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

const family = (k) => (k === 'volcano' ? 'mountain' : k);

/** Which of two duplicates survives: rivers over estuary polygons, outlines over points, then r, then names. */
function better(a, b) {
  const score = (p) =>
    (p.k === 'river' ? 1000 : 0) + (p._area ? 100 : 0) + p.r * 10 + Object.keys(p.l || {}).length + (p.wd ? 0.5 : 0);
  return score(a) >= score(b) ? [a, b] : [b, a];
}

function absorb(keep, drop) {
  keep.r = Math.max(keep.r, drop.r);
  keep.wd ??= drop.wd;
  keep.l ??= drop.l;
  if (keep.k === 'city') keep.pop ??= drop.pop;
  if (keep.k === 'mountain' || keep.k === 'volcano') keep.el ??= drop.el;
  if (drop.k === 'volcano' && keep.k === 'mountain') keep.k = 'volcano';
  drop._dropped = true;
  if (process.env.DEBUG) console.log(`    merge ${keep.id} ${keep.k} "${keep.n}" <- ${drop.id} ${drop.k} "${drop.n}"`);
}

/** bbox grown by `km` on every side. */
function grow(bb, km) {
  const dLat = km / 111;
  const dLon = dLat / Math.max(0.1, Math.cos((((bb[1] + bb[3]) / 2) * Math.PI) / 180));
  return [bb[0] - dLon, bb[1] - dLat, bb[2] + dLon, bb[3] + dLat];
}

/** Label points within `km`, or one within `km` of the other's bbox (only for extents under `maxExt` km). */
function close(a, b, km, maxExt) {
  return (
    haversineKm(a.lat, a.lon, b.lat, b.lon) <= km ||
    (a.bb && a.ext < maxExt && pointInBBox(b.lon, b.lat, grow(a.bb, km))) ||
    (b.bb && b.ext < maxExt && pointInBBox(a.lon, a.lat, grow(b.bb, km)))
  );
}

function dedupe(places) {
  let merged = 0;
  // 1. Same wikidata id and near each other (NE occasionally links two
  //    different "Mount Olympus" to one item). A city is never merged into a non-city.
  const byWd = new Map();
  for (const p of places) {
    if (!p.wd) continue;
    if (!byWd.has(p.wd)) byWd.set(p.wd, []);
    byWd.get(p.wd).push(p);
  }
  for (const group of byWd.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a._dropped || b._dropped) continue;
        if ((a.k === 'city') !== (b.k === 'city') || !close(a, b, 100, Infinity)) continue;
        const [keep, drop] = better(a, b);
        absorb(keep, drop);
        merged++;
      }
    }
  }
  // 2. Same name, same kind family, close together.
  const byName = new Map();
  for (const p of places) {
    if (p._dropped) continue;
    const key = `${family(p.k)}:${fold(p.n)}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a._dropped || b._dropped || !close(a, b, 30, 300)) continue;
        const [keep, drop] = better(a, b);
        absorb(keep, drop);
        merged++;
      }
    }
  }
  // 3. Estuary polygons named after a river we already carry ("Amazon River").
  const riverNames = new Set(places.filter((p) => p.k === 'river' && !p._dropped).map((p) => fold(p.n)));
  for (const p of places) {
    if (p._marineRiver && !p._dropped && riverNames.has(fold(p.n).replace(/ river$/, ''))) {
      p._dropped = true;
      merged++;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------

const KEY_ORDER = ['id', 'k', 'n', 'l', 'lat', 'lon', 'r', 'pop', 'el', 'cc', 'wd', 'ext', 'bb'];

function main() {
  console.log('build-places');
  const loc = CountryLocator.load();
  const knownCodes = new Set(loc.countries.map((c) => c.cc));
  const countryNames = new Set(
    loadNEGeoJSON('ne_10m_admin_0_countries').flatMap((f) => [fold(f.properties.name), fold(f.properties.name_en)]),
  );
  const PSEUDO = { SOL: 'XS', CYN: 'XC', KOS: 'XK' };
  const ccFromIso = (p) => {
    const cc = PSEUDO[p._adm0] ?? p._iso;
    return cc && knownCodes.has(cc) ? cc : undefined;
  };

  const layers = {
    cities: cities(countryNames),
    peaks: peaks(),
    regions: regions(),
    marine: marine(),
    lakes: lakes(),
    rivers: rivers(),
    glaciers: glaciers(),
  };
  for (const [name, list] of Object.entries(layers)) console.log(`  ${name}: ${list.length}`);
  const all = Object.values(layers).flat();

  for (const p of all) {
    if (FAMOUS_KEYS.has(`${p.k}:${fold(p.n)}`)) p.r = 10;
  }
  const missingFamous = FAMOUS.filter(([k, n]) => !all.some((p) => p.k === k && fold(p.n) === n));
  if (missingFamous.length) console.warn(`  FAMOUS entries not found: ${missingFamous.map((x) => x.join(':')).join(', ')}`);

  const merged = dedupe(all);
  console.log(`  merged ${merged} duplicates`);
  const kept = all.filter((p) => !p._dropped);

  // A wikidata id shared by places far apart is a Natural Earth linking error
  // on at least one of them (two "Mount Olympus"); we cannot tell which, so
  // neither keeps it — no article beats the wrong article.
  const byWd = new Map();
  for (const p of kept) if (p.wd) byWd.set(p.wd, [...(byWd.get(p.wd) || []), p]);
  let unlinked = 0;
  for (const group of byWd.values()) {
    if (group.length < 2) continue;
    const far = group.some((a) => group.some((b) => haversineKm(a.lat, a.lon, b.lat, b.lon) > 50));
    if (!far) continue;
    for (const p of group) p.wd = undefined;
    unlinked += group.length;
  }
  if (unlinked) console.log(`  dropped ambiguous wikidata ids from ${unlinked} places`);

  // Natural Earth reuses a few ne_ids for distinct features (two "Cordillera
  // Occidental"): later ones get a numeric suffix, stable for a given input.
  const used = new Set();
  for (const p of kept) {
    let id = p.id;
    for (let i = 2; used.has(id); i++) id = `${p.id}-${i}`;
    p.id = id;
    used.add(id);
  }

  // Natural Earth labels checked by hand and found wrong for the feature at
  // those coordinates (content/places/* writers flagged them).
  for (const p of kept) {
    const fix = RENAME[p.id];
    if (!fix) continue;
    p.n = fix.n;
    p.l = { ...(p.l || {}), ...fix.l };
    for (const lang of fix.drop ?? []) delete p.l[lang];
  }

  const areas = {};
  const places = [];
  for (const p of kept) {
    p.cc = assignCountry(p, loc, ccFromIso);
    p.lat = round(p.lat, 3);
    p.lon = round(p.lon, 3);
    if (p._area) areas[p.id] = p._area;
    const out = {};
    for (const key of KEY_ORDER) if (p[key] !== undefined) out[key] = p[key];
    places.push(out);
  }
  places.sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));

  const ids = new Set();
  for (const p of places) {
    if (ids.has(p.id)) throw new Error(`duplicate id ${p.id}`);
    ids.add(p.id);
  }

  writeOutput('places.json', {
    version: 1,
    source: `Natural Earth 1:10m (public domain): populated places, geography regions, elevation points, marine areas, lakes, rivers, glaciated areas; built ${today()}`,
    places,
  });
  writeOutput('areas.json', { version: 1, areas });

  const byKind = {};
  for (const p of places) byKind[p.k] = (byKind[p.k] || 0) + 1;
  console.log(`  ${places.length} places, ${Object.keys(areas).length} outlines`, byKind);
}

main();
