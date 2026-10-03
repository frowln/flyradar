import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { POICategory } from '@skyatlas/shared';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall, Title, Small, typeStyles } from '../design/type';
import { Screen, Gutter, Row, Cells, Space, PressSurface, Rule, textHitSlop } from '../design/layout';
import { useReveal } from '../motion';
import Stamp from '../components/Stamp';
import FlightsMap, { type MapFlight } from '../components/FlightsMap';
import { airportByIata } from '../../src/core/data/datasets';
import { getRecords } from '../../src/core/game/journal';
import { buildPassport } from '../../src/core/game/passport';
import { totalXP, levelFromXP, rankFor } from '../../src/core/game/xp';
import { achievementStates, ACHIEVEMENTS } from '../../src/core/game/achievements';
import { continentOf } from '../../src/core/flight/controller';
import type { FlightRecord } from '../../src/core/game/types';
import type { GlobeLine } from '../../src/core/geo/lines';
import { countryName } from '../../src/core/places/names';
import { formatInt, km } from '../../src/core/units';
import { t, getLocale } from '../../src/i18n';
import { dayMonth } from '../format';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LINES: GlobeLine[] = ['equator', 'dateline', 'arctic_circle', 'tropic_cancer', 'tropic_capricorn', 'antarctic_circle'];
const COLLECTIONS: POICategory[] = [
  'mountain',
  'volcano',
  'range',
  'glacier',
  'sea',
  'lake',
  'river',
  'island',
  'peninsula',
  'desert',
  'plateau',
  'city'
];

function Bar({ value }: { value: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.min(1, Math.max(0, value)) * 100}%` }]} />
    </View>
  );
}

export default function AtlasScreen() {
  const nav = useNavigation<Nav>();
  const reveal = useReveal();
  const locale = getLocale();
  const [records, setRecords] = useState<FlightRecord[]>(() => getRecords());

  useFocusEffect(
    useCallback(() => {
      setRecords([...getRecords()]);
    }, [])
  );

  const passport = useMemo(() => buildPassport(records, continentOf), [records]);
  const { width } = useWindowDimensions();
  // Every flight as an arc; the airports come from the bundled list.
  const mapFlights = useMemo(
    () =>
      records.flatMap((r): MapFlight[] => {
        const a = airportByIata(r.from);
        const b = airportByIata(r.to);
        return a && b ? [{ from: a, to: b }] : [];
      }),
    [records]
  );
  const xp = useMemo(() => totalXP(records), [records]);
  const level = levelFromXP(xp);
  const rank = rankFor(level.level);
  const states = useMemo(() => achievementStates(passport), [passport]);
  const earned = states.filter((a) => a.earned).length;
  const upcoming = states
    .filter((a) => !a.earned)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);
  const dist = km(passport.distanceKm);
  const hours = Math.round(passport.airborneS / 3600);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter>
            <Space h={s.x3} />
            <Row style={styles.spread}>
              <Label tone="dim" accessibilityRole="header">{t('atlas.title')}</Label>
              <PressSurface onPress={() => nav.navigate('Settings')} accessibilityLabel={t('atlas.settings')} hitSlop={textHitSlop} style={styles.settings}>
                <Label tone="muted">{t('atlas.settings')}</Label>
              </PressSurface>
            </Row>
            <Space h={s.x4} />
            <Display>{t('atlas.countriesBig', { count: passport.countries.length })}</Display>
            <Space h={s.x1} />
            <Body tone="muted">
              {t('atlas.summary', { flights: passport.flights, dist: dist.value, unit: t(`unit.${dist.unit}`), hours })}
            </Body>
          </Gutter>

          <Space h={s.x5} />
          <FlightsMap flights={mapFlights} visited={passport.countries} width={width} height={Math.round(width * 0.56)} />

          <Space h={s.x6} />
          <Gutter>
            <Row style={styles.spread}>
              <Title tone="accent">{t(`rank.${rank}`)}</Title>
              <DataSmall allowFontScaling={false}>{t('atlas.level', { n: level.level })}</DataSmall>
            </Row>
            <Space h={s.x3} />
            <Bar value={level.progress} />
            <Space h={s.x2} />
            <Row style={styles.spread}>
              <DataSmall allowFontScaling={false}>{`${formatInt(xp)} XP`}</DataSmall>
              <DataSmall style={typeStyles.shrink}>{t('atlas.toNext', { xp: formatInt(level.span - level.into) })}</DataSmall>
            </Row>
          </Gutter>

          <Space h={s.x6} />
          <Cells
            items={[
              { value: String(passport.flights), label: t('atlas.flights') },
              { value: String(passport.landed.length), label: t('atlas.landed') },
              { value: String(passport.places), label: t('atlas.places') },
              { value: String(passport.spotted), label: t('atlas.spotted'), tone: 'accent' }
            ]}
          />

          <Gutter style={styles.section}>
            <Row style={styles.spread}>
              <Label tone="dim" accessibilityRole="header">{t('atlas.stamps')}</Label>
              <DataSmall allowFontScaling={false} accessibilityLabel={t('a11y.of', { n: passport.countries.length, total: 195 })}>
                {`${passport.countries.length} / 195`}
              </DataSmall>
            </Row>
          </Gutter>
          <Gutter>
            {passport.countries.length === 0 ? (
              <>
                <View style={styles.stamps}>
                  {['?', '?', '?', '?'].map((c, i) => (
                    <Stamp key={i} code={c} kind="locked" />
                  ))}
                </View>
                <Space h={s.x3} />
                <Small>{t('atlas.stampsEmpty')}</Small>
              </>
            ) : (
              <>
                <View style={styles.stamps}>
                  {passport.countries.map((cc) => (
                    <Stamp key={cc} code={cc} name={countryName(cc, locale)} kind={passport.landed.includes(cc) ? 'landed' : 'overflown'} />
                  ))}
                </View>
                <Space h={s.x3} />
                <Small>{t('atlas.stampsLegend')}</Small>
              </>
            )}
          </Gutter>

          <Gutter style={styles.section}>
            <Label tone="dim" accessibilityRole="header">{t('atlas.lines')}</Label>
          </Gutter>
          {LINES.map((l) => {
            const n = passport.lines[l] ?? 0;
            return (
              <View
                key={l}
                style={[styles.row, n > 0 && styles.rowOn]}
                accessible
                accessibilityLabel={`${t(`line.${l}`)}, ${n > 0 ? t('a11y.crossed', { count: n }) : t('a11y.notCrossed')}`}
              >
                <View style={[styles.linePip, n > 0 && styles.linePipOn]} />
                <Body tone={n > 0 ? 'default' : 'dim'} style={styles.flex}>
                  {t(`line.${l}`)}
                </Body>
                <DataSmall tone={n > 0 ? 'brass' : 'dim'} allowFontScaling={false}>
                  {n > 0 ? `× ${n}` : '—'}
                </DataSmall>
              </View>
            );
          })}

          <Gutter style={styles.section}>
            <Row style={styles.spread}>
              <Label tone="dim" accessibilityRole="header">{t('atlas.collections')}</Label>
              <DataSmall allowFontScaling={false}>{t('atlas.collectionsLegend')}</DataSmall>
            </Row>
          </Gutter>
          <View style={styles.grid}>
            {COLLECTIONS.map((c) => {
              const tally = passport.byCategory[c] ?? { passed: 0, spotted: 0 };
              return (
                <View
                  key={c}
                  style={styles.cell}
                  accessible
                  accessibilityLabel={`${t(`categoryPlural.${c}`)}: ${tally.passed}${
                    tally.spotted ? `, ${t('atlas.spotted')} ${tally.spotted}` : ''
                  }`}
                >
                  <Row gap={s.x2}>
                    <Data tone={tally.passed ? 'default' : 'dim'}>
                      {String(tally.passed)}
                    </Data>
                    {tally.spotted ? (
                      <DataSmall tone="brass" allowFontScaling={false}>{`★ ${tally.spotted}`}</DataSmall>
                    ) : null}
                  </Row>
                  <Label tone={tally.passed ? 'muted' : 'dim'} numberOfLines={1}>
                    {t(`categoryPlural.${c}`)}
                  </Label>
                </View>
              );
            })}
          </View>

          <Gutter style={styles.section}>
            <Row style={styles.spread}>
              <Label tone="dim" accessibilityRole="header">{t('atlas.achievements')}</Label>
              <DataSmall allowFontScaling={false} accessibilityLabel={t('a11y.of', { n: earned, total: ACHIEVEMENTS.length })}>
                {`${earned} / ${ACHIEVEMENTS.length}`}
              </DataSmall>
            </Row>
          </Gutter>
          {upcoming.map((a) => (
            <View
              key={a.def.id}
              style={styles.achRow}
              accessible
              accessibilityLabel={[
                t(`ach.${a.def.id}.name`),
                t('a11y.of', { n: formatInt(Math.floor(a.value)), total: formatInt(a.def.target) }),
                t(`ach.${a.def.id}.desc`)
              ].join(', ')}
            >
              <Row style={styles.spread}>
                <Body style={styles.flex}>{t(`ach.${a.def.id}.name`)}</Body>
                <DataSmall allowFontScaling={false}>{`${formatInt(Math.floor(a.value))} / ${formatInt(a.def.target)}`}</DataSmall>
              </Row>
              <Space h={s.x1} />
              <Small>{t(`ach.${a.def.id}.desc`)}</Small>
              <Space h={s.x2} />
              <Bar value={a.progress} />
            </View>
          ))}
          <PressSurface onPress={() => nav.navigate('Achievements')} accessibilityLabel={t('atlas.allAchievements')} style={styles.navRow}>
            <Body>{t('atlas.allAchievements')}</Body>
            <View style={styles.flex} />
            <Data tone="dim" allowFontScaling={false}>
              ›
            </Data>
          </PressSurface>

          <Gutter style={styles.section}>
            <Label tone="dim" accessibilityRole="header">{t('atlas.journal')}</Label>
          </Gutter>
          {records.length === 0 ? (
            <Gutter>
              <Small>{t('atlas.journalEmpty')}</Small>
            </Gutter>
          ) : (
            [...records].reverse().map((r) => (
              <PressSurface
                key={r.flightId}
                onPress={() => nav.navigate('FlightSummary', { flightId: r.flightId })}
                accessibilityLabel={[
                  `${r.from} — ${r.to}`,
                  dayMonth(r.takeoffAt),
                  t('atlas.journalCountries', { count: r.countries.length }),
                  r.spotted.length ? `${t('atlas.spotted')} ${r.spotted.length}` : null
                ]
                  .filter(Boolean)
                  .join(', ')}
                style={styles.journalRow}
              >
                <DataSmall allowFontScaling={false} style={styles.journalDate}>
                  {dayMonth(r.takeoffAt)}
                </DataSmall>
                <Body style={styles.flex}>{`${r.from} — ${r.to}`}</Body>
                <DataSmall style={typeStyles.trailing}>
                  {t('atlas.journalCountries', { count: r.countries.length })}
                  {r.spotted.length ? ` · ★ ${r.spotted.length}` : ''}
                </DataSmall>
              </PressSurface>
            ))
          )}

          <Space h={s.x8} />
          <Rule />
          <PressSurface onPress={() => nav.navigate('Settings')} accessibilityLabel={t('atlas.settings')} style={styles.navRow}>
            <Body>{t('atlas.settings')}</Body>
            <View style={styles.flex} />
            <Data tone="dim" allowFontScaling={false}>
              ›
            </Data>
          </PressSurface>
        </Animated.View>
        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spread: { justifyContent: 'space-between' },
  scroll: { paddingBottom: s.x8 },
  settings: { paddingVertical: s.x1, paddingLeft: s.x4 },
  section: { paddingTop: s.x10, paddingBottom: s.x3 },

  track: { height: 2, backgroundColor: palette.rule },
  fill: { height: 2, backgroundColor: palette.amber },

  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  rowOn: { backgroundColor: palette.warm },
  linePip: { width: 10, height: 2, backgroundColor: palette.rule },
  linePipOn: { backgroundColor: palette.brass },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: line.hair,
    borderLeftWidth: line.hair,
    borderColor: palette.rule,
    marginHorizontal: gutter
  },
  cell: {
    width: '33.333%',
    paddingHorizontal: s.x3,
    paddingVertical: s.x3,
    borderRightWidth: line.hair,
    borderBottomWidth: line.hair,
    borderColor: palette.rule,
    gap: s.x1
  },

  achRow: {
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  journalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  journalDate: { width: 60 }
});
