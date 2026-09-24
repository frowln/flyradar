import type { BBox, MultiPolygon, Polygon, Ring } from '../data/types';

/** Ray casting on [lon, lat] pairs. Adequate at the scale of countries and seas. */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(lon: number, lat: number, poly: Polygon): boolean {
  if (poly.length === 0 || !pointInRing(lon, lat, poly[0]!)) return false;
  for (let h = 1; h < poly.length; h++) {
    if (pointInRing(lon, lat, poly[h]!)) return false;
  }
  return true;
}

export function pointInMulti(lon: number, lat: number, multi: MultiPolygon): boolean {
  for (const poly of multi) if (pointInPolygon(lon, lat, poly)) return true;
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
