import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Polygon, Polyline, Line, Circle, G, Text as SvgText } from 'react-native-svg';
import type { POI } from '@skyatlas/shared';
import { palette, s, gutter, line, family, familyJa } from '../design/tokens';
import { Label, Small } from '../design/type';
import { t, getLocale } from '../../src/i18n';
import { Terrain } from '../../src/core/view/terrain';
import { loadHeights, DEM_ZOOMS } from '../../src/core/view/demSource';
import { panorama, project, visible, viewParams, type PanoramaInput } from '../../src/core/view/panorama';
import { getPlaces } from '../../src/core/data/datasets';
import { haversine } from '../../src/core/geo/greatCircle';
import { km, metres } from '../../src/core/units';

interface Props {
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  /** The window shown first: the passenger's own when known. */
  side: 'left' | 'right';
  night: boolean;
  pois: POI[];
  labelFor: (poi: POI) => string;
  onSelectPOI: (poi: POI) => void;
}

const HEIGHT = 230;
/** One terrain for the whole flight: tiles once loaded stay loaded. */
const terrain = new Terrain(loadHeights, DEM_ZOOMS);

interface Mark {
  key: string;
  name: string;
  sub: string;
  x: number;
  y: number;
  kind: 'peak' | 'city' | 'other';
  weight: number;
  poi?: POI;
}

function mix(a: string, b: string, f: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * f).toString(16).padStart(2, '0')).join('')}`;
}

const DAY = {
  skyTop: '#3f7fc4',
  skyLow: '#d9e8f4',
  landNear: '#4f6232',
  landMid: '#7d8a5a',
  landHigh: '#8a7458',
  landFar: '#9fb3c9',
  waterNear: '#1f4f7f',
  waterFar: '#9db6cf',
  label: '#10202e',
  halo: 'rgba(255,255,255,0.88)'
};
const NIGHT = {
  skyTop: '#03060a',
  skyLow: '#141e2c',
  landNear: '#0a0e13',
  landMid: '#121820',
  landHigh: '#1a212b',
  landFar: '#222c3a',
  waterNear: '#06090d',
  waterFar: '#18212c',
  label: '#e8dcc6',
  halo: 'rgba(0,0,0,0.75)'
};

/**
 * The window view: what is out there, drawn from elevation data — through
 * cloud and in the dark. Ridges in layers to the horizon, the notable peaks
 * and towns named where they stand; tap a name to open its story.
 */
export default function WindowView({ lat, lon, altitude, heading, side: initialSide, night, pois, labelFor, onSelectPOI }: Props) {
  const { width: screenW } = useWindowDimensions();
  const width = Math.max(280, screenW);
  const [side, setSide] = useState<'left' | 'right'>(initialSide);
  const [loaded, setLoaded] = useState(0);
  const at = useRef<{ lat: number; lon: number } | null>(null);
  const locale = getLocale();
  const ink = night ? NIGHT : DAY;
  const faces = locale.startsWith('ja') ? familyJa : family;

  // Tiles around the aircraft; again after it has moved ~40 km, or, while some
  // are still missing (a demo downloads its elevation after takeoff), every
  // so often until they arrive.
  const complete = useRef(false);
  useEffect(() => {
    const last = at.current;
    if (last && complete.current && haversine(last.lat, last.lon, lat, lon) < 40) return;
    at.current = { lat, lon };
    let alive = true;
    const run = () =>
      terrain.prefetch(lat, lon, 470).then((all) => {
        if (!alive) return;
        complete.current = all;
        setLoaded((n) => n + 1);
      });
    run();
    const retry = setInterval(() => {
      if (!complete.current) run();
    }, 16_000);
    return () => {
      alive = false;
      clearInterval(retry);
    };
  }, [lat, lon]);

  const input: PanoramaInput = useMemo(
    () => ({ lat, lon, altM: altitude, heading, side, heightAt: terrain.heightAt, width, height: HEIGHT }),
    [lat, lon, altitude, heading, side, width]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => panorama(input), [input, loaded]);

  const marks = useMemo(() => {
    const out: Mark[] = [];
    const seen = new Set<string>();
    const add = (m: Mark) => {
      if (seen.has(m.key)) return;
      seen.add(m.key);
      out.push(m);
    };
    for (const poi of pois) {
      if (poi.category === 'historic') continue;
      const isPeak = (poi.category === 'mountain' || poi.category === 'volcano') && poi.elevation;
      if (!isPeak && poi.category !== 'city' && !(poi.category === 'lake' || poi.category === 'island')) continue;
      const elev = isPeak ? poi.elevation! : (terrain.heightAt(poi.lat, poi.lon) ?? 0);
      const p = project(input, poi.lat, poi.lon, elev);
      if (!p || !visible(view, p.x, width, p.d, p.y)) continue;
      const d = km(p.d);
      add({
        key: poi.wikidata ?? poi.id,
        name: labelFor(poi),
        sub: isPeak ? `${metres(elev).value} ${t(`unit.${metres(elev).unit}`)} · ${d.value} ${t(`unit.${d.unit}`)}` : `${d.value} ${t(`unit.${d.unit}`)}`,
        x: p.x,
        y: p.y,
        kind: isPeak ? 'peak' : poi.category === 'city' ? 'city' : 'other',
        weight: (poi.rank ?? 5) + 2,
        poi
      });
    }
    let places: ReturnType<typeof getPlaces> = [];
    try {
      places = getPlaces();
    } catch {
      places = [];
    }
    const { maxKm } = viewParams(input);
    const lang = locale.slice(0, 2);
    for (const pl of places) {
      const peak = (pl.k === 'mountain' || pl.k === 'volcano') && pl.el && pl.r >= 4;
      const city = pl.k === 'city' && pl.r >= (night ? 5 : 7);
      if (!peak && !city) continue;
      if (Math.abs(pl.lat - lat) > maxKm / 100 + 1) continue;
      const elev = peak ? pl.el! : (terrain.heightAt(pl.lat, pl.lon) ?? 0);
      const p = project(input, pl.lat, pl.lon, elev);
      if (!p || !visible(view, p.x, width, p.d, p.y)) continue;
      const d = km(p.d);
      const name = (lang !== 'en' ? pl.l?.[lang as 'ru'] : undefined) ?? pl.n;
      add({
        key: pl.wd ?? pl.id,
        name,
        sub: peak ? `${metres(elev).value} ${t(`unit.${metres(elev).unit}`)} · ${d.value} ${t(`unit.${d.unit}`)}` : `${d.value} ${t(`unit.${d.unit}`)}`,
        x: p.x,
        y: p.y,
        kind: peak ? 'peak' : 'city',
        weight: pl.r
      });
    }
    // Names on rows at the top, the weightiest first, none overlapping.
    out.sort((a, b) => b.weight - a.weight);
    const rows: Array<Array<[number, number]>> = [[], [], []];
    const placed: Array<Mark & { row: number; tx: number }> = [];
    for (const m of out) {
      const w = Math.max(m.name.length, m.sub.length) * 6.2 + 8;
      const x0 = Math.max(4, Math.min(width - w - 4, m.x - w / 2));
      const row = rows.findIndex((r) => r.every(([a, b]) => x0 + w < a || x0 > b));
      if (row < 0) continue;
      rows[row]!.push([x0, x0 + w]);
      placed.push({ ...m, row, tx: x0 + w / 2 });
      if (placed.length >= 9) break;
    }
    return placed;
  }, [view, input, pois, labelFor, width, night, lat, locale]);

  const bands = useMemo(
    () =>
      view.bands
        .map((b, i) => {
          const f = i / Math.max(1, view.bands.length - 1);
          // Height tints the land (green lowland, brown upland), distance fades it to sky blue.
          const high = Math.min(1, Math.max(0, (Math.max(...b.peak) - 600) / 2400));
          const land = mix(mix(ink.landNear, ink.landHigh, high * 0.8), ink.landFar, Math.pow(f, 0.7));
          const color = b.water > 0.6 ? mix(ink.waterNear, ink.waterFar, Math.pow(f, 0.7)) : land;
          const crest = mix(color, night ? '#000000' : '#1b2430', night ? 0.35 : 0.22);
          const ridge = view.xs.map((x, c) => `${x.toFixed(1)},${b.ridge[c]!.toFixed(1)}`).join(' ');
          const snow: string[][] = [];
          let run: string[] = [];
          b.ridge.forEach((y, c) => {
            if (!night && b.peak[c]! > 2700) run.push(`${view.xs[c]!.toFixed(1)},${(y + 0.8).toFixed(1)}`);
            else if (run.length) {
              snow.push(run);
              run = [];
            }
          });
          if (run.length) snow.push(run);
          return { key: i, points: `0,${HEIGHT} ${ridge} ${width},${HEIGHT}`, ridge, color, crest, snow, water: b.water > 0.6 };
        })
        .reverse(),
    [view, ink, width, night]
  );

  const noData = view.missing > 0.5;
  const { maxKm } = viewParams(input);
  const reach = km(maxKm);

  return (
    <View style={styles.wrap} testID="window-view">
      <View style={styles.head}>
        <Label tone="accent" style={styles.flex} accessibilityRole="header">
          {t('window.title')}
        </Label>
        {(['left', 'right'] as const).map((sd) => (
          <Pressable
            key={sd}
            onPress={() => setSide(sd)}
            accessibilityRole="button"
            accessibilityState={{ selected: side === sd }}
            accessibilityLabel={t(`window.${sd}`)}
            style={[styles.tab, side === sd && styles.tabOn]}
          >
            <Label tone={side === sd ? 'accent' : 'muted'}>{t(`window.${sd}`)}</Label>
          </Pressable>
        ))}
      </View>
      <View accessible accessibilityLabel={`${t('window.title')}, ${t(`window.${side}`)}: ${marks.map((m) => m.name).join(', ') || t('window.nothing')}`}>
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ink.skyTop} />
              <Stop offset="1" stopColor={ink.skyLow} />
            </LinearGradient>
            <LinearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={night ? '#000000' : '#ffffff'} stopOpacity={night ? 0 : 0.28} />
              <Stop offset="1" stopColor={night ? '#000000' : '#ffffff'} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#sky)" />
          {noData
            ? null
            : bands.map((b) => (
                <G key={b.key}>
                  <Polygon points={b.points} fill={b.color} />
                  {b.water ? null : <Polyline points={b.ridge} stroke={b.crest} strokeWidth={1} fill="none" />}
                </G>
              ))}
          {noData
            ? null
            : bands.flatMap((b) => b.snow.map((run, k) => <Polyline key={`${b.key}-${k}`} points={run.join(' ')} stroke="#f4f7fa" strokeWidth={1.4} fill="none" />))}
          {noData ? null : <Rect x={0} y={view.horizonY - 4} width={width} height={22} fill="url(#haze)" />}
          {marks.map((m) => {
            const ty = 16 + m.row * 30;
            const tap = m.poi ? () => onSelectPOI(m.poi!) : undefined;
            return (
              <G key={m.key} onPress={tap}>
                <Line x1={m.tx} y1={ty + 14} x2={m.x} y2={m.y} stroke={ink.label} strokeOpacity={0.55} strokeWidth={0.8} />
                {m.kind === 'city' ? (
                  <Circle cx={m.x} cy={m.y} r={night ? 3.2 : 2.2} fill={night ? '#FFC46B' : ink.label} opacity={night ? 0.9 : 0.8} />
                ) : (
                  <Circle cx={m.x} cy={m.y} r={2} fill={ink.label} />
                )}
                {/* A halo first, then the letters: SVG text has no paint order here. */}
                {[true, false].map((halo) => (
                  <G key={halo ? 'halo' : 'ink'}>
                    <SvgText
                      x={m.tx}
                      y={ty}
                      fontSize={11.5}
                      fontFamily={faces.textStrong}
                      fill={halo ? ink.halo : ink.label}
                      stroke={halo ? ink.halo : 'none'}
                      strokeWidth={halo ? 3 : 0}
                      textAnchor="middle"
                    >
                      {m.name}
                    </SvgText>
                    <SvgText
                      x={m.tx}
                      y={ty + 11}
                      fontSize={9.5}
                      fontFamily={faces.text}
                      fill={halo ? ink.halo : ink.label}
                      stroke={halo ? ink.halo : 'none'}
                      strokeWidth={halo ? 2.5 : 0}
                      textAnchor="middle"
                      opacity={halo ? 1 : 0.85}
                    >
                      {m.sub}
                    </SvgText>
                  </G>
                ))}
              </G>
            );
          })}
        </Svg>
      </View>
      <Small style={styles.caption}>
        {noData
          ? t('window.noData')
          : t('window.caption', { course: Math.round(((heading % 360) + 360) % 360), reach: reach.value, unit: t(`unit.${reach.unit}`) })}
      </Small>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: line.hair, borderTopColor: palette.rule, paddingTop: s.x3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: s.x2, paddingHorizontal: gutter, paddingBottom: s.x2 },
  flex: { flex: 1 },
  tab: { paddingHorizontal: s.x3, paddingVertical: s.x1, borderWidth: line.hair, borderColor: palette.rule, borderRadius: 12 },
  tabOn: { borderColor: palette.amberDim, backgroundColor: palette.warm },
  caption: { paddingHorizontal: gutter, paddingTop: s.x2, paddingBottom: s.x3 }
});
