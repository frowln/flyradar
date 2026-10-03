#!/usr/bin/env node
/**
 * The basemap for the browser build: an atlas a hosted demo can draw without
 * reaching any tile server.
 *
 * Natural Earth (public domain) rivers, lakes, urban areas and glaciers,
 * simplified for zooms up to ~7, with river and lake names in the six app
 * languages (rivers take theirs from the app's own place dataset), plus the
 * Noto Sans glyphs MapLibre needs to set labels (Latin, Greek, Cyrillic and
 * punctuation; Japanese uses the browser's own fonts).
 *
 *   node scripts/preview/build-atlas.mjs       # writes public/atlas/
 *
 * Sources are downloaded once into scripts/data/.cache. The output is not
 * committed (see .gitignore); the web export copies public/ as is.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cache = join(app, 'scripts/data/.cache');
const out = join(app, 'public/atlas');
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const FONTS = 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts';
const LANGS = ['ru', 'de', 'fr', 'es', 'ja'];

async function source(name) {
  const file = join(cache, `${name}.geojson`);
  if (!existsSync(file)) {
    mkdirSync(cache, { recursive: true });
    const res = await fetch(`${NE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

// ─── Geometry ───────────────────────────────────────────────────────────────

const round = (v) => Math.round(v * 100) / 100;

function simplify(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > best) {
        best = d;
        at = i;
      }
    }
    if (best > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const outPts = [];
  for (let i = 0; i < points.length; i++) {
    if (!keep[i]) continue;
    const p = [round(points[i][0]), round(points[i][1])];
    const prev = outPts[outPts.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) outPts.push(p);
  }
  return outPts;
}

function lines(geom, tol) {
  const parts = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];
  const kept = parts.map((l) => simplify(l, tol)).filter((l) => l.length >= 2);
  if (!kept.length) return null;
  return kept.length === 1 ? { type: 'LineString', coordinates: kept[0] } : { type: 'MultiLineString', coordinates: kept };
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}

/**
 * A closed ring starts and ends on the same point, so Douglas–Peucker between
 * them sees no line at all and drops everything: split it at its farthest
 * point and simplify the two halves.
 */
function simplifyRing(ring, tol) {
  let far = 1;
  let best = -1;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = simplify(ring.slice(0, far + 1), tol);
  const b = simplify(ring.slice(far), tol);
  return [...a, ...b.slice(1)];
}

function polygons(geom, tol, minArea = 0) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const kept = [];
  for (const poly of polys) {
    const rings = poly.map((r) => simplifyRing(r, tol)).filter((r) => r.length >= 4);
    if (!rings.length || ringArea(rings[0]) < minArea) continue;
    for (const r of rings) {
      const [f, l] = [r[0], r[r.length - 1]];
      if (f[0] !== l[0] || f[1] !== l[1]) r.push([...f]);
    }
    kept.push(rings);
  }
  if (!kept.length) return null;
  return kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept };
}

const collection = (features) => ({ type: 'FeatureCollection', features });
const write = (name, data) => {
  const text = JSON.stringify(data);
  writeFileSync(join(out, `${name}.json`), text);
  console.log(`${name}: ${data.features.length} features, ${(text.length / 1024 / 1024).toFixed(2)} MB`);
};

function names(props, from) {
  const outNames = {};
  for (const l of LANGS) {
    const v = from?.[l] ?? props?.[`name_${l}`];
    if (v && v !== props.name) outNames[l] = String(v).normalize('NFD').replace(/́/g, '').normalize('NFC');
  }
  return outNames;
}

// ─── Layers ─────────────────────────────────────────────────────────────────

mkdirSync(out, { recursive: true });
const places = JSON.parse(readFileSync(join(app, 'assets/data/places.skydata'), 'utf8')).places;
const riverNames = new Map();
for (const p of places) {
  if (p.k !== 'river') continue;
  const list = riverNames.get(p.n) ?? [];
  list.push(p);
  riverNames.set(p.n, list);
}
const near = (list, geom) => {
  const c = (geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat())[0];
  let best = null;
  for (const p of list) {
    const d = Math.hypot(p.lon - c[0], p.lat - c[1]);
    if (!best || d < best.d) best = { d, p };
  }
  return best?.p;
};

{
  const src = await source('ne_10m_rivers_lake_centerlines');
  const feats = [];
  for (const f of src.features) {
    const p = f.properties;
    if (p.featurecla?.includes('Lake')) continue;
    const g = lines(f.geometry, 0.02);
    if (!g) continue;
    const local = p.name ? near(riverNames.get(p.name) ?? [], g) : null;
    feats.push({ type: 'Feature', properties: { n: p.name ?? '', r: p.scalerank, z: p.min_zoom ?? 5, ...names(p, local?.l) }, geometry: g });
  }
  write('rivers', collection(feats));
}

{
  const src = await source('ne_10m_lakes');
  const feats = [];
  for (const f of src.features) {
    const p = f.properties;
    const g = polygons(f.geometry, 0.01, 0.002);
    if (!g) continue;
    feats.push({ type: 'Feature', properties: { n: p.name ?? '', r: p.scalerank, ...names(p) }, geometry: g });
  }
  write('lakes', collection(feats));
}

{
  const src = await source('ne_10m_urban_areas');
  const feats = [];
  for (const f of src.features) {
    const p = f.properties;
    if ((p.area_sqkm ?? 0) < 25) continue;
    const g = polygons(f.geometry, 0.01, 0.001);
    if (g) feats.push({ type: 'Feature', properties: { a: Math.round(p.area_sqkm) }, geometry: g });
  }
  write('urban', collection(feats));
}

{
  const src = await source('ne_10m_glaciated_areas');
  const feats = [];
  for (const f of src.features) {
    const g = polygons(f.geometry, 0.02, 0.002);
    if (g) feats.push({ type: 'Feature', properties: {}, geometry: g });
  }
  write('glaciers', collection(feats));
}

// ─── Glyphs ─────────────────────────────────────────────────────────────────

const RANGES = ['0-255', '256-511', '768-1023', '1024-1279', '7680-7935', '8192-8447'];
for (const font of ['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Medium']) {
  const dir = join(out, 'fonts', font);
  mkdirSync(dir, { recursive: true });
  for (const range of RANGES) {
    const file = join(dir, `${range}.pbf`);
    if (existsSync(file)) continue;
    const res = await fetch(`${FONTS}/${encodeURIComponent(font)}/${range}.pbf`);
    if (res.ok) writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}
console.log('glyphs: Noto Sans Regular, Italic, Medium →', RANGES.join(', '));
