import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { colors } from '../theme/colors';
import { t } from '../i18n';

export default function NetworkBanner() {
  const [offline, setOffline] = useState(false);
  const translateY = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOffline = !state.isConnected;
      setOffline(isOffline);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: offline ? 0 : -50,
      useNativeDriver: true,
      tension: 80,
      friction: 12
    }).start();
  }, [offline]);

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]} pointerEvents="none">
      <Text style={styles.text}>{t('common.offlineMode') || '✈️ Offline mode — your flight data still works'}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: colors.accent, paddingTop: 50, paddingBottom: 8,
    paddingHorizontal: 16,
    zIndex: 10000
  },
  text: { color: '#0A0E1A', fontSize: 13, fontWeight: '700', textAlign: 'center' }
});
