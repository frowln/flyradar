import { View, StyleSheet } from 'react-native';
import { palette, s, gutter, line } from '../design/tokens';
import { Code, Small } from '../design/type';
import { t } from '../../src/i18n';

interface Props {
  fromCode: string;
  toCode: string;
  fromCity?: string;
  toCity?: string;
  /** 0–1 along the leg. When set, a marker rides the rule at that point. */
  progress?: number;
}

/**
 * A leg, drawn the way a departure board draws one: two codes and a rule.
 *
 * The aircraft glyph that usually lives between two airport codes reads as a
 * sticker at this size. A rule with a lit origin cap says the same thing and
 * survives being placed next to real instrument type.
 *
 * Read aloud as one sentence — "Moscow to Antalya, 45% flown" — rather than as
 * two codes and a rule.
 */
export default function RouteRule({ fromCode, toCode, fromCity, toCity, progress }: Props) {
  const showMarker = typeof progress === 'number' && Number.isFinite(progress);
  const p = showMarker ? Math.min(1, Math.max(0, progress!)) : 0;
  const route = t('a11y.route', { from: fromCity || fromCode, to: toCity || toCode });

  return (
    <View
      accessible
      accessibilityLabel={showMarker ? `${route}, ${t('a11y.flown', { pct: Math.round(p * 100) })}` : route}
      style={styles.block}
    >
      <View style={styles.row}>
        <Code allowFontScaling={false}>{fromCode}</Code>

        <View style={styles.rail}>
          <View style={styles.cap} />
          <View style={styles.hair} />
          {showMarker ? (
            <View style={[styles.marker, { left: `${p * 100}%` }]} pointerEvents="none" />
          ) : null}
          <View style={[styles.cap, styles.capEnd]} />
        </View>

        <Code allowFontScaling={false}>{toCode}</Code>
      </View>

      {fromCity || toCity ? (
        <View style={styles.cities}>
          <Small numberOfLines={1} style={styles.cityLeft}>
            {fromCity ?? ''}
          </Small>
          <Small numberOfLines={1} style={styles.cityRight}>
            {toCity ?? ''}
          </Small>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: gutter },
  row: { flexDirection: 'row', alignItems: 'center', gap: s.x3 },
  rail: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  hair: { flex: 1, height: line.hair, backgroundColor: palette.rule },
  cap: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.amber },
  capEnd: { backgroundColor: palette.rule },
  marker: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.amber,
    marginLeft: -3.5
  },
  cities: { flexDirection: 'row', justifyContent: 'space-between', marginTop: s.x2, gap: s.x3 },
  cityLeft: { flex: 1 },
  cityRight: { flex: 1, textAlign: 'right' }
});
