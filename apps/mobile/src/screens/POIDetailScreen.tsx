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
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Speech from 'expo-speech';
import { colors } from '../theme/colors';
import { typography, fonts } from '../theme/typography';
import { loadPackage } from '../core/offline/poiDatabase';
import type { RootStackParamList } from '../navigation/types';
import type { POI } from '@skyatlas/shared';
import { t } from '../i18n';
import { collectionsStore } from '../core/gamification/collections';
import { recordPOIView } from '../core/ai/personalization';

function getNarratorOptions(): Speech.SpeechOptions {
  switch (collectionsStore.getNarrator()) {
    case 'documentary': return { rate: 0.85, pitch: 0.9 };
    case 'casual': return { rate: 1.05, pitch: 1.1 };
    default: return {};
  }
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'POIDetail'>;
type Route = RouteProp<RootStackParamList, 'POIDetail'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.6);

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
  const waveAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadPackage(flightId).then((pkg) => {
      if (pkg) {
        const found = pkg.pois.find((p) => p.id === poiId);
        setPoi(found ?? null);
        if (found) {
          recordPOIView(found.category);
        }
      }
    }).finally(() => setLoading(false));
  }, [poiId, flightId]);

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

    Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, { toValue: 1.4, duration: 400, useNativeDriver: true }),
        Animated.timing(waveAnim, { toValue: 0.7, duration: 400, useNativeDriver: true })
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
    waveAnim.setValue(1);
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
      const narratorOpts = getNarratorOptions();
      Speech.speak(poi.summary, {
        language: 'en',
        rate: narratorOpts.rate ?? 0.95,
        pitch: narratorOpts.pitch,
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
      {/* Cinematic hero: 60% screen height */}
      <View style={styles.heroWrapper}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.heroPhoto} contentFit="cover" transition={300} />
        ) : (
          <View style={[styles.heroPhoto, styles.heroPlaceholder]}>
            <Text style={styles.heroIcon}>{icon}</Text>
          </View>
        )}

        {/* Full gradient fade from transparent to bg at bottom */}
        <LinearGradient
          colors={['transparent', 'rgba(10,11,20,0.65)', colors.bg]}
          style={styles.heroGradient}
          locations={[0.3, 0.7, 1]}
        />

        {/* Share button — frosted glass, top-right corner */}
        <Pressable
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityLabel={poi ? `Share ${poi.name}` : 'Share this place'}
          accessibilityRole="button"
        >
          <Text style={styles.shareIcon}>↗</Text>
        </Pressable>

        {/* Category badge above name, overlaid on hero */}
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroCategoryBadge}>
            <Text style={styles.heroCategoryText}>{icon}  {label.toUpperCase()}</Text>
          </View>
        </View>

        {/* Massive POI name at bottom of hero */}
        <Text style={styles.heroName}>{poi.name}</Text>
      </View>

      {/* Stats chips */}
      <View style={styles.statsRow}>
        {poi.elevation != null && (
          <StatChip label={t('poi.elevation')} value={`${poi.elevation.toLocaleString()}M`} />
        )}
        {poi.population != null && poi.population > 0 && (
          <StatChip label={t('poi.population')} value={poi.population.toLocaleString()} />
        )}
        {poi.closestApproachKm != null && (
          <StatChip label={t('poi.distance')} value={`${poi.closestApproachKm} KM`} />
        )}
      </View>

      {/* ABOUT section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[typography.label, styles.sectionTitle]}>{t('poi.about')}</Text>
          {/* Listen button: circular with waveform when playing */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Pressable
              onPress={handleListen}
              style={[styles.listenButton, isSpeaking && styles.listenButtonActive]}
              accessibilityLabel={isSpeaking ? t('poi.stop') : t('poi.listen')}
              accessibilityRole="button"
            >
              {isSpeaking ? (
                <Animated.Text style={[styles.listenIcon, { transform: [{ scaleY: waveAnim }] }]}>
                  ▐▌
                </Animated.Text>
              ) : (
                <Text style={styles.listenIcon}>♪</Text>
              )}
            </Pressable>
          </Animated.View>
        </View>
        <Text style={[typography.bodyLarge, styles.summary]}>{poi.summary}</Text>
      </View>

      {/* DID YOU KNOW — numbered list in big mono */}
      {poi.facts.length > 0 && (
        <View style={styles.section}>
          <Text style={[typography.label, styles.sectionTitle]}>{t('poi.didYouKnow').toUpperCase()}</Text>
          {poi.facts.map((fact, i) => (
            <View key={i} style={styles.factRow}>
              <Text style={styles.factNumber}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={[typography.body, styles.factText]}>{fact}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Additional photos */}
      {poi.photos.length > 1 && (
        <View style={styles.section}>
          <Text style={[typography.label, styles.sectionTitle]}>{t('poi.photos').toUpperCase()}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {poi.photos.slice(1).map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.thumbPhoto} contentFit="cover" transition={200} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ height: 48 }} />
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

  // Cinematic hero
  heroWrapper: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    position: 'relative',
    justifyContent: 'flex-end'
  },
  heroPhoto: {
    ...StyleSheet.absoluteFillObject
  },
  heroPlaceholder: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center'
  },
  heroIcon: { fontSize: 80 },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT * 0.75
  },

  // Share button — frosted glass top-right
  shareButton: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  shareIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700'
  },

  // Badge above name
  heroBadgeRow: {
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  heroCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(94,139,255,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(94,139,255,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4
  },
  heroCategoryText: {
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  },

  // Massive name at bottom of hero
  heroName: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.5,
    paddingHorizontal: 16,
    paddingBottom: 20,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8
  },

  // Stats chips — mono font
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexWrap: 'wrap'
  },
  statChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  statValue: {
    fontFamily: fonts.monoMedium,
    color: colors.text,
    fontSize: 15,
    letterSpacing: -0.3
  },
  statLabel: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 2
  },

  // Sections
  section: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    color: colors.textMuted
  },

  // Listen button — circular
  listenButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  listenButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}22`
  },
  listenIcon: {
    color: colors.primary,
    fontSize: 16
  },

  summary: {
    color: colors.text,
    lineHeight: 26
  },

  // Numbered facts
  factRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start'
  },
  factNumber: {
    fontFamily: fonts.monoMedium,
    color: colors.primary,
    fontSize: 22,
    lineHeight: 26,
    opacity: 0.7,
    minWidth: 30
  },
  factText: {
    color: colors.text,
    flex: 1,
    lineHeight: 22,
    paddingTop: 2
  },

  photoScroll: { marginHorizontal: -16 },
  thumbPhoto: { width: 160, height: 110, borderRadius: 10, marginHorizontal: 6 }
});
