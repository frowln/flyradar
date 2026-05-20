import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../theme/colors';
import FlightMap from '../components/FlightMap';
import FlightStats from '../components/FlightStats';
import POICard from '../components/POICard';
import { useFlightStore } from '../core/flight/flightStore';
import { computePosition } from '../core/flight/positionEngine';
import { tryFetchLivePosition } from '../core/flight/liveTracker';
import { getNextPOI } from '../core/flight/poiScheduler';
import type { ScheduledPOI } from '../core/flight/poiScheduler';
import type { POI } from '@skyatlas/shared';
import type { RootStackParamList } from '../navigation/types';
import { isPro } from '../core/monetization/revenueCat';
import { analytics } from '../core/analytics';
import { collectionsStore } from '../core/gamification/collections';

type Nav = NativeStackNavigationProp<RootStackParamList, 'InFlight'>;
type Route = RouteProp<RootStackParamList, 'InFlight'>;

const TICK_MS = 5000;

export default function InFlightScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { flightId } = route.params;

  const { activePackage, takeoffAt, currentPosition, updatePosition, clearFlight, mode, setMode, timeMultiplier } = useFlightStore();
  const [followPlane, setFollowPlane] = useState(true);
  const [activePOI, setActivePOI] = useState<ScheduledPOI | null>(null);
  const [kidsModeOn] = useState(() => collectionsStore.isKidsMode());
  const activePOIRef = useRef<ScheduledPOI | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activePackage || !takeoffAt) return;

    const tick = async () => {
      const currentMode = useFlightStore.getState().mode;
      let pos = currentMode === 'live'
        ? await tryFetchLivePosition(activePackage.flight.flightNumber)
        : null;
      if (!pos) {
        const multiplier = useFlightStore.getState().timeMultiplier;
        pos = computePosition(activePackage.route, takeoffAt, new Date(), multiplier);
      }
      updatePosition(pos);

      // Auto-navigate to summary when flight ends
      const lastPoint = activePackage.route[activePackage.route.length - 1];
      if (pos.elapsedSeconds >= lastPoint.elapsedSeconds) {
        clearInterval(tickRef.current!);
        nav.replace('FlightSummary', { flightId });
        return;
      }

      // Check for nearby POIs
      const seenIds = new Set(useFlightStore.getState().seenPOIs.map((s) => s.poiId));
      const next = await getNextPOI(flightId, pos, seenIds);
      if (next && activePOIRef.current?.poi.id !== next.poi.id) {
        activePOIRef.current = next;
        setActivePOI(next);
      }
    };

    analytics.track('flight_started', { flightId });
    tick(); // immediate first tick
    tickRef.current = setInterval(tick, TICK_MS);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activePackage, takeoffAt]);

  const handleDismissPOI = async () => {
    if (activePOI) {
      useFlightStore.getState().markPOISeen(activePOI.poi.id);
      activePOIRef.current = null;
      setActivePOI(null);
      // Free tier: max 5 POIs per flight
      const { seenPOIs: updatedSeen } = useFlightStore.getState();
      if (updatedSeen.length >= 5) {
        const pro = await isPro();
        if (!pro) {
          nav.navigate('Paywall');
        }
      }
    }
  };

  const handleReadMore = async (poi: POI) => {
    analytics.track('poi_viewed', { poiId: poi.id, name: poi.name });
    useFlightStore.getState().markPOISeen(poi.id);
    activePOIRef.current = null;
    setActivePOI(null);
    // Free tier: max 5 POIs per flight
    const { seenPOIs: updatedSeen } = useFlightStore.getState();
    if (updatedSeen.length >= 5) {
      const pro = await isPro();
      if (!pro) {
        nav.navigate('Paywall');
        return;
      }
    }
    nav.navigate('POIDetail', { poiId: poi.id, flightId });
  };

  if (!activePackage || !takeoffAt || !currentPosition) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No active flight.</Text>
        <Pressable onPress={() => nav.navigate('Home')} style={styles.homeButton}>
          <Text style={styles.homeButtonText}>Go Home</Text>
        </Pressable>
      </View>
    );
  }

  const { flight } = activePackage;

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <FlightMap
        route={activePackage.route}
        position={currentPosition}
        pois={activePackage.pois}
        followPlane={followPlane}
      />

      {/* Top HUD */}
      <SafeAreaView style={styles.topHUD} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={() => nav.navigate('Home')} style={styles.topButton}>
            <Text style={styles.topButtonText}>← Exit</Text>
          </Pressable>
          <View style={styles.routeChip}>
            <Text style={styles.routeText}>
              {flight.origin.iata} → {flight.destination.iata}
            </Text>
            <Text style={styles.flightNumText}>{flight.flightNumber}</Text>
          </View>
          <View style={styles.topRightGroup}>
            <Pressable
              onPress={() => setMode(mode === 'live' ? 'offline' : 'live')}
              style={[styles.topButton, mode === 'live' && styles.topButtonActive]}
            >
              <Text style={styles.topButtonText}>
                {mode === 'live' ? '🔴 LIVE' : 'OFFLINE'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFollowPlane((f) => !f)}
              style={[styles.topButton, followPlane && styles.topButtonActive]}
            >
              <Text style={styles.topButtonText}>{followPlane ? '📍' : '🗺'}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* POI proximity card */}
      {activePOI && (
        <POICard
          poi={activePOI.poi}
          distanceKm={activePOI.distanceKm}
          onReadMore={handleReadMore}
          onDismiss={handleDismissPOI}
          kidsMode={kidsModeOn}
        />
      )}

      {/* Bottom stats bar */}
      <View style={styles.bottomBar}>
        <FlightStats
          pkg={activePackage}
          position={currentPosition}
          takeoffAt={takeoffAt}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16
  },
  errorText: { color: colors.textMuted, fontSize: 16 },
  homeButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  homeButtonText: { color: colors.text, fontWeight: '600' },

  topHUD: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8
  },
  topButton: {
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border
  },
  topButtonActive: {
    borderColor: colors.primary
  },
  topButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  routeChip: {
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  routeText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  flightNumText: { color: colors.primary, fontSize: 11, fontWeight: '600' },

  topRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
  }
});
