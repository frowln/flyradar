import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { listPackages, loadPackage, initDb } from '../core/offline/poiDatabase';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

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

  return (
    <View style={styles.container}>
      <FlatList
        data={flights}
        keyExtractor={(item) => item.flightId}
        contentContainerStyle={flights.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✈️</Text>
            <Text style={[typography.h3, styles.emptyTitle]}>No flights yet</Text>
            <Text style={[typography.body, styles.emptySubtitle]}>
              Add your first flight before you board to explore the world below.
            </Text>
          </View>
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
  list: { padding: 16, gap: 12 },
  emptyList: { flex: 1 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { textAlign: 'center' },
  emptySubtitle: { color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
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
  fabText: { color: colors.text, fontSize: 28, fontWeight: '300', lineHeight: 32 }
});
