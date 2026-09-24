import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Rect } from 'react-native-svg';
import type { POI, RoutePoint } from '@skyatlas/shared';
import { palette } from '../design/tokens';
import { getCountries } from '../../src/core/data/datasets';
import type { DataCountry } from '../../src/core/data/types';

/**
 * The route as an atlas plate.
 *
 * Drawn from the bundled country outlines rather than map tiles, so it renders
 * instantly, offline, at any size — on the board before departure, on the
 * postcard after landing, and anywhere the tile map is unavailable. Countries
 * the flight crosses are drawn a step brighter; everything else is a hairline.
 */

interface Props {
  route: RoutePoint[];
  width: number;
  height: number;
  /** Seconds flown; the part behind is drawn lit. */
  flownS?: number;
  pois?: POI[];
  /** Countries crossed, drawn brighter. */
  highlight?: string[];
  /** Ids drawn filled (opened or spotted). */
  lit?: Set<string>;
  plane?: { lat: number; lon: number } | null;
  background?: string;
}

type XY = [number, number];

function projector(route: RoutePoint[], width: number, height: number, pad: number) {
  const lons = route.map((p) => p.lon);
  const spansDateline = Math.max(...lons) - Math.min(...lons) > 180;
  const normLon = (lon: number) => (spansDateline && lon < 0 ? lon + 360 : lon);

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of route) {
    const lon = normLon(p.lon);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }
  const midLat = (minLat + maxLat) / 2;
  const k = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));

  // Pad the box so the route never touches the edge, and keep a sane minimum
  // extent so a short hop is not magnified into abstraction.
  let spanX = (maxLon - minLon) * k;
  let spanY = maxLat - minLat;
  const minSpan = 4;
  if (spanX < minSpan) {
    const grow = (minSpan - spanX) / k / 2;
    minLon -= grow;
    maxLon += grow;
    spanX = minSpan;
  }
  if (spanY < minSpan) {
    const grow = (minSpan - spanY) / 2;
    minLat -= grow;
    maxLat += grow;
    spanY = minSpan;
  }
  const marginX = spanX * 0.12;
  const marginY = spanY * 0.18;
  const scale = Math.min((width - 2 * pad) / (spanX + 2 * marginX), (height - 2 * pad) / (spanY + 2 * marginY));
  const cx = ((minLon + maxLon) / 2) * k;
  const cy = (minLat + maxLat) / 2;

  const project = (lon: number, lat: number): XY => [
    width / 2 + (normLon(lon) * k - cx) * scale,
    height / 2 - (lat - cy) * scale
  ];
  const view = {
    minLon: minLon - marginX / k - 5,
    maxLon: maxLon + marginX / k + 5,
    minLat: minLat - marginY - 5,
    maxLat: maxLat + marginY + 5
  };
  return { project, view, normLon };
}

function ringPath(ring: [number, number][], project: (lon: number, lat: number) => XY): string {
  let d = '';
  let last: XY | null = null;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i]![0], ring[i]![1]);
    // Skip sub-pixel steps: outlines are dense and the path is redrawn often.
    if (last && Math.abs(x - last[0]) < 0.8 && Math.abs(y - last[1]) < 0.8 && i < ring.length - 1) continue;
    d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    last = [x, y];
  }
  return d ? `${d}Z` : '';
}

function countryPaths(
  countries: DataCountry[],
  view: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  normLon: (lon: number) => number,
  project: (lon: number, lat: number) => XY
) {
  const out: Array<{ cc: string; d: string }> = [];
  for (const c of countries) {
    const [w, s, e, n] = c.bb;
    const west = normLon(w);
    const east = normLon(e);
    const lonOverlap = Math.max(west, view.minLon) <= Math.min(Math.max(east, west), view.maxLon) || e - w > 300;
    if (!lonOverlap || n < view.minLat || s > view.maxLat) continue;
    let d = '';
    for (const poly of c.g) {
      const outer = poly[0];
      if (outer && outer.length > 2) d += ringPath(outer, project);
    }
    if (d) out.push({ cc: c.cc, d });
  }
  return out;
}

function RouteSketch({ route, width, height, flownS, pois = [], highlight = [], lit, plane, background }: Props) {
  const geo = useMemo(() => {
    if (route.length < 2) return null;
    const { project, view, normLon } = projector(route, width, height, 6);
    let countries: DataCountry[] = [];
    try {
      countries = getCountries();
    } catch {
      // Datasets missing in a test build: the route alone still draws.
    }
    const paths = countryPaths(countries, view, normLon, project);
    const line = (pts: RoutePoint[]) =>
      pts.map((p, i) => {
        const [x, y] = project(p.lon, p.lat);
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join('');
    return { project, paths, full: line(route), line };
  }, [route, width, height]);

  if (!geo) return <View style={{ width, height }} />;

  const flown = flownS != null ? route.filter((p) => p.elapsedSeconds <= flownS) : [];
  const hi = new Set(highlight);
  const [ox, oy] = geo.project(route[0]!.lon, route[0]!.lat);
  const last = route[route.length - 1]!;
  const [dx, dy] = geo.project(last.lon, last.lat);
  const planeXY = plane ? geo.project(plane.lon, plane.lat) : null;

  return (
    <View style={[styles.wrap, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Rect width={width} height={height} fill={background ?? palette.void} />
        <G>
          {geo.paths.map((p) => (
            <Path
              key={p.cc}
              d={p.d}
              fill={hi.has(p.cc) ? palette.lifted : palette.raised}
              stroke={hi.has(p.cc) ? palette.inkDim : palette.rule}
              strokeWidth={hi.has(p.cc) ? 0.9 : 0.6}
            />
          ))}
        </G>
        <Path d={geo.full} stroke={palette.inkMuted} strokeWidth={1.2} strokeDasharray="3 4" fill="none" />
        {flown.length > 1 ? <Path d={geo.line(flown)} stroke={palette.amber} strokeWidth={2.2} fill="none" strokeLinecap="round" /> : null}
        {pois.map((poi) => {
          const [x, y] = geo.project(poi.lon, poi.lat);
          const on = lit?.has(poi.id);
          return (
            <Circle
              key={poi.id}
              cx={x}
              cy={y}
              r={on ? 3 : 2.2}
              fill={on ? palette.amber : palette.ground}
              stroke={on ? palette.amber : palette.inkMuted}
              strokeWidth={1}
            />
          );
        })}
        <Circle cx={ox} cy={oy} r={3.5} fill={palette.amber} />
        <Circle cx={dx} cy={dy} r={3.5} fill={palette.ground} stroke={palette.amber} strokeWidth={1.5} />
        {planeXY ? (
          <G>
            <Circle cx={planeXY[0]} cy={planeXY[1]} r={9} fill="none" stroke={palette.amberDim} strokeWidth={1} />
            <Circle cx={planeXY[0]} cy={planeXY[1]} r={4} fill={palette.amber} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

export default memo(RouteSketch);

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' }
});
