import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, ActivityIndicator, Pressable } from 'react-native';
import { Image } from 'expo-image';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { palette, s, gutter, line, radius } from '../design/tokens';
import { Display, Label, Body, BodyLarge, Data, DataSmall } from '../design/type';
import { Screen, Gutter, Cells, Space, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import PlaceFigure from '../components/PlaceFigure';
import PlaceReviews from '../components/PlaceReviews';
import { social } from '../../src/core/api/social';
import { canOpenPlace, notePlaceOpened } from '../../src/core/monetization/entitlement';
import { loadPackage } from '../../src/core/offline/poiDatabase';
import { getRandomQuiz, type LocalisedQuiz } from '../../src/core/quizzes/quizzes';
import { recordPOIView } from '../../src/core/ai/personalization';
import { haptics } from '../../src/core/ux/haptics';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';
import type { POI } from '@skyatlas/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'POIDetail'>;
type R = RouteProp<RootStackParamList, 'POIDetail'>;

function localised(poi: POI) {
  const loc = getLocale().slice(0, 2) as keyof NonNullable<POI['translations']>;
  const tr = poi.translations?.[loc];
  return {
    name: tr?.name ?? poi.name,
    summary: tr?.summary ?? poi.summary,
    facts: tr?.facts ?? poi.facts
  };
}

/** The hero is full-bleed, so its height is also where the status-bar lid closes. */
const HERO_HEIGHT = 230;

const coords = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;

/**
 * The quiz, placed after the reading rather than before it.
 *
 * Asking first turns the card into an exam; asking after the passenger has
 * just read the answer turns it into a small win. Same content, opposite feel.
 */
function QuizBlock({ quiz }: { quiz: LocalisedQuiz }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === quiz.correctIdx;

  return (
    <View style={styles.quiz}>
      <Gutter>
        {/* Its own heading. Both this block and the facts above it read
            "did you know", so one screen carried the same title twice. */}
        <Label tone="accent">{t('poi.question')}</Label>
        <Space h={s.x3} />
        <BodyLarge>{quiz.question}</BodyLarge>
      </Gutter>
      <Space h={s.x4} />

      {quiz.options.map((option, i) => {
        const chosen = picked === i;
        const isAnswer = i === quiz.correctIdx;
        const revealed = picked !== null;
        return (
          <Pressable
            key={option}
            disabled={revealed}
            onPress={() => {
              setPicked(i);
              i === quiz.correctIdx ? haptics.success() : haptics.error();
            }}
            accessibilityRole="button"
            accessibilityLabel={option}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
              revealed && isAnswer && styles.optionRight,
              chosen && !isAnswer && styles.optionWrong
            ]}
          >
            <Body tone={revealed && isAnswer ? 'accent' : 'default'}>{option}</Body>
          </Pressable>
        );
      })}

      {picked !== null ? (
        <View style={styles.explain}>
          <Gutter>
            <Label tone={right ? 'accent' : 'muted'}>{right ? '✓' : '—'}</Label>
            <Space h={s.x2} />
            <Body tone="muted">{quiz.explanation}</Body>
          </Gutter>
        </View>
      ) : null}
    </View>
  );
}

export default function PlaceScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const { poiId, flightId } = route.params;
  const insets = useSafeAreaInsets();

  const [poi, setPoi] = useState<POI | null>(null);
  const [loading, setLoading] = useState(true);
  const [plate, setPlate] = useState<string>('');
  const [speaking, setSpeaking] = useState(false);
  const reveal = useReveal();
  const scrollY = useRef(new Animated.Value(0)).current;

  /**
   * A lid over the status bar, opened only once there is something to hide.
   *
   * The hero is deliberately full-bleed, so the card scrolls under the clock —
   * and the body text ran straight through the time of day. An always-on strip
   * would instead put a slab of page colour over the warm hero. So it fades in
   * across the twenty points before the hero's edge reaches the status bar,
   * which is exactly when the first line of text arrives there.
   */
  const maskOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, HERO_HEIGHT - insets.top - 20), Math.max(1, HERO_HEIGHT - insets.top)],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  /**
   * One question per place, not per render.
   *
   * This was a plain `useState(null)` that nothing ever set, so the fallback ran
   * `getRandomQuiz()` on every render — pressing "listen" swapped the question
   * out from under the reader. Keyed on the place, it is drawn once.
   */
  const quiz = useMemo<LocalisedQuiz | null>(
    () => (poi ? getRandomQuiz(poi.category) : null),
    [poi]
  );

  useEffect(() => {
    let alive = true;

    // The free tier stops at five places a flight. Reopening one already read
    // costs nothing, so only a genuinely new card can be turned away.
    if (!canOpenPlace(flightId, poiId)) {
      nav.replace('Paywall');
      return;
    }

    loadPackage(flightId)
      .then((pkg) => {
        if (!alive || !pkg) return;
        const idx = pkg.pois.findIndex((p) => p.id === poiId);
        const found = idx >= 0 ? pkg.pois[idx]! : null;
        setPoi(found);
        setPlate(String(idx + 1).padStart(3, '0'));
        if (found) {
          notePlaceOpened(flightId, found.id);
          recordPOIView(found.category);
          // Best-effort: queued and replayed if there is no signal at cruise.
          social.discover(found.id, flightId);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      Speech.stop();
    };
  }, [poiId, flightId, nav]);

  const speak = useCallback(() => {
    if (!poi) return;
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const { summary } = localised(poi);
    setSpeaking(true);
    Speech.speak(summary, {
      language: getLocale(),
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false)
    });
  }, [poi, speaking]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={palette.amber} />
      </Screen>
    );
  }

  if (!poi) {
    return (
      <Screen style={styles.center}>
        <Body tone="muted">{t('poi.notFound')}</Body>
      </Screen>
    );
  }

  const { name, summary, facts } = localised(poi);
  const photo = poi.photos?.[0];
  const cells = [
    poi.elevation ? { value: `${poi.elevation.toLocaleString()}`, label: `${t('poi.elevation')} · M` } : null,
    poi.closestApproachKm
      ? { value: String(Math.round(poi.closestApproachKm)), label: `${t('poi.distance')} · KM` }
      : null,
    poi.population
      ? { value: `${Math.round(poi.population / 1000)}K`, label: t('poi.population') }
      : null
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <Screen edges={[]}>
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true
        })}
      >
        <View style={styles.hero}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={240} />
          ) : (
            <PlaceFigure category={poi.category} seed={poi.id} height={HERO_HEIGHT} />
          )}
          <View style={styles.plate}>
            <Label tone="accent" numberOfLines={1}>
              {`№ ${plate} · ${t(`category.${poi.category}`)}`}
            </Label>
          </View>
        </View>

        <Animated.View style={reveal}>
          <Gutter>
            <Space h={s.x5} />
            <Display>{name}</Display>
            <Space h={s.x2} />
            <DataSmall allowFontScaling={false}>{coords(poi.lat, poi.lon)}</DataSmall>
          </Gutter>

          {cells.length > 0 ? (
            <>
              <Space h={s.x5} />
              <Cells items={cells} />
            </>
          ) : null}

          <Space h={s.x5} />
          <Gutter>
            <Body tone="muted" style={styles.measure}>
              {summary}
            </Body>
          </Gutter>

          {facts?.length ? (
            <>
              <Space h={s.x8} />
              <Gutter>
                <Label tone="dim">{t('poi.didYouKnow')}</Label>
              </Gutter>
              <Space h={s.x3} />
              {facts.map((fact) => (
                <View key={fact} style={styles.factRow}>
                  <View style={styles.factPip} />
                  <Body tone="muted" style={styles.factText}>
                    {fact}
                  </Body>
                </View>
              ))}
            </>
          ) : null}

          <Space h={s.x8} />
          <Rule />
          <PressSurface onPress={speak} accessibilityLabel={t('poi.listen')} style={styles.listenRow}>
            <Body>{speaking ? t('poi.stop') : t('poi.listen')}</Body>
            <View style={styles.fill} />
            <Data tone="dim" allowFontScaling={false}>
              {speaking ? '■' : '▶'}
            </Data>
          </PressSurface>
          <Rule />

          {quiz ? <QuizBlock key={quiz.id} quiz={quiz} /> : null}

          <PlaceReviews poiId={poi.id} />
        </Animated.View>

        <Space h={s.x16} />
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[styles.statusMask, { height: insets.top, opacity: maskOpacity }]}
      />

      {/* Floats above the hero rather than inside it: a child of the fixed-height
          hero cannot be positioned against the screen, and the control has to
          clear the status bar on every device. */}
      <View style={[styles.backFloat, { top: insets.top + s.x2 }]} pointerEvents="box-none">
        <PressSurface
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))}
          accessibilityLabel={t('common.back')}
          style={styles.backBtn}
        >
          <Label tone="muted">{t('common.back')}</Label>
        </PressSurface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: s.x8 },

  hero: { height: HERO_HEIGHT, backgroundColor: palette.warm },
  photo: { width: "100%", height: HERO_HEIGHT },
  plate: {
    position: 'absolute',
    left: gutter,
    bottom: s.x3,
    paddingHorizontal: s.x2,
    paddingVertical: s.x1,
    borderWidth: line.hair,
    borderColor: palette.amberDim,
    backgroundColor: palette.ground
  },
  statusMask: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: palette.ground },
  backFloat: { position: 'absolute', left: 0, right: 0 },
  backBtn: {
    alignSelf: 'flex-start',
    marginLeft: gutter,
    paddingVertical: s.x2,
    paddingHorizontal: s.x3,
    borderWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.ground
  },

  measure: { maxWidth: 460 },

  factRow: {
    flexDirection: 'row',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  factPip: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.amber, marginTop: 9 },
  factText: { flex: 1 },

  listenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4
  },
  fill: { flex: 1 },

  quiz: { marginTop: s.x10 },
  option: {
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  optionPressed: { backgroundColor: palette.raised },
  optionRight: { backgroundColor: palette.warm, borderLeftWidth: 2, borderLeftColor: palette.amber },
  optionWrong: { opacity: 0.45 },
  explain: {
    marginTop: s.x4,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    backgroundColor: palette.raised,
    borderRadius: radius.none
  }
});
