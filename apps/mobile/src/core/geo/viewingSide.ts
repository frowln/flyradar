import { bearing, haversine } from './greatCircle';

export type Side = 'left' | 'right' | 'ahead' | 'behind';

export interface Sighting {
  side: Side;
  /** Great-circle distance from the aircraft to the place, km. */
  distanceKm: number;
  /** Relative bearing, 0–359°, clockwise from the nose. */
  relativeBearing: number;
  /**
   * Degrees below the horizon the passenger must look, from cruise altitude.
   * Null when the place is behind, or so far that it is below the horizon.
   */
  depressionAngle: number | null;
}

/** Cruise altitude in km. Used when the caller does not supply one. */
const DEFAULT_CRUISE_KM = 11.28;
const EARTH_R = 6371;

/**
 * Which window to look out of.
 *
 * This is the one piece of information on the whole screen a passenger can act
 * on within seconds, and no competing product provides it. It is also the reason
 * to open the app *before* choosing a seat, which is the cheapest acquisition
 * moment the product has.
 *
 * Sectors are deliberately asymmetric: ±30° of the nose reads as "ahead" —
 * a side window cannot see there, so telling someone to look for it would be a
 * promise the cabin cannot keep — while the beam sectors run wide since that is
 * where a window seat actually looks.
 */
export function viewingSide(
  planeLat: number,
  planeLon: number,
  headingDeg: number,
  poiLat: number,
  poiLon: number,
  altitudeKm: number = DEFAULT_CRUISE_KM
): Sighting {
  const absolute = bearing(planeLat, planeLon, poiLat, poiLon);
  const relative = ((absolute - headingDeg) % 360 + 360) % 360;
  const distanceKm = haversine(planeLat, planeLon, poiLat, poiLon);

  let side: Side;
  if (relative <= 30 || relative >= 330) side = 'ahead';
  else if (relative < 150) side = 'right';
  else if (relative <= 210) side = 'behind';
  else side = 'left';

  return {
    side,
    distanceKm,
    relativeBearing: relative,
    depressionAngle: side === 'behind' ? null : depressionAngle(distanceKm, altitudeKm)
  };
}

/**
 * How far below the horizontal a passenger must look to see something this far
 * away, accounting for the Earth's curvature.
 *
 * Ignoring curvature overstates the angle badly at cruise: at 300 km the flat
 * approximation says 2.2°, while the real answer is negative — the place has
 * already dropped below the horizon and cannot be seen at all.
 */
export function depressionAngle(distanceKm: number, altitudeKm: number): number | null {
  if (distanceKm <= 0) return 90;

  // Visibility is decided by geometry, not by the sign of the angle: anything
  // further than the horizon is hidden by the Earth's bulge, and the angle stays
  // stubbornly positive well past that point. Gating on the horizon distance is
  // what keeps the two functions consistent with each other.
  if (distanceKm > horizonDistanceKm(altitudeKm)) return null;

  // Angle subtended at the Earth's centre between the aircraft and the place.
  const central = distanceKm / EARTH_R;
  const rPlane = EARTH_R + altitudeKm;

  // Below the local horizontal: opposite is the aircraft's height above the
  // place's tangent plane, adjacent is the ground distance along the chord.
  const opposite = rPlane - EARTH_R * Math.cos(central);
  const adjacent = EARTH_R * Math.sin(central);

  return (Math.atan2(opposite, adjacent) * 180) / Math.PI;
}

/**
 * Furthest a place can be and still sit above the horizon, in km.
 * At 11 280 m that is roughly 380 km.
 */
export function horizonDistanceKm(altitudeKm: number = DEFAULT_CRUISE_KM): number {
  return EARTH_R * Math.acos(EARTH_R / (EARTH_R + altitudeKm));
}
