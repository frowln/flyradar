import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { palette, radius, line } from '../design/tokens';
import { DataSmall, Label } from '../design/type';
import { decorative } from '../design/layout';
import { useReducedMotion } from '../motion';
import { t } from '../../src/i18n';

interface Props {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Spoken name; two letters are not readable aloud. */
  name?: string;
  /** Overflown: outlined in brass. Landed: filled. Locked: dashed, not yet collected. */
  kind?: 'overflown' | 'landed' | 'locked';
  /** Marked as new on this flight. */
  fresh?: boolean;
  size?: number;
  /** Stamp in with a thud after this many ms. Omit for no animation. */
  stampDelay?: number;
}

/**
 * A country mark, shaped like a passport stamp.
 *
 * Countries flown over are outlined; countries landed in are filled. Locked
 * stamps stay on the grid on purpose: an atlas with visible gaps is what makes
 * someone want to fill it. To a screen reader a locked stamp is only a gap, so
 * it says nothing.
 */
export default function Stamp({ code, name, kind = 'overflown', fresh, size = 52, stampDelay }: Props) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(stampDelay == null || reduced ? 1 : 0)).current;

  useEffect(() => {
    // Reduce Motion can arrive after the first render, mid-delay: land the
    // stamp rather than leave it at opacity 0.
    if (stampDelay == null || reduced) {
      v.setValue(1);
      return;
    }
    const a = Animated.sequence([
      Animated.delay(stampDelay),
      Animated.spring(v, { toValue: 1, useNativeDriver: true, tension: 220, friction: 9 })
    ]);
    a.start();
    return () => a.stop();
  }, [v, stampDelay, reduced]);

  const style = kind === 'landed' ? styles.landed : kind === 'locked' ? styles.locked : styles.overflown;
  const tone = kind === 'landed' ? 'default' : kind === 'locked' ? 'dim' : 'brass';

  return (
    <Animated.View
      {...(kind === 'locked' ? decorative : { accessible: true, accessibilityLabel: stampLabel(name ?? code, kind, fresh) })}
      style={{
        opacity: v,
        transform: [
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', `${((code.charCodeAt(0) % 7) - 3) * 1.5}deg`] }) }
        ]
      }}
    >
      <View style={[styles.base, { width: size, height: size, borderRadius: radius.full }, style]}>
        <View style={[styles.inner, { borderRadius: radius.full }, kind === 'landed' && styles.innerLanded]}>
          <DataSmall tone={tone} allowFontScaling={false} style={styles.code}>
            {code}
          </DataSmall>
        </View>
      </View>
      {fresh ? (
        <View style={styles.fresh}>
          <Label tone="accent" style={styles.freshText}>
            ●
          </Label>
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * "Turkey, landed in, new" — what a stamp says aloud. Exported for layouts that
 * print the country name under the stamp and speak the pair as one.
 */
export function stampLabel(country: string, kind: Props['kind'] = 'overflown', fresh?: boolean): string {
  const base = t(kind === 'landed' ? 'a11y.stampLanded' : 'a11y.stampOverflown', { country });
  return fresh ? `${base}, ${t('a11y.stampNew')}` : base;
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: line.bold, padding: 3 },
  inner: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderWidth: line.hair, borderColor: 'transparent' },
  innerLanded: { borderColor: palette.ground },
  overflown: { borderColor: palette.brass, backgroundColor: palette.warm },
  landed: { borderColor: palette.brass, backgroundColor: palette.brass },
  locked: { borderColor: palette.rule, borderStyle: 'dashed', borderWidth: line.hair },
  code: { fontSize: 14, lineHeight: 17, letterSpacing: 0.5 },
  fresh: { position: 'absolute', top: -2, right: -2 },
  freshText: { fontSize: 12, lineHeight: 12 }
});
