import type { PlaceKind } from '../data/types';

/**
 * How far away a thing can be and still be recognised from a cruising airliner.
 *
 * The horizon at 11 km is ~375 km away, but nobody recognises a city at the
 * horizon: haze, the shallow viewing angle and the window frame cut the useful
 * distance to a fraction of that. These ranges are what a passenger with an
 * ordinary window seat can reasonably pick out on a clear day; they are the
 * difference between "look left now" being a promise and being a guess.
 */

export interface VisibilityInput {
  k: PlaceKind;
  r: number;
  pop?: number;
  el?: number;
  ext?: number;
}

/** Distance to the horizon from a height, km. */
export function horizonKm(altitudeM: number): number {
  return 3.57 * Math.sqrt(Math.max(0, altitudeM));
}

/** Recognition range at cruise, km. For areas, measured from the area's edge. */
export function recognitionRangeKm(p: VisibilityInput): number {
  switch (p.k) {
    case 'city': {
      const pop = p.pop ?? 100_000;
      return Math.min(170, 45 + 45 * Math.log10(Math.max(1, pop / 100_000)));
    }
    case 'mountain':
    case 'volcano': {
      const el = p.el ?? 0;
      if (el >= 6000) return 260;
      if (el >= 4500) return 210;
      if (el >= 3000) return 150;
      if (el >= 2000) return 100;
      return 60;
    }
    case 'range':
    case 'glacier':
      return 180;
    case 'desert':
    case 'sea':
    case 'plateau':
    case 'peninsula':
      return 120;
    case 'lake':
    case 'island':
      return Math.min(150, 50 + (p.ext ?? 5) * 1.5);
    case 'river':
      return 60;
    case 'landmark':
      return 25;
    case 'region':
      return 60;
  }
}

/** Places that are best known as areas, and so are described as "below" when overflown. */
export function isArea(k: PlaceKind): boolean {
  return (
    k === 'range' ||
    k === 'desert' ||
    k === 'sea' ||
    k === 'plateau' ||
    k === 'peninsula' ||
    k === 'glacier' ||
    k === 'region' ||
    k === 'lake' ||
    k === 'island'
  );
}

/** How much a kind of place is worth to someone looking out of a window. */
export const KIND_WEIGHT: Record<PlaceKind, number> = {
  mountain: 1.25,
  volcano: 1.35,
  range: 1.2,
  desert: 1.15,
  glacier: 1.2,
  sea: 1.0,
  lake: 1.05,
  island: 1.05,
  peninsula: 0.95,
  plateau: 0.8,
  city: 0.95,
  river: 0.8,
  region: 0.6,
  landmark: 1.0
};
