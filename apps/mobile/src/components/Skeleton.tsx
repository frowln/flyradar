import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle, View } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as any, height, borderRadius, opacity },
        style
      ]}
    />
  );
}

export function FlightCardSkeleton() {
  return (
    <View style={skeletonCardStyles.card}>
      <Skeleton width={80} height={16} />
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <Skeleton width={50} height={32} />
        <Skeleton width={20} height={32} style={{ alignSelf: 'center' }} />
        <Skeleton width={50} height={32} />
      </View>
      <Skeleton width="60%" height={12} style={{ marginTop: 6 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceElevated }
});

const skeletonCardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4
  }
});
