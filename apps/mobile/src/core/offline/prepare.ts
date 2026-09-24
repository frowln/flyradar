import type { OfflinePackage } from '@skyatlas/shared';
import { buildFlightPackage, type BuildProgress, type BuildRequest } from './buildPackage';
import { savePackage } from './packageStore';
import { cachePhotos } from './photoCache';
import { downloadCorridor } from '../map/offlineMap';
import { ensureDatasets, getAreas, getCountries, getHistory, getPlaces, loadStories } from '../data/datasets';
import { API_ENABLED } from '../api/client';
import { fetchClouds, fetchTrack } from '../api/flights';

/**
 * Prepares a flight on this phone with the bundled data and the real storage.
 *
 * With a server configured, the route comes from the track the flight number
 * flew this week when there is one, and the cloud forecast is added; without
 * one, neither is asked for and nothing changes.
 */
export async function prepareFlight(req: BuildRequest, onProgress?: (p: BuildProgress) => void): Promise<OfflinePackage> {
  await ensureDatasets();
  const stories = await loadStories(req.locale);
  return buildFlightPackage(
    req,
    {
      data: () => ({ places: getPlaces(), areas: getAreas(), countries: getCountries(), history: getHistory(), stories }),
      save: savePackage,
      cachePhotos,
      downloadMap: (pkg, report) => downloadCorridor(pkg.flight.id, pkg.route, (p) => report(p.progress)),
      ...(API_ENABLED ? { fetchTrack, fetchClouds } : {})
    },
    onProgress
  );
}
