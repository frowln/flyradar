import { useRef, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { palette, s, gutter, line, family } from '../design/tokens';
import { Label, Body, Display } from '../design/type';
import { Screen, Gutter, Space, ActionBar, PressSurface } from '../design/layout';
import Stamp from '../components/Stamp';
import { collectionsStore } from '../../src/core/gamification/collections';
import { t } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Wrapped'>;

/**
 * The year, told in five panels.
 *
 * This is the one screen permitted to break the instrument language: it exists
 * to be screenshotted and posted in December, and a ruled table does not travel
 * on social. The numbers are set enormous, one idea per panel, and the amber is
 * allowed to fill rather than merely mark.
 *
 * Everything else in the app stays quiet precisely so this can be loud.
 */
export default function WrappedScreen() {
  const nav = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const shot = useRef<View>(null);

  const stats = collectionsStore.getStats();
  const year = new Date().getFullYear();
  const laps = (stats.totalDistanceKm / 40075).toFixed(2);
  const countries = stats.countriesFlownOver;

  const panels = [
    {
      key: 'year',
      eyebrow: `${year}`,
      value: String(stats.totalFlights),
      unit: t('wrapped.flights'),
      note: t('wrapped.flightsNote')
    },
    {
      key: 'distance',
      eyebrow: t('wrapped.distance'),
      value: Math.round(stats.totalDistanceKm).toLocaleString(),
      unit: t('atlas.km'),
      note: `${laps} ${t('stats.earthLaps')}`
    },
    {
      key: 'places',
      eyebrow: t('wrapped.discovered'),
      value: String(stats.poisDiscovered),
      unit: t('atlas.places'),
      note: t('wrapped.placesNote')
    },
    {
      key: 'countries',
      eyebrow: t('wrapped.countries'),
      value: String(countries.length),
      unit: t('atlas.countries'),
      note: '',
      stamps: countries.slice(0, 12)
    }
  ];

  const share = useCallback(async () => {
    try {
      if (!shot.current) return;
      const uri = await captureRef(shot.current, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch {
      // Sharing is a nicety; failing to capture must never break the recap.
    }
  }, []);

  return (
    <Screen>
      <Gutter style={styles.head}>
        <Label tone="accent">{t('atlas.wrapped')}</Label>
        <PressSurface
          onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))}
          accessibilityLabel={t('common.done')}
          style={styles.close}
        >
          <Label tone="dim">{t('common.done')}</Label>
        </PressSurface>
      </Gutter>

      <View ref={shot} collapsable={false} style={styles.capture}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))
          }
        >
          {panels.map((panel) => (
            <View key={panel.key} style={[styles.panel, { width }]}>
              <Gutter>
                <Label tone="accent" style={styles.eyebrow}>
                  {panel.eyebrow}
                </Label>
                <Space h={s.x5} />
                <Animated.Text style={styles.huge} allowFontScaling={false} numberOfLines={1}>
                  {panel.value}
                </Animated.Text>
                <Space h={s.x2} />
                <Display tone="muted">{panel.unit}</Display>
                {panel.note ? (
                  <>
                    <Space h={s.x5} />
                    <Body tone="muted" style={styles.note}>
                      {panel.note}
                    </Body>
                  </>
                ) : null}
                {panel.stamps?.length ? (
                  <>
                    <Space h={s.x6} />
                    <View style={styles.stamps}>
                      {panel.stamps.map((code) => (
                        <Stamp key={code} code={code} size={40} />
                      ))}
                    </View>
                  </>
                ) : null}
              </Gutter>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.dots}>
        {panels.map((panel, i) => (
          <View key={panel.key} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <ActionBar label={t('wrapped.share')} onPress={share} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: s.x3,
    paddingBottom: s.x2
  },
  close: { paddingVertical: s.x2, paddingLeft: s.x4 },

  capture: { flex: 1, backgroundColor: palette.ground },
  panel: { flex: 1, justifyContent: 'center' },
  eyebrow: { letterSpacing: 3 },

  // Deliberately outside the type scale: this number is the point of the screen.
  huge: {
    fontFamily: family.display,
    fontSize: 92,
    lineHeight: 96,
    letterSpacing: -5,
    color: palette.amber
  },
  note: { maxWidth: 320 },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x2 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: s.x2, paddingVertical: s.x5 },
  dot: { width: 5, height: 2, backgroundColor: palette.rule },
  dotOn: { width: 18, backgroundColor: palette.amber }
});
