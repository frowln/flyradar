#!/usr/bin/env node
/**
 * Elevation for the browser build's map.
 *
 * The iPhone app downloads elevation tiles for each flight's corridor. A web
 * build cannot: a hosted demo is not allowed to reach tile servers, and the
 * store screenshots are taken from it. So the web build carries its own:
 * the whole world at small scales (zooms 0–3) and the corridors of the demo
 * and screenshot routes in more detail (zooms 4–6), packed into a few files
 * with an index (a host may cap the number of files, not only their size).
 *
 *   node scripts/preview/fetch-dem.mjs          # writes public/dem/
 *
 * Source: AWS Terrain Tiles (Terrarium PNG), free and keyless; attribution in
 * the app's Licences screen. The output is not committed (see .gitignore).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(app, 'public/dem');
const REMOTE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const WORLD_MAX_ZOOM = 3;
const CHUNK_BYTES = 3 * 1024 * 1024;

// Demo routes (src/core/offline/demo.ts) and the Russian screenshot scenes get
// zoom 6 near the track; every route gets zooms 4–5 out to ~4°, which is what
// the window view needs to reach the horizon.
const DETAILED = [
  ['SVO', 'AER'], ['ZRH', 'FCO'], ['DEL', 'KTM'], ['HND', 'ITM'], ['AKL', 'ZQN'], ['LIM', 'CUZ'], ['YVR', 'YYC'],
  ['SVO', 'AYT'], ['LED', 'SVO'], ['SVO', 'IST']
];
const BASIC = [['LAX', 'JFK'], ['JFK', 'LHR'], ['LHR', 'ATH'], ['CDG', 'ATH'], ['FRA', 'LIS'], ['MAD', 'FCO']];
const ZOOMS = [
  { z: 4, margin: 4.5, routes: [...DETAILED, ...BASIC] },
  { z: 5, margin: 4, routes: [...DETAILED, ...BASIC] },
  { z: 6, margin: 1.6, routes: DETAILED }
];

const airports = Object.fromEntries(
  JSON.parse(readFileSync(join(app, 'assets/data/airports.skydata'), 'utf8')).airports.map((a) => [a.i, a])
);
const coord = (code) => {
  const a = airports[code];
  if (!a) throw new Error(`airport ${code} not in the dataset`);
  return [a.lat, a.lon];
};

const rad = Math.PI / 180;
function greatCircle([lat1, lon1], [lat2, lon2], steps = 60) {
  const toV = (lat, lon) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
  const a = toV(lat1, lon1);
  const b = toV(lat2, lon2);
  const d = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = d < 1e-9 ? 1 - f : Math.sin((1 - f) * d) / Math.sin(d);
    const B = d < 1e-9 ? f : Math.sin(f * d) / Math.sin(d);
    const v = [0, 1, 2].map((k) => A * a[k] + B * b[k]);
    pts.push([Math.atan2(v[2], Math.hypot(v[0], v[1])) / rad, Math.atan2(v[1], v[0]) / rad]);
  }
  return pts;
}

function tileOf(lat, lon, z) {
  const n = 2 ** z;
  const r = Math.max(-85.05, Math.min(85.05, lat)) * rad;
  const x = Math.floor(((((lon + 180) % 360) + 360) % 360 / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

const keys = new Set();
for (let z = 0; z <= WORLD_MAX_ZOOM; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) keys.add(`${z}/${x}/${y}`);
for (const { z, margin, routes } of ZOOMS) {
  for (const [from, to] of routes) {
    for (const [lat, lon] of greatCircle(coord(from), coord(to))) {
      const [x0, y0] = tileOf(lat + margin, lon - margin, z);
      const [x1, y1] = tileOf(lat - margin, lon + margin, z);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = y0; y <= y1; y++) keys.add(`${z}/${x}/${y}`);
    }
  }
}
console.log(`${keys.size} tiles`);
const list = [...keys].sort((a, b) => a.split('/').map(Number).reduce((s, v, i) => s || v - b.split('/').map(Number)[i], 0));
const bodies = new Map();
let fetched = 0;
const queue = [...list];
async function worker() {
  for (let key = queue.shift(); key; key = queue.shift()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${REMOTE}/${key}.png`);
        if (res.ok) bodies.set(key, Buffer.from(await res.arrayBuffer()));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (++fetched % 100 === 0) console.log(`${fetched}/${list.length}`);
  }
}
await Promise.all(Array.from({ length: 12 }, worker));

if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });
const index = {};
const chunks = [[]];
let size = 0;
for (const key of list) {
  const body = bodies.get(key);
  if (!body) continue;
  if (size + body.length > CHUNK_BYTES) {
    chunks.push([]);
    size = 0;
  }
  index[key] = [chunks.length - 1, size, body.length];
  chunks[chunks.length - 1].push(body);
  size += body.length;
}
chunks.forEach((parts, i) => writeFileSync(join(out, `pack-${i}.bin`), Buffer.concat(parts)));
writeFileSync(join(out, 'index.json'), JSON.stringify({ version: 1, maxzoom: 6, chunks: chunks.length, tiles: index }));
const total = chunks.reduce((s, c) => s + c.reduce((t, b) => t + b.length, 0), 0);
console.log(`${Object.keys(index).length} tiles in ${chunks.length} files, ${(total / 1024 / 1024).toFixed(1)} MB → public/dem/`);
