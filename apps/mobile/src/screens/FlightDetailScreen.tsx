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
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../core/ux/haptics';
import { scheduleFlightReminder } from '../core/ux/notifications';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { loadPackage } from '../core/offline/poiDatabase';
import { downloadPackage } from '../core/offline/packageDownloader';
import { fetchWeather, weatherIcon, packingList, type WeatherForecast } from '../core/api/weather';
import { useFlightStore } from '../core/flight/flightStore';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';
import { t } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'FlightDetail'>;
type Route = RouteProp<RootStackParamList, 'FlightDetail'>;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
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
            scheduleFlightReminder(
              fresh.flight.id,
              fresh.flight.flightNumber,
              new Date(fresh.flight.scheduledDeparture)
            );
            fetchWeather(
              fresh.flight.destination.lat,
              fresh.flight.destination.lon
            ).then(setWeather);
            return;
          } catch {
            // fall through with stale package
          }
        }
        setPkg(p);
        if (p) {
          scheduleFlightReminder(
            p.flight.id,
            p.flight.flightNumber,
            new Date(p.flight.scheduledDeparture)
          );
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
          onPress: () => {
            haptics.success();
            startFlight(new Date());
          }
        },
        {
          text: t('flightDetail.scheduledTime'),
          onPress: () => {
            haptics.success();
            startFlight(new Date(pkg.flight.scheduledDeparture));
          }
        },
        { text: t('flightDetail.cancel'), style: 'cancel' }
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
        <Text style={styles.notFound}>{t('flightDetail.flightNotFound')}</Text>
      </View>
    );
  }

  const { flight } = pkg;
  const pkgSize = estimatePackageSize(pkg);
  const duration = formatDuration(flight.scheduledDeparture, flight.scheduledArrival);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* PHOTO STRIP / Destination gradient hero — boarding pass top */}
        <LinearGradient
          colors={['#0B1340', '#1A2560', '#152045']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.photoStrip}
        >
          {/* Decorative orb */}
          <View style={styles.stripOrb} pointerEvents="none" />

          {/* Airline + flight number — small, top */}
          <View style={styles.stripHeader}>
            {flight.airline ? (
              <Text style={styles.stripAirline}>{flight.airline}</Text>
            ) : null}
            <Text style={styles.stripFlightNum}>{flight.flightNumber}</Text>
          </View>

          {/* Destination city name large */}
          <Text style={styles.stripDestCity}>{flight.destination.city}</Text>
          <Text style={styles.stripDate}>{formatDate(flight.scheduledDeparture)}</Text>
        </LinearGradient>

        {/* BOARDING PASS CARD — lifts over photo strip */}
        <View style={styles.boardingCard}>
          {/* Tear-line separator */}
          <View style={styles.tearLine}>
            <View style={styles.tearCircleLeft} />
            <View style={styles.tearDash} />
            <View style={styles.tearCircleRight} />
          </View>

          {/* MASSIVE airport codes */}
          <View style={styles.routeBlock}>
            <View style={styles.routeAirport}>
              <Text style={styles.routeIata}>{flight.origin.iata}</Text>
              <Text style={styles.routeCity}>{flight.origin.city}</Text>
            </View>

            <View style={styles.routeMiddle}>
              <Text style={styles.routeArrowGlyph}>✈</Text>
              <Text style={styles.routeDuration}>{duration}</Text>
            </View>

            <View style={[styles.routeAirport, styles.routeAirportRight]}>
              <Text style={styles.routeIata}>{flight.destination.iata}</Text>
              <Text style={styles.routeCity}>{flight.destination.city}</Text>
            </View>
          </View>

          {/* DEPARTURE → ARRIVAL timeline */}
          <View style={styles.timeline}>
            <View style={styles.timelineStop}>
              <Text style={styles.timelineTime}>{formatTime(flight.scheduledDeparture)}</Text>
              <Text style={styles.timelineLabel}>Departs</Text>
            </View>

            <View style={styles.timelineTrack}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineBar} />
              <View style={styles.timelineDot} />
            </View>

            <View style={[styles.timelineStop, styles.timelineStopRight]}>
              <Text style={styles.timelineTime}>{formatTime(flight.scheduledArrival)}</Text>
              <Text style={styles.timelineLabel}>Arrives</Text>
            </View>
          </View>

          {/* Aircraft chip */}
          {flight.aircraftType ? (
            <View style={styles.aircraftChip}>
              <Text style={styles.aircraftText}>{flight.aircraftType}</Text>
            </View>
          ) : null}
        </View>

        {/* WEATHER CARD */}
        {weather && (
          <View style={styles.card}>
            <View style={styles.weatherMain}>
              <View style={styles.weatherLeft}>
                <Text style={styles.weatherIcon}>{weatherIcon(weather.weatherCode)}</Text>
                <Text style={styles.weatherTemp}>{weather.temperature}°C</Text>
              </View>
              <View style={styles.weatherRight}>
                <Text style={styles.weatherCity}>At {flight.destination.city}</Text>
                <Text style={styles.weatherDesc}>{weather.description}</Text>
                <Text style={styles.weatherWind}>Wind {weather.windSpeed} km/h</Text>
              </View>
            </View>

            {/* Packing hints */}
            <View style={styles.packingRow}>
              {packingList(weather.temperature, weather.weatherCode)
                .slice(0, 4)
                .map((item, i) => (
                  <View key={i} style={styles.packingChip}>
                    <Text style={styles.packingChipText}>{item}</Text>
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* OFFLINE PACKAGE */}
        <View style={styles.card}>
          <View style={styles.offlineRow}>
            <View style={styles.offlineStat}>
              <Text style={styles.offlineNum}>{pkg.pois.length}</Text>
              <Text style={styles.offlineLabel}>places</Text>
            </View>
            <View style={styles.offlineDivider} />
            <View style={styles.offlineStat}>
              <Text style={styles.offlineNum}>{pkg.route.length}</Text>
              <Text style={styles.offlineLabel}>waypoints</Text>
            </View>
            <View style={styles.offlineDivider} />
            <View style={styles.offlineStat}>
              <Text style={styles.offlineNum}>{formatBytes(pkgSize)}</Text>
              <Text style={styles.offlineLabel}>offline</Text>
            </View>
          </View>
          <View style={styles.readyBadge}>
            <Text style={styles.readyText}>{t('flightDetail.readyForOffline')}</Text>
          </View>
        </View>

        {/* HIGHLIGHTS — horizontal scroll of POIs */}
        {pkg.pois.length > 0 && (
          <View style={styles.highlightsSection}>
            <Text style={styles.highlightsTitle}>
              {t('flightDetail.highlights').toUpperCase()}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.highlightsScroll}
            >
              {pkg.pois.slice(0, 6).map((poi) => (
                <View key={poi.id} style={styles.poiCard}>
                  <Text style={styles.poiCategory}>{poi.category.toUpperCase()}</Text>
                  <Text style={styles.poiName}>{poi.name}</Text>
                </View>
              ))}
              {pkg.pois.length > 6 && (
                <View style={[styles.poiCard, styles.poiCardMore]}>
                  <Text style={styles.poiMoreNum}>+{pkg.pois.length - 6}</Text>
                  <Text style={styles.poiMoreLabel}>more</Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* Bottom padding for sticky footer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* STICKY START BUTTON */}
      <View style={styles.stickyFooter}>
        <Pressable
          style={styles.startButton}
          onPress={handleStartFlight}
          accessibilityLabel="Start flight tracking"
          accessibilityRole="button"
        >
          <Text style={styles.startButtonText}>{t('flightDetail.startFlight')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  content: { paddingBottom: 0 },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center'
  },
  notFound: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 15
  },

  // PHOTO STRIP
  photoStrip: {
    height: 200,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end'
  },
  stripOrb: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(94,139,255,0.15)'
  },
  stripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'absolute',
    top: 20,
    left: 24,
    right: 24
  },
  stripAirline: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12
  },
  stripFlightNum: {
    fontFamily: fonts.mono,
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 1
  },
  stripDestCity: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1
  },
  stripDate: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13
  },

  // BOARDING CARD — lifts over photo
  boardingCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: -24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
    paddingBottom: 20
  },

  // Tear line — boarding pass detail
  tearLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 12,
    paddingHorizontal: 8
  },
  tearCircleLeft: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.bg,
    marginLeft: -8
  },
  tearDash: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border
  },
  tearCircleRight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.bg,
    marginRight: -8
  },

  // Route block — MASSIVE IATA codes
  routeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4
  },
  routeAirport: { flex: 1, gap: 4 },
  routeAirportRight: { alignItems: 'flex-end' },
  routeIata: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -2
  },
  routeCity: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
  routeMiddle: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8
  },
  routeArrowGlyph: {
    fontSize: 22,
    color: colors.primary
  },
  routeDuration: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontSize: 11
  },

  // Timeline departure → arrival
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8
  },
  timelineStop: { alignItems: 'flex-start', gap: 2 },
  timelineStopRight: { alignItems: 'flex-end' },
  timelineTime: {
    fontFamily: fonts.monoMedium,
    color: colors.text,
    fontSize: 22,
    letterSpacing: -0.5
  },
  timelineLabel: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  timelineTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8
  },
  timelineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary
  },
  timelineBar: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border
  },

  aircraftChip: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4
  },
  aircraftText: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.5
  },

  // Generic card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    gap: 12
  },

  // WEATHER
  weatherMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  weatherLeft: {
    alignItems: 'center',
    gap: 4
  },
  weatherRight: { flex: 1, gap: 2 },
  weatherIcon: { fontSize: 44 },
  weatherTemp: {
    fontFamily: fonts.monoMedium,
    color: colors.text,
    fontSize: 28,
    letterSpacing: -0.5
  },
  weatherCity: {
    fontFamily: fonts.bodySemi,
    color: colors.text,
    fontSize: 14
  },
  weatherDesc: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 13
  },
  weatherWind: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
  packingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  packingChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  packingChipText: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 12
  },

  // OFFLINE
  offlineRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  offlineStat: { flex: 1, alignItems: 'center', gap: 2 },
  offlineNum: {
    fontFamily: fonts.monoMedium,
    color: colors.text,
    fontSize: 20,
    letterSpacing: -0.5
  },
  offlineLabel: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 11
  },
  offlineDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border
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

  // HIGHLIGHTS horizontal scroll
  highlightsSection: {
    marginTop: 12,
    gap: 12
  },
  highlightsTitle: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    paddingHorizontal: 16
  },
  highlightsScroll: {
    paddingHorizontal: 16,
    gap: 10
  },
  poiCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    width: 140,
    gap: 4
  },
  poiCardMore: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  poiCategory: {
    fontFamily: fonts.bodySemi,
    color: colors.accent,
    fontSize: 9,
    letterSpacing: 1.2
  },
  poiName: {
    fontFamily: fonts.bodyMedium,
    color: colors.text,
    fontSize: 13,
    lineHeight: 17
  },
  poiMoreNum: {
    fontFamily: fonts.display,
    color: colors.textMuted,
    fontSize: 24
  },
  poiMoreLabel: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },

  // STICKY FOOTER
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
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
  }
});
