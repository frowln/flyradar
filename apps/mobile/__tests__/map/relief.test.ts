import { describe, it, expect, vi } from 'vitest';
import type { RoutePoint } from '@skyatlas/shared';

vi.mock('@maplibre/maplibre-react-native', () => ({ OfflineManager: {} }));
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///doc/' }));
const { demTilesFor, DEM_TILES } = await import('../../src/core/map/offlineMap');

const at = (lat: number, lon: number): RoutePoint => ({ lat, lon, altitude: 11000, elapsedSeconds: 0 });

describe('elevation tiles for a corridor', () => {
  it('covers the track with a margin at every zoom, from the phone', () => {
    const tiles = demTilesFor([at(46.0, 8.0), at(45.0, 9.0)]);
    // Zoom 3: the Alps sit in one tile (x 4, y 2).
    expect(tiles).toContain('3/4/2');
    // Zoom 7 spans several tiles either side of the track, and nothing far away.
    const z7 = tiles.filter((k) => k.startsWith('7/'));
    expect(z7.length).toBeGreaterThan(3);
    expect(z7.length).toBeLessThan(40);
    expect(DEM_TILES).toBe('file:///doc/dem/{z}/{x}/{y}.png');
  });

  it('wraps across the date line instead of spanning the globe', () => {
    const z5 = demTilesFor([at(52, 179.5), at(52, -179.5)]).filter((k) => k.startsWith('5/'));
    const xs = new Set(z5.map((k) => Number(k.split('/')[1])));
    expect([...xs].every((x) => x <= 1 || x >= 30)).toBe(true);
  });
});
