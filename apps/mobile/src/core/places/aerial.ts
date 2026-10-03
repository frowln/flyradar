import type { POI } from '@skyatlas/shared';

/**
 * Satellite views of places ("from above").
 *
 * The browser build carries a set made for its demo routes
 * (scripts/content/satellite.mjs → public/sat/); see aerial.web.ts. The
 * phone app shows the photographs downloaded for each flight instead, for
 * now.
 */
export async function aerialReady(): Promise<void> {}

export function withAerial(pois: POI[]): POI[] {
  return pois;
}
