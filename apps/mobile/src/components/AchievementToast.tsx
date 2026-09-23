import { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Dimensions } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { create } from 'zustand';
import { colors } from '../theme/colors';
import { haptics } from '../core/ux/haptics';

interface AchUnlock {
  id: string;
  name: string;
  icon: string;
  description: string;
  isMilestone?: boolean;
}

interface AchToastState {
  current: AchUnlock | null;
  show: (a: AchUnlock) => void;
  hide: () => void;
}

export const useAchievementToast = create<AchToastState>((set) => ({
  current: null,
  show: (a) => {
    set({ current: a });
    haptics.success();
    setTimeout(() => set({ current: null }), 4500);
  },
  hide: () => set({ current: null }),
}));

const { width: W } = Dimensions.get('window');

export default function AchievementToast() {
  const { current } = useAchievementToast();
  const scale = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiCannon>(null);

  useEffect(() => {
    if (current) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
      if (current.isMilestone) {
        confettiRef.current?.start();
      }
    } else {
      Animated.timing(scale, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [current]);

  if (!current) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {current.isMilestone && (
        <ConfettiCannon
          ref={confettiRef}
          count={120}
          origin={{ x: W / 2, y: 0 }}
          autoStart={true}
          fadeOut
          explosionSpeed={400}
          fallSpeed={2500}
          colors={[colors.primary, colors.accent, '#FF6B6B', '#9B51E0', '#34C759']}
        />
      )}
      <Animated.View style={[styles.toast, { transform: [{ scale }] }]}>
        <Text style={styles.unlockedLabel}>ACHIEVEMENT UNLOCKED</Text>
        <Text style={styles.icon}>{current.icon}</Text>
        <Text style={styles.name}>{current.name}</Text>
        <Text style={styles.desc}>{current.description}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 120,
    left: 24,
    right: 24,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  unlockedLabel: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  icon: { fontSize: 56, marginVertical: 4 },
  name: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  desc: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
