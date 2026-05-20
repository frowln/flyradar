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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createMMKV } from 'react-native-mmkv';
import { Plane, Compass, Trophy, type LucideIcon } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';
import AtmosphericBackground from '../components/AtmosphericBackground';

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

type AtmosphericVariant = 'sky' | 'sunset' | 'aurora';

type Slide = {
  key: string;
  Icon: LucideIcon;
  iconColor: string;
  titleKey: string;
  bodyKey: string;
  variant: AtmosphericVariant;
};

const SLIDES: Slide[] = [
  {
    key: '1',
    Icon: Plane,
    iconColor: colors.primary,
    titleKey: 'onboarding.slide1_title',
    bodyKey: 'onboarding.slide1_body',
    variant: 'sky'
  },
  {
    key: '2',
    Icon: Compass,
    iconColor: colors.accent,
    titleKey: 'onboarding.slide2_title',
    bodyKey: 'onboarding.slide2_body',
    variant: 'sunset'
  },
  {
    key: '3',
    Icon: Trophy,
    iconColor: '#FFB547',
    titleKey: 'onboarding.slide3_title',
    bodyKey: 'onboarding.slide3_body',
    variant: 'aurora'
  }
];

interface AnimatedSlideProps {
  item: Slide;
  isActive: boolean;
}

function AnimatedSlide({ item, isActive }: AnimatedSlideProps) {
  const iconScale = useRef(new Animated.Value(0.5)).current;
  const iconTranslateY = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const floatLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isActive) {
      // Reset values
      iconScale.setValue(0.5);
      titleOpacity.setValue(0);
      titleTranslateY.setValue(20);
      bodyOpacity.setValue(0);

      // Icon entrance spring
      Animated.spring(iconScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true
      }).start(() => {
        // Start gentle float loop after entrance
        floatLoop.current = Animated.loop(
          Animated.sequence([
            Animated.timing(iconTranslateY, {
              toValue: -8,
              duration: 1800,
              useNativeDriver: true
            }),
            Animated.timing(iconTranslateY, {
              toValue: 0,
              duration: 1800,
              useNativeDriver: true
            })
          ])
        );
        floatLoop.current.start();
      });

      // Title slides in from below with delay
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

      // Body fades in with longer delay
      Animated.timing(bodyOpacity, {
        toValue: 1,
        duration: 350,
        delay: 300,
        useNativeDriver: true
      }).start();
    } else {
      // Stop float animation when slide is not active
      floatLoop.current?.stop();
      iconTranslateY.setValue(0);
    }
  }, [isActive]);

  return (
    <AtmosphericBackground variant={item.variant} style={styles.slide}>
      <Animated.View
        style={[
          styles.iconWrapper,
          {
            transform: [
              { scale: iconScale },
              { translateY: iconTranslateY }
            ]
          }
        ]}
      >
        <View style={[styles.iconGlow3, { backgroundColor: item.iconColor + '08' }]} />
        <View style={[styles.iconGlow2, { backgroundColor: item.iconColor + '14' }]} />
        <View style={[styles.iconGlow1, { backgroundColor: item.iconColor + '22' }]} />
        <item.Icon size={140} color={item.iconColor} strokeWidth={1.5} />
      </Animated.View>
      {/* Slide title in 42px Fraunces display serif */}
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
      {/* Body in Inter bodyLarge */}
      <Animated.Text style={[styles.slideBody, { opacity: bodyOpacity }]}>
        {t(item.bodyKey)}
      </Animated.Text>
    </AtmosphericBackground>
  );
}

interface AnimatedDotProps {
  isActive: boolean;
}

function AnimatedDot({ isActive }: AnimatedDotProps) {
  const widthAnim = useRef(new Animated.Value(isActive ? 24 : 8)).current;
  const opacityAnim = useRef(new Animated.Value(isActive ? 1 : 0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(widthAnim, {
        toValue: isActive ? 24 : 8,
        tension: 80,
        friction: 8,
        useNativeDriver: false
      }),
      Animated.timing(opacityAnim, {
        toValue: isActive ? 1 : 0.4,
        duration: 200,
        useNativeDriver: false
      })
    ]).start();
  }, [isActive]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { width: widthAnim, opacity: opacityAnim }
      ]}
    />
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

      {/* Dots with spring animation */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <AnimatedDot key={i} isActive={i === currentIndex} />
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 20
  },
  iconWrapper: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center'
  },
  iconGlow1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90
  },
  iconGlow2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110
  },
  iconGlow3: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140
  },
  // 42px Fraunces display serif for slide titles
  slideTitle: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.5,
    textAlign: 'center'
  },
  // Inter bodyLarge for slide body
  slideBody: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center'
  },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingBottom: 16 },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 12
  },
  skipButton: { padding: 14 },
  skipText: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 15
  },
  nextButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    flex: 1,
    alignItems: 'center'
  },
  getStartedButton: { flex: 1 },
  nextText: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
    fontSize: 16
  }
});
