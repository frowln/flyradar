import type { LiveFlight } from '../api/social';
import { airportByIata, getCountries } from '../data/datasets';
import { buildRoute } from '../route/profile';
import { countriesAlong } from '../places/countries';
import { gcInterpolate } from '../geo/greatCircle';

/** Where a friend's flight is now: share flown, the ground below, the time to landing. */
export function liveState(f: LiveFlight, now = Date.now()): { progress: number; below: string | null; leftS: number; at: { lat: number; lon: number } } {
  const t0 = Date.parse(f.takeoffAt);
  const t1 = Date.parse(f.landAt);
  const progress = Math.max(0, Math.min(1, (now - t0) / Math.max(1, t1 - t0)));
  const at = gcInterpolate(f.from.lat, f.from.lon, f.to.lat, f.to.lon, progress);
  let below: string | null = null;
  try {
    const a = airportByIata(f.from.iata);
    const b = airportByIata(f.to.iata);
    if (a && b) {
      const { route } = buildRoute({ from: a, to: b });
      const end = route[route.length - 1]?.elapsedSeconds ?? 0;
      const passes = countriesAlong(route, getCountries(), { fromCC: a.cc, toCC: b.cc });
      const s = end * progress;
      below = passes.find((p) => p.enterAt <= s && s < p.exitAt)?.cc ?? null;
    }
  } catch {
    // No outlines: the card shows the route without the ground.
  }
  return { progress, below, leftS: Math.max(0, Math.round((t1 - now) / 1000)), at };
}
