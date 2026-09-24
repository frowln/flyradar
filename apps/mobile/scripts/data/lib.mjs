/**
 * Shared helpers for the offline dataset builders (`build-*.mjs`, `validate.mjs`).
 *
 * No npm dependencies on purpose: the scripts run with a bare Node >= 20.
 * Downloads go through `curl` (it honours HTTPS_PROXY and the system CA bundle,
 * which Node's global fetch does not without undici's ProxyAgent) and are cached
 * in `.cache/` next to this file, so re-running a builder is offline and
 * deterministic. Pass `--refresh` to any builder to re-download its inputs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const MOBILE_DIR = resolve(SCRIPT_DIR, '..', '..');
export const CACHE_DIR = join(SCRIPT_DIR, '.cache');
export const OUT_DIR = join(MOBILE_DIR, 'assets', 'data');

/** Upstream locations. Natural Earth is read from its GitHub mirror (the only host reachable from CI). */
export const NE_REF = process.env.NE_REF || 'master';
export const NE_RAW = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_REF}`;
export const OURAIRPORTS_URL =
  'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';
export const MWGG_URL = 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json';

export const LANGS = ['ru', 'de', 'fr', 'es', 'ja'];
export const EARTH_RADIUS_KM = 6371.0088;

const REFRESH = process.argv.includes('--refresh');

// ---------------------------------------------------------------------------
// Download + cache
// ---------------------------------------------------------------------------

/** Download `url` into the cache as `name` (once) and return the local path. */
export function download(url, name) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, name);
  if (!REFRESH && existsSync(path) && statSync(path).size > 0) return path;
  const tmp = `${path}.part`;
  process.stderr.write(`  downloading ${url}\n`);
  execFileSync('curl', ['-sS', '-L', '--fail', '--retry', '3', '--max-time', '600', '-o', tmp, url], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  renameSync(tmp, path);
  return path;
}

export function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Natural Earth layer from the `geojson/` folder, e.g. `ne_10m_lakes`. Property keys are lower-cased. */
export function loadNEGeoJSON(layer) {
  const path = download(`${NE_RAW}/geojson/${layer}.geojson`, `${layer}.geojson`);
  const fc = readJSON(path);
  return fc.features.map((f) => ({ properties: lowerKeys(f.properties), geometry: f.geometry }));
}

/**
 * Natural Earth layer read from the original shapefile (`10m_physical/…shp` + `.dbf`).
 * Used where the GeoJSON export lags behind (rivers: it lacks names in other
 * languages and wikidata ids).
 */
export function loadNEShapefile(folder, layer) {
  const shp = readFileSync(download(`${NE_RAW}/${folder}/${layer}.shp`, `${layer}.shp`));
  const dbf = readFileSync(download(`${NE_RAW}/${folder}/${layer}.dbf`, `${layer}.dbf`));
  const records = parseDbf(dbf);
  const shapes = parseShp(shp);
  if (records.length !== shapes.length) {
    throw new Error(`${layer}: ${records.length} dbf records vs ${shapes.length} shapes`);
  }
  return records.map((properties, i) => ({ properties: lowerKeys(properties), geometry: shapes[i] }));
}

function lowerKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k.toLowerCase()] = v;
  return out;
}

/** dBase III reader (UTF-8 text fields, as Natural Earth ships them). */
export function parseDbf(buf) {
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) {
    fields.push({
      name: buf.toString('latin1', o, o + 11).replace(/\0.*$/s, ''),
      type: String.fromCharCode(buf[o + 11]),
      len: buf[o + 16],
    });
  }
  const rows = [];
  for (let i = 0; i < count; i++) {
    let o = headerLen + i * recordLen;
    if (buf[o] === 0x2a) continue; // deleted
    o += 1;
    const row = {};
    for (const f of fields) {
      const raw = buf.toString('utf8', o, o + f.len).replace(/\0/g, '').trim();
      o += f.len;
      if (f.type === 'N' || f.type === 'F') row[f.name] = raw === '' ? null : Number(raw);
      else row[f.name] = raw === '' ? null : raw;
    }
    rows.push(row);
  }
  return rows;
}

/** ESRI shapefile reader for PolyLine / Polygon records → GeoJSON Multi* geometry. */
export function parseShp(buf) {
  const out = [];
  let o = 100;
  while (o < buf.length) {
    const contentLen = buf.readInt32BE(o + 4) * 2;
    const c = o + 8;
    const type = buf.readInt32LE(c);
    if (type === 0) {
      out.push(null);
    } else if (type === 3 || type === 5) {
      const numParts = buf.readInt32LE(c + 36);
      const numPoints = buf.readInt32LE(c + 40);
      const parts = [];
      for (let i = 0; i < numParts; i++) parts.push(buf.readInt32LE(c + 44 + i * 4));
      const p0 = c + 44 + numParts * 4;
      const lines = [];
      for (let i = 0; i < numParts; i++) {
        const end = i + 1 < numParts ? parts[i + 1] : numPoints;
        const line = [];
        for (let k = parts[i]; k < end; k++) {
          line.push([buf.readDoubleLE(p0 + k * 16), buf.readDoubleLE(p0 + k * 16 + 8)]);
        }
        lines.push(line);
      }
      out.push(
        type === 3
          ? { type: 'MultiLineString', coordinates: lines }
          : { type: 'Polygon', coordinates: lines }, // rings as-is; callers here only need lines
      );
    } else {
      throw new Error(`unsupported shape type ${type}`);
    }
    o = c + contentLen;
  }
  return out;
}

/** RFC 4180 CSV parser (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Where a dataset lives. Scripts refer to them by their logical `.json` name;
 * on disk they are `.skydata`, so Metro ships them as assets read at runtime
 * instead of compiling six megabytes of JSON into the JavaScript bundle.
 */
export function dataPath(name) {
  return join(OUT_DIR, name.replace(/\.json$/, '.skydata'));
}

export function writeOutput(name, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = dataPath(name);
  const text = JSON.stringify(data);
  writeFileSync(path, text);
  console.log(`  wrote ${name}: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
  return path;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Lower-case ASCII fold: "Köln" → "koln", "Frankfurt am Main" → "frankfurt am main". */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'o')
    .replace(/[đ]/g, 'd')
    .replace(/[ł]/g, 'l')
    .replace(/[ı]/g, 'i')
    .replace(/[þ]/g, 'th')
    .toLowerCase()
    .replace(/[’'`ʻ‘]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slug(s) {
  return fold(s).replace(/ /g, '-');
}

export function cleanName(s) {
  if (s == null) return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

const SMALL_WORDS = {
  es: new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en']),
  fr: new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en']),
  de: new Set(['am', 'an', 'der', 'die', 'das', 'des', 'und', 'von'])
};

/**
 * Natural Earth writes some region labels in capitals, as printed on a map
 * ("MONTES STANOVOI", "KASACHISCHE SCHWELLE"); a card shows them as a name.
 * Roman numerals stay as they are.
 */
export function unshout(lang, v) {
  if (!/\p{Lu}{3}/u.test(v) || /\p{Ll}/u.test(v)) return v;
  const small = SMALL_WORDS[lang] ?? new Set();
  return v
    .split(' ')
    .map((word, i) =>
      word
        .split('-')
        .map((part) => {
          if (/^[IVX]+$/.test(part)) return part;
          const lower = part.toLocaleLowerCase(lang);
          if (i > 0 && small.has(lower)) return lower;
          return lower.charAt(0).toLocaleUpperCase(lang) + lower.slice(1);
        })
        .join('-')
    )
    .join(' ');
}

/**
 * `{ru, de, fr, es, ja}` from Natural Earth `name_xx` fields, dropping ones
 * equal to English — in capitals too: "WESTERN PLATEAU" as the German name is
 * the English one.
 */
export function localNames(props, english) {
  const l = {};
  for (const lang of LANGS) {
    // Stress marks (На́нда-Де́ви) are for dictionaries, not for names on a card.
    const raw = cleanName(props[`name_${lang}`]?.normalize('NFD').replace(/\u0301/g, '').normalize('NFC'));
    if (!raw || raw.toLocaleUpperCase('en') === english?.toLocaleUpperCase('en')) continue;
    const v = unshout(lang, raw);
    if (v !== english) l[lang] = v;
  }
  return Object.keys(l).length ? l : undefined;
}

export function wikidataId(v) {
  const s = String(v ?? '').replace(/\s+/g, '');
  return /^Q\d+$/.test(s) ? s : undefined;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Folded-name similarity: equal, whole-word prefix ("frankfurt am main" ~ "frankfurt"), or ≤ 1–2 typos. */
export function similarNames(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && (l.startsWith(`${s} `) || l.endsWith(` ${s}`))) return true;
  const ns = s.replace(/ /g, '');
  const nl = l.replace(/ /g, '');
  if (ns === nl) return true;
  if (ns.length >= 5) return levenshtein(ns, nl) <= (ns.length >= 9 ? 2 : 1);
  return false;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function round(v, decimals) {
  const f = 10 ** decimals;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Geometry. Coordinates are [lon, lat] degrees throughout.
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** GeoJSON Polygon / MultiPolygon → MultiPolygon coordinates (rings still closed). */
export function toMultiPolygon(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/** Drop the repeated closing point of a GeoJSON ring. */
export function openRing(ring) {
  if (ring.length > 1) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Spherical area of a ring in km² (unsigned; same formula as d3-geo / turf). */
export function ringAreaKm2(ring) {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    total += (lon2 - lon1) * RAD * (2 + Math.sin(lat1 * RAD) + Math.sin(lat2 * RAD));
  }
  return Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

export function polygonAreaKm2(poly) {
  if (!poly.length) return 0;
  let a = ringAreaKm2(poly[0]);
  for (let i = 1; i < poly.length; i++) a -= ringAreaKm2(poly[i]);
  return Math.max(0, a);
}

export function multiPolygonAreaKm2(mp) {
  return mp.reduce((s, p) => s + polygonAreaKm2(p), 0);
}

/** Planar signed area in degrees² (for orientation / degeneracy checks). */
export function ringAreaDeg(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Iterate every [lon, lat] of nested coordinate arrays. */
export function* eachCoord(coords) {
  if (typeof coords[0] === 'number') {
    yield coords;
    return;
  }
  for (const c of coords) yield* eachCoord(c);
}

/**
 * Bounding box [minLon, minLat, maxLon, maxLat].
 * Features that straddle the antimeridian get the full longitude span
 * [-180, minLat, 180, maxLat] so a naive `minLon <= lon <= maxLon` test stays
 * conservative (never misses); their real size is reported by `extentKm`.
 */
export function bbox(coords) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of eachCoord(coords)) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Longitude span that accounts for the antimeridian: returns {west, east, width}
 * where west may be > east when the shortest covering interval crosses 180°.
 */
export function lonSpan(coords) {
  const lons = [];
  for (const [lon] of eachCoord(coords)) lons.push(lon);
  if (!lons.length) return { west: 0, east: 0, width: 0, crosses: false };
  lons.sort((a, b) => a - b);
  // Largest gap between consecutive longitudes (circularly) is the part NOT covered.
  let gap = lons[0] + 360 - lons[lons.length - 1];
  let gi = lons.length - 1;
  for (let i = 0; i < lons.length - 1; i++) {
    const g = lons[i + 1] - lons[i];
    if (g > gap) {
      gap = g;
      gi = i;
    }
  }
  const west = lons[(gi + 1) % lons.length];
  const east = lons[gi];
  const width = 360 - gap;
  return { west, east, width, crosses: west > east };
}

export function bboxAntimeridianSafe(coords, decimals = 2) {
  const [minLon, minLat, maxLon, maxLat] = bbox(coords);
  const span = lonSpan(coords);
  const b = span.crosses ? [-180, minLat, 180, maxLat] : [minLon, minLat, maxLon, maxLat];
  // Round outwards so the box still contains the geometry.
  const f = 10 ** decimals;
  return [
    Math.floor(b[0] * f) / f,
    Math.floor(b[1] * f) / f,
    Math.ceil(b[2] * f) / f,
    Math.ceil(b[3] * f) / f,
  ].map((v) => (Object.is(v, -0) ? 0 : v));
}

/** Rough half-size in km: half of the larger bbox side (antimeridian-aware). */
export function extentKm(coords) {
  const [, minLat, , maxLat] = bbox(coords);
  const span = lonSpan(coords);
  const midLat = (minLat + maxLat) / 2;
  const h = (maxLat - minLat) * RAD * EARTH_RADIUS_KM;
  const w = span.width * RAD * EARTH_RADIUS_KM * Math.cos(midLat * RAD);
  return Math.max(h, w) / 2;
}

/** Perpendicular distance² from p to segment ab, planar (degrees). */
function segDist2(p, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Douglas–Peucker on an open polyline (iterative, safe for 100k+ points). */
export function simplifyLine(points, tolerance) {
  const n = points.length;
  if (n <= 2 || tolerance <= 0) return points.slice();
  const tol2 = tolerance * tolerance;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDist2(points[i], points[first], points[last]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Douglas–Peucker on a ring (open form, no repeated closing point). The ring is
 * split at its first vertex and the vertex farthest from it so both halves are
 * simplified as open lines.
 */
export function simplifyRing(ring, tolerance) {
  const r = openRing(ring);
  if (r.length <= 4) return r.slice();
  let far = 0;
  let farD = -1;
  for (let i = 1; i < r.length; i++) {
    const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = simplifyLine(r.slice(0, far + 1), tolerance);
  const b = simplifyLine([...r.slice(far), r[0]], tolerance);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Round a ring's coordinates and remove consecutive duplicates / back-tracks. Returns null if degenerate. */
export function roundRing(ring, decimals) {
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [round(lon, decimals), round(lat, decimals)];
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    // Drop spikes A-B-A.
    const prev = out[out.length - 2];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) {
      out.pop();
      continue;
    }
    out.push(p);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  if (out.length < 3) return null;
  if (Math.abs(ringAreaDeg(out)) < 0.5 * 10 ** (-2 * decimals)) return null;
  return out;
}

/** Ray-casting point-in-ring test (ring open or closed). */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lon, lat, poly) {
  if (!poly.length || !pointInRing(lon, lat, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(lon, lat, poly[i])) return false;
  return true;
}

export function pointInMultiPolygon(lon, lat, mp) {
  for (const poly of mp) if (pointInPolygon(lon, lat, poly)) return true;
  return false;
}

export function pointInBBox(lon, lat, bb) {
  return lon >= bb[0] && lon <= bb[2] && lat >= bb[1] && lat <= bb[3];
}

/** Distance (degrees², planar) from a point to a polygon's outline, signed negative inside. */
function pointToPolygonDist(x, y, poly) {
  let inside = false;
  let minD = Infinity;
  for (const ring of poly) {
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      minD = Math.min(minD, segDist2([x, y], a, b));
    }
  }
  return minD === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minD);
}

/**
 * Pole of inaccessibility (the "polylabel" algorithm by Agafonkin, 2016):
 * a point inside the polygon, as far as possible from its edges. Planar in
 * degrees with longitude scaled by cos(lat) so it is not skewed at high latitudes.
 */
export function polylabel(poly, precisionDeg = 0.01) {
  const [minX0, minY, maxX0, maxY] = bbox(poly[0]);
  const k = Math.max(0.2, Math.cos(((minY + maxY) / 2) * RAD));
  const P = poly.map((r) => r.map(([x, y]) => [x * k, y]));
  const minX = minX0 * k;
  const maxX = maxX0 * k;
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  const fallback = [(minX0 + maxX0) / 2, (minY + maxY) / 2];
  if (cellSize === 0) return fallback;
  let h = cellSize / 2;
  const cell = (x, y, hh) => {
    const d = pointToPolygonDist(x, y, P);
    return { x, y, h: hh, d, max: d + hh * Math.SQRT2 };
  };
  const heap = [];
  const push = (c) => {
    heap.push(c);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].max >= heap[i].max) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].max > heap[m].max) m = l;
        if (r < heap.length && heap[r].max > heap[m].max) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (let x = minX; x < maxX; x += cellSize) for (let y = minY; y < maxY; y += cellSize) push(cell(x + h, y + h, h));
  // Seed with the centroid of the outer ring and the bbox centre.
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  const c = ringCentroid(P[0]);
  if (c) {
    const cc = cell(c[0], c[1], 0);
    if (cc.d > best.d) best = cc;
  }
  const precision = precisionDeg;
  let guard = 0;
  while (heap.length && guard++ < 200000) {
    const cur = pop();
    if (cur.d > best.d) best = cur;
    if (cur.max - best.d <= precision) continue;
    h = cur.h / 2;
    push(cell(cur.x - h, cur.y - h, h));
    push(cell(cur.x + h, cur.y - h, h));
    push(cell(cur.x - h, cur.y + h, h));
    push(cell(cur.x + h, cur.y + h, h));
  }
  if (best.d <= 0) return fallback;
  return [best.x / k, best.y];
}

function ringCentroid(ring) {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const p = ring[i];
    const q = ring[j];
    const f = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * f;
    y += (p[1] + q[1]) * f;
    a += f * 3;
  }
  return a === 0 ? null : [x / a, y / a];
}

/** Length of a polyline in km. */
export function lineLengthKm(line) {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += haversineKm(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]);
  return s;
}

/** Point at half the length of a polyline. */
export function lineMidpoint(line) {
  const total = lineLengthKm(line);
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const d = haversineKm(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]);
    if (acc + d >= total / 2 && d > 0) {
      const t = (total / 2 - acc) / d;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    acc += d;
  }
  return line[Math.floor(line.length / 2)];
}

/**
 * Simplify + round a MultiPolygon for output. Rings that collapse at `decimals`
 * are retried with finer precision when `fineTolerance` is given, otherwise dropped.
 * Holes are simplified with the same tolerance. Returns [] if nothing survives.
 */
export function simplifyMultiPolygon(
  mp,
  { tolerance, decimals = 2, keepRing = () => true, fineTolerance, relTolerance = Infinity },
) {
  // A ring never gets a tolerance above `relTolerance` × its narrower bbox side,
  // so narrow islands (Manhattan) keep their shape inside a coarse country.
  const tolFor = (ring) => {
    if (!Number.isFinite(relTolerance)) return tolerance;
    const [w, s, e, n] = bbox(ring);
    return Math.min(tolerance, Math.max(fineTolerance ?? 0, Math.min(e - w, n - s) * relTolerance));
  };
  const out = [];
  for (const poly of mp) {
    const outer = openRing(poly[0]);
    if (!keepRing(outer, true)) continue;
    const o = simplifyAndRound(outer, tolFor(outer), decimals, fineTolerance);
    if (!o) continue;
    const rings = [o];
    for (let i = 1; i < poly.length; i++) {
      const hole = openRing(poly[i]);
      if (!keepRing(hole, false)) continue;
      const h = simplifyAndRound(hole, tolFor(hole), decimals, fineTolerance);
      if (h) rings.push(h);
    }
    out.push(rings);
  }
  return out;
}

function simplifyAndRound(ring, tolerance, decimals, fineTolerance) {
  const r = roundRing(simplifyRing(ring, tolerance), decimals);
  if (r) return r;
  if (fineTolerance == null) return null;
  // Small ring (islet, enclave, the Vatican): keep it with one or two more
  // decimals (≈100 m / ≈10 m) rather than lose it.
  for (let d = decimals + 1; d <= decimals + 2; d++) {
    const fine = roundRing(simplifyRing(ring, fineTolerance / 10 ** (d - decimals - 1)), d);
    if (fine) return fine;
  }
  return null;
}

/** Count coordinate pairs in nested arrays. */
export function countCoords(coords) {
  let n = 0;
  for (const _ of eachCoord(coords)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Natural Earth populated places
// ---------------------------------------------------------------------------

const ADMIN_WORDS = /\b(governorate|province|county|district|prefecture|region|oblast|municipality|state)\b/i;
const OTHER_LATIN = ['de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'sv', 'tr', 'id', 'vi', 'hu'];

/** All folded spellings Natural Earth knows for a populated place (for matching). */
export function neCityAliases(p) {
  const names = [p.name, p.nameascii, p.name_en, p.ls_name, p.meganame, p.namepar];
  for (const alt of String(p.namealt ?? '').split(/[|,;]/)) names.push(alt);
  for (const lang of OTHER_LATIN) names.push(p[`name_${lang}`]);
  return [...new Set(names.map(fold).filter(Boolean))];
}

/**
 * English label, local names and wikidata id for a populated place.
 *
 * Natural Earth's NAME is the reliable cartographic label; NAME_EN and the
 * name_xx translations come from the linked Wikidata item, which is
 * occasionally the wrong one ("Hail" → "Saudi Arabia", "Celaya" → "Guanajuato").
 * The Wikidata-derived fields are used only when they agree with NAME: either
 * NAME_EN is a close spelling of it, or one of the Latin-script translations is
 * (so "Nürnberg"/"Nuremberg" is trusted through name_de, "Hail"/"Saudi Arabia" is not).
 */
export function neCityNames(p, countryNames = new Set()) {
  const name = cleanName(p.name);
  const base = [p.name, p.nameascii, ...String(p.namealt ?? '').split(/[|,;]/)].map(fold).filter(Boolean);
  const enRaw = cleanName(p.name_en);
  // "Jingmen City" → "Jingmen" when NAME is "Jingmen"; "Mexico City" stays.
  const stripped = enRaw?.replace(/\s+(City|County|Governorate)$/i, '') ?? null;
  const en = stripped && base.includes(fold(stripped)) ? stripped : enRaw;
  const enF = fold(en);
  const enSimilar = !!en && base.some((b) => similarNames(b, enF));
  const badEn =
    !!enRaw &&
    ((countryNames.has(enF) && !base.includes(enF)) ||
      (fold(p.adm1name) === enF && !base.includes(enF)) ||
      ADMIN_WORDS.test(enRaw) ||
      /^[a-z]/.test(enRaw));
  const otherAgrees = OTHER_LATIN.some((lang) => {
    const v = fold(p[`name_${lang}`]);
    return v && base.some((b) => similarNames(b, v));
  });
  const trusted = !badEn && (enSimilar || otherAgrees);
  const n = enSimilar && !badEn ? en : name;
  return {
    n,
    l: trusted ? localNames(p, n) : undefined,
    wd: trusted ? wikidataId(p.wikidataid) : undefined,
    trusted,
  };
}

// ---------------------------------------------------------------------------
// Country lookup against the built countries.json
// ---------------------------------------------------------------------------

export class CountryLocator {
  constructor(countries) {
    this.countries = countries;
  }

  static load() {
    const path = dataPath('countries.json');
    if (!existsSync(path)) throw new Error('countries.json missing: run build-countries.mjs first');
    return new CountryLocator(readJSON(path).countries);
  }

  /** ISO code of the country containing the point, or null. */
  locate(lon, lat) {
    for (const c of this.countries) {
      if (!pointInBBox(lon, lat, c.bb)) continue;
      if (pointInMultiPolygon(lon, lat, c.g)) return c.cc;
    }
    return null;
  }

  /** Country containing the point, else the one whose outline passes within `maxKm`. */
  locateNear(lon, lat, maxKm = 15) {
    const hit = this.locate(lon, lat);
    if (hit) return hit;
    const dLat = maxKm / 111;
    const dLon = dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    let best = null;
    let bestD = Infinity;
    for (const c of this.countries) {
      const [w, s, e, n] = c.bb;
      if (lon < w - dLon || lon > e + dLon || lat < s - dLat || lat > n + dLat) continue;
      for (const poly of c.g) {
        for (const ring of poly) {
          for (const [x, y] of ring) {
            const km = haversineKm(lat, lon, y, x);
            if (km < bestD) {
              bestD = km;
              best = c.cc;
            }
          }
        }
      }
    }
    return bestD <= maxKm ? best : null;
  }

  has(cc) {
    return this.countries.some((c) => c.cc === cc);
  }
}

/** Simple lat/lon grid index for nearest-neighbour lookups over points. */
export class GridIndex {
  constructor(items, getLonLat, cellDeg = 1) {
    this.cell = cellDeg;
    this.get = getLonLat;
    this.cells = new Map();
    for (const it of items) {
      const [lon, lat] = getLonLat(it);
      const k = this.key(lon, lat);
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(it);
    }
  }

  key(lon, lat) {
    return `${Math.floor(lon / this.cell)},${Math.floor(lat / this.cell)}`;
  }

  /** Items within `km` of the point, nearest first, as {item, km}. */
  within(lon, lat, km) {
    const dLat = km / 111 + this.cell;
    const dLon = Math.min(360, km / (111 * Math.max(0.05, Math.cos((lat * Math.PI) / 180))) + this.cell);
    const out = [];
    const seen = new Set();
    for (let x = Math.floor((lon - dLon) / this.cell); x <= Math.floor((lon + dLon) / this.cell); x++) {
      for (let y = Math.floor((lat - dLat) / this.cell); y <= Math.floor((lat + dLat) / this.cell); y++) {
        // Wrap longitude cells across the antimeridian.
        const wx = ((((x * this.cell + 180) % 360) + 360) % 360) - 180;
        const k = `${Math.floor(wx / this.cell + 1e-9)},${y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const list = this.cells.get(k);
        if (!list) continue;
        for (const it of list) {
          const [ilon, ilat] = this.get(it);
          const d = haversineKm(lat, lon, ilat, ilon);
          if (d <= km) out.push({ item: it, km: d });
        }
      }
    }
    return out.sort((a, b) => a.km - b.km);
  }

  nearest(lon, lat, maxKm = 2000) {
    for (let r = 50; r <= maxKm; r *= 2) {
      const hits = this.within(lon, lat, r);
      if (hits.length) return hits[0];
    }
    return null;
  }
}
