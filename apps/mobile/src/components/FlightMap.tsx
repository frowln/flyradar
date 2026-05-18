import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Map, Camera, GeoJSONSource, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import type { RoutePoint } from '@skyatlas/shared';
import { colors } from '../theme/colors';

interface Props {
  route: RoutePoint[];
  position: RoutePoint;
  followPlane?: boolean;
}

function routeToGeoJSON(route: RoutePoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: route.map((p) => [p.lon, p.lat])
    },
    properties: {}
  };
}

function positionToGeoJSON(position: RoutePoint): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [position.lon, position.lat]
    },
    properties: {}
  };
}

// Split route into traversed (past) and remaining (future) segments
function splitRoute(route: RoutePoint[], position: RoutePoint) {
  const elapsed = position.elapsedSeconds;
  const splitIdx = route.findIndex((p) => p.elapsedSeconds > elapsed);
  const idx = splitIdx === -1 ? route.length : splitIdx;
  const traversed = route.slice(0, Math.max(idx, 2));
  const remaining = route.slice(Math.max(idx - 1, 0));
  return { traversed, remaining };
}

export default function FlightMap({ route, position, followPlane = true }: Props) {
  const cameraRef = useRef<CameraRef>(null);

  useEffect(() => {
    if (followPlane && cameraRef.current) {
      cameraRef.current.flyTo({
        center: [position.lon, position.lat],
        duration: 1000
      });
    }
  }, [position.lon, position.lat, followPlane]);

  const { traversed, remaining } = splitRoute(route, position);
  const planeGeoJSON = positionToGeoJSON(position);
  const traversedGeoJSON = routeToGeoJSON(traversed);
  const remainingGeoJSON = routeToGeoJSON(remaining);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle="https://demotiles.maplibre.org/style.json"
        logo={false}
        attribution={false}
        compass
      >
        <Camera
          ref={cameraRef}
          center={[position.lon, position.lat]}
          zoom={5}
        />

        {/* Traversed (past) route — dimmed */}
        <GeoJSONSource id="route-traversed" data={traversedGeoJSON}>
          <Layer
            id="route-traversed-line"
            type="line"
            paint={{
              'line-color': colors.primary,
              'line-width': 2,
              'line-opacity': 0.35,
              'line-dasharray': [4, 3]
            }}
          />
        </GeoJSONSource>

        {/* Remaining route — solid */}
        <GeoJSONSource id="route-remaining" data={remainingGeoJSON}>
          <Layer
            id="route-remaining-line"
            type="line"
            paint={{
              'line-color': colors.primary,
              'line-width': 2.5,
              'line-opacity': 0.9
            }}
          />
        </GeoJSONSource>

        {/* Plane position marker */}
        <GeoJSONSource id="plane" data={planeGeoJSON}>
          <Layer
            id="plane-glow"
            type="circle"
            paint={{
              'circle-radius': 14,
              'circle-color': colors.accent,
              'circle-opacity': 0.25
            }}
          />
          <Layer
            id="plane-dot"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': colors.accent,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#fff'
            }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}
