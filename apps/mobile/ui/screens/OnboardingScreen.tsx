import { useRef, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, DataSmall } from '../design/type';
import { Screen, Gutter, Space, ActionBar, PressSurface } from '../design/layout';
import { useReveal } from '../motion';
import Dial from '../components/Dial';
import PlaceFigure from '../components/PlaceFigure';
import Stamp from '../components/Stamp';
import { markOnboardingComplete } from '../onboardingState';
import { initNotifications } from '../../src/core/ux/notifications';
import { t } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

/**
 * Three panels, each showing the actual mechanism rather than an illustration
 * of one. The dial, the drawn terrain and the stamps on these screens are the
 * same components the app uses in earnest — so the promise and the product are
 * literally the same objects, and nothing here can drift out of date.
 */
export default function OnboardingScreen() {
  const nav = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const reveal = useReveal();

  const panels = [
    {
      key: 'beneath',
      title: t('onboard.beneathTitle'),
      body: t('onboard.beneathBody'),
      art: <PlaceFigure category="mountain" seed="onboarding-ridge" height={210} />
    },
    {
      key: 'offline',
      title: t('onboard.offlineTitle'),
      body: t('onboard.offlineBody'),
      art: (
        <View style={styles.artCenter}>
          <Dial size={220} progress={0.62} reading="6:12" caption={t('onboard.offlineCaption')} />
        </View>
      )
    },
    {
      key: 'atlas',
      title: t('onboard.atlasTitle'),
      body: t('onboard.atlasBody'),
      art: (
        <View style={styles.stamps}>
          {['SG', 'MY', 'IN', 'AF', 'TR', 'DE'].map((code, i) => (
            <Stamp key={code} code={code} locked={i > 3} />
          ))}
        </View>
      )
    }
  ];

  const goNext = useCallback(() => {
    if (page < panels.length - 1) {
      scroller.current?.scrollTo({ x: width * (page + 1), animated: true });
      setPage(page + 1);
      return;
    }
    markOnboardingComplete();
    // Asked at the end, once the value is understood — a permission prompt on
    // launch is refused far more often than one that has been earned.
    initNotifications().catch(() => {});
    nav.replace('Tabs');
  }, [page, panels.length, width, nav]);

  const skip = useCallback(() => {
    markOnboardingComplete();
    nav.replace('Tabs');
  }, [nav]);

  return (
    <Screen>
      <View style={styles.head}>
        <Gutter style={styles.headRow}>
          <Label tone="accent" style={styles.wordmark}>
            SKYATLAS
          </Label>
          <PressSurface onPress={skip} accessibilityLabel={t('onboard.skip')} style={styles.skip}>
            <Label tone="dim">{t('onboard.skip')}</Label>
          </PressSurface>
        </Gutter>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
        }
        style={styles.pager}
      >
        {panels.map((panel) => (
          <View key={panel.key} style={[styles.panel, { width }]}>
            <View style={styles.art}>{panel.art}</View>
            <Animated.View style={reveal}>
              <Gutter>
                <Display>{panel.title}</Display>
                <Space h={s.x3} />
                <Body tone="muted" style={styles.measure}>
                  {panel.body}
                </Body>
              </Gutter>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {panels.map((panel, i) => (
          <View key={panel.key} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <ActionBar
        label={page === panels.length - 1 ? t('onboard.begin') : t('common.next')}
        onPress={goNext}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: s.x3, paddingBottom: s.x2 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { letterSpacing: 3.5 },
  skip: { paddingVertical: s.x2, paddingLeft: s.x4 },

  pager: { flex: 1 },
  panel: { flex: 1, justifyContent: 'center' },
  art: { marginBottom: s.x10 },
  artCenter: { alignItems: 'center' },
  stamps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s.x2,
    paddingHorizontal: gutter,
    justifyContent: 'center'
  },
  measure: { maxWidth: 340 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: s.x2, paddingVertical: s.x5 },
  dot: { width: 5, height: 2, backgroundColor: palette.rule },
  dotOn: { width: 18, backgroundColor: palette.amber }
});
