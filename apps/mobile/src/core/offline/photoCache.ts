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

export async function cachePhotos(
  flightId: string,
  pois: POI[],
  onProgress?: (done: number, total: number) => void
): Promise<POI[]> {
  const dir = dirFor(flightId);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const withPhotos = pois.filter((p) => p.photos[0]?.startsWith('http'));
  let done = 0;
  const local = new Map<string, string>();
  let next = 0;
  const worker = async () => {
    while (next < withPhotos.length) {
      const poi = withPhotos[next++]!;
      const url = poi.photos[0]!;
      const ext = /\.png($|\?)/i.test(url) ? 'png' : 'jpg';
      const target = `${dir}${encodeURIComponent(poi.id)}.${ext}`;
      try {
        const res = await FileSystem.downloadAsync(url, target);
        if (res.status === 200) local.set(poi.id, res.uri);
      } catch {
        // No photo is fine; the card has a drawn figure instead.
      }
      onProgress?.(++done, withPhotos.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, withPhotos.length) }, worker));
  return pois.map((p) => (local.has(p.id) ? { ...p, photos: [local.get(p.id)!, ...p.photos] } : p));
}

export async function deletePhotos(flightId: string): Promise<void> {
  await FileSystem.deleteAsync(dirFor(flightId), { idempotent: true }).catch(() => {});
}
