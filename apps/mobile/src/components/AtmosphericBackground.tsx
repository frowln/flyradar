import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

interface Props {
  variant?: 'sky' | 'sunset' | 'aurora' | 'space';
  children?: React.ReactNode;
  style?: object;
}

const VARIANTS = {
  sky: ['#0E1530', '#0A0B14', '#0A0B14'] as const,
  sunset: ['#2D1B3D', '#1A1E3E', '#0A0B14'] as const,
  aurora: ['#0E2A3D', '#1B1B3D', '#0A0B14'] as const,
  space: ['#000208', '#0A0B14', '#0A0B14'] as const
};

export default function AtmosphericBackground({ variant = 'sky', children, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={VARIANTS[variant]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
      />
      <View style={styles.glow} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  glow: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.glow,
    opacity: 0.6
  }
});
