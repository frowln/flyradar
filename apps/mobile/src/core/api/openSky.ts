// OpenSky Network — free public flight tracking API
const OPENSKY_BASE = 'https://opensky-network.org/api';

export interface OpenSkyState {
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number;       // meters
  velocity: number;       // m/s
  trueTrack: number;      // bearing in degrees
  onGround: boolean;
  lastContact: number;
}

export async function fetchFlightByCallsign(callsign: string): Promise<OpenSkyState | null> {
  try {
    const r = await fetch(`${OPENSKY_BASE}/states/all`);
    if (!r.ok) return null;
    const j = await r.json() as any;
    const states = j.states ?? [];
    // OpenSky returns array indexed format: [icao24, callsign, country, ..., lat, lon, alt, ...]
    const match = states.find((s: any[]) => s[1]?.trim().toUpperCase() === callsign.toUpperCase());
    if (!match) return null;
    return {
      callsign: match[1].trim(),
      latitude: match[6],
      longitude: match[5],
      altitude: match[7] ?? match[13] ?? 0,
      velocity: match[9] ?? 0,
      trueTrack: match[10] ?? 0,
      onGround: match[8] ?? false,
      lastContact: match[4] ?? 0
    };
  } catch {
    return null;
  }
}
