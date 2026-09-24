import type { OfflinePackage } from '@skyatlas/shared';
import { composePackage } from './buildPackage';
import { savePackage } from './packageStore';
import { enrichWithWikipedia } from '../places/wiki';
import { airportByIata, ensureDatasets, getAreas, getCountries, getHistory, getPlaces, loadStories } from '../data/datasets';
import { takeOff } from '../flight/controller';
import { formatClock, localDate } from '../time/zones';
import { buildRoute } from '../route/profile';
import { closedCountries, planAround } from '../route/airspace';
import type { RoutePoint } from '@skyatlas/shared';

/**
 * A short flight that starts now, so the product can be felt without a ticket.
 *
 * The route is picked by language — a Russian speaker gets Moscow–Sochi down to
 * the Caucasus, everyone else Zürich–Rome over the Alps — because a demo over
 * familiar ground lands harder than one over somewhere abstract. It runs twenty
 * times faster than real time, is built instantly from bundled data, and never
 * enters the passport.
 */

const ROUTES: Record<string, [string, string]> = {
  ru: ['SVO', 'AER'],
  default: ['ZRH', 'FCO']
};

export const DEMO_SPEED = 20;

export function demoRoute(locale: string): [string, string] {
  return ROUTES[locale.slice(0, 2)] ?? ROUTES['default']!;
}

/** The demo route as it will be flown — detours included — for illustrations. */
export function demoPreviewRoute(locale: string): RoutePoint[] | null {
  try {
    const [a, b] = demoRoute(locale);
    const from = airportByIata(a);
    const to = airportByIata(b);
    if (!from || !to) return null;
    const detour = planAround(from, to, closedCountries({ fromCC: from.cc, toCC: to.cc }), getCountries());
    return buildRoute({ from, to, via: detour.via }).route;
  } catch {
    return null;
  }
}

export async function startDemo(locale: string): Promise<OfflinePackage> {
  await ensureDatasets();
  const stories = await loadStories(locale);
  const [fromCode, toCode] = demoRoute(locale);
  const from = airportByIata(fromCode);
  const to = airportByIata(toCode);
  if (!from || !to) throw new Error('demo airports missing from dataset');

  const now = new Date();
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
  pkg.flight = { ...pkg.flight, id: `DEMO-${fromCode}-${toCode}`, flightNumber: 'DEMO' };
  await savePackage(pkg);
  await takeOff(pkg, now, { multiplier: DEMO_SPEED });

  // Stories arrive in the background if there is a connection; the demo does
  // not wait for them.
  enrichWithWikipedia(pkg.pois, locale)
    .then((pois) => savePackage({ ...pkg, pois }))
    .catch(() => {});

  return pkg;
}
