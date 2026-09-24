import type { Flight, OfflinePackage, POI, SeatInfo } from '@skyatlas/shared';
import type { DataAirport, DataPlace, DataCountry, MultiPolygon } from '../data/types';
import { toAirport } from '../data/airports';
import { buildRoute, airborneFromSchedule } from '../route/profile';
import { closedCountries, planAround } from '../route/airspace';
import { selectSightings, sightingsAlong, toPOI } from '../places/corridor';
import { countriesAlong } from '../places/countries';
import { computeMoments } from '../flight/moments';
import { haversine } from '../geo/greatCircle';
import { zonedToUtc } from '../time/zones';
import { enrichWithWikipedia, type FetchLike } from '../places/wiki';

/**
 * Preparing a flight on the phone, from bundled data.
 *
 * This is what makes the app usable without any server: the route, the places
 * along it, the countries crossed and the moment-by-moment timeline are all
 * computed here in a second or two. Only the stories need the network, and
 * their absence degrades the cards rather than the flight.
 */

export type BuildStage = 'route' | 'places' | 'stories' | 'photos' | 'map' | 'done';

export interface BuildProgress {
  stage: BuildStage;
  /** 0–1 within the stage. */
  progress: number;
}

export interface BuildRequest {
  from: DataAirport;
  to: DataAirport;
  /** Local calendar date at the origin, YYYY-MM-DD. */
  date: string;
  /** Local departure time at the origin, HH:MM. */
  departureTime: string;
  /** Local arrival time at the destination, HH:MM, when known. */
  arrivalTime?: string;
  flightNumber?: string;
  seat?: SeatInfo;
  locale: string;
}

export interface BuildData {
  places: DataPlace[];
  areas: Record<string, MultiPolygon>;
  countries: DataCountry[];
}

export function flightIdFor(req: Pick<BuildRequest, 'from' | 'to' | 'date' | 'departureTime' | 'flightNumber'>): string {
  const base = req.flightNumber ? req.flightNumber.replace(/\s+/g, '').toUpperCase() : `${req.from.i}-${req.to.i}`;
  return `${base}-${req.date}-${req.departureTime.replace(':', '')}`;
}

/** The city a flight leaves from or lands in, if the dataset has it near the airport. */
function nearestCity(places: DataPlace[], a: DataAirport): DataPlace | undefined {
  let best: DataPlace | undefined;
  let bestScore = -Infinity;
  for (const p of places) {
    if (p.k !== 'city') continue;
    if (Math.abs(p.lat - a.lat) > 1 || Math.abs(p.lon - a.lon) > 1.5) continue;
    const d = haversine(p.lat, p.lon, a.lat, a.lon);
    if (d > 45) continue;
    const score = p.r * 10 - d;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** Everything that can be computed without a network: route, places, countries, timeline. */
export function composePackage(req: BuildRequest, data: BuildData): OfflinePackage {
  const departure = zonedToUtc(req.date, req.departureTime, req.from.tz);
  const closed = closedCountries({
    carrier: req.flightNumber?.replace(/\s+/g, '').match(/^([A-Z0-9]{2})\d/i)?.[1],
    fromCC: req.from.cc,
    toCC: req.to.cc
  });
  const detour = planAround(req.from, req.to, closed, data.countries);
  const straight = haversine(req.from.lat, req.from.lon, req.to.lat, req.to.lon);
  const distanceKm = straight * detour.ratio;

  let airborne: number | undefined;
  if (req.arrivalTime) {
    // The arrival may be on the next local day (or two, for long-haul westbound).
    let arrival = zonedToUtc(req.date, req.arrivalTime, req.to.tz);
    while (arrival.getTime() <= departure.getTime()) arrival = new Date(arrival.getTime() + 86_400_000);
    const block = (arrival.getTime() - departure.getTime()) / 1000;
    if (block < 30 * 3600) airborne = airborneFromSchedule(block, distanceKm);
  }

  const built = buildRoute({ from: req.from, to: req.to, via: detour.via, airborneSeconds: airborne });
  const sightings = sightingsAlong(built.route, data.places, data.areas);
  const pinned = [nearestCity(data.places, req.from), nearestCity(data.places, req.to)]
    .filter((p): p is DataPlace => !!p)
    .map((p) => p.id);
  const chosen = selectSightings(sightings, built.airborneSeconds, { pinned });
  const pois: POI[] = chosen.map(toPOI);
  const countries = countriesAlong(built.route, data.countries);

  // Scheduled block time includes taxi; the timeline starts at wheels-up.
  const takeoff = new Date(departure.getTime() + 10 * 60 * 1000);
  const moments = computeMoments({
    route: built.route,
    pois,
    countries,
    takeoff,
    topOfDescentAt: built.topOfDescentAt
  });

  const arrival = new Date(departure.getTime() + (built.airborneSeconds + 18 * 60) * 1000);
  const flight: Flight = {
    id: flightIdFor(req),
    flightNumber: req.flightNumber?.toUpperCase() ?? '',
    airline: '',
    origin: toAirport(req.from),
    destination: toAirport(req.to),
    scheduledDeparture: departure.toISOString(),
    scheduledArrival: arrival.toISOString(),
    localDate: req.date
  };

  return {
    version: 2,
    flight,
    route: built.route,
    pois,
    generatedAt: new Date().toISOString(),
    builtBy: 'device',
    countries,
    moments,
    seat: req.seat,
    locale: req.locale,
    routeKind: detour.approximate ? 'approximate' : detour.via.length ? 'detour' : 'direct'
  };
}

export interface BuildDeps {
  data: () => BuildData;
  fetchImpl?: FetchLike;
  cachePhotos?: (flightId: string, pois: POI[], onProgress?: (d: number, t: number) => void) => Promise<POI[]>;
  save: (pkg: OfflinePackage) => Promise<void>;
  downloadMap?: (pkg: OfflinePackage, onProgress: (p: number) => void) => Promise<void>;
  online?: () => boolean;
}

/**
 * The full preparation, in stages the screen can show.
 *
 * The package is saved as soon as the offline part exists and again after each
 * network step, so a passenger who boards halfway through a slow download
 * still flies with everything that finished.
 */
export async function buildFlightPackage(
  req: BuildRequest,
  deps: BuildDeps,
  onProgress?: (p: BuildProgress) => void
): Promise<OfflinePackage> {
  onProgress?.({ stage: 'route', progress: 0 });
  // Yield once so the screen can paint before the synchronous work.
  await new Promise((r) => setTimeout(r, 16));
  let pkg = composePackage(req, deps.data());
  onProgress?.({ stage: 'places', progress: 1 });
  await deps.save(pkg);

  try {
    onProgress?.({ stage: 'stories', progress: 0 });
    const pois = await enrichWithWikipedia(pkg.pois, req.locale, {
      fetchImpl: deps.fetchImpl,
      onProgress: (d, t) => onProgress?.({ stage: 'stories', progress: t ? d / t : 1 })
    });
    pkg = { ...pkg, pois };
    await deps.save(pkg);
  } catch (e) {
    console.warn('[build] stories unavailable', e);
  }

  if (deps.cachePhotos) {
    try {
      onProgress?.({ stage: 'photos', progress: 0 });
      const pois = await deps.cachePhotos(pkg.flight.id, pkg.pois, (d, t) =>
        onProgress?.({ stage: 'photos', progress: t ? d / t : 1 })
      );
      pkg = { ...pkg, pois };
      await deps.save(pkg);
    } catch (e) {
      console.warn('[build] photos unavailable', e);
    }
  }

  if (deps.downloadMap) {
    try {
      onProgress?.({ stage: 'map', progress: 0 });
      await deps.downloadMap(pkg, (p) => onProgress?.({ stage: 'map', progress: p }));
    } catch (e) {
      console.warn('[build] map corridor unavailable', e);
    }
  }

  onProgress?.({ stage: 'done', progress: 1 });
  return pkg;
}
