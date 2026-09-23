import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  type: 'success' | 'error' | 'info';
  show: (message: string, type?: 'success' | 'error' | 'info') => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  type: 'info',
  show: (message, type = 'info') => {
    set({ message, type });
    setTimeout(() => set({ message: null }), 3000);
  },
  hide: () => set({ message: null }),
}));

export default function Toast() {
  const { message, type } = useToast();
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: message ? 56 : -100,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [message]);

  if (!message) return null;

  const bg = type === 'success' ? colors.success : type === 'error' ? colors.error : colors.primary;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }], backgroundColor: bg }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,

    zIndex: 9999,
  },
  icon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  message: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
});
