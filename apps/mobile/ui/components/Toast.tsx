import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { palette, s, gutter, line } from '../design/tokens';
import { Body } from '../design/type';

/** A single line of feedback at the top edge. Quiet, brief, never stacked. */

interface ToastState {
  message: string | null;
  tone: 'info' | 'good' | 'bad';
  show: (message: string, tone?: 'info' | 'good' | 'bad') => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  show: (message, tone = 'info') => {
    if (timer) clearTimeout(timer);
    set({ message, tone });
    timer = setTimeout(() => set({ message: null }), 3200);
  }
}));

export default function Toast() {
  const { message, tone } = useToast();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.spring(y, { toValue: message ? 0 : -120, useNativeDriver: true, tension: 90, friction: 14 }).start();
  }, [message, y]);

  if (!message) return null;
  const edge = tone === 'good' ? palette.good : tone === 'bad' ? palette.bad : palette.amber;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.bar, { top: insets.top + s.x2, borderLeftColor: edge, transform: [{ translateY: y }] }]}
    >
      <Body>{message}</Body>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: gutter,
    right: gutter,
    paddingHorizontal: s.x4,
    paddingVertical: s.x3,
    backgroundColor: palette.lifted,
    borderWidth: line.hair,
    borderColor: palette.rule,
    borderLeftWidth: 3
  }
});
