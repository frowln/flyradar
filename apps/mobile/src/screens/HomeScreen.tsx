import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated,
  ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { t } from '../i18n';
import { listPackages, loadPackage, initDb } from '../core/offline/poiDatabase';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';
import { groupIntoTrips } from '../core/trip/trips';
import type { Trip } from '../core/trip/trips';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

interface FlightRow {
  flightId: string;
  downloadedAt: number;
  pkg: OfflinePackage;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatDuration(departure: string, arrival: string): string {
  const mins = Math.round(
    (new Date(arrival).getTime() - new Date(departure).getTime()) / 60_000
  );
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatCountdown(departure: string): string {
  const diff = new Date(departure).getTime() - Date.now();
  if (diff <= 0) return '';
  const totalMins = Math.floor(diff / 60_000);
  const d = Math.floor(totalMins / 1440);
  const h = Math.floor((totalMins % 1440) / 60);
  const m = totalMins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function isUpcoming(departure: string): boolean {
  return new Date(departure).getTime() > Date.now();
}

// Full-bleed hero for upcoming flight — takes ~50% of screen
function UpcomingHero({
  item,
  onPress
}: {
  item: FlightRow;
  onPress: () => void;
}) {
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(item.pkg.flight.scheduledDeparture)
  );
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(item.pkg.flight.scheduledDeparture));
    }, 60_000);
    return () => clearInterval(timer);
  }, [item.pkg.flight.scheduledDeparture]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.975,
      useNativeDriver: true,
      tension: 300,
      friction: 20
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 20
    }).start();
  };

  const { flight } = item.pkg;

  return (
    <Animated.View style={[styles.heroOuter, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={`Open flight ${flight.flightNumber}`}
      >
        <LinearGradient
          colors={['#0B1340', '#1A2560', '#0E1C50']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        >
          {/* Glow orb */}
          <View style={styles.heroGlowOrb} pointerEvents="none" />
          <View style={styles.heroGlowOrb2} pointerEvents="none" />

          {/* Top row: label + flight number */}
          <View style={styles.heroTopRow}>
            <Text style={styles.heroNextLabel}>{t('home.nextFlight')}</Text>
            <Text style={styles.heroFlightNum}>{flight.flightNumber}</Text>
          </View>

          {/* MASSIVE airport codes — the focal point */}
          <View style={styles.heroRouteRow}>
            <View style={styles.heroAirportLeft}>
              <Text style={styles.heroIata}>{flight.origin.iata}</Text>
              <Text style={styles.heroCity}>{flight.origin.city}</Text>
            </View>
            <View style={styles.heroArrowBlock}>
              <Text style={styles.heroArrowLine}>──────</Text>
              <Text style={styles.heroPlane}>✈</Text>
            </View>
            <View style={styles.heroAirportRight}>
              <Text style={styles.heroIata}>{flight.destination.iata}</Text>
              <Text style={styles.heroCity}>{flight.destination.city}</Text>
            </View>
          </View>

          {/* Countdown or departure time */}
          {countdown ? (
            <View style={styles.heroCountdownBlock}>
              <Text style={styles.heroCountdownLabel}>DEPARTING IN</Text>
              <Text style={styles.heroCountdown}>{countdown}</Text>
            </View>
          ) : (
            <Text style={styles.heroDepartTime}>
              {formatDate(flight.scheduledDeparture)} · {formatTime(flight.scheduledDeparture)}
            </Text>
          )}

          {/* CTA row */}
          <View style={styles.heroCtaRow}>
            <View style={styles.heroOpenBtn}>
              <Text style={styles.heroOpenText}>{t('home.open')}</Text>
            </View>
            {flight.airline ? (
              <Text style={styles.heroAirline}>{flight.airline}</Text>
            ) : null}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// Compact timeline row for additional upcoming flights
function FlightTimelineRow({
  item,
  onPress
}: {
  item: FlightRow;
  onPress: () => void;
}) {
  const { flight } = item.pkg;
  const upcoming = isUpcoming(flight.scheduledDeparture);

  return (
    <Pressable
      style={styles.timelineRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open flight ${flight.flightNumber}`}
    >
      {/* Timeline dot */}
      <View style={styles.timelineDotCol}>
        <View
          style={[
            styles.timelineDot,
            { backgroundColor: upcoming ? colors.primary : colors.textDim }
          ]}
        />
        <View style={styles.timelineLine} />
      </View>

      <View style={styles.timelineContent}>
        <View style={styles.timelineTop}>
          <Text style={styles.timelineIata}>
            {flight.origin.iata} → {flight.destination.iata}
          </Text>
          <Text style={styles.timelineNum}>{flight.flightNumber}</Text>
        </View>
        <Text style={styles.timelineDate}>
          {formatDate(flight.scheduledDeparture)} ·{' '}
          {formatDuration(flight.scheduledDeparture, flight.scheduledArrival)}
        </Text>
      </View>

      <Text style={styles.timelineChevron}>›</Text>
    </Pressable>
  );
}

// Trip group header + indented legs for multi-leg trips
function TripGroupRow({
  trip,
  onPressFlight
}: {
  trip: Trip;
  onPressFlight: (flightId: string) => void;
}) {
  const isMultiLeg = trip.flights.length > 1;

  return (
    <View style={tripStyles.tripGroup}>
      {isMultiLeg && (
        <View style={tripStyles.tripHeader}>
          <View style={tripStyles.tripAccent} />
          <Text style={tripStyles.tripName}>{trip.name}</Text>
          <Text style={tripStyles.tripLegs}>{trip.flights.length} legs</Text>
        </View>
      )}
      {trip.flights.map((pkg) => (
        <FlightTimelineRow
          key={pkg.flight.id}
          item={{ flightId: pkg.flight.id, downloadedAt: 0, pkg }}
          onPress={() => onPressFlight(pkg.flight.id)}
        />
      ))}
    </View>
  );
}

const tripStyles = StyleSheet.create({
  tripGroup: { marginBottom: 8 },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    paddingLeft: 2
  },
  tripAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: colors.primary,
    opacity: 0.6
  },
  tripName: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.5,
    flex: 1
  },
  tripLegs: {
    fontFamily: fonts.mono,
    color: colors.textDim,
    fontSize: 10
  }
});

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFlights = useCallback(async () => {
    await initDb();
    const rows = await listPackages();
    const loaded: FlightRow[] = [];
    for (const row of rows) {
      const pkg = await loadPackage(row.flightId);
      if (pkg) loaded.push({ flightId: row.flightId, downloadedAt: row.downloadedAt, pkg });
    }
    loaded.sort((a, b) => {
      const aUp = isUpcoming(a.pkg.flight.scheduledDeparture);
      const bUp = isUpcoming(b.pkg.flight.scheduledDeparture);
      if (aUp && !bUp) return -1;
      if (!aUp && bUp) return 1;
      if (aUp && bUp) {
        return (
          new Date(a.pkg.flight.scheduledDeparture).getTime() -
          new Date(b.pkg.flight.scheduledDeparture).getTime()
        );
      }
      return (
        new Date(b.pkg.flight.scheduledDeparture).getTime() -
        new Date(a.pkg.flight.scheduledDeparture).getTime()
      );
    });
    setFlights(loaded);
  }, []);

  useEffect(() => {
    loadFlights().finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFlights();
    }, [loadFlights])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFlights();
    setRefreshing(false);
  }, [loadFlights]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const heroFlight = flights.find((f) => isUpcoming(f.pkg.flight.scheduledDeparture));
  const upcomingRest = heroFlight
    ? flights.filter(
        (f) =>
          f.flightId !== heroFlight.flightId && isUpcoming(f.pkg.flight.scheduledDeparture)
      )
    : [];
  const pastFlights = flights.filter((f) => !isUpcoming(f.pkg.flight.scheduledDeparture));
  const pastTrips = groupIntoTrips(pastFlights.map((f) => f.pkg));

  // Empty state — cinematic
  if (flights.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyGlyph}>✦</Text>
          <Text style={styles.emptyHeadline}>{t('home.whereWillYouGo')}</Text>
          <Text style={styles.emptyBody}>
            Add a flight before you board and discover the world below at 35,000 ft.
          </Text>
          <Pressable
            style={styles.emptyCtaBtn}
            onPress={() => nav.navigate('AddFlight')}
            accessibilityRole="button"
            accessibilityLabel={t('home.addFirstFlight')}
          >
            <Text style={styles.emptyCtaText}>{t('home.addFirstFlight')}</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.fab}
          onPress={() => nav.navigate('AddFlight')}
          accessibilityRole="button"
          accessibilityLabel="Add flight"
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Screen title — only shown when no upcoming hero */}
        {!heroFlight && (
          <View style={styles.screenHeader}>
            <Text style={styles.screenTitle}>{t('home.title')}</Text>
          </View>
        )}

        {/* HERO — upcoming flight takes 50% of visual weight */}
        {heroFlight && (
          <UpcomingHero
            item={heroFlight}
            onPress={() => nav.navigate('FlightDetail', { flightId: heroFlight.flightId })}
          />
        )}

        {/* Today's timeline — other upcoming flights */}
        {upcomingRest.length > 0 && (
          <View style={styles.timelineSection}>
            <Text style={styles.timelineSectionLabel}>ALSO UPCOMING</Text>
            {upcomingRest.slice(0, 3).map((item) => (
              <FlightTimelineRow
                key={item.flightId}
                item={item}
                onPress={() => nav.navigate('FlightDetail', { flightId: item.flightId })}
              />
            ))}
          </View>
        )}

        {/* Past flights — grouped into trips */}
        {pastTrips.length > 0 && (
          <View style={styles.pastSection}>
            <Text style={styles.pastSectionLabel}>PAST FLIGHTS</Text>
            {pastTrips.slice(0, 3).map((trip) => (
              <TripGroupRow
                key={trip.id}
                trip={trip}
                onPressFlight={(flightId) => nav.navigate('FlightDetail', { flightId })}
              />
            ))}
            {pastTrips.length > 3 && (
              <Text style={styles.pastMoreHint}>
                +{pastTrips.length - 3} more trips
              </Text>
            )}
          </View>
        )}

        {/* Bottom padding for FAB */}
        <View style={{ height: 96 }} />
      </ScrollView>

      {/* FAB — sits at bottom edge of hero visually */}
      <Pressable
        style={styles.fab}
        onPress={() => nav.navigate('AddFlight')}
        accessibilityRole="button"
        accessibilityLabel="Add flight"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollContent: { paddingTop: 0 },

  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16
  },
  screenTitle: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: colors.text
  },

  // HERO — full-bleed, tall
  heroOuter: {
    shadowColor: '#1A2560',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16
  },
  heroGradient: {
    minHeight: 300,
    padding: 24,
    paddingTop: 36,
    gap: 16,
    overflow: 'hidden'
  },
  heroGlowOrb: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(94,139,255,0.10)'
  },
  heroGlowOrb2: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(94,139,255,0.06)'
  },

  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heroNextLabel: {
    fontFamily: fonts.bodySemi,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  heroFlightNum: {
    fontFamily: fonts.mono,
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 1
  },

  heroRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4
  },
  heroAirportLeft: { flex: 1, gap: 4 },
  heroAirportRight: { flex: 1, alignItems: 'flex-end', gap: 4 },
  heroIata: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 58,
    lineHeight: 62,
    letterSpacing: -2
  },
  heroCity: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12
  },
  heroArrowBlock: {
    alignItems: 'center',
    paddingHorizontal: 4
  },
  heroArrowLine: {
    fontFamily: fonts.mono,
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10
  },
  heroPlane: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.5)',
    marginTop: -2
  },

  heroCountdownBlock: { gap: 2 },
  heroCountdownLabel: {
    fontFamily: fonts.bodySemi,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    letterSpacing: 2
  },
  heroCountdown: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.5
  },
  heroDepartTime: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13
  },

  heroCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4
  },
  heroOpenBtn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 12
  },
  heroOpenText: {
    fontFamily: fonts.bodyBold,
    color: '#FFFFFF',
    fontSize: 14
  },
  heroAirline: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13
  },

  // TIMELINE
  timelineSection: {
    marginTop: 20,
    paddingHorizontal: 16
  },
  pastSection: {
    marginTop: 20,
    paddingHorizontal: 16
  },
  timelineSectionLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 12
  },
  pastSectionLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 12
  },

  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
    paddingVertical: 4
  },
  timelineDotCol: {
    alignItems: 'center',
    width: 14,
    paddingTop: 5
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: colors.border,
    marginTop: 4,
    minHeight: 32
  },
  timelineContent: {
    flex: 1,
    gap: 3,
    paddingBottom: 16
  },
  timelineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  timelineIata: {
    fontFamily: fonts.displayBold,
    color: colors.text,
    fontSize: 18,
    letterSpacing: -0.3
  },
  timelineNum: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5
  },
  timelineDate: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
  timelineChevron: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 20,
    paddingTop: 2
  },

  pastMoreHint: {
    fontFamily: fonts.body,
    color: colors.primary,
    fontSize: 13,
    marginTop: 4,
    paddingLeft: 26
  },

  // EMPTY STATE
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 16
  },
  emptyGlyph: {
    fontSize: 48,
    color: colors.primary,
    marginBottom: 8
  },
  emptyHeadline: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -1,
    textAlign: 'center'
  },
  emptyBody: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  emptyCtaBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 8
  },
  emptyCtaText: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
    fontSize: 16
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8
  },
  fabText: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 28,
    lineHeight: 32
  }
});
