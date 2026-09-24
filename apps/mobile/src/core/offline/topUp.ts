import type { OfflinePackage } from '@skyatlas/shared';
import { enrichWithWikipedia } from '../places/wiki';
import { listPackages, savePackage } from './packageStore';
import { cachePhotos } from './photoCache';
import { downloadCorridor, hasCorridor } from '../map/offlineMap';
import { useSession } from '../flight/session';
import { API_ENABLED } from '../api/client';
import { fetchClouds } from '../api/flights';
import { fetchCloudsFor } from '../flight/clouds';

/**
 * Finishing what the first preparation could not.
 *
 * A flight added in the metro or on hotel Wi-Fi that dropped has its route and
 * places but no stories, photos or map. Whenever the app starts with a
 * connection, flights still ahead are topped up quietly: missing stories (or
 * all of them, if the reader has changed language since), photos not yet on the
 * phone, and the map corridor. Nothing runs while a flight is in the air.
 * With a server, flights in the next three days also get a fresher cloud
 * forecast: it sharpens by the day as departure nears.
 */

const HORIZON_MS = 14 * 24 * 3600_000;
const CLOUD_REFRESH_WITHIN_MS = 3 * 24 * 3600_000;
/** A forecast younger than this is as good as a new one; models run every few hours. */
const CLOUD_MAX_AGE_MS = 3 * 3600_000;

function cloudsDue(pkg: OfflinePackage, now: Date): boolean {
  const dep = Date.parse(pkg.flight.scheduledDeparture);
  if (!Number.isFinite(dep) || dep < now.getTime() || dep - now.getTime() > CLOUD_REFRESH_WITHIN_MS) return false;
  const fetched = Date.parse(pkg.cloudsAt ?? '');
  return !Number.isFinite(fetched) || now.getTime() - fetched >= CLOUD_MAX_AGE_MS;
}

/** The package with a fresh forecast, or unchanged when none could be had. */
async function refreshClouds(pkg: OfflinePackage, now: Date): Promise<OfflinePackage> {
  if (!API_ENABLED || !cloudsDue(pkg, now)) return pkg;
  const clouds = await fetchCloudsFor(pkg, fetchClouds, now);
  if (!clouds) return pkg;
  const next = { ...pkg, clouds, cloudsAt: now.toISOString() };
  await savePackage(next);
  return next;
}

function sameLang(pkg: OfflinePackage, locale: string): boolean {
  return (pkg.locale ?? 'en').slice(0, 2) === locale.slice(0, 2);
}

/** Places that could have a story and have not been looked up successfully. */
function missing(pkg: OfflinePackage) {
  const skip = new Set(pkg.storyless ?? []);
  return pkg.pois.filter((p) => p.wikidata && !p.textSource && !skip.has(p.id));
}

export async function topUpFlight(pkg: OfflinePackage, locale: string, now: Date = new Date()): Promise<OfflinePackage> {
  let next = await refreshClouds(pkg, now);
  const relang = !sameLang(pkg, locale);
  const todo = relang ? pkg.pois : missing(pkg);
  if (todo.length) {
    const enriched = await enrichWithWikipedia(todo, locale);
    const found = enriched.filter((p) => p.textSource);
    // Nothing at all came back: most likely no connection. Try again next time.
    if (found.length === 0) return next;
    const byId = new Map(found.map((p) => [p.id, p]));
    const none = todo.filter((p) => !byId.has(p.id)).map((p) => p.id);
    next = {
      ...next,
      locale,
      pois: next.pois.map((p) => byId.get(p.id) ?? p),
      storyless: relang ? none : [...(pkg.storyless ?? []), ...none]
    };
    await savePackage(next);
  }
  if (next.pois.some((p) => p.photos[0]?.startsWith('http'))) {
    next = { ...next, pois: await cachePhotos(next.flight.id, next.pois) };
    await savePackage(next);
  }
  if (!(await hasCorridor(next.flight.id))) {
    await downloadCorridor(next.flight.id, next.route).catch(() => {});
  }
  return next;
}

let running: Promise<number> | null = null;

/** Tops up every flight in the next two weeks; resolves to how many changed. */
export function topUpAll(locale: string, now: Date = new Date()): Promise<number> {
  running ??= (async () => {
    const s = useSession.getState();
    if (s.flightId && !s.landedAt) return 0;
    let changed = 0;
    for (const pkg of await listPackages()) {
      if (pkg.demo) continue;
      const dep = new Date(pkg.flight.scheduledDeparture).getTime();
      if (dep < now.getTime() - 3600_000 || dep > now.getTime() + HORIZON_MS) continue;
      try {
        const after = await topUpFlight(pkg, locale, now);
        if (after !== pkg) changed++;
      } catch {
        // Offline or a service down: the next launch tries again.
      }
    }
    return changed;
  })().finally(() => {
    running = null;
  });
  return running;
}
