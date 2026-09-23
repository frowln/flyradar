import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall } from '../design/type';
import { Screen, Gutter, Row, Cells, Space, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import Stamp from '../components/Stamp';
import { collectionsStore } from '../../src/core/gamification/collections';
import { calculateXP, levelFromXP, rankFromLevel } from '../../src/core/gamification/levels';
import { t } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

/** Shown as outlines so the grid always reads as a set with gaps in it. */
const HORIZON = [
  'SG', 'MY', 'TH', 'IN', 'AF', 'IR', 'TM', 'AZ', 'TR', 'GE',
  'RO', 'HU', 'AT', 'DE', 'BE', 'GB', 'FR', 'ES', 'IT', 'PL'
];

/**
 * A thin rule that fills to show progress. Used instead of a ring: it aligns
 * with the type above it and does not import a second geometric language.
 */
function ProgressRule({ value }: { value: number }) {
  const p = Math.min(1, Math.max(0, value));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${p * 100}%` }]} />
    </View>
  );
}

export default function AtlasScreen() {
  const nav = useNavigation<Nav>();
  const [stats, setStats] = useState(() => collectionsStore.getStats());
  const reveal = useReveal();

  useFocusEffect(
    useCallback(() => {
      setStats(collectionsStore.getStats());
    }, [])
  );

  const xp = calculateXP({
    flightsCompleted: stats.totalFlights,
    poisDiscovered: stats.poisDiscovered,
    countriesVisited: stats.countriesFlownOver.length,
    distanceKm: stats.totalDistanceKm,
    achievementsEarned: collectionsStore.getEarnedAchievements().length
  });
  const level = levelFromXP(xp);
  const rank = rankFromLevel(level.level);

  const collected = new Set(stats.countriesFlownOver);
  const grid = Array.from(new Set([...stats.countriesFlownOver, ...HORIZON])).slice(0, 24);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter>
            <Space h={s.x3} />
            <Label tone="dim">{t('atlas.title')}</Label>
            <Space h={s.x3} />
            <Display>
              {stats.poisDiscovered} {t('atlas.places')}
            </Display>
            <Space h={s.x1} />
            <Body tone="muted">
              {stats.countriesFlownOver.length} {t('atlas.countries')} ·{' '}
              {Math.round(stats.totalDistanceKm).toLocaleString()} {t('atlas.km')}
            </Body>
          </Gutter>

          <Space h={s.x6} />
          <Cells
            items={[
              { value: String(stats.totalFlights), label: t('atlas.flights') },
              { value: String(stats.countriesFlownOver.length), label: t('atlas.countriesShort') },
              { value: String(stats.poisDiscovered), label: t('atlas.placesShort') }
            ]}
          />

          {/* Rank — a line of type and a rule, not a badge. */}
          <Space h={s.x8} />
          <Gutter>
            <Row style={styles.spread}>
              <Label tone="accent">{t(`rank.${rank.id}`)}</Label>
              <DataSmall allowFontScaling={false}>
                {t('atlas.level')} {level.level}
              </DataSmall>
            </Row>
            <Space h={s.x3} />
            <ProgressRule value={level.progress} />
            <Space h={s.x2} />
            <Row style={styles.spread}>
              <DataSmall allowFontScaling={false}>{level.currentLevelXP} XP</DataSmall>
              <DataSmall allowFontScaling={false}>{level.nextLevelXP} XP</DataSmall>
            </Row>
          </Gutter>

          {/* Countries */}
          <Space h={s.x10} />
          <Gutter>
            <Label tone="dim">
              {t('atlas.stamps')} · {stats.countriesFlownOver.length} / 195
            </Label>
          </Gutter>
          <Space h={s.x4} />
          <Gutter>
            <View style={styles.stampGrid}>
              {grid.map((code) => (
                <Stamp key={code} code={code} locked={!collected.has(code)} />
              ))}
            </View>
          </Gutter>

          {/* Everything that used to be a tab lives here as a row. */}
          <Space h={s.x10} />
          <Rule />
          {[
            { label: t('atlas.people'), to: 'People' as const },
            { label: t('atlas.history'), to: 'Stats' as const },
            { label: t('atlas.wrapped'), to: 'Wrapped' as const },
            { label: t('atlas.settings'), to: 'Settings' as const }
          ].map((item) => (
            <PressSurface
              key={item.label}
              onPress={() => nav.navigate(item.to)}
              accessibilityLabel={item.label}
              style={styles.navRow}
            >
              <Body>{item.label}</Body>
              <View style={styles.navFill} />
              <Data tone="dim" allowFontScaling={false}>
                ›
              </Data>
            </PressSurface>
          ))}
        </Animated.View>

        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: s.x8 },
  spread: { justifyContent: 'space-between' },

  progressTrack: { height: 2, backgroundColor: palette.rule },
  progressFill: { height: 2, backgroundColor: palette.amber },

  stampGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x2 },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  navFill: { flex: 1 }
});
