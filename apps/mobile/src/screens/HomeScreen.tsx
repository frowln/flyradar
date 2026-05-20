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
import { typography } from '../theme/typography';
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
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function isUpcoming(departure: string): boolean {
  return new Date(departure).getTime() > Date.now();
}

function HeroCard({ item, onPress }: { item: FlightRow; onPress: () => void }) {
  const [countdown, setCountdown] = useState(() => formatCountdown(item.pkg.flight.scheduledDeparture));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(item.pkg.flight.scheduledDeparture));
    }, 60_000);
    return () => clearInterval(timer);
  }, [item.pkg.flight.scheduledDeparture]);

  const { flight } = item.pkg;

  return (
    <LinearGradient
      colors={[colors.primary, '#1A4A8E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.heroCard}
    >
      <Text style={styles.heroLabel}>{t('home.nextFlight')}</Text>
      <View style={styles.heroFlightRow}>
        <Text style={styles.heroFlightNumber}>{flight.flightNumber}</Text>
        {flight.airline ? <Text style={styles.heroAirline}>{flight.airline}</Text> : null}
      </View>
      {countdown ? (
        <Text style={styles.heroCountdown}>
          {t('home.in')} {countdown}
        </Text>
      ) : null}
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
      <Pressable style={styles.heroButton} onPress={onPress}>
        <Text style={styles.heroButtonText}>{t('home.open')}</Text>
      </Pressable>
    </LinearGradient>
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
    // Sort: upcoming first (soonest first), then past (most recent first)
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

  // Reload list whenever screen comes into focus (after adding a flight)
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

  // Find the soonest upcoming flight for the hero card
  const heroFlight = flights.find((f) => isUpcoming(f.pkg.flight.scheduledDeparture));
  // Regular list: all flights except the hero one
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
              <Text style={typography.h1}>{t('home.title')}</Text>
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
    paddingTop: 16,
    marginBottom: 16
  },
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },

  // Hero card
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 20,
    padding: 20,
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  heroFlightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10
  },
  heroFlightNumber: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800'
  },
  heroAirline: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500'
  },
  heroCountdown: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5
  },
  heroRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4
  },
  heroAirport: { gap: 2 },
  heroAirportRight: { alignItems: 'flex-end' },
  heroIata: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  heroCity: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  heroArrow: { flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 22 },
  heroButton: {
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: 'flex-start'
  },
  heroButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

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
    color: colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  duration: { color: colors.textMuted, fontSize: 13 },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  airport: { gap: 2 },
  airportRight: { alignItems: 'flex-end' },
  iata: { color: colors.text, fontSize: 22, fontWeight: '700' },
  city: { color: colors.textMuted, fontSize: 12 },
  arrow: { flex: 1, textAlign: 'center', color: colors.primary, fontSize: 20 },
  date: { color: colors.textMuted, fontSize: 12 },
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
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8
  },
  fabText: { color: colors.text, fontSize: 28, fontWeight: '300', lineHeight: 32 },
});
