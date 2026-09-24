import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Map, Camera, GeoJSONSource, Layer, Marker, RasterSource, RasterDEMSource } from '@maplibre/maplibre-react-native';
import type { RoutePoint, POI } from '@skyatlas/shared';
import { palette, line, s as space } from '../design/tokens';
import { decorative } from '../design/layout';
import { Label } from '../design/type';
import { t } from '../../src/i18n';
import { MAP_STYLE_DAY, MAP_STYLE_NIGHT, RELIEF_TILES, DEM_TILES, DEM_MAX_ZOOM } from '../../src/core/map/offlineMap';

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
  /** Dark chart instead of the coloured relief — by default when it is night outside. */
  night?: boolean;
  /** Whether the map fills the screen; shows the expand/collapse control when a handler is given. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

/** Colours of the chart's own marks on each basemap. */
export const INK = {
  day: { leg: '#56657A', flown: '#E07A12', dot: '#3A4656', label: '#1C2530', halo: 'rgba(255, 255, 255, 0.9)', opened: '#C25E00' },
  night: { leg: palette.rule, flown: palette.amber, dot: palette.inkMuted, label: palette.inkMuted, halo: palette.void, opened: palette.amber }
} as const;

/** Hill shading, strong enough to read the Alps at cruise and quiet at night. */
export const HILLSHADE = {
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
  onToggleExpand
}: RouteMapProps) {
  const [interacting, setInteracting] = useState(false);
  // The passenger's choice wins over the clock until they leave the screen.
  const [override, setOverride] = useState<boolean | null>(null);
  const night = override ?? nightOutside;
  const ink = night ? INK.night : INK.day;
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    []
  );

  const onTouch = () => {
    setInteracting(true);
    if (idle.current) clearTimeout(idle.current);
    // Give the camera back only once the passenger has clearly stopped exploring.
    idle.current = setTimeout(() => setInteracting(false), 12_000);
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
          opened: seen?.has(poi.id) ? 1 : 0
        },
        geometry: { type: 'Point' as const, coordinates: [poi.lon, poi.lat] }
      }))
    }),
    [pois, seen, labelFor]
  );

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
          mapStyle={night ? MAP_STYLE_NIGHT : MAP_STYLE_DAY}
          logo={false}
          compass={false}
          attribution
          onPress={onTouch}
          onRegionIsChanging={onTouch}
        >
          <Camera
            {...(follow && !interacting
              ? { center: [position.lon, position.lat] as [number, number], zoom: expanded ? CRUISE_ZOOM + 0.8 : CRUISE_ZOOM, duration: 600 }
              : {})}
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
                'text-field': ['get', 'name'],
                'text-size': 11,
                'text-offset': [0, 1.1],
                'text-anchor': 'top',
                'text-allow-overlap': true,
                'text-ignore-placement': true
              }}
              paint={{
                'text-color': ['case', ['==', ['get', 'opened'], 1], ink.opened, ink.label],
                'text-halo-color': ink.halo,
                'text-halo-width': 1.4
              }}
            />
          </GeoJSONSource>

          <Marker lngLat={[position.lon, position.lat]} anchor="center">
            <View style={styles.planeHalo}>
              <View style={styles.plane} />
            </View>
          </Marker>
        </Map>
      </View>

      <View style={styles.controls} pointerEvents="box-none">
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
  control: {
    minHeight: 32,
    paddingHorizontal: space.x3,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(11, 14, 17, 0.82)',
    borderWidth: line.hair,
    borderColor: palette.rule
  },
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
