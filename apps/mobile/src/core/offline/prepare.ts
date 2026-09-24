import type { OfflinePackage } from '@skyatlas/shared';
import { buildFlightPackage, type BuildProgress, type BuildRequest } from './buildPackage';
import { savePackage } from './packageStore';
import { cachePhotos } from './photoCache';
import { downloadCorridor } from '../map/offlineMap';
import { ensureDatasets, getAreas, getCountries, getHistory, getPlaces, loadStories } from '../data/datasets';

/** Prepares a flight on this phone with the bundled data and the real storage. */
export async function prepareFlight(req: BuildRequest, onProgress?: (p: BuildProgress) => void): Promise<OfflinePackage> {
  await ensureDatasets();
  const stories = await loadStories(req.locale);
  return buildFlightPackage(
    req,
    {
      data: () => ({ places: getPlaces(), areas: getAreas(), countries: getCountries(), history: getHistory(), stories }),
      save: savePackage,
      cachePhotos,
      downloadMap: (pkg, report) => downloadCorridor(pkg.flight.id, pkg.route, (p) => report(p.progress))
    },
    onProgress
  );
}
