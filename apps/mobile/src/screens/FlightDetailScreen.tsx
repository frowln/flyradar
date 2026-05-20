import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { loadPackage } from '../core/offline/poiDatabase';
import { fetchWeather, weatherIcon, packingList, type WeatherForecast } from '../core/api/weather';
import { useFlightStore } from '../core/flight/flightStore';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'FlightDetail'>;
type Route = RouteProp<RootStackParamList, 'FlightDetail'>;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(departure: string, arrival: string): string {
  const mins = Math.round(
    (new Date(arrival).getTime() - new Date(departure).getTime()) / 60_000
  );
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function estimatePackageSize(pkg: OfflinePackage): number {
  // Rough estimate: JSON serialization size
  return new Blob([JSON.stringify(pkg)]).size;
}

export default function FlightDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { flightId } = route.params;

  const [pkg, setPkg] = useState<OfflinePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);

  const { setPackage, confirmTakeoff } = useFlightStore();

  useEffect(() => {
    loadPackage(flightId)
      .then(p => {
        setPkg(p);
        if (p) {
          fetchWeather(p.flight.destination.lat, p.flight.destination.lon).then(setWeather);
        }
      })
      .finally(() => setLoading(false));
  }, [flightId]);

  const handleStartFlight = () => {
    if (!pkg) return;

    Alert.alert(
      'Confirm Takeoff Time',
      'What time did you take off? This helps SkyAtlas accurately show your position without internet.',
      [
        {
          text: 'Just now',
          onPress: () => startFlight(new Date())
        },
        {
          text: 'Scheduled time',
          onPress: () => startFlight(new Date(pkg.flight.scheduledDeparture))
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const startFlight = (takeoffAt: Date) => {
    if (!pkg) return;
    setPackage(pkg);
    confirmTakeoff(takeoffAt);
    nav.navigate('InFlight', { flightId: pkg.flight.id });
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
        <Text style={[typography.body, { color: colors.textMuted }]}>Flight not found.</Text>
      </View>
    );
  }

  const { flight } = pkg;
  const pkgSize = estimatePackageSize(pkg);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Route header */}
      <View style={styles.routeCard}>
        <View style={styles.routeRow}>
          <View style={styles.airportBlock}>
            <Text style={styles.iata}>{flight.origin.iata}</Text>
            <Text style={styles.airportName}>{flight.origin.city}</Text>
          </View>
          <View style={styles.routeCenter}>
            <Text style={styles.flightNumber}>{flight.flightNumber}</Text>
            <Text style={styles.arrow}>──────✈</Text>
            <Text style={styles.duration}>
              {formatDuration(flight.scheduledDeparture, flight.scheduledArrival)}
            </Text>
          </View>
          <View style={[styles.airportBlock, styles.airportRight]}>
            <Text style={styles.iata}>{flight.destination.iata}</Text>
            <Text style={styles.airportName}>{flight.destination.city}</Text>
          </View>
        </View>
      </View>

      {/* Flight info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>FLIGHT INFO</Text>
        <InfoRow label="Airline" value={flight.airline} />
        <InfoRow label="Departure" value={formatDateTime(flight.scheduledDeparture)} />
        <InfoRow label="Arrival" value={formatDateTime(flight.scheduledArrival)} />
        {flight.aircraftType && (
          <InfoRow label="Aircraft" value={flight.aircraftType} />
        )}
      </View>

      {/* Offline package info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>OFFLINE PACKAGE</Text>
        <InfoRow label="Places to discover" value={`${pkg.pois.length} locations`} />
        <InfoRow label="Route points" value={`${pkg.route.length} waypoints`} />
        <InfoRow label="Downloaded" value={formatBytes(pkgSize)} />
        <View style={styles.readyBadge}>
          <Text style={styles.readyText}>✓ Ready for offline use</Text>
        </View>
      </View>

      {/* Weather at destination */}
      {weather && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WEATHER AT DESTINATION</Text>
          <View style={styles.weatherRow}>
            <Text style={styles.weatherIcon}>{weatherIcon(weather.weatherCode)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.weatherTemp}>{weather.temperature}°C</Text>
              <Text style={styles.weatherDesc}>{weather.description} · Wind {weather.windSpeed} km/h</Text>
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>WHAT TO PACK</Text>
            {packingList(weather.temperature, weather.weatherCode).map((item, i) => (
              <Text key={i} style={styles.packItem}>{item}</Text>
            ))}
          </View>
        </View>
      )}

      {/* What's below preview */}
      {pkg.pois.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HIGHLIGHTS</Text>
          {pkg.pois.slice(0, 4).map((poi) => (
            <View key={poi.id} style={styles.poiPreview}>
              <Text style={styles.poiCategory}>{poi.category.toUpperCase()}</Text>
              <Text style={styles.poiName}>{poi.name}</Text>
            </View>
          ))}
          {pkg.pois.length > 4 && (
            <Text style={styles.moreHint}>+{pkg.pois.length - 4} more places</Text>
          )}
        </View>
      )}

      {/* Start flight CTA */}
      <Pressable style={styles.startButton} onPress={handleStartFlight}>
        <Text style={styles.startButtonText}>✈ Start Flight</Text>
      </Pressable>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },

  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  airportBlock: { flex: 1, gap: 4 },
  airportRight: { alignItems: 'flex-end' },
  iata: { color: colors.text, fontSize: 28, fontWeight: '800' },
  airportName: { color: colors.textMuted, fontSize: 12 },
  routeCenter: { flex: 1, alignItems: 'center', gap: 2 },
  flightNumber: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  arrow: { color: colors.accent, fontSize: 14 },
  duration: { color: colors.textMuted, fontSize: 12 },

  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { color: colors.textMuted, fontSize: 14 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },

  readyBadge: {
    backgroundColor: `${colors.success}22`,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center'
  },
  readyText: { color: colors.success, fontSize: 13, fontWeight: '600' },

  poiPreview: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  poiCategory: { color: colors.accent, fontSize: 10, fontWeight: '700', width: 64 },
  poiName: { color: colors.text, fontSize: 14, flex: 1 },
  moreHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },

  startButton: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8
  },
  startButtonText: { color: colors.text, fontSize: 17, fontWeight: '700' },

  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  weatherIcon: { fontSize: 48 },
  weatherTemp: { color: colors.text, fontSize: 32, fontWeight: '700' },
  weatherDesc: { color: colors.textMuted, fontSize: 14 },
  packItem: { color: colors.text, fontSize: 14, marginVertical: 3 }
});
