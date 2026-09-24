import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, AccessibilityInfo } from 'react-native';
import { motion } from '../design/tokens';

/**
 * Motion in this app is quiet on purpose. Things resolve, settle and hold — the
 * interface is read at altitude by someone who did not ask to be entertained.
 *
 * Two rules hold everywhere:
 *   · No content depends on an animation. Every view is complete at rest.
 *   · Reduce Motion is honoured by jumping to the end state, never by half-speed.
 */

/**
 * The last answer the system gave. The query is async, so without this every
 * screen would animate its first frame before learning motion is off; with it,
 * only the very first screen of a session can.
 */
let lastKnown = false;

/** The one place the app asks about Reduce Motion. Every animation goes through it. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(lastKnown);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      lastKnown = on;
      if (alive) setReduced(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      lastKnown = on;
      setReduced(on);
    });
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  return reduced;
}

/**
 * Entrance: fade with a short lift. Starts at rest-visible when motion is
 * reduced, so nothing is ever stuck at opacity 0.
 */
export function useReveal(delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: motion.move,
      delay,
      easing: Easing.bezier(...motion.ease),
      useNativeDriver: true
    });
    anim.start();
    return () => anim.stop();
  }, [v, delay, reduced]);

  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }]
  };
}

/**
 * Press feedback for large surfaces: a scale so slight it reads as pressure
 * rather than movement. Small controls use a background change instead.
 */
export function usePressScale(to = 0.985) {
  const v = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  const spring = (toValue: number) =>
    Animated.spring(v, { toValue, useNativeDriver: true, tension: 320, friction: 22 }).start();

  return {
    style: { transform: [{ scale: v }] },
    onPressIn: () => !reduced && spring(to),
    onPressOut: () => !reduced && spring(1)
  };
}

/**
 * Animates a number toward a target and reports it as a formatted string.
 *
 * Used for readouts that jump when fresh data lands — a countdown that snaps
 * from 6:40 to 6:12 looks broken; one that runs there looks like an instrument.
 */
export function useCountUp(target: number, format: (n: number) => string): string {
  const v = useRef(new Animated.Value(target)).current;
  const [text, setText] = useState(() => format(target));
  const reduced = useReducedMotion();

  useEffect(() => {
    const id = v.addListener(({ value }) => setText(format(value)));
    return () => v.removeListener(id);
  }, [v, format]);

  useEffect(() => {
    if (reduced) {
      v.setValue(target);
      setText(format(target));
      return;
    }
    const anim = Animated.timing(v, {
      toValue: target,
      duration: motion.count,
      easing: Easing.bezier(...motion.ease),
      useNativeDriver: false
    });
    anim.start();
    return () => anim.stop();
  }, [target, v, reduced, format]);

  return text;
}
