import type { POI } from '@skyatlas/shared';

/** Browser preview: images stay remote. */
export async function cachePhotos(_flightId: string, pois: POI[]): Promise<POI[]> {
  return pois;
}

export async function deletePhotos(_flightId: string): Promise<void> {}
