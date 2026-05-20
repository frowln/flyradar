import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Share,
  Animated
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Speech from 'expo-speech';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { loadPackage } from '../core/offline/poiDatabase';
import type { RootStackParamList } from '../navigation/types';
import type { POI } from '@skyatlas/shared';
import { t } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'POIDetail'>;
type Route = RouteProp<RootStackParamList, 'POIDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORY_LABELS: Record<string, string> = {
  city: 'City',
  mountain: 'Mountain',
  lake: 'Lake',
  river: 'River',
  sea: 'Sea',
  volcano: 'Volcano',
  island: 'Island',
  historic: 'Historic Site',
  park: 'National Park',
  landmark: 'Landmark'
};

const CATEGORY_ICONS: Record<string, string> = {
  city: '🏙️', mountain: '⛰️', lake: '🌊', river: '🌊',
  sea: '🌊', volcano: '🌋', island: '🏝️', historic: '🏛️',
  park: '🌿', landmark: '🗺️'
};

export default function POIDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { poiId, flightId } = route.params;

  const [poi, setPoi] = useState<POI | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loadPackage(flightId).then((pkg) => {
      if (pkg) {
        const found = pkg.pois.find((p) => p.id === poiId);
        setPoi(found ?? null);
      }
    }).finally(() => setLoading(false));
  }, [poiId, flightId]);

  // Stop speech when leaving screen
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const startPulse = () => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true })
      ])
    );
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  };

  const handleListen = async () => {
    if (!poi) return;
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      Speech.stop();
      setIsSpeaking(false);
      stopPulse();
    } else {
      setIsSpeaking(true);
      startPulse();
      Speech.speak(poi.summary, {
        language: 'en',
        rate: 0.95,
        onDone: () => { setIsSpeaking(false); stopPulse(); },
        onStopped: () => { setIsSpeaking(false); stopPulse(); },
        onError: () => { setIsSpeaking(false); stopPulse(); }
      });
    }
  };

  const handleShare = async () => {
    if (!poi) return;
    try {
      await Share.share({
        message: `✈️ I'm flying over ${poi.name}! ${poi.facts[0] ?? ''} #SkyAtlas`,
        title: `Flying over ${poi.name}`
      });
    } catch {
      // user cancelled
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!poi) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textMuted }}>{t('poi.notFound')}</Text>
      </View>
    );
  }

  const icon = CATEGORY_ICONS[poi.category] ?? '📍';
  const label = CATEGORY_LABELS[poi.category] ?? poi.category;
  const photo = poi.photos?.[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Photo header */}
      {photo ? (
        <Image source={{ uri: photo }} style={styles.heroPhoto} contentFit="cover" transition={200} />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroIcon}>{icon}</Text>
        </View>
      )}

      {/* Category badge + share */}
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{icon} {label.toUpperCase()}</Text>
        </View>
        <Pressable
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityLabel={poi ? `Share ${poi.name}` : 'Share this place'}
          accessibilityRole="button"
        >
          <Text style={styles.shareText}>{t('poi.share')}</Text>
        </Pressable>
      </View>

      {/* Name */}
      <Text style={[typography.h1, styles.name]}>{poi.name}</Text>

      {/* Key stats */}
      <View style={styles.statsRow}>
        {poi.elevation != null && (
          <StatChip label={t('poi.elevation')} value={`${poi.elevation.toLocaleString()}m`} />
        )}
        {poi.population != null && poi.population > 0 && (
          <StatChip label={t('poi.population')} value={poi.population.toLocaleString()} />
        )}
        {poi.closestApproachKm != null && (
          <StatChip label={t('poi.distance')} value={`${poi.closestApproachKm}km`} />
        )}
      </View>

      {/* Summary / About section with Listen button */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('poi.about')}</Text>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Pressable
              onPress={handleListen}
              style={[styles.listenButton, isSpeaking && styles.listenButtonActive]}
            >
              <Text style={styles.listenText}>
                {isSpeaking ? `⏹ ${t('poi.stop')}` : `🔊 ${t('poi.listen')}`}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
        <Text style={styles.summary}>{poi.summary}</Text>
      </View>

      {/* Facts */}
      {poi.facts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('poi.didYouKnow').toUpperCase()}</Text>
          {poi.facts.map((fact, i) => (
            <View key={i} style={styles.factRow}>
              <Text style={styles.factBullet}>💡</Text>
              <Text style={styles.factText}>{fact}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Additional photos */}
      {poi.photos.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('poi.photos')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {poi.photos.slice(1).map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.thumbPhoto} contentFit="cover" transition={200} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 20 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },

  heroPhoto: { width: SCREEN_WIDTH, height: 240 },
  heroPlaceholder: {
    width: SCREEN_WIDTH, height: 200,
    backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center'
  },
  heroIcon: { fontSize: 64 },

  badgeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12
  },
  badge: {
    backgroundColor: `${colors.accent}22`,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6
  },
  badgeText: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  shareButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border
  },
  shareText: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  name: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },

  statsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingVertical: 8, flexWrap: 'wrap'
  },
  statChip: {
    backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border
  },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11 },

  section: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  sectionTitle: {
    color: colors.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 1
  },
  listenButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border
  },
  listenButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}22`
  },
  listenText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  summary: { color: colors.text, fontSize: 15, lineHeight: 24 },

  factRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  factBullet: { fontSize: 16 },
  factText: { color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 },

  photoScroll: { marginHorizontal: -16 },
  thumbPhoto: { width: 160, height: 110, borderRadius: 10, marginHorizontal: 6 }
});
