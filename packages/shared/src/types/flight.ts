export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  /** City name in other languages, when known. */
  cityNames?: Partial<Record<'ru' | 'de' | 'fr' | 'es' | 'ja', string>>;
}

/** Where a flight stands, reduced from each provider's own vocabulary. */
export type FlightStatus =
  | 'scheduled'
  | 'boarding'
  | 'departed'
  | 'landed'
  | 'delayed'
  | 'cancelled'
  | 'diverted'
  | 'unknown';

export interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  origin: Airport;
  destination: Airport;
  scheduledDeparture: string; // ISO, with offset or Z
  scheduledArrival: string;
  actualDeparture?: string;
  /** Latest estimate or actual time from the provider, ISO with the local offset. */
  revisedDeparture?: string;
  revisedArrival?: string;
  /** Aircraft model as the provider names it, e.g. "Airbus A321" or "B77W". */
  aircraftType?: string;
  /** Local calendar date of departure at the origin, YYYY-MM-DD. */
  localDate?: string;
  status?: FlightStatus;
}

/**
 * The path a flight number actually flew recently, simplified.
 *
 * Each point is `[lon, lat, altitude m, seconds after takeoff]` — compact
 * because it travels to the phone and is kept there.
 */
export interface FlightTrack {
  points: Array<[number, number, number, number]>;
  /** UTC date of the flight the track was recorded on, YYYY-MM-DD. */
  flownOn: string;
  /** Airport codes of that flight (IATA when known, else ICAO). */
  from: string;
  to: string;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  altitude: number;       // meters
  elapsedSeconds: number; // from takeoff
}
