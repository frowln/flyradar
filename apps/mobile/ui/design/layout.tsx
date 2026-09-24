import {
  View,
  Pressable,
  StyleSheet,
  type ViewProps,
  type ViewStyle,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, s, gutter, line } from './tokens';
import { Label, Data } from './type';

/**
 * Layout primitives.
 *
 * Screens are composed from these rather than from ad-hoc Views, which is what
 * keeps gutters, rules and rhythm identical across surfaces that were built
 * weeks apart.
 */

/**
 * Every screen sits inside the safe area by default.
 *
 * This is baked into the primitive rather than left to each screen: the very
 * first screen built without it put a mono label underneath the status-bar
 * clock, and that is a mistake worth making structurally impossible.
 *
 * Screens that deliberately run edge-to-edge — the map at cruise — opt out with
 * `edges={[]}` and handle their own insets.
 */
export function Screen({
  style,
  edges = ['top'],
  ...rest
}: ViewProps & { edges?: ('top' | 'bottom')[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...rest}
      style={[
        styles.screen,
        edges.includes('top') && { paddingTop: insets.top },
        edges.includes('bottom') && { paddingBottom: insets.bottom },
        style
      ]}
    />
  );
}

/** Full-bleed horizontal rule. The main tool for dividing anything. */
export function Rule({ soft = false, inset = false }: { soft?: boolean; inset?: boolean }) {
  return (
    <View
      style={[
        styles.rule,
        { backgroundColor: soft ? palette.ruleSoft : palette.rule },
        inset && { marginHorizontal: gutter }
      ]}
    />
  );
}

/** Standard horizontal padding. Nothing sets paddingHorizontal by hand. */
export function Gutter({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.gutter, style]} />;
}

export function Row({ gap = s.x3, style, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[styles.row, { gap }, style]} />;
}

export function Col({ gap = s.x2, style, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[{ gap }, style]} />;
}

/** Vertical whitespace from the scale. */
export function Space({ h }: { h: number }) {
  return <View style={{ height: h }} />;
}

export interface CellItem {
  value: string;
  label: string;
  tone?: 'default' | 'accent';
}

/**
 * A row of readings divided by hairlines — the app's workhorse for showing
 * three related numbers without ranking them.
 */
export function Cells({ items, bordered = true }: { items: CellItem[]; bordered?: boolean }) {
  return (
    <View style={[styles.cells, bordered && styles.cellsBordered]}>
      {items.map((item, i) => (
        <View
          key={item.label}
          style={[styles.cell, i < items.length - 1 && styles.cellDivider]}
          accessible
          accessibilityLabel={`${item.label}: ${item.value}`}
        >
          <Data tone={item.tone === 'accent' ? 'accent' : 'default'} allowFontScaling={false}>
            {item.value}
          </Data>
          <View style={styles.cellLabel}>
            <Label numberOfLines={1}>{item.label}</Label>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * The single primary action, pinned to the bottom edge.
 *
 * A bar rather than a floating button: at this size the target is unmissable
 * one-handed, and it does not hover over content the way a circle does.
 */
export function ActionBar({
  label,
  onPress,
  tone = 'accent',
  accessibilityLabel
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'quiet';
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.actionBar, pressed && styles.actionBarPressed]}
    >
      <Label tone={tone === 'accent' ? 'accent' : 'muted'}>{label}</Label>
    </Pressable>
  );
}

/** A large tappable region with pressure feedback instead of a highlight. */
export function PressSurface({
  onPress,
  children,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  accessibilityRole = 'button',
  disabled
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  accessibilityRole?: AccessibilityRole;
  disabled?: boolean;
}) {
  // Feedback comes from Pressable's own pressed state rather than an Animated
  // wrapper. Two earlier attempts failed for the same reason: any wrapper splits
  // layout from content, so `position: absolute` landed back in the flow and row
  // styles stopped reaching their children. One element, one style, no split.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.ground },
  rule: { height: line.hair },
  gutter: { paddingHorizontal: gutter },
  row: { flexDirection: 'row', alignItems: 'center' },

  cells: { flexDirection: 'row' },
  cellsBordered: {
    borderTopWidth: line.hair,
    borderBottomWidth: line.hair,
    borderColor: palette.rule
  },
  cell: { flex: 1, alignItems: 'center', paddingVertical: s.x3 },
  cellDivider: { borderRightWidth: line.hair, borderRightColor: palette.rule },
  cellLabel: { marginTop: s.x1 },

  actionBar: {
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    backgroundColor: palette.raised,
    alignItems: 'center',
    paddingTop: s.x4,
    paddingBottom: s.x8
  },
  actionBarPressed: { backgroundColor: palette.lifted },
  pressed: { backgroundColor: palette.raised }
});
