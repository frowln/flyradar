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

export interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  origin: Airport;
  destination: Airport;
  scheduledDeparture: string; // ISO, with offset or Z
  scheduledArrival: string;
  actualDeparture?: string;
  aircraftType?: string;
  /** Local calendar date of departure at the origin, YYYY-MM-DD. */
  localDate?: string;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  altitude: number;       // meters
  elapsedSeconds: number; // from takeoff
}
