#!/usr/bin/env node
/**
 * "From above": a real satellite view of each place, as the window shows it.
 *
 * Ground photos tell what a place is like to stand in; a passenger at 11 km
 * sees it from above. Copernicus Sentinel-2 (free and open data, attribution
 * "Contains modified Copernicus Sentinel data") photographs every land tile
 * every few days at 10 m a pixel; Element 84 keeps them on AWS as Cloud
 * Optimized GeoTIFFs, so a window around a place can be read without
 * downloading the 110 km tile.
 *
 * For each place: the Sentinel-2 tile (MGRS square) it falls in, the
 * clearest recent scene of that tile in the local summer, a window sized to
 * the place (a city ~15 km, a lake its own extent, a range up to 100 km),
 * a gentle contrast stretch, an 840 × 560 JPEG.
 *
 *   node scripts/content/satellite.mjs                  # places along the demo routes
 *   node scripts/content/satellite.mjs --routes SVO-AER,ZRH-FCO --max 60
 *
 * Writes public/sat/<key>.jpg and public/sat/index.json (not committed).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromUrl } from 'geotiff';
import jpeg from 'jpeg-js';
import proj4 from 'proj4';
import mgrsLib from 'mgrs';

const mgrs = mgrsLib.forward;

const app = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(app, 'public/sat');
const BUCKET = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com';
const W = 840;
const H = 560;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const DEMO = 'SVO-AER,ZRH-FCO,DEL-KTM,HND-ITM,AKL-ZQN,LIM-CUZ,YVR-YYC,SVO-AYT,LED-SVO,SVO-IST,LAX-JFK';
const ROUTES = String(args.routes ?? DEMO).split(',').map((r) => r.split('-'));
const MAX = Number(args.max ?? 130);

const readJson = (f) => JSON.parse(readFileSync(join(app, f), 'utf8'));
const airports = Object.fromEntries(readJson('assets/data/airports.skydata').airports.map((a) => [a.i, a]));
const places = readJson('assets/data/places.skydata').places;
const stories = readJson('assets/data/stories.en.skydata').places;

// ─── Which places ───────────────────────────────────────────────────────────

const rad = Math.PI / 180;
const hav = (a, b, c, d) => {
  const x = Math.sin(((c - a) * rad) / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(((d - b) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};
function greatCircle(a, b, steps = 80) {
  const v = (lat, lon) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
  const A = v(a.lat, a.lon);
  const B = v(b.lat, b.lon);
  const d = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const f = i / steps;
    const ka = Math.sin((1 - f) * d) / Math.sin(d);
    const kb = Math.sin(f * d) / Math.sin(d);
    const p = [0, 1, 2].map((k) => ka * A[k] + kb * B[k]);
    return { lat: Math.atan2(p[2], Math.hypot(p[0], p[1])) / rad, lon: Math.atan2(p[1], p[0]) / rad };
  });
}

const SKIP = new Set(['sea']);
const picked = new Map();
for (const [from, to] of ROUTES) {
  const a = airports[from];
  const b = airports[to];
  if (!a || !b) continue;
  const track = greatCircle(a, b);
  const near = places
    .filter((p) => !SKIP.has(p.k) && p.r >= (p.k === 'city' ? 6 : 5))
    .map((p) => ({ p, d: Math.min(...track.map((t) => hav(t.lat, t.lon, p.lat, p.lon))) }))
    .filter(({ p, d }) => d < Math.min(250, 80 + (p.ext ?? 0)))
    // Places with a written story first: those are the cards people open.
    .sort((x, y) => (stories[y.p.wd ?? y.p.id] ? 1 : 0) - (stories[x.p.wd ?? x.p.id] ? 1 : 0) || y.p.r - x.p.r || x.d - y.d)
    .slice(0, 22);
  for (const { p } of near) picked.set(p.wd ?? p.id, p);
}
const todo = [...picked.entries()].slice(0, MAX);
console.log(`${todo.length} places along ${ROUTES.length} routes`);

// ─── Scenes ─────────────────────────────────────────────────────────────────

async function list(prefix) {
  const res = await fetch(`${BUCKET}/?list-type=2&prefix=${prefix}&delimiter=/`);
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1]).filter((p) => p !== prefix);
}

/** Months to look in, most promising first: the local summer of the last two years. */
function months(lat) {
  const north = [7, 8, 6, 9, 5, 10];
  const south = [1, 2, 12, 3, 11, 4];
  const order = lat >= -10 ? north : south;
  const out = [];
  for (const year of [2025, 2024]) for (const m of order) out.push([m >= 11 && lat < -10 ? year - 1 : year, m]);
  return out;
}

const sceneCache = new Map();
async function clearestScene(tile, lat) {
  if (sceneCache.has(tile)) return sceneCache.get(tile);
  const zone = tile.slice(0, tile.length - 3);
  const band = tile.slice(-3, -2);
  const sq = tile.slice(-2);
  let best = null;
  for (const [year, month] of months(lat)) {
    const scenes = await list(`sentinel-s2-l2a-cogs/${Number(zone)}/${band}/${sq}/${year}/${month}/`);
    for (const s of scenes) {
      const name = s.split('/').filter(Boolean).pop();
      const item = await fetch(`${BUCKET}/${s}${name}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!item) continue;
      const cloud = item.properties['eo:cloud_cover'] ?? 100;
      const nodata = item.properties['s2:nodata_pixel_percentage'] ?? 100;
      if (nodata > 8) continue;
      const score = cloud + nodata * 0.3;
      if (!best || score < best.score) best = { score, cloud, href: item.assets.visual?.href, date: item.properties.datetime?.slice(0, 10) };
    }
    if (best && best.cloud < 2) break;
  }
  sceneCache.set(tile, best);
  return best;
}

// ─── Windows ────────────────────────────────────────────────────────────────

function widthKm(p) {
  if (p.k === 'city') return p.pop > 3e6 ? 34 : p.pop > 1e6 ? 24 : 16;
  if (p.k === 'mountain' || p.k === 'volcano') return 22;
  if (p.k === 'river') return 36;
  const ext = (p.ext ?? 30) * 2.2;
  return Math.max(14, Math.min(100, ext));
}

/** Stretch each channel between its 1st and 99th percentile, with a slight lift of the shadows. */
function stretch(rgb, n) {
  const outPx = Buffer.alloc(n * 4);
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[rgb[i * 3 + c]]++;
    let lo = 0;
    let hi = 255;
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) > n * 0.01) { lo = v; break; }
    acc = 0;
    for (let v = 255; v >= 0; v--) if ((acc += hist[v]) > n * 0.01) { hi = v; break; }
    const span = Math.max(20, hi - lo);
    for (let i = 0; i < n; i++) {
      const x = Math.max(0, Math.min(1, (rgb[i * 3 + c] - lo) / span));
      outPx[i * 4 + c] = Math.round(255 * Math.pow(x, 0.88));
    }
  }
  for (let i = 0; i < n; i++) outPx[i * 4 + 3] = 255;
  return outPx;
}

mkdirSync(out, { recursive: true });
const indexFile = join(out, 'index.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
let done = 0;
for (const [key, p] of todo) {
  const file = join(out, `${key}.jpg`);
  if (index[key] && existsSync(file)) {
    done++;
    continue;
  }
  try {
    const tile = mgrs([p.lon, p.lat], 0);
    const scene = await clearestScene(tile, p.lat);
    if (!scene?.href) {
      console.log(`  ${p.n}: no clear scene`);
      continue;
    }
    const tiff = await fromUrl(scene.href);
    const img = await tiff.getImage();
    const [ox, oy] = img.getOrigin();
    const [rx, ry] = img.getResolution();
    const zone = Number(tile.slice(0, tile.length - 3));
    const south = tile.slice(-3, -2) < 'N';
    const [x, y] = proj4('WGS84', `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`, [p.lon, p.lat]);
    const halfW = (widthKm(p) * 1000) / 2;
    const halfH = halfW * (H / W);
    // Keep the window inside the tile: shift it rather than show the black outside.
    const minX = ox;
    const maxX = ox + img.getWidth() * rx;
    const maxY = oy;
    const minY = oy + img.getHeight() * ry;
    const cx = Math.max(minX + halfW, Math.min(maxX - halfW, x));
    const cy = Math.max(minY + halfH, Math.min(maxY - halfH, y));
    const raster = await tiff.readRasters({ bbox: [cx - halfW, cy - halfH, cx + halfW, cy + halfH], width: W, height: H, interleave: true, resampleMethod: 'bilinear' });
    let empty = 0;
    for (let i = 0; i < W * H; i++) if (raster[i * 3] === 0 && raster[i * 3 + 1] === 0 && raster[i * 3 + 2] === 0) empty++;
    if (empty > W * H * 0.05) {
      console.log(`  ${p.n}: scene has no data here`);
      continue;
    }
    const jpg = jpeg.encode({ data: stretch(raster, W * H), width: W, height: H }, 64);
    writeFileSync(file, jpg.data);
    index[key] = { d: scene.date, w: Math.round(widthKm(p)) };
    writeFileSync(indexFile, JSON.stringify(index));
    done++;
    console.log(`${done}/${todo.length} ${p.n} — ${scene.date}, cloud ${scene.cloud.toFixed(1)}%, ${(jpg.data.length / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`  ${p.n}: ${String(e).slice(0, 120)}`);
  }
}
console.log(`${Object.keys(index).length} images in public/sat/`);
