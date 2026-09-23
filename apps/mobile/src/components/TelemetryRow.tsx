import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { space, hairline } from '../theme/tokens';

export interface Reading {
  /** The number itself. Pre-formatted — this component does not do units maths. */
  value: string;
  /** Caps label under it, e.g. "ВЫСОТА · М". Keep it short; it must not wrap. */
  label: string;
}

interface Props {
  readings: Reading[];
  /** Hairlines above and below the row. Off when it already sits against a rule. */
  bordered?: boolean;
}

/**
 * A row of instrument readings separated by hairlines.
 *
 * Numbers use the tabular mono face so a changing altitude does not shift the
 * label underneath it — on a screen that updates every second, proportional
 * digits visibly jitter.
 */
export default function TelemetryRow({ readings, bordered = true }: Props) {
  return (
    <View style={[styles.row, bordered && styles.bordered]}>
      {readings.map((r, i) => (
        <View
          key={r.label}
          style={[styles.cell, i < readings.length - 1 && styles.divider]}
          accessible
          accessibilityLabel={`${r.label}: ${r.value}`}
        >
          <Text style={typography.data} allowFontScaling={false} numberOfLines={1}>
            {r.value}
          </Text>
          <Text style={[typography.label, styles.label]} numberOfLines={1}>
            {r.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row'
  },
  bordered: {
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
    borderColor: colors.line
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md
  },
  divider: {
    borderRightWidth: hairline,
    borderRightColor: colors.line
  },
  label: {
    marginTop: space.xs
  }
});
