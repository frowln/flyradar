import type { RoutePoint } from '@skyatlas/shared';

const DEG = Math.PI / 180;

// Simple sunrise/sunset calculator (NOAA algorithm simplified)
export function sunTimes(lat: number, lon: number, date: Date = new Date()): { sunrise: Date; sunset: Date } {
  const J1970 = 2440588;
  const J2000 = 2451545;
  const dayMs = 1000 * 60 * 60 * 24;
  const toJulian = (d: Date) => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (d: Date) => toJulian(d) - J2000;

  const d = toDays(date);
  const M = (357.5291 + 0.98560028 * d) * DEG;
  const L = M + (1.9148 * Math.sin(M) + 0.0200 * Math.sin(2 * M)) * DEG + (102.9372 + 180) * DEG;
  const dec = Math.asin(Math.sin(L) * Math.sin(23.4397 * DEG));
  const phi = lat * DEG;
  const H = Math.acos((Math.sin(-0.83 * DEG) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec))) / DEG;
  const noon = 0.0009 + (-lon) / 360 + d;
  const Jnoon = J2000 + noon;
  const Jrise = Jnoon - H / 360;
  const Jset = Jnoon + H / 360;
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

// CO2 emissions: ~115g per passenger per km (industry average for jet fuel)
export function calculateCO2(distanceKm: number): {
  kg: number;
  treesEquivalent: number;
  vsTrain: number;
  vsCar: number;
} {
  const kg = Math.round(distanceKm * 0.115);
  // 1 tree absorbs ~22kg CO2 per year
  const treesEquivalent = Math.round(kg / 22);
  // Train: ~14g/km, Car (alone): ~120g/km
  const vsTrain = Math.round((kg / (distanceKm * 0.014)) * 10) / 10;
  const vsCar = Math.round((kg / (distanceKm * 0.120)) * 10) / 10;
  return { kg, treesEquivalent, vsTrain, vsCar };
}

// Random funky fact based on current position
export function funFact(position: RoutePoint, _route: RoutePoint[]): string {
  const facts = [
    `❄️ Outside temperature: about ${Math.round(-56 + position.altitude / 1000 * 6.5 * -1)}°C`,
    `🚀 You're flying ~3× faster than a 9mm bullet`,
    `📐 You're ${Math.round(position.altitude / 1000 * 10) / 10}× higher than Mount Everest`,
    `🛰️ ISS orbits 400km above you — you're at ${Math.round(position.altitude / 1000)}km`,
    `🌍 You see ~5° of Earth's curvature from here`,
    `🐦 Birds typically fly below 2km. You're at ${Math.round(position.altitude)}m`,
    `⚡ At cruise, you'd reach New York from London in ~7 hours`,
    `☄️ Falling here would take ~3 minutes (without parachute)`,
  ];
  return facts[Math.floor((position.elapsedSeconds / 600) % facts.length)];
}

// Aircraft type lookup (common IATA codes)
const AIRCRAFT_INFO: Record<string, { name: string; range: number; capacity: number; firstFlight: number }> = {
  'B77W': { name: 'Boeing 777-300ER', range: 13649, capacity: 396, firstFlight: 2003 },
  'B748': { name: 'Boeing 747-8', range: 14310, capacity: 467, firstFlight: 2011 },
  'A380': { name: 'Airbus A380', range: 14800, capacity: 853, firstFlight: 2005 },
  'A350': { name: 'Airbus A350', range: 15000, capacity: 410, firstFlight: 2013 },
  'B737': { name: 'Boeing 737', range: 6570, capacity: 215, firstFlight: 1967 },
  'A320': { name: 'Airbus A320', range: 6100, capacity: 180, firstFlight: 1987 },
  'B789': { name: 'Boeing 787-9 Dreamliner', range: 14140, capacity: 296, firstFlight: 2013 },
};

export function aircraftInfo(code?: string) {
  if (!code) return null;
  return AIRCRAFT_INFO[code] ?? null;
}

export function detectTimezoneCrossing(prevLon: number, currentLon: number): boolean {
  // Rough — each 15° of longitude is one timezone
  return Math.floor(prevLon / 15) !== Math.floor(currentLon / 15);
}
