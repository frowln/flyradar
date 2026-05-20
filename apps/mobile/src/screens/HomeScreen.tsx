import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography, fonts } from '../theme/typography';
import { t } from '../i18n';
import EmptyState from '../components/EmptyState';
import { listPackages, loadPackage, initDb } from '../core/offline/poiDatabase';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

interface FlightRow {
  flightId: string;
  downloadedAt: number;
  pkg: OfflinePackage;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
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

function HeroCard({ item, onPress }: { item: FlightRow; onPress: () => void }) {
  const [countdown, setCountdown] = useState(() => formatCountdown(item.pkg.flight.scheduledDeparture));
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(item.pkg.flight.scheduledDeparture));
    }, 60_000);
    return () => clearInterval(timer);
  }, [item.pkg.flight.scheduledDeparture]);

  const handlePressIn = () => {
    Animated.spring(pressAnim, { toValue: 0.97, useNativeDriver: true, tension: 300, friction: 20 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, tension: 300, friction: 20 }).start();
  };

  const { flight } = item.pkg;

  return (
    <Animated.View style={[styles.heroWrapper, { transform: [{ scale: pressAnim }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <LinearGradient
          colors={['#1A2560', '#0E1530', '#0A0B14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          {/* Glow accent */}
          <View style={styles.heroGlow} pointerEvents="none" />

          {/* Header row */}
          <View style={styles.heroHeader}>
            <Text style={styles.heroLabel}>{t('home.nextFlight')}</Text>
            <Text style={styles.heroFlightNumber}>{flight.flightNumber}</Text>
          </View>

          {/* Route — big serif airport codes */}
          <View style={styles.heroRoute}>
            <View style={styles.heroAirport}>
              <Text style={styles.heroIata}>{flight.origin.iata}</Text>
              <Text style={styles.heroCity}>{flight.origin.city}</Text>
            </View>
            <Text style={styles.heroArrow}>→</Text>
            <View style={[styles.heroAirport, styles.heroAirportRight]}>
              <Text style={styles.heroIata}>{flight.destination.iata}</Text>
              <Text style={styles.heroCity}>{flight.destination.city}</Text>
            </View>
          </View>

          {/* Countdown — huge serif */}
          {countdown ? (
            <View style={styles.heroCountdownBlock}>
              <Text style={styles.heroDepartingLabel}>Departing in</Text>
              <Text style={styles.heroCountdown}>{countdown}</Text>
            </View>
          ) : null}

          {/* CTA */}
          <View style={styles.heroButtonRow}>
            <View style={styles.heroButton}>
              <Text style={styles.heroButtonText}>{t('home.open')}</Text>
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
        return new Date(a.pkg.flight.scheduledDeparture).getTime() - new Date(b.pkg.flight.scheduledDeparture).getTime();
      }
      return new Date(b.pkg.flight.scheduledDeparture).getTime() - new Date(a.pkg.flight.scheduledDeparture).getTime();
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
  const regularFlights = heroFlight
    ? flights.filter((f) => f.flightId !== heroFlight.flightId)
    : flights;

  return (
    <View style={styles.container}>
      <FlatList
        data={regularFlights}
        keyExtractor={(item) => item.flightId}
        contentContainerStyle={flights.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.screenTitle}>{t('home.title')}</Text>
            </View>
            {heroFlight ? (
              <HeroCard
                item={heroFlight}
                onPress={() => nav.navigate('FlightDetail', { flightId: heroFlight.flightId })}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          heroFlight ? null : (
            <EmptyState
              icon="✈️"
              title="No flights yet"
              description="Add your first flight before you board to explore the world below."
              ctaLabel="Add Flight"
              onCtaPress={() => nav.navigate('AddFlight')}
            />
          )
        }
        renderItem={({ item }) => {
          const { flight } = item.pkg;
          return (
            <Pressable
              style={styles.card}
              onPress={() => nav.navigate('FlightDetail', { flightId: item.flightId })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.flightNumber}>{flight.flightNumber}</Text>
                <Text style={styles.duration}>
                  {formatDuration(flight.scheduledDeparture, flight.scheduledArrival)}
                </Text>
              </View>
              <View style={styles.route}>
                <View style={styles.airport}>
                  <Text style={styles.iata}>{flight.origin.iata}</Text>
                  <Text style={styles.city}>{flight.origin.city}</Text>
                </View>
                <Text style={styles.arrow}>→</Text>
                <View style={[styles.airport, styles.airportRight]}>
                  <Text style={styles.iata}>{flight.destination.iata}</Text>
                  <Text style={styles.city}>{flight.destination.city}</Text>
                </View>
              </View>
              <Text style={styles.date}>
                {formatDate(flight.scheduledDeparture)} · {item.pkg.pois.length} places to discover
              </Text>
            </Pressable>
          );
        }}
      />
      <Pressable
        style={styles.fab}
        onPress={() => nav.navigate('AddFlight')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    marginBottom: 16
  },
  screenTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: colors.text
  },
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },

  // Hero card
  heroWrapper: {
    marginHorizontal: 16,
    marginBottom: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12
  },
  heroCard: {
    borderRadius: 24,
    padding: 22,
    gap: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(94,139,255,0.2)'
  },
  heroGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(94,139,255,0.12)'
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heroLabel: {
    fontFamily: fonts.bodySemi,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  },
  heroFlightNumber: {
    fontFamily: fonts.mono,
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 1
  },
  heroRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  heroAirport: { gap: 3 },
  heroAirportRight: { alignItems: 'flex-end' },
  heroIata: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1.5
  },
  heroCity: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12
  },
  heroArrow: {
    flex: 1,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 20,
    fontFamily: fonts.body
  },
  heroCountdownBlock: { gap: 2 },
  heroDepartingLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)'
  },
  heroCountdown: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.5
  },
  heroButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2
  },
  heroButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12
  },
  heroButtonText: {
    fontFamily: fonts.bodyBold,
    color: '#FFFFFF',
    fontSize: 14
  },
  heroAirline: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13
  },

  // Regular cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  flightNumber: {
    fontFamily: fonts.monoMedium,
    color: colors.text,
    fontSize: 15,
    letterSpacing: 0.5
  },
  duration: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 13
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  airport: { gap: 2 },
  airportRight: { alignItems: 'flex-end' },
  iata: {
    fontFamily: fonts.displayBold,
    color: colors.text,
    fontSize: 24,
    letterSpacing: -0.5
  },
  city: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
  arrow: {
    flex: 1,
    textAlign: 'center',
    color: colors.primary,
    fontSize: 18,
    fontFamily: fonts.body
  },
  date: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
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
