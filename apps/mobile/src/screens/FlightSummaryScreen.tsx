import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import InstagramStoryCard from '../components/InstagramStoryCard';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { loadPackage } from '../core/offline/poiDatabase';
import { analytics } from '../core/analytics';
import { useFlightStore } from '../core/flight/flightStore';
import { haversine } from '../core/geo/greatCircle';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';
import { t } from '../i18n';
import { collectionsStore } from '../core/gamification/collections';
import { ACHIEVEMENTS, evaluateAchievements } from '../core/gamification/achievements';
import { useAchievementToast } from '../components/AchievementToast';
import { sendAchievementNotification } from '../core/ux/notifications';

type Nav = NativeStackNavigationProp<RootStackParamList, 'FlightSummary'>;
type Route = RouteProp<RootStackParamList, 'FlightSummary'>;

function calcTotalDistanceKm(pkg: OfflinePackage): number {
  const { route } = pkg;
  return Math.round(
    haversine(
      route[0].lat, route[0].lon,
      route[route.length - 1].lat, route[route.length - 1].lon
    )
  );
}

function formatDuration(departure: string, arrival: string): string {
  const mins = Math.round(
    (new Date(arrival).getTime() - new Date(departure).getTime()) / 60_000
  );
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function FlightSummaryScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { flightId } = route.params;

  const [pkg, setPkg] = useState<OfflinePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const { seenPOIs, clearFlight } = useFlightStore();
  const showAchievementToast = useAchievementToast((s) => s.show);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    loadPackage(flightId).then(setPkg).finally(() => setLoading(false));
    analytics.track('flight_completed', { flightId, poisDiscovered: seenPOIs.length });

    // Evaluate and award new achievements
    const stats = collectionsStore.getStats();
    const alreadyEarned = collectionsStore.getEarnedAchievements();
    const newIds = evaluateAchievements(stats, alreadyEarned);
    if (newIds.length > 0) {
      collectionsStore.addAchievements(newIds);
      for (const id of newIds) {
        const achievement = ACHIEVEMENTS.find((a) => a.id === id);
        if (achievement) {
          sendAchievementNotification(achievement.name, achievement.description);
        }
      }
      // Show in-app toast for the first new achievement only
      const first = ACHIEVEMENTS.find((a) => a.id === newIds[0]);
      if (first) {
        const milestoneIds = ['air_wolf', 'legend', 'globetrotter', 'explorer'];
        showAchievementToast({
          id: first.id,
          name: first.name,
          icon: first.icon,
          description: first.description,
          isMilestone: milestoneIds.includes(first.id)
        });
      }
    }

    // Don't clear flight state immediately — user might go back
  }, [flightId]);

  const handleDone = () => {
    clearFlight();
    nav.navigate('Tabs');
  };

  const handleShareCard = async () => {
    if (!cardRef.current || !pkg) return;
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: 1080, height: 1920 });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      }
    } catch {
      // sharing not available or user cancelled — silent fail
    }
  };

  const handleShare = async () => {
    if (!pkg) return;
    const { flight } = pkg;
    const dist = calcTotalDistanceKm(pkg);
    const placesCount = seenPOIs.length;
    try {
      await Share.share({
        message: `✈️ ${t('flightSummary.shareMessage', {
          flightNumber: flight.flightNumber,
          origin: flight.origin.city,
          destination: flight.destination.city,
          distance: dist.toLocaleString(),
          places: placesCount
        })}`,
        title: 'My Flight with SkyAtlas'
      });
    } catch {
      // user cancelled
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!pkg) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textMuted }}>{t('flightSummary.flightDataNotFound')}</Text>
        <Pressable onPress={handleDone} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>{t('flightSummary.goHome')}</Text>
        </Pressable>
      </View>
    );
  }

  const { flight } = pkg;
  const distKm = calcTotalDistanceKm(pkg);
  const duration = formatDuration(flight.scheduledDeparture, flight.scheduledArrival);
  const discoveredPOIs = pkg.pois.filter((p) => seenPOIs.some((s) => s.poiId === p.id));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>🛬</Text>
        <Text style={[typography.h1, styles.heroTitle]}>{t('flightSummary.landed')}</Text>
        <Text style={styles.heroSub}>
          {flight.flightNumber} · {flight.origin.iata} → {flight.destination.iata}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <SummaryStatCard value={`${distKm.toLocaleString()}`} unit="km" label={t('flightSummary.distanceFlown')} />
        <SummaryStatCard value={duration} unit="" label={t('flightSummary.timeInAir')} />
        <SummaryStatCard value={`${discoveredPOIs.length}`} unit={`/ ${pkg.pois.length}`} label={t('flightSummary.placesDiscovered')} />
        <SummaryStatCard value={`${pkg.route.length}`} unit="pts" label={t('flightSummary.routeWaypoints')} />
      </View>

      {/* Discovered places */}
      {discoveredPOIs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('flightSummary.placesYouDiscovered')}</Text>
          {discoveredPOIs.map((poi) => (
            <View key={poi.id} style={styles.poiRow}>
              <Text style={styles.poiIcon}>
                {poi.category === 'city' ? '🏙️' :
                  poi.category === 'mountain' ? '⛰️' :
                  poi.category === 'lake' ? '🌊' :
                  poi.category === 'volcano' ? '🌋' :
                  poi.category === 'island' ? '🏝️' : '📍'}
              </Text>
              <View style={styles.poiInfo}>
                <Text style={styles.poiName}>{poi.name}</Text>
                <Text style={styles.poiCategory}>{poi.category}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* All available places (not discovered) */}
      {pkg.pois.length > discoveredPOIs.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('flightSummary.missedThisTime')}</Text>
          {pkg.pois
            .filter((p) => !seenPOIs.some((s) => s.poiId === p.id))
            .slice(0, 5)
            .map((poi) => (
              <Text key={poi.id} style={styles.missedItem}>· {poi.name}</Text>
            ))}
        </View>
      )}

      {/* Hidden 1080×1920 Instagram Story card — rendered off-screen for capture */}
      <View style={{ position: 'absolute', left: -10000 }} pointerEvents="none">
        <InstagramStoryCard
          ref={cardRef}
          flight={flight}
          distanceKm={distKm}
          poisDiscovered={discoveredPOIs.length}
        />
      </View>

      {/* Action buttons */}
      <Pressable style={styles.shareCardButton} onPress={handleShareCard}>
        <Text style={styles.shareCardButtonText}>📸 Share to Instagram Story</Text>
      </Pressable>

      <Pressable style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareButtonText}>{t('flightSummary.shareFlight')}</Text>
      </Pressable>

      <Pressable style={styles.doneButton} onPress={handleDone}>
        <Text style={styles.doneButtonText}>{t('flightSummary.done')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function SummaryStatCard({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: 16 },

  hero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  heroEmoji: { fontSize: 56 },
  heroTitle: { textAlign: 'center' },
  heroSub: { color: colors.primary, fontSize: 15, fontWeight: '600' },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10
  },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border, gap: 4
  },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  statUnit: { color: colors.textMuted, fontSize: 13 },
  statLabel: { color: colors.textMuted, fontSize: 12 },

  section: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    gap: 10, borderWidth: 1, borderColor: colors.border
  },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  poiRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  poiIcon: { fontSize: 20 },
  poiInfo: { flex: 1 },
  poiName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  poiCategory: { color: colors.textMuted, fontSize: 12, textTransform: 'capitalize' },

  missedItem: { color: colors.textMuted, fontSize: 14 },

  shareCardButton: {
    backgroundColor: colors.surfaceTinted, borderWidth: 1, borderColor: colors.accent,
    padding: 16, borderRadius: 14, alignItems: 'center'
  },
  shareCardButtonText: { color: colors.accent, fontSize: 16, fontWeight: '700' },

  shareButton: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary,
    padding: 16, borderRadius: 14, alignItems: 'center'
  },
  shareButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },

  doneButton: {
    backgroundColor: colors.primary,
    padding: 16, borderRadius: 14, alignItems: 'center'
  },
  doneButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});
