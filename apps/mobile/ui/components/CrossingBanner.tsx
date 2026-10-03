import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Pressable, AccessibilityInfo } from 'react-native';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Title, Small, Data } from '../design/type';
import { t, getLocale } from '../../src/i18n';
import { countryName, flagOf } from '../../src/core/places/names';
import { useReducedMotion } from '../motion';

export interface Crossing {
  cc: string;
  /** Clock on the ground below, "15:40". */
  time?: string;
  /** Minutes the clocks below moved by at this border, if they did. */
  shiftMin?: number;
  /** Only the clocks moved; the country is the same. */
  zoneOnly?: boolean;
}

function shiftText(min: number): string {
  const sign = min > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return m ? `${sign}${h}:${String(m).padStart(2, '0')}` : `${sign}${h}`;
}

/**
 * A border crossed: the moment a seat-back map never marks. The new country's
 * flag and name, the time down there, and how far the clocks just moved.
 */
export default function CrossingBanner({ crossing, onClose }: { crossing: Crossing; onClose: () => void }) {
  const locale = getLocale();
  const reduced = useReducedMotion();
  const appear = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const name = countryName(crossing.cc, locale);
  const title = crossing.zoneOnly ? t('crossing.zoneTitle') : t('crossing.title', { country: name });

  useEffect(() => {
    if (!reduced) Animated.timing(appear, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility(title);
  }, [appear, reduced, title]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }
      ]}
      testID="crossing-banner"
    >
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={`${title}. ${t('common.close')}`} style={styles.row}>
        {flagOf(crossing.cc) ? <Data allowFontScaling={false} style={styles.flag}>{flagOf(crossing.cc)}</Data> : null}
        <View style={styles.text}>
          <Label tone="brass">{t('crossing.label')}</Label>
          <Title numberOfLines={2}>{title}</Title>
          <Small>
            {[
              crossing.time ? t('crossing.timeBelow', { time: crossing.time }) : null,
              crossing.shiftMin ? t('crossing.shift', { d: shiftText(crossing.shiftMin) }) : null,
              crossing.zoneOnly ? null : t('crossing.stamp')
            ]
              .filter(Boolean)
              .join(' · ')}
          </Small>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: palette.warm, borderBottomWidth: line.hair, borderBottomColor: palette.brass },
  row: { flexDirection: 'row', alignItems: 'center', gap: s.x3, paddingHorizontal: gutter, paddingVertical: s.x3 },
  flag: { fontSize: 30, lineHeight: 36 },
  text: { flex: 1, gap: 2 }
});
