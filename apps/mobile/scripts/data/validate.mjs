#!/usr/bin/env node
/**
 * Validates assets/data/{airports,places,areas,countries}.json against the
 * contract in src/core/data/types.ts: types, value ranges, unique ids / IATA
 * codes, coordinate bounds, polygon rings of ≥ 3 points, cross-file
 * references, a few known point-in-country facts, and size budgets.
 *
 * Prints counts per kind. Exits 1 on any error.
 *
 * Run: node scripts/data/validate.mjs
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS, OUT_DIR, pointInBBox, pointInMultiPolygon, pointInPolygon } from './lib.mjs';

const BUDGET_BYTES = {
  'airports.json': 1.2 * 1024 * 1024,
  'places.json': 3 * 1024 * 1024,
  'areas.json': 2.5 * 1024 * 1024,
  'countries.json': 2 * 1024 * 1024,
};

const PLACE_KINDS = new Set([
  'city', 'mountain', 'volcano', 'range', 'desert', 'plateau', 'lake', 'river', 'sea', 'island', 'peninsula',
  'glacier', 'region', 'landmark',
]);
const CONTINENTS = new Set(['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']);
const ID_RE = /^ne-(pp|pk|rg|mr|lk|rv|gl)-[a-z0-9-]+$/;

/** [name, lat, lon, expected cc] — must be inside exactly that country. */
const COUNTRY_FACTS = [
  ['central Moscow', 55.7558, 37.6173, 'RU'],
  ['Singapore city', 1.2903, 103.8519, 'SG'],
  ['Valletta', 35.8989, 14.5146, 'MT'],
  ['Manama', 26.2285, 50.586, 'BH'],
  ['Vatican City', 41.9029, 12.4534, 'VA'],
  ['Paris', 48.8566, 2.3522, 'FR'],
  ['New York', 40.7128, -74.006, 'US'],
  ['Cayenne', 4.9224, -52.3135, 'GF'],
  ['Tokyo', 35.6762, 139.6503, 'JP'],
  // Disputed areas are regions of their own (README "Disputed areas").
  ['Simferopol', 44.95, 34.1, 'XR'],
  ['Sevastopol', 44.6, 33.52, 'XR'],
  ['Laayoune', 27.15, -13.2, 'EH'],
  ['Rabat', 33.99, -6.85, 'MA'],
  ['Kyiv', 50.4501, 30.5234, 'UA'],
  ['Kherson', 46.66, 32.61, 'UA'],
  ['Pristina', 42.6629, 21.1655, 'XK'],
  ['north Nicosia', 35.2, 33.36, 'XC'],
  ['Hargeisa', 9.56, 44.06, 'XS'],
];

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

function load(name) {
  const path = join(OUT_DIR, name);
  const size = statSync(path).size;
  const budget = BUDGET_BYTES[name];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`${name}: ${(size / 1024).toFixed(0)} KB (budget ${(budget / 1024).toFixed(0)} KB)`);
  if (size > budget) err(name, `size ${size} B exceeds budget ${budget} B`);
  if (data.version !== 1) err(name, 'version must be 1');
  return data;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '' && v === v.trim();

function checkKeys(file, where, obj, allowed) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(file, `${where}: unexpected key "${k}"`);
}

function checkLatLon(file, where, lat, lon) {
  if (!isNum(lat) || lat < -90 || lat > 90) err(file, `${where}: bad lat ${lat}`);
  if (!isNum(lon) || lon < -180 || lon > 180) err(file, `${where}: bad lon ${lon}`);
}

function checkLocalNames(file, where, l) {
  if (l === undefined) return;
  if (typeof l !== 'object' || l === null || Array.isArray(l) || !Object.keys(l).length) {
    err(file, `${where}: l must be a non-empty object`);
    return;
  }
  for (const [k, v] of Object.entries(l)) {
    if (!LANGS.includes(k)) err(file, `${where}: unknown language "${k}"`);
    if (!isStr(v)) err(file, `${where}: bad ${k} name`);
  }
}

function checkBBox(file, where, bb) {
  if (!Array.isArray(bb) || bb.length !== 4 || !bb.every(isNum)) {
    err(file, `${where}: bb must be 4 numbers`);
    return false;
  }
  const [w, s, e, n] = bb;
  if (w < -180 || e > 180 || s < -90 || n > 90 || w > e || s > n) {
    err(file, `${where}: bb out of range ${JSON.stringify(bb)}`);
    return false;
  }
  return true;
}

/** Returns the number of coordinates, or -1 when malformed. */
function checkMultiPolygon(file, where, mp, bb) {
  if (!Array.isArray(mp) || !mp.length) {
    err(file, `${where}: MultiPolygon must be a non-empty array`);
    return -1;
  }
  let n = 0;
  for (const poly of mp) {
    if (!Array.isArray(poly) || !poly.length) {
      err(file, `${where}: empty polygon`);
      return -1;
    }
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 3) {
        err(file, `${where}: ring with < 3 points`);
        return -1;
      }
      const f = ring[0];
      const l = ring[ring.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) err(file, `${where}: ring repeats its first point`);
      if (new Set(ring.map((p) => `${p[0]},${p[1]}`)).size < 3) err(file, `${where}: ring with < 3 distinct points`);
      for (const p of ring) {
        if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) {
          err(file, `${where}: bad coordinate ${JSON.stringify(p)}`);
          return -1;
        }
        if (p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90) err(file, `${where}: coordinate out of range`);
        if (bb && !pointInBBox(p[0], p[1], bb)) {
          err(file, `${where}: coordinate ${p} outside bb`);
          return -1;
        }
        n++;
      }
    }
  }
  return n;
}

function countBy(list, key) {
  const out = {};
  for (const x of list) out[key(x)] = (out[key(x)] || 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------

function validateCountries() {
  const F = 'countries.json';
  const data = load(F);
  if (!isStr(data.source)) err(F, 'missing source');
  const countries = data.countries;
  const seen = new Set();
  for (const c of countries) {
    const where = c.cc ?? '?';
    checkKeys(F, where, c, ['cc', 'n', 'l', 'cont', 'bb', 'g']);
    if (!/^[A-Z]{2}$/.test(c.cc ?? '')) err(F, `${where}: bad cc`);
    if (seen.has(c.cc)) err(F, `${where}: duplicate cc`);
    seen.add(c.cc);
    if (!isStr(c.n)) err(F, `${where}: bad name`);
    checkLocalNames(F, where, c.l);
    if (!CONTINENTS.has(c.cont)) err(F, `${where}: bad continent "${c.cont}"`);
    const bbOk = checkBBox(F, where, c.bb);
    checkMultiPolygon(F, where, c.g, bbOk ? c.bb : null);
  }
  for (const [name, lat, lon, cc] of COUNTRY_FACTS) {
    const hits = countries.filter((c) => pointInBBox(lon, lat, c.bb) && pointInMultiPolygon(lon, lat, c.g)).map((c) => c.cc);
    if (hits.length !== 1 || hits[0] !== cc) err(F, `${name} should be in ${cc} only, found in [${hits.join(', ')}]`);
  }
  console.log(`  ${countries.length} countries`, countBy(countries, (c) => c.cont));
  return new Set(countries.map((c) => c.cc));
}

function validateAirports(countryCodes) {
  const F = 'airports.json';
  const data = load(F);
  if (!isStr(data.source)) err(F, 'missing source');
  const seen = new Set();
  const tzOk = new Map();
  const unknownCc = new Set();
  for (const a of data.airports) {
    const where = a.i ?? '?';
    checkKeys(F, where, a, ['i', 'c', 'n', 'city', 'cl', 'cc', 'lat', 'lon', 'tz', 's']);
    if (!/^[A-Z]{3}$/.test(a.i ?? '')) err(F, `${where}: bad IATA`);
    if (seen.has(a.i)) err(F, `${where}: duplicate IATA`);
    seen.add(a.i);
    if (a.c !== undefined && !/^[A-Z0-9]{4}$/.test(a.c)) err(F, `${where}: bad ICAO ${a.c}`);
    if (!isStr(a.n)) err(F, `${where}: bad name`);
    if (!isStr(a.city)) err(F, `${where}: bad city`);
    checkLocalNames(F, where, a.cl);
    if (!/^[A-Z]{2}$/.test(a.cc ?? '')) err(F, `${where}: bad cc`);
    else if (!countryCodes.has(a.cc)) unknownCc.add(a.cc);
    checkLatLon(F, where, a.lat, a.lon);
    if (!tzOk.has(a.tz)) {
      let ok = typeof a.tz === 'string' && a.tz.includes('/');
      try {
        new Intl.DateTimeFormat('en', { timeZone: a.tz });
      } catch {
        ok = false;
      }
      tzOk.set(a.tz, ok);
    }
    if (!tzOk.get(a.tz)) err(F, `${where}: invalid time zone ${a.tz}`);
    if (![1, 2, 3].includes(a.s)) err(F, `${where}: bad size ${a.s}`);
  }
  if (unknownCc.size) err(F, `country codes not in countries.json: ${[...unknownCc].join(', ')}`);
  console.log(`  ${data.airports.length} airports`, countBy(data.airports, (a) => `s${a.s}`), `${tzOk.size} time zones`);
}

function validatePlacesAndAreas(countryCodes) {
  const F = 'places.json';
  const A = 'areas.json';
  const data = load(F);
  const areasFile = load(A);
  if (!isStr(data.source)) err(F, 'missing source');
  const areas = areasFile.areas;
  const ids = new Set();
  let outlinePoints = 0;
  for (const p of data.places) {
    const where = p.id ?? '?';
    checkKeys(F, where, p, ['id', 'k', 'n', 'l', 'lat', 'lon', 'r', 'pop', 'el', 'cc', 'wd', 'ext', 'bb']);
    if (!ID_RE.test(p.id ?? '')) err(F, `${where}: bad id`);
    if (ids.has(p.id)) err(F, `${where}: duplicate id`);
    ids.add(p.id);
    if (!PLACE_KINDS.has(p.k)) err(F, `${where}: bad kind ${p.k}`);
    if (!isStr(p.n)) err(F, `${where}: bad name`);
    checkLocalNames(F, where, p.l);
    checkLatLon(F, where, p.lat, p.lon);
    if (!Number.isInteger(p.r) || p.r < 1 || p.r > 10) err(F, `${where}: bad r ${p.r}`);
    if (p.pop !== undefined && (p.k !== 'city' || !Number.isInteger(p.pop) || p.pop <= 0)) err(F, `${where}: bad pop`);
    if (p.el !== undefined && (!['mountain', 'volcano'].includes(p.k) || !Number.isInteger(p.el) || p.el < -500 || p.el > 9000)) {
      err(F, `${where}: bad el ${p.el}`);
    }
    if (p.cc !== undefined && !countryCodes.has(p.cc)) err(F, `${where}: cc ${p.cc} not in countries.json`);
    if (p.wd !== undefined && !/^Q\d+$/.test(p.wd)) err(F, `${where}: bad wd ${p.wd}`);
    if ((p.ext === undefined) !== (p.bb === undefined)) err(F, `${where}: ext and bb go together`);
    if (p.ext !== undefined && (!isNum(p.ext) || p.ext <= 0)) err(F, `${where}: bad ext`);
    if (p.bb !== undefined && checkBBox(F, where, p.bb) && !pointInBBox(p.lon, p.lat, p.bb)) {
      err(F, `${where}: label point outside bb`);
    }
    const outline = areas[p.id];
    if (p.k === 'river') {
      if (outline) err(A, `${where}: rivers carry no outline`);
    } else if (p.bb !== undefined) {
      if (!outline) err(A, `${where}: area place without outline`);
      else {
        const n = checkMultiPolygon(A, where, outline, p.bb);
        if (n > 0) {
          outlinePoints += n;
          if (!outline.some((poly) => pointInPolygon(p.lon, p.lat, poly))) {
            err(F, `${where}: label point not inside its outline`);
          }
        }
      }
    } else if (outline) err(A, `${where}: point place has an outline`);
  }
  for (const id of Object.keys(areas)) if (!ids.has(id)) err(A, `${id}: no such place`);
  console.log(`  ${data.places.length} places`, countBy(data.places, (p) => p.k));
  console.log('  by importance', countBy(data.places, (p) => `r${p.r}`));
  console.log(`  ${Object.keys(areas).length} outlines, ${outlinePoints} vertices`);
}

const countryCodes = validateCountries();
validateAirports(countryCodes);
validatePlacesAndAreas(countryCodes);

for (const w of warnings.slice(0, 50)) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors.slice(0, 100)) console.error(`error: ${e}`);
  if (errors.length > 100) console.error(`… and ${errors.length - 100} more`);
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log('\nall datasets valid');
