import { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Rect, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import type { POI, RoutePoint } from '@skyatlas/shared';
import { palette, family } from '../design/tokens';
import { PLANE_PATH } from './planeGlyph';
import { decorative } from '../design/layout';
import { getCountries } from '../../src/core/data/datasets';
import { placeName } from '../../src/core/places/names';
import { getLocale } from '../../src/i18n';
import type { DataCountry } from '../../src/core/data/types';

/**
 * The route as an atlas plate.
 *
 * Drawn from the bundled country outlines rather than map tiles, so it renders
 * instantly, offline, at any size — on the board before departure, on the
 * postcard after landing, and anywhere the tile map is unavailable. Countries
 * the flight crosses are drawn a step brighter; everything else is a hairline.
 *
 * Hidden from screen readers: a plate has no single sentence to speak, and
 * every screen that draws one also states the route and progress in text.
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
  /** A flat sea colour instead of the gradient (the postcard's own ground). */
  background?: string;
  /** Names set at the two ends of the route. */
  fromLabel?: string;
  toLabel?: string;
  /** More names to set, if they fit. */
  labels?: SketchLabel[];
}

type XY = [number, number];

export function projector(route: Array<{ lat: number; lon: number }>, width: number, height: number, pad: number, wrap = true) {
  const lons = route.map((p) => p.lon);
  // A route over the date line is drawn centred on the Pacific; a set of
  // flights round the whole world (wrap off) keeps Greenwich in the middle.
  const spansDateline = wrap && Math.max(...lons) - Math.min(...lons) > 180;
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

export function ringPath(ring: [number, number][], project: (lon: number, lat: number) => XY): string {
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

export function countryPaths(
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

/**
 * The plate's colours: an atlas at dusk, so it sits in the dark interface
 * and still reads as a map — blue sea, land, the countries of the flight lit
 * warm. Shared with FlightsMap.
 */
export const ATLAS = {
  seaTop: '#173852',
  seaBottom: '#0E2335',
  land: '#2C3B30',
  landLit: '#433F2D',
  border: 'rgba(233, 238, 244, 0.16)',
  borderLit: 'rgba(255, 196, 107, 0.55)',
  graticule: 'rgba(233, 238, 244, 0.06)',
  label: '#F2F5F8',
  labelSoft: 'rgba(233, 238, 244, 0.78)',
  halo: 'rgba(8, 18, 28, 0.85)'
} as const;

export interface SketchLabel {
  lat: number;
  lon: number;
  text: string;
  /** Ends of the route are set larger. */
  strong?: boolean;
}

function boxesOverlap(a: number[], b: number[]) {
  return a[0]! < b[2]! && a[2]! > b[0]! && a[1]! < b[3]! && a[3]! > b[1]!;
}

/** Labels that fit without covering each other, the strong ones first. */
function layoutLabels(labels: SketchLabel[], project: (lon: number, lat: number) => XY, width: number, height: number) {
  const placed: number[][] = [];
  const out: Array<SketchLabel & { x: number; y: number; anchor: 'start' | 'end' }> = [];
  for (const l of [...labels].sort((a, b) => Number(!!b.strong) - Number(!!a.strong))) {
    const [x, y] = project(l.lon, l.lat);
    if (x < 0 || x > width || y < 0 || y > height) continue;
    const size = l.strong ? 13 : 11;
    const w = l.text.length * size * 0.56 + 6;
    // Right of the dot, or left of it near the right edge.
    const anchor: 'start' | 'end' = x + w + 10 > width ? 'end' : 'start';
    const x0 = anchor === 'start' ? x + 7 : x - 7 - w;
    const box = [x0, y - size, x0 + w, y + 4];
    if (placed.some((b) => boxesOverlap(b, box))) continue;
    placed.push(box);
    out.push({ ...l, x: anchor === 'start' ? x + 8 : x - 8, y: y + size * 0.35, anchor });
  }
  return out;
}

function Halo({ x, y, text, size, anchor, color, weight }: { x: number; y: number; text: string; size: number; anchor: 'start' | 'end'; color: string; weight: string }) {
  // The halo is a second, stroked copy underneath: SVG text on native has no paint order.
  return (
    <G>
      <SvgText x={x} y={y} fontSize={size} fontFamily={weight} textAnchor={anchor} stroke={ATLAS.halo} strokeWidth={3} strokeLinejoin="round" fill={ATLAS.halo}>
        {text}
      </SvgText>
      <SvgText x={x} y={y} fontSize={size} fontFamily={weight} textAnchor={anchor} fill={color}>
        {text}
      </SvgText>
    </G>
  );
}

function RouteSketch({ route, width, height, flownS, pois = [], highlight = [], lit, plane, background, fromLabel, toLabel, labels = [] }: Props) {
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
    // A faint graticule every 5° (10° on wide views): the plate reads as a map at a glance.
    const span = view.maxLat - view.minLat;
    const stepDeg = span > 40 ? 10 : 5;
    let grid = '';
    for (let lat = Math.ceil(view.minLat / stepDeg) * stepDeg; lat <= view.maxLat; lat += stepDeg) {
      const [, y] = project(view.minLon, lat);
      grid += `M0 ${y.toFixed(1)}L${width} ${y.toFixed(1)}`;
    }
    for (let lon = Math.ceil(view.minLon / stepDeg) * stepDeg; lon <= view.maxLon; lon += stepDeg) {
      const [x] = project(lon, (view.minLat + view.maxLat) / 2);
      grid += `M${x.toFixed(1)} 0L${x.toFixed(1)} ${height}`;
    }
    return { project, paths, full: line(route), line, grid };
  }, [route, width, height]);

  const placed = useMemo(() => {
    if (!geo) return [];
    const first = route[0]!;
    const last = route[route.length - 1]!;
    const all: SketchLabel[] = [...labels];
    if (fromLabel) all.push({ lat: first.lat, lon: first.lon, text: fromLabel, strong: true });
    if (toLabel) all.push({ lat: last.lat, lon: last.lon, text: toLabel, strong: true });
    // The most notable places on the way, as many as fit.
    for (const p of [...pois].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)).slice(0, 12)) {
      all.push({ lat: p.lat, lon: p.lon, text: placeName(p, getLocale()) });
    }
    return layoutLabels(all, geo.project, width, height);
  }, [geo, route, labels, fromLabel, toLabel, pois, width, height]);

  if (!geo) return <View {...decorative} style={{ width, height }} />;

  const flown = flownS != null ? route.filter((p) => p.elapsedSeconds <= flownS) : [];
  const hi = new Set(highlight);
  const [ox, oy] = geo.project(route[0]!.lon, route[0]!.lat);
  const last = route[route.length - 1]!;
  const [dx, dy] = geo.project(last.lon, last.lat);
  const planeXY = plane ? geo.project(plane.lon, plane.lat) : null;
  // The plane points along the route on screen, from the point before it to the one after.
  let planeDeg = 0;
  if (plane && planeXY) {
    let k = 0;
    let best = Infinity;
    route.forEach((p, i) => {
      const d = (p.lat - plane.lat) ** 2 + (p.lon - plane.lon) ** 2;
      if (d < best) {
        best = d;
        k = i;
      }
    });
    const a = geo.project(route[Math.max(0, k - 1)]!.lon, route[Math.max(0, k - 1)]!.lat);
    const b = geo.project(route[Math.min(route.length - 1, k + 1)]!.lon, route[Math.min(route.length - 1, k + 1)]!.lat);
    planeDeg = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
  }

  return (
    <View {...decorative} style={[styles.wrap, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={background ?? ATLAS.seaTop} />
            <Stop offset="1" stopColor={background ?? ATLAS.seaBottom} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#sea)" />
        <Path d={geo.grid} stroke={ATLAS.graticule} strokeWidth={1} fill="none" />
        <G>
          {geo.paths.map((p) => (
            <Path key={p.cc} d={p.d} fill={hi.has(p.cc) ? ATLAS.landLit : ATLAS.land} stroke={ATLAS.border} strokeWidth={0.7} />
          ))}
          {geo.paths
            .filter((p) => hi.has(p.cc))
            .map((p) => (
              <Path key={`lit-${p.cc}`} d={p.d} fill="none" stroke={ATLAS.borderLit} strokeWidth={1} />
            ))}
        </G>
        <Path d={geo.full} stroke={ATLAS.labelSoft} strokeWidth={1.4} strokeDasharray="4 5" fill="none" />
        {flown.length > 1 ? (
          <G>
            <Path d={geo.line(flown)} stroke={palette.amber} strokeOpacity={0.25} strokeWidth={7} fill="none" strokeLinecap="round" />
            <Path d={geo.line(flown)} stroke={palette.amber} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          </G>
        ) : null}
        {pois.map((poi) => {
          const [x, y] = geo.project(poi.lon, poi.lat);
          const on = lit?.has(poi.id);
          return (
            <Circle
              key={poi.id}
              cx={x}
              cy={y}
              r={on ? 3.2 : 2.6}
              fill={on ? palette.amber : ATLAS.land}
              stroke={on ? palette.amber : ATLAS.label}
              strokeWidth={1.2}
            />
          );
        })}
        <Circle cx={ox} cy={oy} r={4.5} fill={palette.amber} stroke={ATLAS.halo} strokeWidth={1.5} />
        <Circle cx={dx} cy={dy} r={4.5} fill={ATLAS.seaBottom} stroke={palette.amber} strokeWidth={2} />
        {placed.map((l) => (
          <Halo
            key={`${l.text}-${l.x}`}
            x={l.x}
            y={l.y}
            text={l.text}
            size={l.strong ? 13 : 11}
            anchor={l.anchor}
            color={l.strong ? ATLAS.label : ATLAS.labelSoft}
            weight={l.strong ? family.textStrong : family.textMid}
          />
        ))}
        {planeXY ? (
          <G transform={`translate(${planeXY[0] - 14} ${planeXY[1] - 14}) rotate(${planeDeg.toFixed(1)} 14 14)`}>
            <Circle cx={14} cy={14} r={15} fill={palette.amber} fillOpacity={0.16} />
            <G transform="scale(1.1667)">
              <Path d={PLANE_PATH} fill={palette.amber} stroke={ATLAS.halo} strokeWidth={0.9} strokeLinejoin="round" />
            </G>
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
