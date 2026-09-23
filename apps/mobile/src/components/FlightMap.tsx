import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import type { RoutePoint, POI } from '@skyatlas/shared';
import { colors } from '../theme/colors';

interface Props {
  route: RoutePoint[];
  position: RoutePoint;
  pois?: POI[];
  followPlane?: boolean;
}

export default function FlightMap({ route, position, pois = [], followPlane = true }: Props) {
  const mapRef = useRef<MapView>(null);
  const [userInteracting, setUserInteracting] = useState(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didInitialFitRef = useRef(false);

  const handlePanDrag = () => {
    setUserInteracting(true);
    if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = setTimeout(() => setUserInteracting(false), 10000);
  };

  // On first render, fit the whole route + POIs in view so the user sees the
  // full picture — the plane is one moving dot, not the entire map.
  useEffect(() => {
    if (didInitialFitRef.current || !mapRef.current || route.length < 2) return;
    didInitialFitRef.current = true;
    const coords = [
      ...route.map((p) => ({ latitude: p.lat, longitude: p.lon })),
      ...pois.map((p) => ({ latitude: p.lat, longitude: p.lon }))
    ];
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 60, bottom: 200, left: 60 },
      animated: false
    });
  }, [route, pois]);

  // Subsequent position updates only re-center when "follow plane" is on and
  // the user isn't actively panning. Zoom is wider (3.6) so the route + plane
  // stay visible together — keeps motion legible for slow real-time playback.
  useEffect(() => {
    if (!didInitialFitRef.current) return;
    if (followPlane && !userInteracting && mapRef.current) {
      mapRef.current.animateCamera(
        { center: { latitude: position.lat, longitude: position.lon }, zoom: 3.6 },
        { duration: 800 }
      );
    }
  }, [position.lat, position.lon, followPlane, userInteracting]);

  // Split route into traversed (past) and remaining (future)
  const idx = route.findIndex((p) => p.elapsedSeconds > position.elapsedSeconds);
  const splitIdx = idx === -1 ? route.length : idx;
  const traversed = route.slice(0, Math.max(splitIdx, 2)).map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const remaining = route.slice(Math.max(splitIdx - 1, 0)).map((p) => ({ latitude: p.lat, longitude: p.lon }));

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        latitude: position.lat,
        longitude: position.lon,
        latitudeDelta: 30,
        longitudeDelta: 30
      }}
      showsCompass
      showsScale
      mapType="standard"
      zoomEnabled={true}
      scrollEnabled={true}
      pitchEnabled={true}
      rotateEnabled={true}
      onPanDrag={handlePanDrag}
    >
      {/* Traversed path — dimmed */}
      <Polyline
        coordinates={traversed}
        strokeColor={colors.primary + '60'}
        strokeWidth={2}
        lineDashPattern={[6, 4]}
      />

      {/* Remaining path — solid */}
      <Polyline
        coordinates={remaining}
        strokeColor={colors.primary}
        strokeWidth={3}
      />

      {/* POI markers (max 30 to avoid clutter) */}
      {pois.slice(0, 30).map((poi) => (
        <Marker
          key={poi.id}
          coordinate={{ latitude: poi.lat, longitude: poi.lon }}
          title={poi.name}
          description={poi.category}
          pinColor={colors.accent}
        />
      ))}

      {/* Plane marker */}
      <Marker
        coordinate={{ latitude: position.lat, longitude: position.lon }}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View style={styles.plane}>
          <View style={styles.planeDot} />
        </View>
      </Marker>
    </MapView>
  );
}

const styles = StyleSheet.create({
  plane: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent + '40',
    justifyContent: 'center',
    alignItems: 'center'
  },
  planeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff'
  }
});
