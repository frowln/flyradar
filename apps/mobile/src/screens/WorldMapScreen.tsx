import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { listPackages, loadPackage, initDb } from '../core/offline/poiDatabase';
import { collectionsStore } from '../core/gamification/collections';
import type { OfflinePackage } from '@skyatlas/shared';

const ROUTE_COLORS = [
  'rgba(61, 139, 253, 0.6)',
  'rgba(255, 200, 87, 0.6)',
  'rgba(52, 199, 89, 0.6)',
  'rgba(255, 69, 58, 0.6)',
  'rgba(175, 82, 222, 0.6)'
];

interface LoadedFlight {
  flightId: string;
  pkg: OfflinePackage;
  color: string;
}

export default function WorldMapScreen() {
  const [flights, setFlights] = useState<LoadedFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const stats = collectionsStore.getStats();

  useEffect(() => {
    async function load() {
      await initDb();
      const rows = await listPackages();
      const loaded: LoadedFlight[] = [];
      for (let i = 0; i < rows.length; i++) {
        const pkg = await loadPackage(rows[i].flightId);
        if (pkg) {
          loaded.push({
            flightId: rows[i].flightId,
            pkg,
            color: ROUTE_COLORS[i % ROUTE_COLORS.length]
          });
        }
      }
      setFlights(loaded);
      setLoading(false);
    }
    load();
  }, []);

  const totalKm = Math.round(stats.totalDistanceKm);
  const countries = stats.countriesFlownOver.length;

  return (
    <View style={styles.container}>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        <StatChip label="Flights" value={String(flights.length)} />
        <View style={styles.statDivider} />
        <StatChip label="km flown" value={totalKm.toLocaleString()} />
        <View style={styles.statDivider} />
        <StatChip label="Countries" value={String(countries)} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : flights.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🌍</Text>
          <Text style={[typography.h3, styles.emptyTitle]}>No flights yet</Text>
          <Text style={[typography.body, styles.emptySubtitle]}>
            Add your first flight to see it on the world map.
          </Text>
        </View>
      ) : (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: 20,
            longitude: 0,
            latitudeDelta: 100,
            longitudeDelta: 100
          }}
          mapType="satellite"
        >
          {flights.map((f) => (
            <Polyline
              key={f.flightId}
              coordinates={f.pkg.route.map((pt) => ({
                latitude: pt.lat,
                longitude: pt.lon
              }))}
              strokeColor={f.color}
              strokeWidth={2}
            />
          ))}
        </MapView>
      )}
    </View>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  statChip: { alignItems: 'center', flex: 1 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  map: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12
  },
  emptyIcon: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { textAlign: 'center' },
  emptySubtitle: { color: colors.textMuted, textAlign: 'center', lineHeight: 22 }
});
