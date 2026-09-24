#!/usr/bin/env node
/**
 * Builds assets/data/countries.json (CountriesFile) from Natural Earth
 * 1:10m Admin 0 – Countries (public domain).
 *
 * One entry per ISO 3166-1 alpha-2 code: Natural Earth features that share a
 * code are merged (Baikonur → KZ, Brazilian Island → BR, …), parts with their
 * own ISO code are split off (SPLITS: French overseas departments, Caribbean
 * Netherlands, Christmas / Cocos Islands) and unrecognised or disputed areas get
 * pseudo-codes (CODE_OVERRIDES). Disputed areas are shown as regions of their
 * own, without attributing them to a state (DISPUTED, see README "Disputed
 * areas"). Outlines are Douglas–Peucker simplified and rounded to 2 decimals
 * (~1 km), 3 for countries under 30 000 km²; rings that would still collapse
 * (the Vatican, atolls) keep up to 2 more decimals.
 *
 * Run: node scripts/data/build-countries.mjs [--refresh]
 */
import {
  bbox,
  bboxAntimeridianSafe,
  cleanName,
  countCoords,
  localNames,
  loadNEGeoJSON,
  multiPolygonAreaKm2,
  openRing,
  pointInBBox,
  pointInMultiPolygon,
  polylabel,
  ringAreaKm2,
  simplifyMultiPolygon,
  toMultiPolygon,
  writeOutput,
  today,
} from './lib.mjs';

/**
 * Natural Earth ADM0_A3 → code for features whose ISO_A2 is missing ("-99"),
 * non-standard ("CN-TW") or better expressed differently. X* codes are from the
 * ISO user-assigned range and are stable pseudo-codes for unrecognised or
 * disputed areas; "XK" is the de-facto code for Kosovo.
 */
const CODE_OVERRIDES = {
  KOS: 'XK', // Kosovo
  CYN: 'XC', // Northern Cyprus
  SOL: 'XS', // Somaliland
  ESB: 'XD', // Dhekelia  } UK Sovereign Base Areas on Cyprus,
  WSB: 'XD', // Akrotiri  } merged as "Akrotiri and Dhekelia"
  CNM: 'CY', // UN buffer zone, de jure Republic of Cyprus
  USG: 'CU', // Guantanamo Bay naval base, leased, de jure Cuba
  KAB: 'KZ', // Baikonur, leased, de jure Kazakhstan
  BRI: 'BR', // Brazilian Island (disputed with Uruguay), administered by Brazil
  CSI: 'AU', // Coral Sea Islands
  ATC: 'AU', // Ashmore and Cartier Islands
  CLP: 'CP', // Clipperton Island (ISO exceptionally reserved "CP")
  KAS: 'XG', // Siachen Glacier (disputed India / Pakistan)
  SPI: 'XP', // Southern Patagonian Ice Field (disputed Argentina / Chile)
  BRT: 'XT', // Bir Tawil (terra nullius)
  PGA: 'XU', // Spratly Islands (disputed)
  SCR: 'XB', // Scarborough Reef (disputed)
  BJN: 'XN', // Bajo Nuevo Bank (disputed)
  SER: 'XE', // Serranilla Bank (disputed)
};

/**
 * Parts of a Natural Earth feature that have their own ISO 3166-1 code, picked
 * by the box [minLon, minLat, maxLon, maxLat] their polygons fall in. Airports
 * there carry these codes (OurAirports uses ISO), so the outlines must too.
 */
const SPLITS = {
  FRA: [
    { cc: 'GF', box: [-55, 1.5, -51, 6.5] },
    { cc: 'GP', box: [-61.9, 15.8, -60.9, 16.6] },
    { cc: 'MQ', box: [-61.3, 14.3, -60.7, 14.95] },
    { cc: 'RE', box: [55, -21.5, 56, -20.8] },
    { cc: 'YT', box: [44.9, -13.1, 45.4, -12.5] },
  ],
  NLD: [
    { cc: 'BQ', box: [-68.5, 11.9, -68.1, 12.4] }, // Bonaire
    { cc: 'BQ', box: [-63.1, 17.4, -62.9, 17.55] }, // Sint Eustatius
    { cc: 'BQ', box: [-63.3, 17.6, -63.2, 17.7] }, // Saba
  ],
  IOA: [
    { cc: 'CX', box: [105, -11, 106.5, -10] },
    { cc: 'CC', box: [96, -12.5, 97.5, -11.5] },
  ],
};

/**
 * Disputed areas, shown as regions of their own rather than as part of a state.
 * Natural Earth's default layer draws de facto control; its US point-of-view
 * layer (REFERENCE_LAYER) draws the internationally recognised borders, and the
 * difference between the two is what is disputed:
 *  - Crimea: the default layer's Russian polygons that the reference layer
 *    gives to Ukraine (Crimea is not land-connected to Russia, so it is a
 *    polygon of its own) become "XR" — neither RU nor UA.
 *  - Western Sahara: the default layer has Morocco covering it and "W. Sahara"
 *    as the Polisario-held strip only; both are taken from the reference layer
 *    instead, where Western Sahara ("EH") is the whole territory and Morocco
 *    stops at 27.66°N.
 * Kosovo (XK), Northern Cyprus (XC) and Somaliland (XS) already have their own
 * features in the default layer.
 */
const REFERENCE_LAYER = 'ne_10m_admin_0_countries_usa';
const DISPUTED = {
  carve: [{ cc: 'XR', from: 'RUS', claimedBy: 'UKR' }],
  replaceGeometry: ['MAR', 'SAH'],
};

/** Names for entries that do not map 1:1 to a Natural Earth feature. */
const NAME_OVERRIDES = {
  XR: {
    n: 'Crimea',
    l: { ru: 'Крым', de: 'Krim', fr: 'Crimée', es: 'Crimea', ja: 'クリミア' },
  },
  GF: {
    n: 'French Guiana',
    l: { ru: 'Французская Гвиана', de: 'Französisch-Guayana', fr: 'Guyane', es: 'Guayana Francesa', ja: 'フランス領ギアナ' },
  },
  GP: {
    n: 'Guadeloupe',
    l: { ru: 'Гваделупа', de: 'Guadeloupe', fr: 'Guadeloupe', es: 'Guadalupe', ja: 'グアドループ' },
  },
  MQ: {
    n: 'Martinique',
    l: { ru: 'Мартиника', de: 'Martinique', fr: 'Martinique', es: 'Martinica', ja: 'マルティニーク' },
  },
  RE: {
    n: 'Réunion',
    l: { ru: 'Реюньон', de: 'Réunion', fr: 'La Réunion', es: 'Reunión', ja: 'レユニオン' },
  },
  YT: {
    n: 'Mayotte',
    l: { ru: 'Майотта', de: 'Mayotte', fr: 'Mayotte', es: 'Mayotte', ja: 'マヨット' },
  },
  BQ: {
    n: 'Caribbean Netherlands',
    l: {
      ru: 'Карибские Нидерланды',
      de: 'Karibische Niederlande',
      fr: 'Pays-Bas caribéens',
      es: 'Caribe Neerlandés',
      ja: 'カリブ・オランダ',
    },
  },
  XD: {
    n: 'Akrotiri and Dhekelia',
    l: {
      ru: 'Акротири и Декелия',
      de: 'Akrotiri und Dekelia',
      fr: 'Akrotiri et Dhekelia',
      es: 'Acrotiri y Dhekelia',
      ja: 'アクロティリおよびデケリア',
    },
  },
  CX: {
    n: 'Christmas Island',
    l: { ru: 'Остров Рождества', de: 'Weihnachtsinsel', fr: 'Île Christmas', es: 'Isla de Navidad', ja: 'クリスマス島' },
  },
  CC: {
    n: 'Cocos (Keeling) Islands',
    l: { ru: 'Кокосовые острова', de: 'Kokosinseln', fr: 'Îles Cocos', es: 'Islas Cocos', ja: 'ココス諸島' },
  },
};

/** Continent for Natural Earth's "Seven seas (open ocean)" features, by ISO code. */
const CONTINENT_OVERRIDES = {
  XR: 'Europe',
  MV: 'Asia',
  HM: 'Oceania',
  CX: 'Oceania',
  CC: 'Oceania',
  GF: 'South America',
  GP: 'North America',
  MQ: 'North America',
  BQ: 'North America',
  RE: 'Africa',
  YT: 'Africa',
};

/** Countries this small keep every islet; larger ones drop islets below MIN_ISLET_KM2. */
const SMALL_COUNTRY_KM2 = 50_000;
const MIN_ISLET_KM2 = 20;

function codeFor(p) {
  if (CODE_OVERRIDES[p.adm0_a3]) return CODE_OVERRIDES[p.adm0_a3];
  if (/^[A-Z]{2}$/.test(p.iso_a2)) return p.iso_a2;
  if (/^[A-Z]{2}$/.test(p.iso_a2_eh)) return p.iso_a2_eh;
  throw new Error(`no ISO code for ${p.name} (${p.adm0_a3}); add it to CODE_OVERRIDES`);
}

function continentFor(p, cc) {
  if (CONTINENT_OVERRIDES[cc]) return CONTINENT_OVERRIDES[cc];
  if (!p.continent.startsWith('Seven seas')) return p.continent;
  // Open-ocean islands: fall back to the UN region (South Georgia → South America).
  if (p.region_un === 'Americas') {
    return /South America|Seven seas/.test(p.subregion) ? 'South America' : 'North America';
  }
  return p.region_un;
}

/**
 * Douglas–Peucker tolerance (degrees) and rounding by country size: big
 * countries lose more detail; small ones (Malta, Bahrain, Singapore …) keep
 * 3 decimals so their capitals on the coast stay inside the outline.
 */
function precisionFor(areaKm2) {
  if (areaKm2 > 1_000_000) return { tolerance: 0.03, decimals: 2 };
  if (areaKm2 > 100_000) return { tolerance: 0.018, decimals: 2 };
  if (areaKm2 > 30_000) return { tolerance: 0.01, decimals: 2 };
  return { tolerance: 0.003, decimals: 3 };
}

/** True when the reference layer puts this polygon inside `claimant` (tested at its pole of inaccessibility). */
function claimedBy(poly, claimant) {
  const [w, s, e, n] = bbox(poly[0]);
  const [cw, cs, ce, cn] = bbox(claimant);
  if (w > ce || e < cw || s > cn || n < cs) return false;
  const [lon, lat] = polylabel(poly.map(openRing), 0.01);
  return pointInMultiPolygon(lon, lat, claimant);
}

function main() {
  console.log('build-countries');
  const features = loadNEGeoJSON('ne_10m_admin_0_countries');
  const reference = new Map(loadNEGeoJSON(REFERENCE_LAYER).map((f) => [f.properties.adm0_a3, f]));
  const refGeometry = (a3) => {
    const f = reference.get(a3);
    if (!f) throw new Error(`${REFERENCE_LAYER} has no ${a3}`);
    return f.geometry;
  };

  /** cc → { props (of the main feature), polygons, area } */
  const byCode = new Map();
  const add = (cc, props, polygons) => {
    const area = multiPolygonAreaKm2(polygons);
    const cur = byCode.get(cc);
    if (!cur) {
      byCode.set(cc, { props, polygons: [...polygons], mainArea: area });
      return;
    }
    cur.polygons.push(...polygons);
    // The largest contributing feature supplies names and continent.
    if (area > cur.mainArea) {
      cur.props = props;
      cur.mainArea = area;
    }
  };

  const carved = new Map(DISPUTED.carve.map((c) => [c.cc, 0]));
  for (const f of features) {
    const p = f.properties;
    const geometry = DISPUTED.replaceGeometry.includes(p.adm0_a3) ? refGeometry(p.adm0_a3) : f.geometry;
    const polygons = toMultiPolygon(geometry);
    const carve = DISPUTED.carve.filter((c) => c.from === p.adm0_a3);
    const rest = [];
    for (const poly of polygons) {
      const disputed = carve.find((c) => claimedBy(poly, toMultiPolygon(refGeometry(c.claimedBy))));
      if (disputed) {
        add(disputed.cc, p, [poly]);
        carved.set(disputed.cc, carved.get(disputed.cc) + 1);
        continue;
      }
      const [lon, lat] = poly[0][0];
      const split = (SPLITS[p.adm0_a3] || []).find(({ box }) => pointInBBox(lon, lat, box));
      if (split) add(split.cc, p, [poly]);
      else rest.push(poly);
    }
    if (rest.length) add(codeFor(p), p, rest);
  }
  for (const [cc, n] of carved) if (n === 0) throw new Error(`disputed area ${cc}: no polygon found`);

  const countries = [];
  for (const [cc, { props: p, polygons }] of byCode) {
    const totalArea = multiPolygonAreaKm2(polygons);
    const small = totalArea < SMALL_COUNTRY_KM2;
    const { tolerance, decimals } = precisionFor(totalArea);
    const g = simplifyMultiPolygon(polygons, {
      tolerance,
      decimals,
      fineTolerance: 0.001,
      relTolerance: 0.08,
      // Holes are always kept (Italy's holes are the Vatican and San Marino).
      keepRing: (ring, isOuter) => !isOuter || small || ringAreaKm2(openRing(ring)) >= MIN_ISLET_KM2,
    });
    if (!g.length) throw new Error(`${cc}: outline vanished`);
    g.sort((a, b) => multiPolygonAreaKm2([b]) - multiPolygonAreaKm2([a]));

    const override = NAME_OVERRIDES[cc];
    const n = override?.n ?? cleanName(p.name_en) ?? cleanName(p.name);
    const l = override
      ? Object.fromEntries(Object.entries(override.l).filter(([, v]) => v !== n))
      : localNames(p, n);
    const entry = { cc, n };
    if (l && Object.keys(l).length) entry.l = l;
    entry.cont = continentFor(p, cc);
    entry.bb = bboxAntimeridianSafe(g, 2);
    entry.g = g;
    countries.push(entry);
  }
  countries.sort((a, b) => a.cc.localeCompare(b.cc));

  writeOutput('countries.json', {
    version: 1,
    source: `Natural Earth 1:10m Admin 0 Countries (public domain), disputed areas as regions of their own, simplified; built ${today()}`,
    countries,
  });
  const pts = countries.reduce((s, c) => s + countCoords(c.g), 0);
  console.log(`  ${countries.length} countries, ${pts} vertices`);
}

main();
