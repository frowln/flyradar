import { View, StyleSheet } from 'react-native';
import { palette, s, line } from '../design/tokens';
import { Label, DataSmall, Small, typeStyles } from '../design/type';
import { decorative } from '../design/layout';
import { t } from '../../src/i18n';

interface Props {
  /** Current run of weeks with a flight (see `streaks()`). */
  weeks: number;
  /** Current run of calendar months with a flight. */
  months: number;
  /** One line, smaller, no hint: for a profile row or a tight header. */
  compact?: boolean;
  /**
   * Whether this week already has a flight. When it is known to be false the
   * newest bar is drawn open — the streak is alive, waiting for this week's
   * flight — and the full badge says so. `streaks()` returns both flags, so
   * `<StreakBadge {...streaks(records)} />` works as is.
   */
  flewThisWeek?: boolean;
  flewThisMonth?: boolean;
}

const BARS = 8;

/**
 * A run of weeks (or months) in a row with a flight, as an instrument reads it:
 * one bar per period, the newest on the right, lit while the run holds.
 *
 * Weeks win when there is a run of two or more of them; otherwise months, for
 * the passenger who flies monthly rather than weekly. A single period is not a
 * streak, so below two the badge draws nothing at all.
 */
export default function StreakBadge({ weeks, months, compact = false, flewThisWeek, flewThisMonth }: Props) {
  const unit = weeks >= 2 ? 'weeks' : months >= 2 ? 'months' : null;
  if (!unit) return null;

  const count = unit === 'weeks' ? weeks : months;
  const waiting = (unit === 'weeks' ? flewThisWeek : flewThisMonth) === false;
  // Spelled out key by key so the i18n check can see each one.
  const label = unit === 'weeks' ? t('streak.weeks', { count }) : t('streak.months', { count });
  const hint = !waiting ? null : unit === 'weeks' ? t('streak.keepWeek') : t('streak.keepMonth');

  // Position 0 is the current period. While it is still open the run ends one
  // period back, and the current bar is drawn as an empty slot.
  const bars = Array.from({ length: BARS }, (_, i) => {
    const p = BARS - 1 - i;
    if (waiting && p === 0) return 'open' as const;
    const lit = waiting ? p >= 1 && p <= count : p < count;
    return lit ? ('lit' as const) : ('off' as const);
  });

  return (
    <View accessible accessibilityLabel={hint ? `${label}. ${hint}` : label} style={compact ? styles.compact : styles.full}>
      <View style={styles.row}>
        <View {...decorative} style={[styles.bars, compact && styles.barsCompact]}>
          {bars.map((b, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                compact && styles.barCompact,
                // The newest bars stand a little taller: the run builds toward now.
                { height: (compact ? 10 : 14) - Math.max(0, BARS - 1 - i - 3) },
                b === 'lit' ? styles.lit : b === 'open' ? styles.open : styles.off
              ]}
            />
          ))}
        </View>
        {compact ? (
          <DataSmall tone="accent" numberOfLines={1} style={typeStyles.shrink}>
            {label}
          </DataSmall>
        ) : (
          <Label tone="accent" style={typeStyles.shrink}>
            {label}
          </Label>
        )}
      </View>
      {!compact && hint ? <Small style={styles.hint}>{hint}</Small> : null}
    </View>
  );
}

const BAR_W = 3;
const BAR_GAP = 2;

const styles = StyleSheet.create({
  full: { gap: s.x1 },
  compact: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: s.x3 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP, height: 14 },
  barsCompact: { height: 10 },
  bar: { width: BAR_W },
  barCompact: { width: 2 },
  lit: { backgroundColor: palette.amber },
  off: { backgroundColor: palette.rule },
  open: { borderWidth: line.hair, borderColor: palette.amberDim },
  // Lines the hint up under the label, past the bars and the gap.
  hint: { paddingLeft: BARS * BAR_W + (BARS - 1) * BAR_GAP + s.x3 }
});
