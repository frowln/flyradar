import { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Body, Small, DataSmall, Title } from '../design/type';
import { Screen, Gutter, Row, Space, PressSurface, textHitSlop } from '../design/layout';
import { getRecords } from '../../src/core/game/journal';
import { buildPassport } from '../../src/core/game/passport';
import { achievementStates, type AchievementGroup } from '../../src/core/game/achievements';
import { continentOf } from '../../src/core/flight/controller';
import { formatInt } from '../../src/core/units';
import { t } from '../../src/i18n';

const GROUPS: AchievementGroup[] = ['journey', 'globe', 'sky', 'eyes'];

/** Every achievement, with how far each one is — never a wall of locks. */
export default function AchievementsScreen() {
  const nav = useNavigation();
  const states = useMemo(() => achievementStates(buildPassport(getRecords(), continentOf)), []);
  const earned = states.filter((a) => a.earned).length;

  return (
    <Screen>
      <View style={styles.top}>
        <PressSurface onPress={() => nav.goBack()} accessibilityLabel={t('common.back')} hitSlop={textHitSlop} style={styles.back}>
          <Label tone="muted">{`‹ ${t('common.back')}`}</Label>
        </PressSurface>
        <DataSmall allowFontScaling={false} accessibilityLabel={t('a11y.of', { n: earned, total: states.length })}>
          {`${earned} / ${states.length}`}
        </DataSmall>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Gutter>
          <Space h={s.x4} />
          <Title accessibilityRole="header">{t('achievements.title')}</Title>
          <Space h={s.x2} />
          <Small>{t('achievements.subtitle')}</Small>
        </Gutter>
        {GROUPS.map((g) => (
          <View key={g}>
            <Gutter style={styles.section}>
              <Label tone="dim" accessibilityRole="header">{t(`achievements.group_${g}`)}</Label>
            </Gutter>
            {states
              .filter((a) => a.def.group === g)
              .map((a) => (
                <View
                  key={a.def.id}
                  style={[styles.row, a.earned && styles.rowEarned]}
                  // "Regular, 3 of 10, Complete 10 flights" — not a star glyph and a slash.
                  accessible
                  accessibilityLabel={[
                    t(`ach.${a.def.id}.name`),
                    a.earned
                      ? t('a11y.earned')
                      : t('a11y.of', { n: formatInt(Math.floor(a.value)), total: formatInt(a.def.target) }),
                    t(`ach.${a.def.id}.desc`)
                  ].join(', ')}
                >
                  <Row style={styles.spread}>
                    <Body tone={a.earned ? 'brass' : 'default'} style={styles.flex}>
                      {t(`ach.${a.def.id}.name`)}
                    </Body>
                    <DataSmall tone={a.earned ? 'brass' : 'muted'} allowFontScaling={false}>
                      {a.earned ? '★' : `${formatInt(Math.floor(a.value))} / ${formatInt(a.def.target)}`}
                    </DataSmall>
                  </Row>
                  <Space h={s.x1} />
                  <Small>{t(`ach.${a.def.id}.desc`)}</Small>
                  {!a.earned ? (
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${a.progress * 100}%` }]} />
                    </View>
                  ) : null}
                </View>
              ))}
          </View>
        ))}
        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spread: { justifyContent: 'space-between' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  back: { paddingVertical: s.x1, paddingRight: s.x4 },
  scroll: { paddingBottom: s.x8 },
  section: { paddingTop: s.x8, paddingBottom: s.x3 },
  row: { paddingHorizontal: gutter, paddingVertical: s.x3, borderTopWidth: line.hair, borderTopColor: palette.ruleSoft },
  rowEarned: { backgroundColor: palette.warm },
  track: { height: 2, backgroundColor: palette.rule, marginTop: s.x2 },
  fill: { height: 2, backgroundColor: palette.amber }
});
