import type { RoutePoint } from '@skyatlas/shared';

/** Browser preview: tiles are not packaged. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
export interface CorridorProgress {
  progress: number;
  completedTiles: number;
  totalTiles: number;
}
export async function downloadCorridor(_flightId: string, _route: RoutePoint[], _onProgress?: (p: CorridorProgress) => void): Promise<void> {}
export async function hasCorridor(_flightId: string): Promise<boolean> {
  return false;
}
export async function deleteCorridor(_flightId: string): Promise<void> {}
