import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { space, radius, hairline, gutter } from '../theme/tokens';

interface Props {
  /** Caps line — what is about to happen, e.g. "ЧЕРЕЗ 4 МИН · ПО ЛЕВОМУ БОРТУ". */
  eyebrow: string;
  /** The place itself. */
  title: string;
  onPress?: () => void;
  /** Square thumbnail slot; a tinted placeholder shows while the photo loads. */
  thumbnail?: React.ReactNode;
}

/**
 * The bottom hint rail on the in-flight screen: what is coming, when, and on
 * which side of the aircraft.
 *
 * The side matters more than it looks — it is the one piece of information a
 * passenger can act on immediately, by turning their head.
 */
export default function Rail({ eyebrow, title, onPress, thumbnail }: Props) {
  const body = (
    <View style={styles.rail}>
      <View style={styles.thumb}>{thumbnail}</View>
      <View style={styles.text}>
        <Text style={[typography.label, styles.eyebrow]} numberOfLines={1}>
          {eyebrow}
        </Text>
        <Text style={typography.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {onPress ? (
        <Text style={[typography.data, styles.chevron]} allowFontScaling={false}>
          ›
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${eyebrow}`}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: gutter,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.line,
    backgroundColor: colors.surface
  },
  pressed: {
    backgroundColor: colors.surfaceHigh
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.none,
    backgroundColor: colors.surfaceTinted,
    borderWidth: hairline,
    borderColor: colors.line,
    overflow: 'hidden'
  },
  text: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    color: colors.accent,
    marginBottom: space.xs
  },
  chevron: {
    color: colors.textDim
  }
});
