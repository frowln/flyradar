import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { space, gutter, hairline } from '../theme/tokens';
import TelemetryRow, { type Reading } from './TelemetryRow';

interface Props {
  /** Sequential number in the user's collection. Formatted by the caller. */
  plateNumber?: string;
  /** Category caps label — MOUNTAIN RANGE, LAKE, CITY. */
  category: string;
  title: string;
  /** Coordinates and country, mono. */
  subtitle?: string;
  /** Up to three readings: peak, distance below, length. */
  spec?: Reading[];
  /** 50–70 words. Longer and nobody finishes it mid-flight. */
  body: string;
  /** Full-bleed image slot. */
  hero?: React.ReactNode;
  /** Quiz block, achievement, or anything that follows the text. */
  footer?: React.ReactNode;
}

/**
 * A discovered place, presented as a numbered plate rather than a list row.
 *
 * The number is the whole point: an achievement badge is forgotten, a plate with
 * a number is something you own and can be missing one of. It is the cheapest
 * mechanism in the product for making a collection feel like a collection.
 */
export default function PlateCard({
  plateNumber,
  category,
  title,
  subtitle,
  spec,
  body,
  hero,
  footer
}: Props) {
  return (
    <View style={styles.card}>
      {hero ? (
        <View style={styles.hero}>
          {hero}
          <View style={styles.badge}>
            <Text style={[typography.label, styles.badgeText]} numberOfLines={1}>
              {plateNumber ? `${plateNumber} · ${category}` : category}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.body}>
        {!hero ? (
          <Text style={[typography.label, styles.badgeText]} numberOfLines={1}>
            {plateNumber ? `${plateNumber} · ${category}` : category}
          </Text>
        ) : null}

        <Text style={typography.displayM} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.dataSmall, styles.subtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        {spec?.length ? (
          <View style={styles.spec}>
            <TelemetryRow readings={spec} />
          </View>
        ) : null}

        <Text style={[typography.body, styles.text]}>{body}</Text>
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    flex: 1
  },
  hero: {
    height: 186,
    backgroundColor: colors.surfaceTinted,
    overflow: 'hidden'
  },
  badge: {
    position: 'absolute',
    top: space.md,
    left: space.lg,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: hairline,
    borderColor: colors.accentDim,
    backgroundColor: colors.bg
  },
  badgeText: {
    color: colors.accent
  },
  body: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    gap: space.md
  },
  subtitle: {
    marginTop: -space.sm
  },
  spec: {
    marginTop: space.xs
  },
  text: {
    color: colors.textMuted
  },
  footer: {
    marginTop: 'auto',
    borderTopWidth: hairline,
    borderTopColor: colors.line,
    paddingHorizontal: gutter,
    paddingVertical: space.lg
  }
});
