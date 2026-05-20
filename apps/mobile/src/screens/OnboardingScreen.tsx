import { useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  type ListRenderItemInfo
} from 'react-native';
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

type Slide = { key: string; icon: string; titleKey: string; bodyKey: string };

const SLIDES: Slide[] = [
  { key: '1', icon: '✈️', titleKey: 'onboarding.slide1_title', bodyKey: 'onboarding.slide1_body' },
  { key: '2', icon: '🌍', titleKey: 'onboarding.slide2_title', bodyKey: 'onboarding.slide2_body' },
  { key: '3', icon: '🏆', titleKey: 'onboarding.slide3_title', bodyKey: 'onboarding.slide3_body' }
];

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
        renderItem={({ item }: ListRenderItemInfo<Slide>) => (
          <View style={styles.slide}>
            <Text style={styles.slideIcon}>{item.icon}</Text>
            <Text style={styles.slideTitle}>{t(item.titleKey)}</Text>
            <Text style={styles.slideBody}>{t(item.bodyKey)}</Text>
          </View>
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
            <Pressable onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </Pressable>
            <Pressable onPress={handleNext} style={styles.nextButton}>
              <Text style={styles.nextText}>{t('onboarding.next')}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={handleNext} style={[styles.nextButton, styles.getStartedButton]}>
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
    width: W, flex: 1,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40, gap: 20
  },
  slideIcon: { fontSize: 80 },
  slideTitle: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  slideBody: { color: colors.textMuted, fontSize: 16, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  buttons: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 48, gap: 12
  },
  skipButton: { padding: 14 },
  skipText: { color: colors.textMuted, fontSize: 15 },
  nextButton: {
    backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 14, flex: 1, alignItems: 'center'
  },
  getStartedButton: { flex: 1 },
  nextText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});
