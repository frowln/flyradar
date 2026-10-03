import type { OfflinePackage } from '@skyatlas/shared';
import { composePackage } from './buildPackage';
import { savePackage } from './packageStore';
import { enrichWithWikipedia } from '../places/wiki';
import { airportByIata, ensureDatasets, getAreas, getCountries, getHistory, getPlaces, loadStories } from '../data/datasets';
import { takeOff } from '../flight/controller';
import { downloadRelief } from '../map/offlineMap';
import { aerialReady } from '../places/aerial';
import { formatClock, localDate } from '../time/zones';
import { buildRoute } from '../route/profile';
import { closedCountries, planAround } from '../route/airspace';
import type { RoutePoint } from '@skyatlas/shared';
import { interpolateAlongRoute } from '../geo/greatCircle';
import { solarElevation } from '../geo/sun';
import { DEMO_COUNTS } from '../api/demoFlag';

/**
 * A short flight that starts now, so the product can be felt without a ticket.
 *
 * The route is picked by language — a Russian speaker gets Moscow–Sochi down to
 * the Caucasus, everyone else Zürich–Rome over the Alps — because a demo over
 * familiar ground lands harder than one over somewhere abstract. But only in
 * daylight: at night the window shows city lights and little else, and a demo
 * opened in the evening (or by an App Store reviewer in California) would sell
 * the product as "nothing to see". Then it flies wherever it is day now — the
 * Himalayas, Mount Fuji, the Andes, the Rockies, New Zealand's Alps. It runs
 * twenty times faster than real time, is built instantly from bundled data,
 * and never enters the passport.
 */

const HOME: Record<string, [string, string]> = {
  ru: ['SVO', 'AER'],
  default: ['ZRH', 'FCO']
};

/** Daylight fallbacks around the clock, each over something worth seeing. */
const AROUND_THE_CLOCK: Array<[string, string]> = [
  ['ZRH', 'FCO'],
  ['SVO', 'AER'],
  ['DEL', 'KTM'],
  ['HND', 'ITM'],
  ['AKL', 'ZQN'],
  ['LIM', 'CUZ'],
  ['YVR', 'YYC']
];

/** What each demo route flies over, as an i18n key under `board.demoOver`. */
export const DEMO_ROUTES: Array<{ pair: [string, string]; over: string }> = [
  { pair: ['SVO', 'AER'], over: 'caucasus' },
  { pair: ['ZRH', 'FCO'], over: 'alps' },
  { pair: ['DEL', 'KTM'], over: 'himalaya' },
  { pair: ['HND', 'ITM'], over: 'fuji' },
  { pair: ['AKL', 'ZQN'], over: 'southernAlps' },
  { pair: ['LIM', 'CUZ'], over: 'andes' },
  { pair: ['YVR', 'YYC'], over: 'rockies' }
];

export const DEMO_SPEED = 20;

export function planned(a: string, b: string): RoutePoint[] | null {
  const from = airportByIata(a);
  const to = airportByIata(b);
  if (!from || !to) return null;
  const detour = planAround(from, to, closedCountries({ fromCC: from.cc, toCC: to.cc }), getCountries());
  return buildRoute({ from, to, via: detour.via }).route;
}

/** Whether the ground is lit along the whole route for a flight taking off now. */
export function daylitThroughout(route: RoutePoint[], takeoff: Date): boolean {
  const end = route[route.length - 1]?.elapsedSeconds ?? 0;
  for (let t = 0; t <= end; t += 300) {
    const p = interpolateAlongRoute(route, t);
    // A few degrees of margin: low sun is dim, and the demo is a first impression.
    if (solarElevation(p.lat, p.lon, new Date(takeoff.getTime() + t * 1000)) < 5) return false;
  }
  return true;
}

export function demoRoute(locale: string, now: Date = new Date()): [string, string] {
  const home = HOME[locale.slice(0, 2)] ?? HOME['default']!;
  for (const pair of [home, ...AROUND_THE_CLOCK]) {
    try {
      const route = planned(pair[0], pair[1]);
      if (route && daylitThroughout(route, now)) return pair;
    } catch {
      // A dataset not loaded yet: fall through to the home route.
    }
  }
  return home;
}

/** The demo route as it will be flown — detours included — for illustrations. */
export function demoPreviewRoute(locale: string, now: Date = new Date()): RoutePoint[] | null {
  try {
    const [a, b] = demoRoute(locale, now);
    return planned(a, b);
  } catch {
    return null;
  }
}

/** Starts the demo now: on the route given, or the one {@link demoRoute} picks. */
export async function startDemo(locale: string, pair?: [string, string]): Promise<OfflinePackage> {
  await ensureDatasets();
  const stories = await loadStories(locale);
  await aerialReady();
  const now = new Date();
  const [fromCode, toCode] = pair ?? demoRoute(locale, now);
  const from = airportByIata(fromCode);
  const to = airportByIata(toCode);
  if (!from || !to) throw new Error('demo airports missing from dataset');

  // The package is timed to start ten minutes ago on the ground clock, so the
  // takeoff moment below lines up with "now".
  const dep = new Date(now.getTime() - 10 * 60_000);
  const pkg: OfflinePackage = {
    ...composePackage(
      {
        from,
        to,
        date: localDate(dep, from.tz),
        departureTime: formatClock(dep, from.tz),
        locale
      },
      { places: getPlaces(), areas: getAreas(), countries: getCountries(), history: getHistory(), stories }
    ),
    demo: true
  };
  // Where demos count into the passport, each is its own flight there.
  const id = DEMO_COUNTS ? `DEMO-${fromCode}-${toCode}-${now.getTime().toString(36)}` : `DEMO-${fromCode}-${toCode}`;
  pkg.flight = { ...pkg.flight, id, flightNumber: 'DEMO' };
  await savePackage(pkg);
  await takeOff(pkg, now, { multiplier: DEMO_SPEED });

  // Mountain shading and stories arrive in the background if there is a
  // connection; the demo does not wait for them.
  downloadRelief(pkg.route).catch(() => {});
  enrichWithWikipedia(pkg.pois, locale)
    .then((pois) => savePackage({ ...pkg, pois }))
    .catch(() => {});

  return pkg;
}
