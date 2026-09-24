import { Flight, RoutePoint } from './flight';
import { POI, PassSide } from './poi';

/** A country the route passes over, with the time spent above it. */
export interface CountryPass {
  /** ISO 3166-1 alpha-2 (or a stable pseudo-code for disputed areas). */
  cc: string;
  /** Seconds after takeoff. */
  enterAt: number;
  exitAt: number;
}

export type MomentKind =
  | 'takeoff'
  | 'sight'
  | 'border'
  | 'line'
  | 'sunrise'
  | 'sunset'
  | 'descent'
  | 'landing';

/**
 * Something worth knowing at a given moment of the flight.
 *
 * The timeline is computed once, when the package is built, from geometry and
 * data alone — so it is exact to the route and never invented.
 */
export interface Moment {
  id: string;
  kind: MomentKind;
  /** Seconds after takeoff. */
  at: number;
  side?: PassSide;
  /** For sights. */
  poiId?: string;
  /** For borders: the country being entered. */
  cc?: string;
  /** For lines: which one. */
  line?: 'equator' | 'tropic_cancer' | 'tropic_capricorn' | 'arctic_circle' | 'antarctic_circle' | 'dateline' | 'prime_meridian';
  /** 0–1: how much this moment is worth interrupting someone for. */
  weight: number;
}

/** The passenger's seat, as far as it matters: which window, if any. */
export interface SeatInfo {
  side: 'left' | 'right' | 'middle' | 'unknown';
  /** As printed on the boarding pass, e.g. "23A". */
  label?: string;
}

export interface OfflinePackage {
  version: 1 | 2;
  flight: Flight;
  route: RoutePoint[];      // ~200 points sampled along great circle
  pois: POI[];
  mapTilesUrl?: string;     // Optional: pre-packaged map tiles
  generatedAt: string;
  /** Where it was built: on the phone from bundled data, or by the server. */
  builtBy?: 'device' | 'server';
  countries?: CountryPass[];
  moments?: Moment[];
  seat?: SeatInfo;
  /** Language the texts were fetched in. */
  locale?: string;
  /** A demonstration flight: runs faster than real time and never enters the passport. */
  demo?: boolean;
  /**
   * How the path was drawn: the great circle, a detour around closed airspace,
   * or a great circle kept only because no plausible detour was found.
   */
  routeKind?: 'direct' | 'detour' | 'approximate';
  /** Places looked up online that turned out to have no article; not retried. */
  storyless?: string[];
}
