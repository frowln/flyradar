import { useRef, useState, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Title, Small, DataSmall } from '../design/type';
import { Screen, Gutter, Space, ActionBar, PressSurface, Row } from '../design/layout';
import { useReveal } from '../motion';
import Stamp from '../components/Stamp';
import SideMark from '../components/SideMark';
import RouteSketch from '../components/RouteSketch';
import { markOnboardingComplete } from '../onboardingState';
import { demoPreviewRoute, startDemo } from '../../src/core/offline/demo';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

/**
 * Three panels, each showing the real mechanism rather than an illustration of
 * one — the same route plate, side mark and stamps the app uses in earnest —
 * and a last step that lets the passenger feel it: a four-minute demo flight.
 */
export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const { width, height } = useWindowDimensions();
  const artH = Math.max(230, Math.round(height * 0.42));
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const reveal = useReveal();
  const locale = getLocale();

  const route = useMemo(() => demoPreviewRoute(locale), [locale]);

  const panels = [
    {
      key: 'window',
      title: t('onboard.windowTitle'),
      body: t('onboard.windowBody'),
      art: route ? (
        <RouteSketch route={route} width={width} height={artH} flownS={route[Math.floor(route.length * 0.45)]!.elapsedSeconds} plane={route[Math.floor(route.length * 0.45)]!} />
      ) : null
    },
    {
      key: 'side',
      title: t('onboard.sideTitle'),
      body: t('onboard.sideBody'),
      art: (
        <View style={styles.sideArt}>
          <Row gap={s.x6}>
            <View style={styles.sideCol}>
              <SideMark side="left" size={56} />
              <Space h={s.x2} />
              <Label tone="accent">{t('side.left')}</Label>
              <DataSmall allowFontScaling={false}>{t('onboard.sideLeftSample')}</DataSmall>
            </View>
            <View style={styles.sideCol}>
              <SideMark side="right" size={56} color={palette.inkDim} />
              <Space h={s.x2} />
              <Label tone="dim">{t('side.right')}</Label>
              <DataSmall allowFontScaling={false}>{t('onboard.sideRightSample')}</DataSmall>
            </View>
          </Row>
        </View>
      )
    },
    {
      key: 'passport',
      title: t('onboard.passportTitle'),
      body: t('onboard.passportBody'),
      art: (
        <View style={styles.stamps}>
          {['RU', 'GE', 'TR', 'CY', 'EG', 'SA'].map((code, i) => (
            <Stamp key={code} code={code} kind={i === 2 ? 'landed' : i > 3 ? 'locked' : 'overflown'} stampDelay={200 + i * 180} />
          ))}
        </View>
      )
    }
  ];

  const last = page === panels.length - 1;

  const next = useCallback(() => {
    const target = Math.min(panels.length - 1, page + 1);
    scroller.current?.scrollTo({ x: target * width, animated: true });
    setPage(target);
  }, [page, width, panels.length]);

  const finish = useCallback(
    (to: 'add' | 'demo') => {
      markOnboardingComplete();
      if (to === 'add') {
        nav.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'AddFlight' }] });
        return;
      }
      setBusy(true);
      startDemo(locale)
        .then((pkg) => nav.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'InFlight', params: { flightId: pkg.flight.id } }] }))
        .catch(() => nav.reset({ index: 0, routes: [{ name: 'Tabs' }] }))
        .finally(() => setBusy(false));
    },
    [nav, locale]
  );

  return (
    <Screen>
      <Animated.View style={[styles.flex, reveal]}>
        <Gutter style={styles.head}>
          <Label tone="accent" style={styles.wordmark}>
            SKYATLAS
          </Label>
          <PressSurface onPress={() => finish('add')} accessibilityLabel={t('onboard.skip')} style={styles.skip}>
            <Label tone="dim">{t('onboard.skip')}</Label>
          </PressSurface>
        </Gutter>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {panels.map((p) => (
            <View key={p.key} style={{ width }}>
              <View style={[styles.art, { height: artH }]}>{p.art}</View>
              <Gutter>
                <Space h={s.x6} />
                <Display>{p.title}</Display>
                <Space h={s.x3} />
                <Body tone="muted" style={styles.measure}>
                  {p.body}
                </Body>
              </Gutter>
            </View>
          ))}
        </ScrollView>

        <Row gap={s.x2} style={styles.dots}>
          {panels.map((p, i) => (
            <View key={p.key} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </Row>
      </Animated.View>

      {last ? (
        <View>
          <PressSurface onPress={() => finish('demo')} accessibilityLabel={t('onboard.demo')} style={styles.demo}>
            <View style={styles.flex}>
              <Title>{busy ? t('common.loading') : t('onboard.demo')}</Title>
              <Small>{t('onboard.demoHint')}</Small>
            </View>
            <Label tone="accent">›</Label>
          </PressSurface>
          <ActionBar label={t('onboard.addFlight')} onPress={() => finish('add')} />
        </View>
      ) : (
        <ActionBar label={t('onboard.next')} onPress={next} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: s.x3 },
  wordmark: { letterSpacing: 3.5 },
  skip: { paddingVertical: s.x1, paddingLeft: s.x4 },
  art: { justifyContent: 'center', borderTopWidth: line.hair, borderBottomWidth: line.hair, borderColor: palette.rule, backgroundColor: palette.void },
  measure: { maxWidth: 360 },
  sideArt: { alignItems: 'center', justifyContent: 'center' },
  sideCol: { alignItems: 'center', width: 130 },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x3, paddingHorizontal: gutter, justifyContent: 'center' },
  dots: { justifyContent: 'center', paddingVertical: s.x4 },
  dot: { width: 14, height: 2, backgroundColor: palette.rule },
  dotOn: { backgroundColor: palette.amber, width: 24 },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    backgroundColor: palette.warm
  }
});
