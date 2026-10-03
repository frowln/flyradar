import { describe, it, expect } from 'vitest';
import { panorama, project, visible, screenY, type PanoramaInput } from '../../src/core/view/panorama';
import { Terrain } from '../../src/core/view/terrain';
import { haversine } from '../../src/core/geo/greatCircle';

// A flat sea with one cone: a 5 km volcano 120 km east of the aircraft.
const PEAK = { lat: 45, lon: 31.53 };
const cone = (lat: number, lon: number) => {
  const d = haversine(lat, lon, PEAK.lat, PEAK.lon);
  return Math.max(0, 5000 - d * 250);
};
const base = (over: Partial<PanoramaInput> = {}): PanoramaInput => ({
  lat: 45,
  lon: 30,
  altM: 11000,
  heading: 0,
  side: 'right',
  heightAt: cone,
  width: 400,
  height: 240,
  ...over
});

describe('the view from the window', () => {
  it('puts the sea horizon a few degrees below level and things farther higher up the screen', () => {
    const v = base();
    expect(screenY(v, 300, 0)).toBeLessThan(screenY(v, 50, 0));
    const p = panorama(v);
    expect(p.horizonY).toBeGreaterThan(0);
    expect(p.horizonY).toBeLessThan(v.height);
    expect(p.maxKm).toBeGreaterThan(400);
  });

  it('raises the skyline where the volcano stands, in the middle of the right window', () => {
    const v = base();
    const p = panorama(v);
    // Heading north, the right window faces east: the volcano is straight ahead in it.
    const mid = Math.round(p.xs.length / 2);
    const top = (c: number) => Math.min(...p.bands.map((b) => b.ridge[c]!));
    expect(top(mid)).toBeLessThan(top(0) - 10);
    const at = project(v, PEAK.lat, PEAK.lon, 5000)!;
    expect(Math.abs(at.x - v.width / 2)).toBeLessThan(10);
    expect(visible(p, at.x, v.width, at.d, at.y)).toBe(true);
  });

  it('does not see the volcano from the left window', () => {
    expect(project(base({ side: 'left' }), PEAK.lat, PEAK.lon, 5000)).toBeNull();
  });

  it('hides a point behind a nearer, higher ridge', () => {
    const v = base();
    const p = panorama(v);
    // Sea level just behind the volcano, on the same line of sight.
    const behind = project(v, 45, 32.1, 0)!;
    expect(visible(p, behind.x, v.width, behind.d, behind.y)).toBe(false);
  });
});

describe('ground heights from tiles', () => {
  it('reads a tile at the finest zoom available and nothing where there is none', async () => {
    const flat = new Float32Array(256 * 256).fill(1234);
    const t = new Terrain(async (z) => (z === 5 ? flat : null), [6, 5]);
    await t.prefetch(45, 30, 200);
    expect(t.heightAt(45, 30)).toBeCloseTo(1234);
    const none = new Terrain(async () => null, [6, 5]);
    await none.prefetch(45, 30, 200);
    expect(none.heightAt(45, 30)).toBeNull();
  });
});
