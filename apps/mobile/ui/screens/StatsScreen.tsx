import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall } from '../design/type';
import { Screen, Gutter, Space, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import { collectionsStore } from '../../src/core/gamification/collections';
import { ACHIEVEMENTS } from '../../src/core/gamification/achievements';
import { t } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Stats'>;

/** Months shown on the activity strip. */
const MONTHS_BACK = 12;

/**
 * Lifetime figures, set as a table rather than a dashboard.
 *
 * Numbers this sparse do not need charts. A ruled table with the values right-
 * aligned in the mono face is faster to read than any donut, and it is the same
 * language the flight instruments already speak.
 */
function Figure({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.figure} accessible accessibilityLabel={`${label}: ${value} ${unit ?? ''}`}>
      <Body tone="muted" style={styles.figureLabel}>
        {label}
      </Body>
      <View style={styles.leader} />
      <Data allowFontScaling={false}>{value}</Data>
      {unit ? <DataSmall style={styles.unit}>{unit}</DataSmall> : null}
    </View>
  );
}

/**
 * A year of flying as twelve marks. Empty months are drawn as thin rules so the
 * gaps are as legible as the activity — the shape of a travel year is mostly
 * about when you were not flying.
 */
function ActivityStrip({ history }: { history: string[] }) {
  const now = new Date();
  const counts: { key: string; n: number }[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    counts.push({ key, n: history.filter((h) => h.startsWith(key)).length });
  }
  const peak = Math.max(1, ...counts.map((c) => c.n));

  return (
    <View style={styles.strip}>
      {counts.map((c) => (
        <View key={c.key} style={styles.stripCol}>
          <View
            style={[
              styles.bar,
              { height: c.n === 0 ? line.hair : Math.max(3, (c.n / peak) * 46) },
              c.n === 0 && styles.barEmpty
            ]}
          />
        </View>
      ))}
    </View>
  );
}

export default function StatsScreen() {
  const nav = useNavigation<Nav>();
  const [stats, setStats] = useState(() => collectionsStore.getStats());
  const [earned, setEarned] = useState(() => collectionsStore.getEarnedAchievements());
  const reveal = useReveal();

  useFocusEffect(
    useCallback(() => {
      setStats(collectionsStore.getStats());
      setEarned(collectionsStore.getEarnedAchievements());
    }, [])
  );

  const hours = Math.round(stats.totalDistanceKm / 850); // ~cruise ground speed
  const earthLaps = (stats.totalDistanceKm / 40075).toFixed(2);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter style={styles.head}>
            <Label tone="dim">{t('atlas.history')}</Label>
            <PressSurface
              onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))}
              accessibilityLabel={t('common.done')}
              style={styles.close}
            >
              <Label tone="accent">{t('common.done')}</Label>
            </PressSurface>
          </Gutter>

          <Space h={s.x5} />
          <Gutter>
            <Display>{Math.round(stats.totalDistanceKm).toLocaleString()}</Display>
            <Space h={s.x1} />
            <Body tone="muted">
              {t('atlas.km')} · {earthLaps} {t('stats.earthLaps')}
            </Body>
          </Gutter>

          <Space h={s.x8} />
          <Gutter>
            <Label tone="dim">{t('stats.activity')}</Label>
          </Gutter>
          <Space h={s.x3} />
          <Gutter>
            <ActivityStrip history={stats.monthlyFlightsHistory ?? []} />
          </Gutter>

          <Space h={s.x8} />
          <Rule />
          <Figure label={t('atlas.flights')} value={String(stats.totalFlights)} />
          <Figure label={t('stats.hoursAloft')} value={String(hours)} unit="h" />
          <Figure label={t('atlas.countriesShort')} value={String(stats.countriesFlownOver.length)} />
          <Figure label={t('atlas.placesShort')} value={String(stats.poisDiscovered)} />
          <Figure label={t('stats.longest')} value={stats.longestFlightHours.toFixed(1)} unit="h" />
          <Figure label={t('stats.nightFlights')} value={String(stats.nightFlights)} />
          <Figure
            label={t('stats.achievements')}
            value={`${earned.length} / ${ACHIEVEMENTS.length}`}
          />
          <Rule />

          {earned.length > 0 ? (
            <>
              <Space h={s.x8} />
              <Gutter>
                <Label tone="dim">{t('stats.achievements')}</Label>
              </Gutter>
              <Space h={s.x3} />
              {ACHIEVEMENTS.filter((a) => earned.includes(a.id)).map((a) => (
                <View key={a.id} style={styles.achievement}>
                  <Body tone="accent">{a.name}</Body>
                  <Space h={s.x1} />
                  <Body tone="muted" style={styles.achievementDesc}>
                    {a.description}
                  </Body>
                </View>
              ))}
            </>
          ) : null}
        </Animated.View>

        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: s.x8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: s.x3 },
  close: { paddingVertical: s.x2, paddingLeft: s.x4 },

  figure: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: s.x2,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  figureLabel: { flexShrink: 1 },
  leader: { flex: 1, height: line.hair, backgroundColor: palette.ruleSoft, marginBottom: 4 },
  unit: { marginLeft: 2 },

  strip: { flexDirection: 'row', alignItems: 'flex-end', gap: s.x1, height: 46 },
  stripCol: { flex: 1, justifyContent: 'flex-end' },
  bar: { backgroundColor: palette.amber },
  barEmpty: { backgroundColor: palette.rule },

  achievement: {
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  achievementDesc: { fontSize: 13, lineHeight: 19 }
});
