import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { palette, s, motion } from '../design/tokens';
import { Label, Readout } from '../design/type';
import { useReducedMotion } from '../motion';

interface Props {
  /** 0 at the start of what is being measured, 1 at the end. Clamped. */
  progress: number;
  /** The one number this dial exists to show. */
  reading: string;
  caption?: string;
  size?: number;
  accessibilityLabel?: string;
}

const ARC_WIDTH = 2;
const TICK_EVERY = 15;

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The one instrument in the product, used in three places: counting down to
 * departure, tracking progress at cruise, and closing the flight on arrival.
 * The same dial meaning three things is what ties those moments into one
 * object rather than three screens.
 *
 * The arc sweeps 180°→360° — left to right over the top — because that is the
 * direction a passenger already reads a route on a map.
 */
export default function Dial({ progress, reading, caption, size = 260, accessibilityLabel }: Props) {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));

  const r = size * 0.4;
  const cx = size / 2;
  const cy = r + ARC_WIDTH * 5;
  const height = cy + ARC_WIDTH * 5;

  const a = polar(cx, cy, r, 180);
  const b = polar(cx, cy, r, 360);
  const arc = `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
  const arcLength = Math.PI * r;

  const anim = useRef(new Animated.Value(p)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      anim.setValue(p);
      return;
    }
    const t = Animated.timing(anim, {
      toValue: p,
      duration: motion.reveal,
      easing: Easing.bezier(...motion.ease),
      // SVG props and rotation share one driver value; SVG cannot use the
      // native driver, so this stays on the JS thread.
      useNativeDriver: false
    });
    t.start();
    return () => t.stop();
  }, [p, anim, reduced]);

  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [arcLength, 0] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const ticks = [];
  for (let deg = 180; deg <= 360; deg += TICK_EVERY) {
    const major = (deg - 180) % 45 === 0;
    const from = polar(cx, cy, r - (major ? 13 : 7), deg);
    const to = polar(cx, cy, r, deg);
    ticks.push(
      <Line
        key={deg}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={major ? palette.inkDim : palette.rule}
        strokeWidth={1}
      />
    );
  }

  return (
    <View
      style={[styles.wrap, { width: size, height }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? reading}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
    >
      <Svg width={size} height={height}>
        <Path d={arc} stroke={palette.rule} strokeWidth={1} fill="none" />
        <AnimatedPath
          d={arc}
          stroke={palette.amber}
          strokeWidth={ARC_WIDTH}
          fill="none"
          strokeDasharray={`${arcLength}`}
          strokeDashoffset={dashOffset as unknown as number}
        />
        {ticks}
        <Circle cx={cx} cy={cy} r={2.5} fill={palette.amber} />
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={[styles.needle, { left: cx, top: cy - 1, width: r, transform: [{ rotate }] }]}
      >
        <View style={styles.needleShaft} />
        <View style={styles.needleTip} />
      </Animated.View>

      <View style={[styles.readout, { top: cy - r * 0.44 }]} pointerEvents="none">
        <Readout allowFontScaling={false}>{reading}</Readout>
        {caption ? (
          <View style={styles.caption}>
            <Label>{caption}</Label>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  needle: {
    position: 'absolute',
    height: 2,
    flexDirection: 'row',
    alignItems: 'center',
    transformOrigin: 'left center'
  },
  needleShaft: { flex: 1, height: 1.5, backgroundColor: palette.amber },
  needleTip: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: palette.amber,
    backgroundColor: palette.ground,
    marginLeft: -4
  },
  readout: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  caption: { marginTop: s.x2 }
});
