import type { BBox, MultiPolygon, Polygon, Ring } from '../data/types';

/**
 * Rings with more vertices than this get a latitude-band index on first use.
 *
 * Russia, the US and Canada run to thousands of vertices each and their bounding
 * boxes span the antimeridian, so every sample of a Pacific or polar route used
 * to ray-cast all of them — seconds per flight on Hermes, which has no JIT.
 */
const INDEX_MIN_VERTICES = 48;

interface RingIndex {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  /** Band of the first slot, floor(minLat). */
  base: number;
  /** Edges of band b are `edges[start[b]] … edges[start[b + 1] - 1]`, as the index of their second vertex. */
  start: Int32Array;
  edges: Int32Array;
}

const ringIndexes = new WeakMap<Ring, RingIndex>();

/**
 * Buckets every edge into each 1° latitude band its latitude range touches. A
 * horizontal ray at a latitude can only cross edges spanning that latitude, so
 * scanning one band gives exactly the answer a scan of the whole ring would.
 */
function indexRing(ring: Ring): RingIndex {
  const cached = ringIndexes.get(ring);
  if (cached) return cached;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of ring) {
    if (p[0] < minLon) minLon = p[0];
    if (p[0] > maxLon) maxLon = p[0];
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
  }
  const base = Math.floor(minLat);
  const bands = Math.floor(maxLat) - base + 1;
  const n = ring.length;
  const count = new Int32Array(bands + 1);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]![1];
    const b = ring[j]![1];
    for (let k = Math.floor(Math.min(a, b)) - base; k <= Math.floor(Math.max(a, b)) - base; k++) count[k + 1]!++;
  }
  const start = new Int32Array(bands + 1);
  for (let k = 0; k < bands; k++) start[k + 1] = start[k]! + count[k + 1]!;
  const fill = start.slice(0, bands);
  const edges = new Int32Array(start[bands]!);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]![1];
    const b = ring[j]![1];
    for (let k = Math.floor(Math.min(a, b)) - base; k <= Math.floor(Math.max(a, b)) - base; k++) edges[fill[k]!++] = i;
  }
  const index = { minLon, maxLon, minLat, maxLat, base, start, edges };
  ringIndexes.set(ring, index);
  return index;
}

/** Whether the edge ending at vertex i toggles a ray cast from the point toward +lon. */
function crosses(lon: number, lat: number, ring: Ring, i: number): boolean {
  const pi = ring[i]!;
  const pj = ring[i === 0 ? ring.length - 1 : i - 1]!;
  const yi = pi[1];
  const yj = pj[1];
  return yi > lat !== yj > lat && lon < ((pj[0] - pi[0]) * (lat - yi)) / (yj - yi) + pi[0];
}

/** Ray casting on [lon, lat] pairs. Adequate at the scale of countries and seas. */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  if (ring.length < INDEX_MIN_VERTICES) {
    for (let i = 0; i < ring.length; i++) if (crosses(lon, lat, ring, i)) inside = !inside;
    return inside;
  }
  const ix = indexRing(ring);
  if (lat < ix.minLat || lat > ix.maxLat || lon < ix.minLon || lon > ix.maxLon) return false;
  const band = Math.floor(lat) - ix.base;
  for (let e = ix.start[band]!; e < ix.start[band + 1]!; e++) if (crosses(lon, lat, ring, ix.edges[e]!)) inside = !inside;
  return inside;
}

export function pointInPolygon(lon: number, lat: number, poly: Polygon): boolean {
  if (poly.length === 0 || !pointInRing(lon, lat, poly[0]!)) return false;
  for (let h = 1; h < poly.length; h++) {
    if (pointInRing(lon, lat, poly[h]!)) return false;
  }
  return true;
}

const polygonBoxes = new WeakMap<MultiPolygon, Float64Array>();

/** Outer-ring bounding boxes of each polygon, [minLon, minLat, maxLon, maxLat] × n. */
function boxesOf(multi: MultiPolygon): Float64Array {
  let boxes = polygonBoxes.get(multi);
  if (boxes) return boxes;
  boxes = new Float64Array(multi.length * 4);
  multi.forEach((poly, k) => {
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const p of poly[0] ?? []) {
      if (p[0] < minLon) minLon = p[0];
      if (p[0] > maxLon) maxLon = p[0];
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
    }
    boxes!.set([minLon, minLat, maxLon, maxLat], k * 4);
  });
  polygonBoxes.set(multi, boxes);
  return boxes;
}

export function pointInMulti(lon: number, lat: number, multi: MultiPolygon): boolean {
  // Most of a large country's polygons are islands far from the point; a box
  // test skips them without touching their vertices.
  const boxes = boxesOf(multi);
  for (let k = 0; k < multi.length; k++) {
    const o = k * 4;
    if (lon < boxes[o]! || lat < boxes[o + 1]! || lon > boxes[o + 2]! || lat > boxes[o + 3]!) continue;
    if (pointInPolygon(lon, lat, multi[k]!)) return true;
  }
  return false;
}

export function bboxContains(bb: BBox, lon: number, lat: number, marginDeg = 0): boolean {
  return (
    lon >= bb[0] - marginDeg &&
    lat >= bb[1] - marginDeg &&
    lon <= bb[2] + marginDeg &&
    lat <= bb[3] + marginDeg
  );
}
