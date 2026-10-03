import { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, Pressable, type LayoutChangeEvent } from 'react-native';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, DataSmall } from '../design/type';
import { t } from '../../src/i18n';
import { clock } from '../format';

export interface ScrubMark {
  at: number;
  side?: 'left' | 'right' | 'below';
  /** 0–1; only the notable ones are drawn. */
  weight: number;
}

interface Props {
  /** Seconds of the whole flight. */
  end: number;
  /** Where the aircraft is now. */
  live: number;
  /** The moment being looked at, or null while following the aircraft. */
  value: number | null;
  marks: ScrubMark[];
  onChange: (seconds: number | null) => void;
}

/**
 * Drag along the flight to see any moment of it: where the aircraft will be,
 * what each window will show, and when. The track shows the flown part in
 * amber and the notable sights as ticks — above the line for the left window,
 * below it for the right — so the shape of the flight reads at a glance.
 */
export default function RouteScrubber({ end, live, value, marks, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const grantX = useRef(0);
  const at = value ?? live;
  const toSeconds = (x: number) => Math.max(0, Math.min(1, x / Math.max(1, width))) * end;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A vertical scroll around it must not steal a drag already started.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          grantX.current = e.nativeEvent.locationX;
          onChange(toSeconds(grantX.current));
        },
        onPanResponderMove: (_e, g) => onChange(toSeconds(grantX.current + g.dx))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, end, onChange]
  );

  const pct = (sec: number) => `${Math.max(0, Math.min(100, (sec / Math.max(1, end)) * 100))}%` as const;
  const ahead = value != null ? value - live : 0;
  const step = 5 * 60;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Label tone={value != null ? 'accent' : 'dim'} numberOfLines={1} style={styles.flex}>
          {value != null
            ? Math.abs(ahead) < 60
              ? t('scrub.atNow')
              : ahead > 0
                ? t('scrub.ahead', { d: clock(ahead) })
                : t('scrub.behind', { d: clock(-ahead) })
            : t('scrub.hint')}
        </Label>
        {value != null ? (
          <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={t('scrub.live')} hitSlop={s.x2} style={styles.live}>
            <Label tone="accent">{t('scrub.live')}</Label>
          </Pressable>
        ) : (
          <DataSmall allowFontScaling={false}>{`${clock(live)} / ${clock(end)}`}</DataSmall>
        )}
      </View>
      <View
        style={styles.track}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('scrub.a11y')}
        accessibilityValue={{ text: `${clock(at)} / ${clock(end)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = at + (e.nativeEvent.actionName === 'increment' ? step : -step);
          onChange(Math.max(0, Math.min(end, next)));
        }}
      >
        <View pointerEvents="none" style={styles.rail} />
        <View pointerEvents="none" style={[styles.flown, { width: pct(live) }]} />
        {marks
          .filter((m) => m.weight >= 0.45)
          .map((m, i) => (
            <View
              key={`${m.at}-${i}`}
              pointerEvents="none"
              style={[
                styles.tick,
                { left: pct(m.at) },
                m.side === 'left' ? styles.tickLeft : m.side === 'right' ? styles.tickRight : styles.tickBelow
              ]}
            />
          ))}
        <View pointerEvents="none" style={[styles.thumb, { left: pct(at) }, value != null && styles.thumbOn]} />
      </View>
    </View>
  );
}

const TRACK = 36;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: gutter, paddingTop: s.x2, paddingBottom: s.x1, backgroundColor: palette.ground, borderTopWidth: line.hair, borderTopColor: palette.rule },
  head: { flexDirection: 'row', alignItems: 'center', gap: s.x3, minHeight: 24 },
  flex: { flex: 1 },
  live: { paddingHorizontal: s.x3, paddingVertical: s.x1, borderWidth: line.hair, borderColor: palette.amberDim, borderRadius: 12 },
  track: { height: TRACK, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, top: TRACK / 2 - 1, height: 2, backgroundColor: palette.rule },
  flown: { position: 'absolute', left: 0, top: TRACK / 2 - 1, height: 2, backgroundColor: palette.amber },
  tick: { position: 'absolute', width: 2, height: 8, marginLeft: -1, borderRadius: 1 },
  tickLeft: { top: TRACK / 2 - 10, backgroundColor: palette.inkMuted },
  tickRight: { top: TRACK / 2 + 2, backgroundColor: palette.inkMuted },
  tickBelow: { top: TRACK / 2 - 4, height: 8, backgroundColor: palette.inkDim },
  thumb: {
    position: 'absolute',
    top: TRACK / 2 - 8,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: palette.ground,
    borderWidth: 2,
    borderColor: palette.amberDim
  },
  thumbOn: { borderColor: palette.amber, backgroundColor: palette.amber }
});
