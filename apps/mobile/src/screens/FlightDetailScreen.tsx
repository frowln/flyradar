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
import { haptics } from '../core/ux/haptics';
import { scheduleFlightReminder } from '../core/ux/notifications';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography, fonts } from '../theme/typography';
import { loadPackage } from '../core/offline/poiDatabase';
import { downloadPackage } from '../core/offline/packageDownloader';
import { fetchWeather, weatherIcon, packingList, type WeatherForecast } from '../core/api/weather';
import { useFlightStore } from '../core/flight/flightStore';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';
import { t } from '../i18n';

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
      .then(async (p) => {
        if (p && p.pois.length === 0) {
          const [flightNumber, date] = flightId.split(/-(.+)/);
          try {
            const fresh = await downloadPackage(flightNumber, date);
            setPkg(fresh);
            scheduleFlightReminder(fresh.flight.id, fresh.flight.flightNumber, new Date(fresh.flight.scheduledDeparture));
            fetchWeather(fresh.flight.destination.lat, fresh.flight.destination.lon).then(setWeather);
            return;
          } catch {
            // fall through with stale package
          }
        }
        setPkg(p);
        if (p) {
          scheduleFlightReminder(p.flight.id, p.flight.flightNumber, new Date(p.flight.scheduledDeparture));
          fetchWeather(p.flight.destination.lat, p.flight.destination.lon).then(setWeather);
        }
      })
      .finally(() => setLoading(false));
  }, [flightId]);

  const handleStartFlight = () => {
    if (!pkg) return;
    haptics.medium();

    Alert.alert(
      t('flightDetail.confirmTakeoff'),
      t('flightDetail.confirmTakeoffMessage'),
      [
        {
          text: t('flightDetail.justNow'),
          onPress: () => { haptics.success(); startFlight(new Date()); }
        },
        {
          text: t('flightDetail.scheduledTime'),
          onPress: () => { haptics.success(); startFlight(new Date(pkg.flight.scheduledDeparture)); }
        },
        {
          text: t('flightDetail.cancel'),
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
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('flightDetail.flightNotFound')}</Text>
      </View>
    );
  }

  const { flight } = pkg;
  const pkgSize = estimatePackageSize(pkg);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Route header — big serif airport codes */}
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
        <Text style={styles.sectionTitle}>{t('flightDetail.flightInfo').toUpperCase()}</Text>
        <InfoRow label={t('flightDetail.airline')} value={flight.airline} />
        <InfoRow label={t('flightDetail.departure')} value={formatDateTime(flight.scheduledDeparture)} />
        <InfoRow label={t('flightDetail.arrival')} value={formatDateTime(flight.scheduledArrival)} />
        {flight.aircraftType && (
          <InfoRow label={t('flightDetail.aircraft')} value={flight.aircraftType} />
        )}
      </View>

      {/* Offline package info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('flightDetail.offlinePackage').toUpperCase()}</Text>
        <InfoRow label={t('flightDetail.placesToDiscover')} value={`${pkg.pois.length} ${t('flightDetail.locations')}`} />
        <InfoRow label={t('flightDetail.routePoints')} value={`${pkg.route.length} ${t('flightDetail.waypoints')}`} />
        <InfoRow label={t('flightDetail.downloaded')} value={formatBytes(pkgSize)} />
        <View style={styles.readyBadge}>
          <Text style={styles.readyText}>{t('flightDetail.readyForOffline')}</Text>
        </View>
      </View>

      {/* Weather at destination */}
      {weather && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('flightDetail.weatherAt').toUpperCase()}</Text>
          <View style={styles.weatherRow}>
            <Text style={styles.weatherIcon}>{weatherIcon(weather.weatherCode)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.weatherTemp}>{weather.temperature}°C</Text>
              <Text style={styles.weatherDesc}>{weather.description} · Wind {weather.windSpeed} km/h</Text>
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>{t('flightDetail.whatToPack').toUpperCase()}</Text>
            {packingList(weather.temperature, weather.weatherCode).map((item, i) => (
              <Text key={i} style={styles.packItem}>{item}</Text>
            ))}
          </View>
        </View>
      )}

      {/* What's below preview */}
      {pkg.pois.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('flightDetail.highlights').toUpperCase()}</Text>
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
      <Pressable
        style={styles.startButton}
        onPress={handleStartFlight}
        accessibilityLabel="Start flight tracking"
        accessibilityRole="button"
      >
        <Text style={styles.startButtonText}>{t('flightDetail.startFlight')}</Text>
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
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  airportBlock: { flex: 1, gap: 4 },
  airportRight: { alignItems: 'flex-end' },
  // Big Fraunces serif airport codes
  iata: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1
  },
  airportName: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
  routeCenter: { flex: 1, alignItems: 'center', gap: 2 },
  flightNumber: {
    fontFamily: fonts.mono,
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 1
  },
  arrow: {
    fontFamily: fonts.mono,
    color: colors.accent,
    fontSize: 12
  },
  duration: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },

  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  sectionTitle: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.5
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14
  },
  infoValue: {
    fontFamily: fonts.bodyMedium,
    color: colors.text,
    fontSize: 14,
    flex: 1,
    textAlign: 'right'
  },

  readyBadge: {
    backgroundColor: `${colors.success}22`,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center'
  },
  readyText: {
    fontFamily: fonts.bodySemi,
    color: colors.success,
    fontSize: 13
  },

  poiPreview: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  poiCategory: {
    fontFamily: fonts.bodySemi,
    color: colors.accent,
    fontSize: 10,
    letterSpacing: 1,
    width: 64
  },
  poiName: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 14,
    flex: 1
  },
  moreHint: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4
  },

  startButton: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8
  },
  startButtonText: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
    fontSize: 17
  },

  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  weatherIcon: { fontSize: 48 },
  weatherTemp: {
    fontFamily: fonts.monoMedium,
    color: colors.text,
    fontSize: 32,
    letterSpacing: -0.5
  },
  weatherDesc: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14
  },
  packItem: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 14,
    marginVertical: 3
  }
});
