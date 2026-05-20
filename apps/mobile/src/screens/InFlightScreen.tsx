import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import FlightMap from '../components/FlightMap';
import FlightStats from '../components/FlightStats';
import POICard from '../components/POICard';
import QuizCard from '../components/QuizCard';
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
import { t } from '../i18n';
import { getRandomQuiz } from '../core/quizzes/quizzes';
import type { Quiz } from '../core/quizzes/quizzes';

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
  const [showTutorial, setShowTutorial] = useState(() => !collectionsStore.hasSeenInflightTutorial());
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const activePOIRef = useRef<ScheduledPOI | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissCountRef = useRef(0);

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
      const shouldReplace = !activePOIRef.current
        || (next && next.distanceKm < (activePOIRef.current.distanceKm - 10))
        || (next && next.poi.id !== activePOIRef.current.poi.id && next.distanceKm < 100);
      if (next && shouldReplace) {
        activePOIRef.current = next;
        setActivePOI(next);
      }
    };

    analytics.track('flight_started', { flightId });
    tick(); // immediate first tick
    tickRef.current = setInterval(tick, TICK_MS);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activePackage, takeoffAt]);

  const handleDismissTutorial = () => {
    collectionsStore.markInflightTutorialSeen();
    setShowTutorial(false);
  };

  const handleDismissPOI = async () => {
    if (activePOI) {
      const dismissedCategory = activePOI.poi.category;
      useFlightStore.getState().markPOISeen(activePOI.poi.id);
      activePOIRef.current = null;
      setActivePOI(null);
      dismissCountRef.current++;

      // Every 3rd dismiss, show a quiz
      if (dismissCountRef.current % 3 === 0) {
        setActiveQuiz(getRandomQuiz(dismissedCategory));
        return;
      }

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
        <Text style={styles.errorText}>{t('inFlight.noActiveFlight')}</Text>
        <Pressable onPress={() => nav.navigate('Tabs')} style={styles.homeButton}>
          <Text style={styles.homeButtonText}>{t('inFlight.goHome')}</Text>
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
          <Pressable
            onPress={() => nav.navigate('Tabs')}
            style={styles.topButton}
            accessibilityLabel="Exit flight view"
            accessibilityRole="button"
          >
            <Text style={styles.topButtonText}>{t('inFlight.exit')}</Text>
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
              accessibilityLabel={mode === 'live' ? 'Switch to offline mode' : 'Switch to live mode'}
              accessibilityRole="button"
            >
              <Text style={styles.topButtonText}>
                {mode === 'live' ? t('inFlight.mode_live') : t('inFlight.mode_offline')}
              </Text>
              <Text style={styles.topButtonCaption}>Mode</Text>
            </Pressable>
            <Pressable
              onPress={() => setFollowPlane((f) => !f)}
              style={[styles.topButton, followPlane && styles.topButtonActive]}
              accessibilityLabel={followPlane ? 'Unfollow plane' : 'Follow plane on map'}
              accessibilityRole="button"
            >
              <Text style={styles.topButtonText}>{followPlane ? '📍' : '🗺'}</Text>
              <Text style={styles.topButtonCaption}>{followPlane ? 'Follow' : 'Free'}</Text>
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

      {/* Quiz card — shown every 3rd POI dismiss */}
      {activeQuiz && (
        <QuizCard quiz={activeQuiz} onClose={() => setActiveQuiz(null)} />
      )}

      {/* Bottom stats bar */}
      <View style={styles.bottomBar}>
        <FlightStats
          pkg={activePackage}
          position={currentPosition}
          takeoffAt={takeoffAt}
        />
      </View>

      {/* First-time in-flight tutorial overlay */}
      <Modal
        visible={showTutorial}
        transparent
        animationType="fade"
        onRequestClose={handleDismissTutorial}
      >
        <View style={styles.tutorialBackdrop}>
          <View style={styles.tutorialSheet}>
            <Text style={styles.tutorialTitle}>Welcome aboard</Text>
            <View style={styles.tutorialRows}>
              <Text style={styles.tutorialRow}>👈 👉  Pinch to zoom the map</Text>
              <Text style={styles.tutorialRow}>🗺️  POI cards appear automatically</Text>
              <Text style={styles.tutorialRow}>📍  Tap them to learn about places below</Text>
            </View>
            <Pressable onPress={handleDismissTutorial} style={styles.tutorialDismiss}>
              <Text style={styles.tutorialDismissText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  topButtonText: { fontFamily: fonts.bodySemi, color: colors.text, fontSize: 14 },
  topButtonCaption: { fontFamily: fonts.mono, color: colors.textMuted, fontSize: 9, textAlign: 'center', marginTop: 2 },
  routeChip: {
    backgroundColor: 'rgba(10, 11, 20, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  routeText: { fontFamily: fonts.monoMedium, color: colors.text, fontSize: 15, letterSpacing: 0.5 },
  flightNumText: { fontFamily: fonts.mono, color: colors.primary, fontSize: 11, letterSpacing: 0.5 },

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
  },

  tutorialBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end'
  },
  tutorialSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: 16
  },
  tutorialTitle: {
    fontFamily: fonts.displayBold,
    color: colors.text,
    fontSize: 22,
    letterSpacing: -0.4,
    textAlign: 'center'
  },
  tutorialRows: {
    gap: 12
  },
  tutorialRow: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22
  },
  tutorialDismiss: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4
  },
  tutorialDismissText: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
    fontSize: 16
  }
});
