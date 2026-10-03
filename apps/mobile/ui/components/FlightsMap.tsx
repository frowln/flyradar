import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Rect, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import { palette } from '../design/tokens';
import { decorative } from '../design/layout';
import { getCountries } from '../../src/core/data/datasets';
import type { DataCountry } from '../../src/core/data/types';
import { gcInterpolate } from '../../src/core/geo/greatCircle';
import { projector, countryPaths, ATLAS } from './RouteSketch';

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

type LL = { lat: number; lon: number };

/** A flight's great circle, cut where it crosses the date line, so it leaves one edge of the map and comes back in at the other. */
function arc(f: MapFlight, steps = 48): LL[][] {
  const parts: LL[][] = [[]];
  let prev: LL | null = null;
  for (let i = 0; i <= steps; i++) {
    const p = gcInterpolate(f.from.lat, f.from.lon, f.to.lat, f.to.lon, i / steps);
    if (prev && Math.abs(p.lon - prev.lon) > 180) parts.push([]);
    parts[parts.length - 1]!.push(p);
    prev = p;
  }
  return parts.filter((part) => part.length > 1);
}

function FlightsMap({ flights, width, height, visited = [], latest, background }: Props) {
  const geo = useMemo(() => {
    const arcs = flights.map((f) => arc(f));
    const all = arcs.flat(2);
    // No flights yet: the world, waiting.
    const frame = all.length ? all : WORLD;
    // Flights on both sides of the date line: the whole world, Greenwich in the middle.
    const lons = frame.map((p) => p.lon);
    const world = Math.max(...lons) - Math.min(...lons) > 180;
    const { project, view, normLon } = projector(frame, width, height, 10, !world);
    let countries: DataCountry[] = [];
    try {
      countries = getCountries();
    } catch {
      // Datasets missing in a test build: the arcs alone still draw.
    }
    const paths = countryPaths(countries, view, normLon, project);
    const lines = arcs.map((parts) =>
      parts
        .map((pts) =>
          pts
            .map((p, i) => {
              const [x, y] = project(p.lon, p.lat);
              return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join('')
        )
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
          <LinearGradient id="fsea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={background ?? ATLAS.seaTop} />
            <Stop offset="1" stopColor={background ?? ATLAS.seaBottom} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#fsea)" />
        <G>
          {geo.paths.map((p) => (
            <Path
              key={p.cc}
              d={p.d}
              fill={lit.has(p.cc) ? ATLAS.landLit : ATLAS.land}
              stroke={lit.has(p.cc) ? ATLAS.borderLit : ATLAS.border}
              strokeWidth={lit.has(p.cc) ? 0.9 : 0.6}
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
            <Circle cx={x} cy={y} r={2.6} fill={ATLAS.seaBottom} stroke={palette.amber} strokeWidth={1.4} />
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
