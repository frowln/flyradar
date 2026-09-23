import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, AccessibilityInfo, Platform } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { space, motion } from '../theme/tokens';

interface Props {
  /** 0 at the start of whatever is being measured, 1 at the end. Clamped. */
  progress: number;
  /** Headline reading in the middle of the dial. */
  reading: string;
  /** Small caps line under the reading. */
  caption?: string;
  size?: number;
  accessibilityLabel?: string;
}

const STROKE = 2;
const TICK_STEP_DEG = 15;

function pointOnArc(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The product's one instrument, used in three places: counting down to
 * departure, showing progress in the air, and closing out the flight on
 * arrival. Same dial, three meanings — which is why it is worth animating
 * properly rather than redrawing on every tick.
 *
 * The needle is a plain View rotated on the native driver, so it stays smooth
 * while JS is busy recomputing position; only the arc fill crosses the bridge.
 */
export default function Gauge({ progress, reading, caption, size = 250, accessibilityLabel }: Props) {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));

  const w = size;
  const r = size * 0.4;
  const cx = w / 2;
  const cy = r + STROKE * 4;
  const h = cy + STROKE * 4;

  const left = pointOnArc(cx, cy, r, 180);
  const right = pointOnArc(cx, cy, r, 360);
  const arc = `M ${left.x} ${left.y} A ${r} ${r} 0 0 1 ${right.x} ${right.y}`;
  const arcLength = Math.PI * r;

  const anim = useRef(new Animated.Value(p)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion.current) {
      anim.setValue(p);
      return;
    }
    Animated.timing(anim, {
      toValue: p,
      duration: motion.reveal,
      easing: Easing.bezier(...motion.easing),
      // strokeDashoffset and rotation are driven from the same value; SVG props
      // cannot go through the native driver, so this one stays on the JS thread.
      useNativeDriver: false
    }).start();
  }, [p, anim]);

  const dashOffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [arcLength, 0]
  });

  const rotation = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg']
  });

  const ticks = [];
  for (let deg = 180; deg <= 360; deg += TICK_STEP_DEG) {
    const major = (deg - 180) % 45 === 0;
    const inner = pointOnArc(cx, cy, r - (major ? 14 : 8), deg);
    const outer = pointOnArc(cx, cy, r, deg);
    ticks.push(
      <Line
        key={deg}
        x1={inner.x}
        y1={inner.y}
        x2={outer.x}
        y2={outer.y}
        stroke={major ? colors.textDim : colors.line}
        strokeWidth={1}
      />
    );
  }

  return (
    <View
      style={[styles.wrap, { width: w, height: h }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? reading}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
    >
      <Svg width={w} height={h}>
        <Path d={arc} stroke={colors.line} strokeWidth={1} fill="none" />
        <AnimatedPath
          d={arc}
          stroke={colors.accent}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${arcLength}`}
          strokeDashoffset={dashOffset as unknown as number}
        />
        {ticks}
        <Circle cx={cx} cy={cy} r={3} fill={colors.accent} />
      </Svg>

      {/* Needle: rotated about the hub so it can ride the native driver. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.needle,
          {
            left: cx,
            top: cy - 1,
            width: r,
            transform: [{ rotate: rotation }],
            ...(Platform.OS === 'web' ? {} : null)
          }
        ]}
      >
        <View style={styles.needleLine} />
        <View style={styles.needleTip} />
      </Animated.View>

      <View style={[styles.readout, { top: cy - r * 0.42 }]} pointerEvents="none">
        <Text style={typography.dataLarge} allowFontScaling={false}>
          {reading}
        </Text>
        {caption ? <Text style={[typography.label, styles.caption]}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  needle: {
    position: 'absolute',
    height: 2,
    flexDirection: 'row',
    alignItems: 'center',
    transformOrigin: 'left center'
  },
  needleLine: {
    flex: 1,
    height: 1.6,
    backgroundColor: colors.accent,
    borderRadius: 1
  },
  needleTip: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.6,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    marginLeft: -4
  },
  readout: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center'
  },
  caption: {
    marginTop: space.sm
  }
});
