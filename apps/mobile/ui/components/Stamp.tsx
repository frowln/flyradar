import { View, StyleSheet } from 'react-native';
import { palette, radius, line } from '../design/tokens';
import { DataSmall } from '../design/type';

interface Props {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Not collected yet — drawn as an outline rather than hidden. */
  locked?: boolean;
  size?: number;
  /** Spoken name; two letters are not readable aloud. */
  name?: string;
}

/**
 * A country mark, shaped like a passport stamp.
 *
 * Locked stamps stay on the grid on purpose. An atlas with visible gaps is what
 * makes someone want to fill it; hiding what has not been collected removes the
 * only reason to collect anything.
 */
export default function Stamp({ code, locked = false, size = 44, name }: Props) {
  return (
    <View
      accessible
      accessibilityLabel={locked ? `${name ?? code} — не собрано` : (name ?? code)}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius.full },
        locked ? styles.locked : styles.got
      ]}
    >
      <DataSmall tone={locked ? 'dim' : 'accent'} allowFontScaling={false} style={styles.code}>
        {code}
      </DataSmall>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: line.hair },
  got: { borderColor: palette.amberDim, backgroundColor: palette.warm },
  locked: { borderColor: palette.rule, borderStyle: 'dashed' },
  code: { fontSize: 13, lineHeight: 16 }
});
