import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  Animated,
  type ListRenderItemInfo
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createMMKV } from 'react-native-mmkv';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';

const storage = createMMKV({ id: 'skyatlas-onboarding' });
export const ONBOARDING_KEY = 'onboarding_complete';

export function hasCompletedOnboarding(): boolean {
  return storage.getBoolean(ONBOARDING_KEY) ?? false;
}

export function markOnboardingComplete(): void {
  storage.set(ONBOARDING_KEY, true);
}

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

const { width: W } = Dimensions.get('window');

type Slide = {
  key: string;
  icon: string;
  titleKey: string;
  bodyKey: string;
  gradient: [string, string];
};

const SLIDES: Slide[] = [
  {
    key: '1',
    icon: '✈️',
    titleKey: 'onboarding.slide1_title',
    bodyKey: 'onboarding.slide1_body',
    gradient: ['#0A0E1A', '#1A2A4E']
  },
  {
    key: '2',
    icon: '🌍',
    titleKey: 'onboarding.slide2_title',
    bodyKey: 'onboarding.slide2_body',
    gradient: ['#1A4A8E', '#2E5BA8']
  },
  {
    key: '3',
    icon: '🏆',
    titleKey: 'onboarding.slide3_title',
    bodyKey: 'onboarding.slide3_body',
    gradient: ['#4E3B8E', '#6F4FB8']
  }
];

interface AnimatedSlideProps {
  item: Slide;
  isActive: boolean;
}

function AnimatedSlide({ item, isActive }: AnimatedSlideProps) {
  const iconScale = useRef(new Animated.Value(0.5)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      // Reset
      iconScale.setValue(0.5);
      titleOpacity.setValue(0);
      titleTranslateY.setValue(20);
      bodyOpacity.setValue(0);

      // Icon springs in
      Animated.spring(iconScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true
      }).start();

      // Title slides + fades in
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 350,
          delay: 100,
          useNativeDriver: true
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 350,
          delay: 100,
          useNativeDriver: true
        })
      ]).start();

      // Body fades in after 200ms delay from title
      Animated.timing(bodyOpacity, {
        toValue: 1,
        duration: 350,
        delay: 300,
        useNativeDriver: true
      }).start();
    }
  }, [isActive]);

  return (
    <LinearGradient
      colors={item.gradient}
      style={styles.slide}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <Animated.Text style={[styles.slideIcon, { transform: [{ scale: iconScale }] }]}>
        {item.icon}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.slideTitle,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }]
          }
        ]}
      >
        {t(item.titleKey)}
      </Animated.Text>
      <Animated.Text style={[styles.slideBody, { opacity: bodyOpacity }]}>
        {t(item.bodyKey)}
      </Animated.Text>
    </LinearGradient>
  );
}

export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      markOnboardingComplete();
      nav.replace('Tabs');
    }
  };

  const handleSkip = () => {
    markOnboardingComplete();
    nav.replace('Tabs');
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          setCurrentIndex(idx);
        }}
        renderItem={({ item, index }: ListRenderItemInfo<Slide>) => (
          <AnimatedSlide item={item} isActive={index === currentIndex} />
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.buttons}>
        {currentIndex < SLIDES.length - 1 ? (
          <>
            <Pressable
              onPress={handleSkip}
              style={styles.skipButton}
              accessibilityLabel="Skip onboarding"
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </Pressable>
            <Pressable
              onPress={handleNext}
              style={styles.nextButton}
              accessibilityLabel="Next slide"
              accessibilityRole="button"
            >
              <Text style={styles.nextText}>{t('onboarding.next')}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={handleNext}
            style={[styles.nextButton, styles.getStartedButton]}
            accessibilityLabel="Get started with SkyAtlas"
            accessibilityRole="button"
          >
            <Text style={styles.nextText}>{t('onboarding.getStarted')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  slide: {
    width: W,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 20
  },
  slideIcon: { fontSize: 80 },
  slideTitle: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  slideBody: { color: 'rgba(255,255,255,0.7)', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 12
  },
  skipButton: { padding: 14 },
  skipText: { color: colors.textMuted, fontSize: 15 },
  nextButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    flex: 1,
    alignItems: 'center'
  },
  getStartedButton: { flex: 1 },
  nextText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});
