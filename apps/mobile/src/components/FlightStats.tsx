import { View, Text, StyleSheet } from 'react-native';
import type { RoutePoint, OfflinePackage } from '@skyatlas/shared';
import { colors } from '../theme/colors';
import { haversine } from '../core/geo/greatCircle';

interface Props {
  pkg: OfflinePackage;
  position: RoutePoint;
  takeoffAt: Date;
}

function formatTime(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function FlightStats({ pkg, position, takeoffAt }: Props) {
  const { flight, route } = pkg;
  const dest = route[route.length - 1];

  const distanceRemaining = Math.round(
    haversine(position.lat, position.lon, dest.lat, dest.lon)
  );

  const arrivalMs = new Date(flight.scheduledArrival).getTime();
  const timeRemaining = Math.max(0, arrivalMs - Date.now());

  const speedKmh = Math.round(
    (haversine(
      route[0].lat, route[0].lon,
      dest.lat, dest.lon
    ) / ((dest.elapsedSeconds || 1) / 3600))
  );

  const altitudeM = Math.round(position.altitude);
  const altitudeFt = Math.round(altitudeM * 3.281);

  return (
    <View style={styles.container}>
      <StatItem label="Altitude" value={`${altitudeM.toLocaleString()}m`} sub={`${altitudeFt.toLocaleString()}ft`} />
      <StatItem label="Distance" value={`${distanceRemaining.toLocaleString()}km`} sub="remaining" />
      <StatItem label="ETA" value={formatTime(timeRemaining)} sub="remaining" />
      <StatItem label="Speed" value={`~${speedKmh}`} sub="km/h" />
    </View>
  );
}

function StatItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.sub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(10, 14, 26, 0.92)',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  stat: { alignItems: 'center', gap: 2 },
  label: { color: colors.textMuted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  value: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 10 }
});
