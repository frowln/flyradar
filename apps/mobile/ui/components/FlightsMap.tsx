import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import { palette } from '../design/tokens';
import { decorative } from '../design/layout';
import { getCountries } from '../../src/core/data/datasets';
import type { DataCountry } from '../../src/core/data/types';
import { gcInterpolate } from '../../src/core/geo/greatCircle';
import { projector, countryPaths } from './RouteSketch';

/**
 * Every flight as a thread across the map: the passport's countries lit,
 * each route a great-circle arc, the airports as the knots that tie them.
 *
 * Drawn from the bundled country outlines, so it works offline and costs
 * nothing to render; the frame fits the flights, from a weekend hop to a
 * globe-spanning year.
 */

export interface MapFlight {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
}

interface Props {
  flights: MapFlight[];
  width: number;
  height: number;
  /** Countries visited, drawn lit. */
  visited?: string[];
  /** The newest flight, drawn brightest. */
  latest?: number;
  background?: string;
}

const WORLD = [
  { lat: 62, lon: -150 },
  { lat: -42, lon: 160 }
];

function arc(f: MapFlight, steps = 48): Array<{ lat: number; lon: number }> {
  const pts: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i <= steps; i++) pts.push(gcInterpolate(f.from.lat, f.from.lon, f.to.lat, f.to.lon, i / steps));
  // Keep longitudes continuous so an arc over the date line is one stroke.
  for (let i = 1; i < pts.length; i++) {
    while (pts[i]!.lon - pts[i - 1]!.lon > 180) pts[i]!.lon -= 360;
    while (pts[i]!.lon - pts[i - 1]!.lon < -180) pts[i]!.lon += 360;
  }
  return pts;
}

function FlightsMap({ flights, width, height, visited = [], latest, background }: Props) {
  const geo = useMemo(() => {
    const arcs = flights.map((f) => arc(f));
    const all = arcs.flat();
    // No flights yet: the world, waiting.
    const frame = all.length ? all : WORLD;
    const { project, view, normLon } = projector(frame, width, height, 10);
    let countries: DataCountry[] = [];
    try {
      countries = getCountries();
    } catch {
      // Datasets missing in a test build: the arcs alone still draw.
    }
    const paths = countryPaths(countries, view, normLon, project);
    const lines = arcs.map((pts) =>
      pts
        .map((p, i) => {
          const [x, y] = project(p.lon, p.lat);
          return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join('')
    );
    const knots = new Map<string, [number, number]>();
    for (const f of flights) {
      for (const p of [f.from, f.to]) {
        const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
        if (!knots.has(key)) knots.set(key, project(p.lon, p.lat));
      }
    }
    return { paths, lines, knots: [...knots.values()] };
  }, [flights, width, height]);

  const lit = new Set(visited);
  const newest = latest ?? flights.length - 1;

  return (
    <View {...decorative} style={[styles.wrap, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="knot" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.amber} stopOpacity={0.55} />
            <Stop offset="1" stopColor={palette.amber} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill={background ?? palette.void} />
        <G>
          {geo.paths.map((p) => (
            <Path
              key={p.cc}
              d={p.d}
              fill={lit.has(p.cc) ? palette.warm : palette.raised}
              stroke={lit.has(p.cc) ? palette.amberDim : palette.rule}
              strokeWidth={lit.has(p.cc) ? 0.9 : 0.5}
            />
          ))}
        </G>
        {geo.lines.map((d, i) => (
          <G key={i}>
            <Path d={d} stroke={palette.amber} strokeOpacity={0.18} strokeWidth={5} fill="none" strokeLinecap="round" />
            <Path
              d={d}
              stroke={i === newest ? palette.amber : palette.amberDim}
              strokeWidth={i === newest ? 2 : 1.4}
              fill="none"
              strokeLinecap="round"
            />
          </G>
        ))}
        {geo.knots.map(([x, y], i) => (
          <G key={i}>
            <Circle cx={x} cy={y} r={7} fill="url(#knot)" />
            <Circle cx={x} cy={y} r={2.4} fill={palette.ground} stroke={palette.amber} strokeWidth={1.3} />
          </G>
        ))}
      </Svg>
    </View>
  );
}

export default memo(FlightsMap);

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' }
});
