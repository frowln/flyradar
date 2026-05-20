import { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

interface FlightInfo {
  origin: { iata: string; city: string };
  destination: { iata: string; city: string };
}

interface Props {
  flight: FlightInfo;
  distanceKm: number;
  poisDiscovered: number;
}

// Renders a hidden 1080x1920 view for screenshot export — mount off-screen
const InstagramStoryCard = forwardRef<View, Props>(({ flight, distanceKm, poisDiscovered }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.container}>
      <LinearGradient
        colors={['#0A0B14', '#1A2E5E', '#0A0B14']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {/* Brand */}
      <Text style={styles.brand}>SkyAtlas</Text>

      {/* Route */}
      <View style={styles.route}>
        <Text style={styles.iata}>{flight.origin.iata}</Text>
        <Text style={styles.arrow}>──────✈──────</Text>
        <Text style={styles.iata}>{flight.destination.iata}</Text>
      </View>

      {/* Cities */}
      <Text style={styles.cities}>
        {flight.origin.city}{'  →  '}{flight.destination.city}
      </Text>

      {/* Stats */}
      <View style={styles.stats}>
        <StatItem number={distanceKm.toLocaleString()} label="KILOMETERS" />
        <StatItem number={String(poisDiscovered)} label="DISCOVERIES" />
      </View>

      {/* Footer */}
      <Text style={styles.footer}>Made with SkyAtlas — your atlas of the world</Text>
    </View>
  );
});

InstagramStoryCard.displayName = 'InstagramStoryCard';

function StatItem({ number, label }: { number: string; label: string }) {
  return (
    <View style={statStyles.item}>
      <Text style={statStyles.number}>{number}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1920,
    backgroundColor: colors.bg,
    padding: 80,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40
  },
  brand: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    color: colors.primary,
    fontFamily: fonts.displayBold,
    fontSize: 36,
    letterSpacing: 2
  },
  route: { flexDirection: 'row', alignItems: 'center', gap: 30, marginTop: 100 },
  iata: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 200,
    letterSpacing: -4
  },
  arrow: { color: colors.accent, fontSize: 40 },
  cities: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 38
  },
  stats: { flexDirection: 'row', gap: 80, marginTop: 80 },
  footer: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 28
  }
});

const statStyles = StyleSheet.create({
  item: { alignItems: 'center', gap: 12 },
  number: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 120,
    letterSpacing: -2
  },
  label: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    letterSpacing: 3
  }
});

export default InstagramStoryCard;
