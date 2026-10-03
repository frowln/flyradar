import { forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import type { OfflinePackage } from '@skyatlas/shared';
import { palette, s } from '../design/tokens';
import { Label, Code, Body, DataSmall, Small } from '../design/type';
import RouteSketch from './RouteSketch';
import { cityName } from '../../src/core/data/airports';
import { countryName } from '../../src/core/places/names';
import { distinctCountries } from '../../src/core/places/countries';
import { km } from '../../src/core/units';
import { routeLengthKm } from '../../src/core/geo/greatCircle';
import { t, getLocale } from '../../src/i18n';
import { duration, dayMonth } from '../format';

/**
 * The card a passenger sends with "landed".
 *
 * Square-ish, 4:5, made for a messenger thread rather than a story: it goes
 * where "we landed" is already being sent. It carries no flight number, seat or
 * booking data — only the shape of the journey and what lay under it.
 *
 * Its text ignores the system text size: the card is captured as an image and
 * sent, and must look the same on the recipient's phone as on the sender's.
 */
const Postcard = forwardRef<View, { pkg: OfflinePackage; width: number; spotted?: number }>(function Postcard(
  { pkg, width, spotted = 0 },
  ref
) {
  const locale = getLocale();
  const height = Math.round(width * 1.25);
  const { flight, route } = pkg;
  const countries = distinctCountries(pkg.countries ?? []);
  const dist = km(routeLengthKm(route));
  const air = route[route.length - 1]?.elapsedSeconds ?? 0;
  const sketchH = Math.round(height * 0.52);

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <View style={styles.pad}>
        <View style={styles.row}>
          <Label tone="accent" style={styles.wordmark}>
            SKYATLAS
          </Label>
          <DataSmall allowFontScaling={false}>{dayMonth(flight.scheduledDeparture, flight.origin.tz)}</DataSmall>
        </View>
        <View style={[styles.row, styles.codes]}>
          <Code allowFontScaling={false}>{flight.origin.iata}</Code>
          <View style={styles.rule} />
          <Code allowFontScaling={false}>{flight.destination.iata}</Code>
        </View>
        <View style={styles.row}>
          <Small numberOfLines={1}>{cityName(flight.origin, locale)}</Small>
          <Small numberOfLines={1}>{cityName(flight.destination, locale)}</Small>
        </View>
      </View>
      <RouteSketch
        route={route}
        width={width}
        height={sketchH}
        pois={pkg.pois}
        highlight={countries}
        flownS={air}
        fromLabel={cityName(flight.origin, locale)}
        toLabel={cityName(flight.destination, locale)}
      />
      <View style={styles.pad}>
        <Body numberOfLines={2}>{countries.map((cc) => countryName(cc, locale)).join(' · ')}</Body>
        <View style={styles.statsRow}>
          <DataSmall tone="accent" allowFontScaling={false}>
            {t('postcard.stats', { count: countries.length, dist: dist.value, unit: t(`unit.${dist.unit}`), time: duration(air) })}
          </DataSmall>
        </View>
        {spotted > 0 ? <Small tone="muted">{t('postcard.spotted', { count: spotted })}</Small> : null}
      </View>
    </View>
  );
});

export default Postcard;

const styles = StyleSheet.create({
  card: { backgroundColor: palette.ground, overflow: 'hidden' },
  pad: { paddingHorizontal: s.x5, paddingVertical: s.x4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codes: { marginVertical: s.x2, gap: s.x3 },
  rule: { flex: 1, height: 1, backgroundColor: palette.amberDim },
  wordmark: { letterSpacing: 3.5 },
  statsRow: { marginTop: s.x3, marginBottom: s.x1 }
});
