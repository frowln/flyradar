export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  origin: Airport;
  destination: Airport;
  scheduledDeparture: string; // ISO
  scheduledArrival: string;
  actualDeparture?: string;
  aircraftType?: string;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  altitude: number;       // meters
  elapsedSeconds: number; // from takeoff
}
