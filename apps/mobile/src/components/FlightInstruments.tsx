import { View, StyleSheet } from 'react-native';
import type { RoutePoint, OfflinePackage } from '@skyatlas/shared';
import { colors } from '../theme/colors';
import { space } from '../theme/tokens';
import { haversine } from '../core/geo/greatCircle';
import { t } from '../i18n';
import Gauge from './Gauge';
import TelemetryRow from './TelemetryRow';

interface Props {
  pkg: OfflinePackage;
  position: RoutePoint;
}

/** "6:12" — hours and minutes, the way a countdown is read aloud. */
function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Local arrival clock, e.g. "14:53". */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The instrument panel: a dial for how far along the flight is, and a row of
 * readings under it.
 *
 * This replaces the four-cell stats strip. The difference is hierarchy — time
 * remaining is the one number a passenger actually wants, so it gets the dial
 * and everything else gets a hairline cell.
 */
export default function FlightInstruments({ pkg, position }: Props) {
  const { flight, route } = pkg;
  const dest = route[route.length - 1]!;
  const totalSeconds = dest.elapsedSeconds || 1;

  const progress = Math.min(1, Math.max(0, position.elapsedSeconds / totalSeconds));

  const arrivalMs = new Date(flight.scheduledArrival).getTime();
  const remaining = Number.isNaN(arrivalMs) ? 0 : Math.max(0, arrivalMs - Date.now());

  const distanceRemaining = Math.round(haversine(position.lat, position.lon, dest.lat, dest.lon));
  const altitudeM = Math.round(position.altitude);
  const speedKmh = Math.round(
    haversine(route[0]!.lat, route[0]!.lon, dest.lat, dest.lon) / (totalSeconds / 3600)
  );

  return (
    <View style={styles.panel}>
      <Gauge
        progress={progress}
        reading={formatRemaining(remaining)}
        caption={`${t('inFlight.eta')} · ${flight.destination.iata} ${formatClock(flight.scheduledArrival)}`}
        accessibilityLabel={`${formatRemaining(remaining)} ${t('inFlight.remaining')}`}
      />
      <TelemetryRow
        readings={[
          { value: altitudeM.toLocaleString(), label: `${t('inFlight.altitude')} · M` },
          { value: String(speedKmh), label: t('inFlight.kmh') },
          { value: distanceRemaining.toLocaleString(), label: `${t('inFlight.remaining')} · KM` }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.bg,
    paddingTop: space.sm
  }
});
