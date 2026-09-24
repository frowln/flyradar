import type { RoutePoint } from '@skyatlas/shared';

/**
 * Browser build: tiles are not packaged, and a hosted demo cannot reach tile
 * servers at all. The web map draws its relief from elevation tiles shipped
 * with the build (public/dem/, see scripts/preview/fetch-dem.mjs).
 */
export const MAP_STYLE_DAY = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_STYLE_NIGHT = 'https://tiles.openfreemap.org/styles/dark';
export const RELIEF_TILES = 'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png';
export const DEM_TILES = 'dem://{z}/{x}/{y}';
export const DEM_MAX_ZOOM = 7;
export interface CorridorProgress {
  progress: number;
  completedTiles: number;
  totalTiles: number;
}
export function demTilesFor(_route: RoutePoint[]): string[] {
  return [];
}
export async function downloadRelief(_route: RoutePoint[]): Promise<void> {}
export async function downloadCorridor(_flightId: string, _route: RoutePoint[], _onProgress?: (p: CorridorProgress) => void): Promise<void> {}
export async function hasCorridor(_flightId: string): Promise<boolean> {
  return false;
}
export async function deleteCorridor(_flightId: string): Promise<void> {}
