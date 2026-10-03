import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Map, Camera, GeoJSONSource, Layer, Marker, RasterSource, RasterDEMSource, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import type { RoutePoint, POI } from '@skyatlas/shared';
import { palette, line, s as space } from '../design/tokens';
import { decorative } from '../design/layout';
import { Label } from '../design/type';
import { t, getLocale } from '../../src/i18n';
import { localizedStyle } from '../../src/core/map/localStyle';
import { RELIEF_TILES, DEM_TILES, DEM_MAX_ZOOM } from '../../src/core/map/offlineMap';
import { viewSector } from '../../src/core/flight/telemetry';
import { haptics } from '../../src/core/ux/haptics';

import { PLANE_PATH } from './planeGlyph';

export interface RouteMapProps {
  route: RoutePoint[];
  /** Where the aircraft is, and how far into the flight. */
  position: { lat: number; lon: number; elapsedS: number };
  pois?: POI[];
  /** Ids already opened — drawn filled rather than hollow. */
  seen?: Set<string>;
  follow?: boolean;
  onSelectPOI?: (poi: POI) => void;
  labelFor?: (poi: POI) => string;
  /** Countries crossed; used by the offline sketch fallback. */
  highlight?: string[];
  /** Course over the ground, degrees: turns the aircraft on the map. */
  heading?: number;
  /** The passenger's window, whose view sector is drawn stronger. */
  seatSide?: 'left' | 'right' | 'middle' | 'unknown';
  /** How far a window sees, km; no sectors when absent. */
  viewKm?: number;
  /** Looking at another moment of the flight than now. */
  previewing?: boolean;
  /** Dark chart instead of the coloured relief — by default when it is night outside. */
  night?: boolean;
  /** Whether the map fills the screen; shows the expand/collapse control when a handler is given. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

/** Colours of the chart's own marks on each basemap. */
const INK = {
  day: { leg: '#56657A', flown: '#E07A12', dot: '#3A4656', label: '#1C2530', halo: 'rgba(255, 255, 255, 0.9)', opened: '#C25E00' },
  night: { leg: palette.rule, flown: palette.amber, dot: palette.inkMuted, label: palette.inkMuted, halo: palette.void, opened: palette.amber }
} as const;

/** Hill shading, strong enough to read the Alps at cruise and quiet at night. */
const HILLSHADE = {
  day: {
    'hillshade-exaggeration': 0.5,
    'hillshade-shadow-color': 'rgba(58, 44, 24, 0.55)',
    'hillshade-highlight-color': 'rgba(255, 255, 255, 0.35)',
    'hillshade-accent-color': 'rgba(58, 44, 24, 0.25)'
  },
  night: {
    'hillshade-exaggeration': 0.55,
    'hillshade-shadow-color': 'rgba(0, 0, 0, 0.65)',
    'hillshade-highlight-color': 'rgba(150, 168, 196, 0.16)',
    'hillshade-accent-color': 'rgba(0, 0, 0, 0.3)'
  }
} as const;

/** Degrees of span visible when the camera follows the aircraft. */
const CRUISE_ZOOM = 4.2;

/** How far the passenger may nudge the chart, in screen points, before it stops following. */
const DRIFT_PX = 48;

/** Screen distance between two points at a Web Mercator zoom. */
function pixelsApart(a: { lon: number; lat: number } | [number, number], b: { lon: number; lat: number }, zoom: number): number {
  const [lon, lat] = Array.isArray(a) ? a : [a.lon, a.lat];
  const scale = (256 * 2 ** zoom) / 360;
  const y = (l: number) => (Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360)) * 180) / Math.PI;
  let dLon = Math.abs(lon - b.lon) % 360;
  if (dLon > 180) dLon = 360 - dLon;
  return Math.hypot(dLon * scale, (y(lat) - y(b.lat)) * scale);
}

/** The only font stack the basemap serves glyphs for. */
const BASEMAP_FONT = 'Noto Sans Regular';

/**
 * The route as a chart.
 *
 * MapLibre rather than Apple Maps for two reasons the product cannot do without:
 * the style is ours, and the tiles can be packaged, so the map still draws at
 * 11 km with the radio off. Apple Maps offers neither — it cannot be restyled
 * and it has no public offline API, which made the app's central promise
 * unbuildable on it.
 *
 * By day it is an atlas: Natural Earth's shaded relief, forests, ice and sand,
 * with mountains shaded from elevation data the corridor download keeps on the
 * phone. By night it is the dark chart, which does not light up a sleeping
 * cabin; the passenger can switch either way.
 *
 * Two lines carry the story: the whole leg dim and dashed so the shape of the
 * journey is visible, and the flown part in amber. Places are marks on the
 * chart, hollow until opened, so the map doubles as a progress display for the
 * collection.
 *
 * Hidden from screen readers. Panning a chart by swipe is not something
 * VoiceOver can do usefully, and everything the map says is also on the panel
 * beneath it in words: route and share flown, what is out of each window, what
 * comes next.
 */
/** Longitudes without the ±180° jump, so consecutive points differ by less than 180°. */
function unwrap(points: Array<{ lat: number; lon: number }>): [number, number][] {
  const out: [number, number][] = [];
  let prev: number | null = null;
  for (const p of points) {
    let lon = p.lon;
    if (prev !== null) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    out.push([lon, p.lat]);
    prev = lon;
  }
  return out;
}

export default function RouteMap({
  route,
  position,
  pois = [],
  seen,
  follow = true,
  onSelectPOI,
  labelFor,
  night: nightOutside = false,
  expanded = false,
  onToggleExpand,
  heading = 0,
  seatSide = 'unknown',
  viewKm,
  previewing = false
}: RouteMapProps) {
  // Off once the passenger drags the chart away; the button brings it back.
  const [detached, setDetached] = useState(false);
  // The passenger's own zoom is kept while following: pinch in on the aircraft and it stays in the middle.
  const [followZoom, setFollowZoom] = useState(CRUISE_ZOOM);
  // The passenger's choice wins over the clock until they leave the screen.
  const [override, setOverride] = useState<boolean | null>(null);
  const night = override ?? nightOutside;
  const ink = night ? INK.night : INK.day;
  // While a finger is on the chart the camera keeps still, or each new
  // position would yank the map from under the pinch.
  const [gesturing, setGesturing] = useState(false);
  const tracking = follow && !detached && !gesturing;

  useEffect(() => setFollowZoom(expanded ? CRUISE_ZOOM + 0.8 : CRUISE_ZOOM), [expanded]);

  /**
   * Only the passenger's own gestures count: the camera's moves to keep up
   * with the aircraft raise the same event, and reading those as a touch
   * would stop the follow after the first one.
   */
  const onRegionWillChange = (e: { nativeEvent: ViewStateChangeEvent }) => {
    if (e.nativeEvent.userInteraction) setGesturing(true);
  };

  const onRegionDidChange = (e: { nativeEvent: ViewStateChangeEvent }) => {
    const v = e.nativeEvent;
    // Whatever ended the move, the camera is free again.
    setGesturing(false);
    if (!v.userInteraction) return;
    setFollowZoom(v.zoom);
    if (pixelsApart(v.center, position, v.zoom) > DRIFT_PX) setDetached(true);
  };

  const backToPlane = () => {
    haptics.selection?.();
    setDetached(false);
  };

  // Continuous longitudes: a line from 170° to −170° would otherwise be drawn
  // the long way round the world instead of across the date line.
  const path = useMemo(() => unwrap(route), [route]);

  const leg = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: path }
    }),
    [path]
  );

  const flown = useMemo(() => {
    const n = route.filter((p) => p.elapsedSeconds <= position.elapsedS).length;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        // A single point is not a line; repeat it so the source stays valid.
        coordinates:
          n > 1
            ? path.slice(0, n)
            : [
                [position.lon, position.lat],
                [position.lon, position.lat]
              ]
      }
    };
  }, [route, path, position.elapsedS, position.lat, position.lon]);

  const places = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: pois.map((poi) => ({
        type: 'Feature' as const,
        id: poi.id,
        properties: {
          id: poi.id,
          name: labelFor?.(poi) ?? poi.name,
          opened: seen?.has(poi.id) ? 1 : 0,
          city: poi.category === 'city' ? 1 : 0,
          historic: poi.category === 'historic' ? 1 : 0,
          rank: poi.rank ?? 5
        },
        geometry: { type: 'Point' as const, coordinates: [poi.lon, poi.lat] }
      }))
    }),
    [pois, seen, labelFor]
  );

  // What each window sees: a sector abeam, the passenger's own drawn stronger.
  const sectors = useMemo(() => {
    if (!viewKm) return null;
    const sector = (side: 'left' | 'right') => ({
      type: 'Feature' as const,
      properties: { mine: seatSide === side ? 1 : 0 },
      geometry: { type: 'Polygon' as const, coordinates: [viewSector(position.lat, position.lon, heading, side, viewKm)] }
    });
    return { type: 'FeatureCollection' as const, features: [sector('left'), sector('right')] };
  }, [position.lat, position.lon, heading, seatSide, viewKm]);

  const onPlacePress = (e: { nativeEvent: { features: GeoJSON.Feature[] } }) => {
    const id = e.nativeEvent.features[0]?.properties?.['id'];
    const poi = pois.find((p) => p.id === id);
    if (poi) onSelectPOI?.(poi);
  };

  return (
    <View style={styles.fill}>
      <View {...decorative} style={styles.fill}>
        <Map
          style={styles.fill}
          mapStyle={localizedStyle(night, getLocale().slice(0, 2))}
          logo={false}
          compass={false}
          attribution
          onRegionWillChange={onRegionWillChange}
          onRegionDidChange={onRegionDidChange}
        >
          <Camera
            {...(tracking ? { center: [position.lon, position.lat] as [number, number], zoom: followZoom, duration: 600 } : {})}
            initialViewState={{ center: [position.lon, position.lat], zoom: CRUISE_ZOOM }}
          />

          {night ? null : (
            <RasterSource id="relief" tiles={[RELIEF_TILES]} tileSize={256} maxzoom={6}>
              <Layer
                id="relief"
                type="raster"
                beforeId="park"
                paint={{ 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.9, 5, 0.75, 7, 0.3], 'raster-fade-duration': 0 }}
              />
            </RasterSource>
          )}

          <RasterDEMSource id="dem" tiles={[DEM_TILES]} tileSize={256} maxzoom={DEM_MAX_ZOOM} encoding="terrarium">
            <Layer id="hillshade" type="hillshade" beforeId="water" paint={night ? HILLSHADE.night : HILLSHADE.day} />
          </RasterDEMSource>

          {sectors ? (
            <GeoJSONSource id="sectors" data={sectors}>
              <Layer
                id="sector-fill"
                type="fill"
                paint={{
                  'fill-color': ['case', ['==', ['get', 'mine'], 1], ink.flown, night ? '#9AA5B4' : '#3A4656'],
                  'fill-opacity': ['case', ['==', ['get', 'mine'], 1], night ? 0.14 : 0.16, night ? 0.05 : 0.07]
                }}
              />
            </GeoJSONSource>
          ) : null}

          <GeoJSONSource id="leg" data={leg}>
            <Layer
              id="leg-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ink.leg, 'line-width': 1.5, 'line-dasharray': [3, 4] }}
            />
          </GeoJSONSource>

          <GeoJSONSource id="flown" data={flown}>
            <Layer
              id="flown-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ink.flown, 'line-width': 2.6 }}
            />
          </GeoJSONSource>

          <GeoJSONSource id="places" data={places} onPress={onPlacePress}>
            {night ? (
              <Layer
                id="city-glow"
                type="circle"
                filter={['==', ['get', 'city'], 1]}
                paint={{
                  'circle-radius': ['interpolate', ['linear'], ['get', 'rank'], 3, 6, 10, 16],
                  'circle-color': '#FFC46B',
                  'circle-opacity': 0.55,
                  'circle-blur': 1
                }}
              />
            ) : null}
            <Layer
              id="place-dot"
              type="circle"
              paint={{
                'circle-radius': 5,
                'circle-color': ['case', ['==', ['get', 'opened'], 1], ink.opened, 'rgba(0, 0, 0, 0)'],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': ['case', ['==', ['get', 'opened'], 1], ink.opened, ink.dot]
              }}
            />
            <Layer
              id="place-label"
              type="symbol"
              layout={{
                'text-font': [BASEMAP_FONT],
                // At cruise scale only the notable and the opened are named
                // (history is a story, not a sight), and at night every city,
                // whose lights are what the window shows; closer in, all.
                // Labels give way to each other, the higher-ranked first.
                'text-field': [
                  'step',
                  ['zoom'],
                  [
                    'case',
                    [
                      'any',
                      ['==', ['get', 'opened'], 1],
                      ['all', ['==', ['get', 'historic'], 0], ['>=', ['get', 'rank'], 8]],
                      ['all', night, ['==', ['get', 'city'], 1]]
                    ],
                    ['get', 'name'],
                    ''
                  ],
                  5.5,
                  ['get', 'name']
                ],
                'text-size': 11,
                'text-offset': [0, 1.1],
                'text-anchor': 'top',
                'text-optional': true,
                'symbol-sort-key': ['-', 0, ['get', 'rank']]
              }}
              paint={{
                'text-color': ['case', ['==', ['get', 'opened'], 1], ink.opened, ink.label],
                'text-halo-color': ink.halo,
                'text-halo-width': 1.4
              }}
            />
          </GeoJSONSource>

          <Marker lngLat={[position.lon, position.lat]} anchor="center">
            <View style={[styles.planeBox, { transform: [{ rotate: `${heading}deg` }] }, previewing && styles.planePreview]}>
              <Svg width={30} height={30} viewBox="0 0 24 24">
                <Path d={PLANE_PATH} fill={night ? palette.amber : '#E07A12'} stroke={night ? palette.void : '#FFFFFF'} strokeWidth={0.9} strokeLinejoin="round" />
              </Svg>
            </View>
          </Marker>
        </Map>
      </View>

      <View style={styles.controls} pointerEvents="box-none">
        {follow && detached ? (
          <Pressable
            onPress={backToPlane}
            accessibilityRole="button"
            accessibilityLabel={t('map.followA11y')}
            hitSlop={8}
            style={[styles.control, styles.follow]}
          >
            <Label tone="accent">{`◎  ${t('map.follow')}`}</Label>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setOverride(!night)}
          accessibilityRole="button"
          accessibilityLabel={night ? t('map.toDay') : t('map.toNight')}
          hitSlop={8}
          style={styles.control}
        >
          <Label tone="muted">{night ? t('map.day') : t('map.night')}</Label>
        </Pressable>
        {onToggleExpand ? (
          <Pressable
            onPress={onToggleExpand}
            accessibilityRole="button"
            accessibilityLabel={expanded ? t('map.collapse') : t('map.expand')}
            hitSlop={8}
            style={styles.control}
          >
            <Label tone="muted">{expanded ? t('map.collapse') : t('map.expand')}</Label>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.void },
  controls: { position: 'absolute', right: space.x3, bottom: space.x3, flexDirection: 'row', gap: space.x2 },
  follow: { borderColor: palette.amber, backgroundColor: 'rgba(11, 14, 17, 0.92)' },
  control: {
    minHeight: 32,
    paddingHorizontal: space.x3,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(11, 14, 17, 0.82)',
    borderWidth: line.hair,
    borderColor: palette.rule
  },
  planeBox: { width: 30, height: 30 },
  planePreview: { opacity: 0.75 },
  planeHalo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: line.hair,
    borderColor: palette.amberDim,
    alignItems: 'center',
    justifyContent: 'center'
  },
  plane: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.amber }
});
