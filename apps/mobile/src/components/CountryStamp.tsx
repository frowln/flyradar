import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius, hairline } from '../theme/tokens';

interface Props {
  /** ISO 3166-1 alpha-2, e.g. "AF". */
  code: string;
  /** Short date the country was first overflown, e.g. "10·VIII". */
  date?: string;
  /** Not yet collected — drawn as a dashed outline. */
  locked?: boolean;
  size?: number;
  /** Full country name, for screen readers. The two-letter code is not readable aloud. */
  countryName?: string;
}

/**
 * A country stamp, in the shape of a passport mark.
 *
 * Locked stamps are drawn rather than hidden: an atlas with visible gaps is what
 * makes someone want to fill it. Hiding what you have not collected removes the
 * only reason to collect.
 */
export default function CountryStamp({
  code,
  date,
  locked = false,
  size = 44,
  countryName
}: Props) {
  const label = countryName ?? code;

  return (
    <View
      style={[
        styles.stamp,
        { width: size, height: size, borderRadius: radius.pill },
        locked ? styles.locked : styles.collected
      ]}
      accessible
      accessibilityLabel={
        locked ? `${label} — не собрано` : date ? `${label}, ${date}` : label
      }
    >
      <Text
        style={[typography.dataSmall, styles.code, locked && styles.lockedText]}
        allowFontScaling={false}
      >
        {code}
      </Text>
      {!locked && date ? (
        <Text style={[typography.dataSmall, styles.date]} allowFontScaling={false}>
          {date}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hairline
  },
  collected: {
    borderColor: colors.accentDim,
    backgroundColor: colors.surfaceTinted
  },
  locked: {
    borderColor: colors.line,
    borderStyle: 'dashed'
  },
  code: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16
  },
  lockedText: {
    color: colors.textDim
  },
  date: {
    color: colors.accentDim,
    fontSize: 8,
    lineHeight: 10
  }
});
