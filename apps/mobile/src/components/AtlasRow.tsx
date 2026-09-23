import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { space, hairline } from '../theme/tokens';

interface Props {
  /** Plate number, zero-padded by the caller: "047". */
  number: string;
  name: string;
  /** Right-hand value — collection date, or a marker like "СЕЙЧАС". */
  meta?: string;
  /** Not yet discovered: dimmed, but still listed so the gap is visible. */
  locked?: boolean;
  /** The place currently under the aircraft. */
  current?: boolean;
  onPress?: () => void;
}

/**
 * One line of the collection index — plate number, name, leader dots, date.
 *
 * The dotted leader is doing real work here: it ties a short name to a distant
 * date across a wide row, which is exactly the problem printed indexes solved
 * long before screens existed.
 */
export default function AtlasRow({
  number,
  name,
  meta,
  locked = false,
  current = false,
  onPress
}: Props) {
  const tone = current ? colors.accent : locked ? colors.textDim : colors.text;

  const content = (
    <View style={styles.row}>
      <Text
        style={[typography.dataSmall, styles.number, { color: current ? colors.accent : locked ? colors.textDim : colors.accentDim }]}
        allowFontScaling={false}
      >
        {number}
      </Text>
      <Text style={[typography.body, styles.name, { color: tone }]} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.leader} />
      {meta ? (
        <Text
          style={[typography.dataSmall, { color: current ? colors.accent : colors.textDim }]}
          allowFontScaling={false}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress || locked) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Лист ${number}, ${name}${meta ? `, ${meta}` : ''}`}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.lineSoft
  },
  pressed: {
    backgroundColor: colors.surface
  },
  number: {
    width: 34
  },
  name: {
    flexShrink: 1
  },
  leader: {
    flex: 1,
    minWidth: space.lg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.line,
    borderStyle: 'dotted',
    marginBottom: 3
  }
});
