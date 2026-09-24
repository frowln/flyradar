import * as FileSystem from 'expo-file-system/legacy';
import type { POI } from '@skyatlas/shared';

/**
 * Photos kept on the phone for the flight.
 *
 * A URL is useless at cruise. Each card's lead image is downloaded into the
 * flight's own folder while there is still a connection, and the package is
 * rewritten to point at the local file.
 */

function dirFor(flightId: string): string {
  return `${FileSystem.documentDirectory}flights/${encodeURIComponent(flightId)}/`;
}

/** Places whose whole gallery is kept; the rest keep their lead photo only. */
const GALLERY_PLACES = 15;

export async function cachePhotos(
  flightId: string,
  pois: POI[],
  onProgress?: (done: number, total: number) => void
): Promise<POI[]> {
  const dir = dirFor(flightId);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const best = new Set(
    [...pois]
      .filter((p) => p.photos.length > 1)
      .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
      .slice(0, GALLERY_PLACES)
      .map((p) => p.id)
  );
  // Every remote photo worth keeping, as (place, index) pairs.
  const jobs: Array<{ poi: POI; i: number }> = [];
  for (const poi of pois) {
    const count = best.has(poi.id) ? poi.photos.length : 1;
    for (let i = 0; i < Math.min(count, poi.photos.length); i++) {
      if (poi.photos[i]!.startsWith('http')) jobs.push({ poi, i });
    }
  }
  let done = 0;
  const local = new Map<string, string>();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { poi, i } = jobs[next++]!;
      const url = poi.photos[i]!;
      const ext = /\.png($|\?)/i.test(url) ? 'png' : 'jpg';
      const target = `${dir}${encodeURIComponent(poi.id)}-${i}.${ext}`;
      try {
        const res = await FileSystem.downloadAsync(url, target);
        if (res.status === 200) local.set(`${poi.id}#${i}`, res.uri);
      } catch {
        // No photo is fine; the card has a drawn figure instead.
      }
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  // Replaced in place, so photo credits stay index for index; a photo that
  // did not download keeps its URL and simply shows when there is a signal.
  return pois.map((p) => {
    if (!p.photos.some((_, i) => local.has(`${p.id}#${i}`))) return p;
    return { ...p, photos: p.photos.map((url, i) => local.get(`${p.id}#${i}`) ?? url) };
  });
}

export async function deletePhotos(flightId: string): Promise<void> {
  await FileSystem.deleteAsync(dirFor(flightId), { idempotent: true }).catch(() => {});
}
