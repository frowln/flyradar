import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Map, Camera, GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import type { RoutePoint, POI } from '@skyatlas/shared';
import { palette, line } from '../design/tokens';
import { MAP_STYLE_URL } from '../../src/core/map/offlineMap';

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
}

/** Degrees of span visible when the camera follows the aircraft. */
const CRUISE_ZOOM = 4.2;

/** The only font stack the basemap serves glyphs for. */
const BASEMAP_FONT = 'Noto Sans Regular';

/**
 * The route as a chart.
 *
 * MapLibre rather than Apple Maps for two reasons the product cannot do without:
 * the style is ours, so the map can be as dark and quiet as the instruments
 * around it; and the tiles can be packaged, so the map still draws at 11 km with
 * the radio off. Apple Maps offers neither — it cannot be restyled and it has no
 * public offline API, which made the app's central promise unbuildable on it.
 *
 * Two lines carry the story: the whole leg dim and dashed so the shape of the
 * journey is visible, and the flown part in amber. Places are marks on the
 * chart, hollow until opened, so the map doubles as a progress display for the
 * collection.
 */
export default function RouteMap({
  route,
  position,
  pois = [],
  seen,
  follow = true,
  onSelectPOI,
  labelFor
}: RouteMapProps) {
  const [interacting, setInteracting] = useState(false);
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

  const leg = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: route.map((p) => [p.lon, p.lat])
      }
    }),
    [route]
  );

  const flown = useMemo(() => {
    const passed = route.filter((p) => p.elapsedSeconds <= position.elapsedS);
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        // A single point is not a line; repeat it so the source stays valid.
        coordinates:
          passed.length > 1
            ? passed.map((p) => [p.lon, p.lat])
            : [
                [position.lon, position.lat],
                [position.lon, position.lat]
              ]
      }
    };
  }, [route, position.elapsedS, position.lat, position.lon]);

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

  return (
    <View style={styles.fill}>
      <Map
        style={styles.fill}
        mapStyle={MAP_STYLE_URL}
        logo={false}
        compass={false}
        attribution
        onPress={onTouch}
        onRegionIsChanging={onTouch}
      >
        <Camera
          {...(follow && !interacting
            ? { center: [position.lon, position.lat] as [number, number], zoom: CRUISE_ZOOM, duration: 600 }
            : {})}
          initialViewState={{ center: [position.lon, position.lat], zoom: CRUISE_ZOOM }}
        />

        <GeoJSONSource id="leg" data={leg}>
          <Layer
            id="leg-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': palette.rule,
              'line-width': 1.5,
              'line-dasharray': [3, 4]
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="flown" data={flown}>
          <Layer
            id="flown-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': palette.amber, 'line-width': 2.2 }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="places" data={places}>
          <Layer
            id="place-dot"
            type="circle"
            paint={{
              'circle-radius': 5,
              'circle-color': [
                'case',
                ['==', ['get', 'opened'], 1],
                palette.amber,
                'rgba(0, 0, 0, 0)'
              ],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': [
                'case',
                ['==', ['get', 'opened'], 1],
                palette.amber,
                palette.inkMuted
              ]
            }}
          />
          <Layer
            id="place-label"
            type="symbol"
            layout={{
              'text-font': [BASEMAP_FONT],
              'text-field': ['get', 'name'],
              'text-size': 10,
              'text-offset': [0, 1.1],
              'text-anchor': 'top',
              'text-allow-overlap': true,
              'text-ignore-placement': true
            }}
            paint={{
              'text-color': ['case', ['==', ['get', 'opened'], 1], palette.amber, palette.inkMuted],
              'text-halo-color': palette.void,
              'text-halo-width': 1.2
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
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.void },
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
