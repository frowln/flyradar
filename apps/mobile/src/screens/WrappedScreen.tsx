import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Share,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { collectionsStore } from '../core/gamification/collections';
import { fonts } from '../theme/typography';
import { t } from '../i18n';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const YEAR = new Date().getFullYear();

type Props = NativeStackScreenProps<RootStackParamList, 'Wrapped'>;

const SLIDE_GRADIENTS: [string, string][] = [
  ['#0A0B14', '#1A2560'],
  ['#0D2137', '#1B6CA8'],
  ['#1A1A0A', '#4A6A1A'],
  ['#1A0A2E', '#5C1A8A'],
  ['#1A0A0A', '#8A2A1A'],
  ['#0A1A1A', '#1A6A6A'],
  ['#1A0E2E', '#3D1A6A'],
];

export default function WrappedScreen({ navigation }: Props) {
  const stats = collectionsStore.getStats();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const earthCircumferenceKm = 40075;
  const earthLaps = (stats.totalDistanceKm / earthCircumferenceKm).toFixed(1);
  const distanceLabel = stats.totalDistanceKm >= 1000
    ? `${(stats.totalDistanceKm / 1000).toFixed(1)}k km`
    : `${stats.totalDistanceKm.toLocaleString()} km`;

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(idx);
  }

  function goTo(idx: number) {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
    setActiveIndex(idx);
  }

  function handleTap(side: 'left' | 'right') {
    const next = side === 'right'
      ? Math.min(activeIndex + 1, SLIDES.length - 1)
      : Math.max(activeIndex - 1, 0);
    goTo(next);
  }

  async function handleShare() {
    const message = t('wrapped.shareMessage', {
      year: YEAR,
      flights: stats.totalFlights,
      distance: distanceLabel,
      countries: stats.countriesFlownOver.length,
      discoveries: stats.poisDiscovered
    });
    await Share.share({ message });
  }

  const SLIDES = buildSlides({ stats, distanceLabel, earthLaps, year: YEAR, handleShare });

  return (
    <View style={styles.root}>
      {/* Dot indicators */}
      <View style={styles.dotsRow} pointerEvents="none">
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>

      {/* Close button */}
      <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.closeBtnText}>✕</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <LinearGradient
            key={i}
            colors={SLIDE_GRADIENTS[i]}
            style={styles.slide}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
          >
            {slide.content}

            {/* Tap zones */}
            <View style={styles.tapZones} pointerEvents="box-none">
              <Pressable style={styles.tapLeft} onPress={() => handleTap('left')} />
              <Pressable
                style={styles.tapRight}
                onPress={() => i === SLIDES.length - 1 ? handleShare() : handleTap('right')}
              />
            </View>
          </LinearGradient>
        ))}
      </ScrollView>
    </View>
  );
}

interface SlideData {
  content: React.ReactNode;
}

function buildSlides(opts: {
  stats: ReturnType<typeof collectionsStore.getStats>;
  distanceLabel: string;
  earthLaps: string;
  year: number;
  handleShare: () => void;
}): SlideData[] {
  const { stats, distanceLabel, earthLaps, year, handleShare } = opts;

  return [
    // Slide 0: Hero
    {
      content: (
        <View style={styles.slideContent}>
          <Text style={styles.slideLabel}>{t('wrapped.skyatlas')}</Text>
          {/* Massive Fraunces year watermark */}
          <Text style={styles.heroYear}>{year}</Text>
          {/* Big serif hero title */}
          <Text style={styles.heroTitle}>{t('wrapped.yourYear')}</Text>
          <View style={styles.heroNumbers}>
            <HeroStat value={stats.totalFlights.toString()} label={t('wrapped.flights')} />
            <HeroStat value={distanceLabel} label={t('wrapped.flown')} />
            <HeroStat value={stats.countriesFlownOver.length.toString()} label={t('wrapped.countries')} />
          </View>
          <Text style={styles.swipeHint}>{t('wrapped.swipeHint')}</Text>
        </View>
      ),
    },

    // Slide 1: Total distance
    {
      content: (
        <View style={styles.slideContent}>
          <Text style={styles.slideEmoji}>🌍</Text>
          <Text style={styles.slideSuperTitle}>{t('wrapped.youFlew')}</Text>
          {/* Hero number in 56px Fraunces */}
          <Text style={styles.slideBigNumber}>{distanceLabel}</Text>
          <Text style={styles.slideSubtitle}>
            {t('wrapped.aroundEarth')}{'\n'}
            <Text style={styles.slideAccent}>{earthLaps}×</Text>
          </Text>
          <Text style={styles.slideFootnote}>
            {stats.totalFlights > 0
              ? t('wrapped.acrossFlights', { count: stats.totalFlights })
              : t('wrapped.startFirst')}
          </Text>
        </View>
      ),
    },

    // Slide 2: Countries
    {
      content: (
        <View style={styles.slideContent}>
          <Text style={styles.slideEmoji}>🗺️</Text>
          <Text style={styles.slideSuperTitle}>{t('wrapped.youCrossed')}</Text>
          <Text style={styles.slideBigNumber}>{stats.countriesFlownOver.length}</Text>
          <Text style={styles.slideSubtitle}>{t('wrapped.countries')}</Text>
          {stats.countriesFlownOver.length > 0 && (
            <View style={styles.countryPills}>
              {stats.countriesFlownOver.slice(0, 5).map((c) => (
                <View key={c} style={styles.countryPill}>
                  <Text style={styles.countryPillText}>{c}</Text>
                </View>
              ))}
              {stats.countriesFlownOver.length > 5 && (
                <View style={styles.countryPill}>
                  <Text style={styles.countryPillText}>+{stats.countriesFlownOver.length - 5} more</Text>
                </View>
              )}
            </View>
          )}
        </View>
      ),
    },

    // Slide 3: Longest flight
    {
      content: (
        <View style={styles.slideContent}>
          <Text style={styles.slideEmoji}>⏱️</Text>
          <Text style={styles.slideSuperTitle}>{t('wrapped.longestFlight')}</Text>
          <Text style={styles.slideBigNumber}>
            {stats.longestFlightHours > 0
              ? `${Math.floor(stats.longestFlightHours)}h ${Math.round((stats.longestFlightHours % 1) * 60)}m`
              : '—'}
          </Text>
          <Text style={styles.slideSubtitle}>
            {stats.longestFlightHours >= 8
              ? 'Ultra long-haul explorer'
              : stats.longestFlightHours >= 4
              ? 'Long-haul traveller'
              : stats.longestFlightHours > 0
              ? 'Short-haul hopper'
              : 'No flights yet'}
          </Text>
          <Text style={styles.slideFootnote}>
            {stats.nightFlights > 0 ? `${stats.nightFlights} of those were night flights 🌙` : ''}
          </Text>
        </View>
      ),
    },

    // Slide 4: Most visited region
    {
      content: (
        <View style={styles.slideContent}>
          <Text style={styles.slideEmoji}>🛫</Text>
          <Text style={styles.slideSuperTitle}>{t('wrapped.mostVisitedRegion')}</Text>
          <Text style={styles.slideBigNumber}>
            {stats.countriesFlownOver.length > 0 ? stats.countriesFlownOver[0] : '—'}
          </Text>
          <Text style={styles.slideSubtitle}>
            {stats.continentsVisited.length > 0
              ? `Across ${stats.continentsVisited.length} continent${stats.continentsVisited.length !== 1 ? 's' : ''}`
              : stats.totalFlights > 0
              ? 'Your first destination awaits'
              : 'Start flying to unlock'}
          </Text>
          {stats.continentsVisited.length > 0 && (
            <View style={styles.countryPills}>
              {stats.continentsVisited.map((c) => (
                <View key={c} style={styles.countryPill}>
                  <Text style={styles.countryPillText}>{c}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ),
    },

    // Slide 5: Top discovery
    {
      content: (
        <View style={styles.slideContent}>
          <Text style={styles.slideEmoji}>📍</Text>
          <Text style={styles.slideSuperTitle}>{t('wrapped.pointsOfInterest')}</Text>
          <Text style={styles.slideBigNumber}>{stats.poisDiscovered.toLocaleString()}</Text>
          <Text style={styles.slideSubtitle}>
            {stats.poisDiscovered === 0
              ? t('wrapped.awaitYou')
              : stats.poisDiscovered === 1
              ? t('wrapped.oneDiscovery')
              : t('wrapped.discoveries')}
          </Text>
          <Text style={styles.slideFootnote}>
            {stats.poisDiscovered > 50
              ? 'World-class explorer 🌟'
              : stats.poisDiscovered > 10
              ? 'Curious traveller 🔭'
              : stats.poisDiscovered > 0
              ? 'Beginning your journey 🌱'
              : 'Fly to discover the world below'}
          </Text>
        </View>
      ),
    },

    // Slide 6: Share card
    {
      content: (
        <View style={styles.slideContent}>
          <Text style={styles.slideEmoji}>✈️</Text>
          <Text style={styles.heroYear}>{year}</Text>
          <Text style={styles.shareTitle}>{t('wrapped.yourSummarized')}</Text>
          <View style={styles.shareSummaryBox}>
            <ShareRow icon="🛫" label={t('wrapped.flights')} value={stats.totalFlights.toString()} />
            <ShareRow icon="📏" label={t('wrapped.distance')} value={distanceLabel} />
            <ShareRow icon="🌍" label={t('wrapped.countries')} value={stats.countriesFlownOver.length.toString()} />
            <ShareRow icon="📍" label={t('wrapped.pointsOfInterest')} value={stats.poisDiscovered.toString()} />
            <ShareRow icon="⏱️" label={t('wrapped.longestFlight')} value={stats.longestFlightHours > 0 ? `${stats.longestFlightHours.toFixed(1)}h` : '—'} />
          </View>
          <ShareButton onPress={handleShare} />
        </View>
      ),
    },
  ];
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      {/* Big mono number for aviation feel */}
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function ShareRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.shareRow}>
      <Text style={styles.shareRowIcon}>{icon}</Text>
      <Text style={styles.shareRowLabel}>{label}</Text>
      <Text style={styles.shareRowValue}>{value}</Text>
    </View>
  );
}

function ShareButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.shareButton} onPress={onPress}>
      <Text style={styles.shareButtonText}>{t('wrapped.shareMyYear')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0B14',
  },

  dotsRow: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    zIndex: 10,
  },
  dot: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: { backgroundColor: '#FFFFFF' },

  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontFamily: fonts.bodyBold,
    color: '#FFFFFF',
    fontSize: 14,
  },

  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  slideContent: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 110,
    paddingBottom: 60,
    justifyContent: 'center',
    gap: 12,
  },

  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 1 },

  slideLabel: {
    fontFamily: fonts.bodySemi,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  // Huge Fraunces watermark year
  heroYear: {
    fontFamily: fonts.display,
    color: 'rgba(255,255,255,0.12)',
    fontSize: 80,
    lineHeight: 80,
    letterSpacing: -3,
    marginBottom: -8,
  },
  // Big serif hero title
  heroTitle: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.5,
  },
  heroNumbers: {
    flexDirection: 'row',
    marginTop: 32,
    gap: 0,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.15)',
  },
  // Mono numbers for aviation data feel
  heroStatValue: {
    fontFamily: fonts.monoMedium,
    color: '#FFB547',
    fontSize: 22,
    letterSpacing: -0.5,
  },
  heroStatLabel: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  swipeHint: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 40,
    textAlign: 'center',
  },

  slideEmoji: { fontSize: 52, marginBottom: 8 },
  slideSuperTitle: {
    fontFamily: fonts.bodyMedium,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
  },
  // Hero 56px Fraunces for big slide numbers
  slideBigNumber: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -2,
  },
  slideSubtitle: {
    fontFamily: fonts.bodySemi,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 22,
    lineHeight: 30,
  },
  slideAccent: {
    fontFamily: fonts.bodyBold,
    color: '#FFB547',
  },
  slideFootnote: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    marginTop: 8,
  },

  countryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  countryPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  countryPillText: {
    fontFamily: fonts.bodySemi,
    color: '#FFFFFF',
    fontSize: 13,
  },

  shareTitle: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1,
  },
  shareSummaryBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 20,
    gap: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shareRowIcon: { fontSize: 20, width: 28 },
  shareRowLabel: {
    fontFamily: fonts.body,
    flex: 1,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  shareRowValue: {
    fontFamily: fonts.monoMedium,
    color: '#FFFFFF',
    fontSize: 15,
    letterSpacing: -0.3,
  },
  shareButton: {
    marginTop: 24,
    backgroundColor: '#FFB547',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: fonts.bodyBold,
    color: '#0A0B14',
    fontSize: 17,
    letterSpacing: 0.3,
  },
});
