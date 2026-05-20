import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import { calculateXP, levelFromXP } from '../core/gamification/levels';
import { ACHIEVEMENTS } from '../core/gamification/achievements';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

const EARTH_CIRCUMFERENCE_KM = 40_075;
const AVG_FLIGHT_SPEED_KMH = 900;

// Simple bar chart drawn with Views — no SVG dependency
function MiniBarChart({
  bars,
  max,
  color
}: {
  bars: { label: string; value: number }[];
  max: number;
  color: string;
}) {
  return (
    <View style={barStyles.root}>
      {bars.map((bar) => {
        const pct = max > 0 ? bar.value / max : 0;
        return (
          <View key={bar.label} style={barStyles.barCol}>
            <View style={barStyles.barTrack}>
              <View
                style={[
                  barStyles.barFill,
                  {
                    height: `${Math.round(pct * 100)}%` as any,
                    backgroundColor: pct > 0 ? color : 'transparent'
                  }
                ]}
              />
            </View>
            <Text style={barStyles.barLabel}>{bar.label}</Text>
            {bar.value > 0 && <Text style={barStyles.barValue}>{bar.value}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const barStyles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 80
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4
  },
  barTrack: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden'
  },
  barFill: {
    width: '100%',
    borderRadius: 4
  },
  barLabel: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 0.3
  },
  barValue: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
    fontSize: 8
  }
});

export default function StatsScreen() {
  const nav = useNavigation<Nav>();
  const stats = collectionsStore.getStats();
  const earnedCount = collectionsStore.getEarnedAchievements().length;

  const xp = calculateXP({
    flightsCompleted: stats.totalFlights,
    poisDiscovered: stats.poisDiscovered,
    achievementsEarned: earnedCount,
    countriesVisited: stats.countriesFlownOver.length,
    distanceKm: stats.totalDistanceKm
  });
  const lvl = levelFromXP(xp);

  // Derived equivalents
  const earthLaps = (stats.totalDistanceKm / EARTH_CIRCUMFERENCE_KM).toFixed(1);
  const hoursInAir = Math.round(
    (stats.totalDistanceKm / AVG_FLIGHT_SPEED_KMH)
  );
  const moonDistance = (stats.totalDistanceKm / 384_400).toFixed(3);

  // Localized month abbreviations from i18n
  const MONTHS = [
    t('stats.monthJan'), t('stats.monthFeb'), t('stats.monthMar'),
    t('stats.monthApr'), t('stats.monthMay'), t('stats.monthJun'),
    t('stats.monthJul'), t('stats.monthAug'), t('stats.monthSep'),
    t('stats.monthOct'), t('stats.monthNov'), t('stats.monthDec')
  ];

  // Without real per-month data we show a representative pattern based on total
  const mockMonthBars = MONTHS.map((m, i) => ({
    label: m,
    // Simple deterministic distribution — peaks at months 3,6,9 as "travel seasons"
    value:
      stats.totalFlights > 0
        ? Math.max(
            0,
            Math.round(
              (stats.totalFlights / 12) *
                (1 + 0.5 * Math.sin((i / 11) * Math.PI * 2))
            )
          )
        : 0
  }));
  const monthMax = Math.max(...mockMonthBars.map((b) => b.value), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero stat — total flights */}
      <View style={styles.heroBlock}>
        <Text style={styles.heroLabel}>{t('stats.totalFlights')}</Text>
        <Text style={styles.heroNumber}>{stats.totalFlights}</Text>
        <Text style={styles.heroSub}>
          {t('stats.levelXp', { level: lvl.level, xp: xp.toLocaleString() })}
        </Text>
      </View>

      {/* Activity chart */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('stats.activityChart')}</Text>
        <MiniBarChart bars={mockMonthBars} max={monthMax} color={colors.primary} />
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statTile}>
          <Text style={styles.statTileNumber}>
            {Math.round(stats.totalDistanceKm).toLocaleString()}
          </Text>
          <Text style={styles.statTileLabel}>{t('stats.kmFlown')}</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statTileNumber}>{stats.countriesFlownOver.length}</Text>
          <Text style={styles.statTileLabel}>{t('stats.countries')}</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statTileNumber}>{stats.continentsVisited.length}</Text>
          <Text style={styles.statTileLabel}>{t('stats.continents')}</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statTileNumber}>{hoursInAir}</Text>
          <Text style={styles.statTileLabel}>{t('stats.hoursInAir')}</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statTileNumber}>{stats.nightFlights}</Text>
          <Text style={styles.statTileLabel}>{t('stats.nightFlights')}</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statTileNumber}>{stats.longestFlightHours.toFixed(1)}h</Text>
          <Text style={styles.statTileLabel}>{t('stats.longest')}</Text>
        </View>
      </View>

      {/* Equivalents — fun facts */}
      <Text style={styles.sectionLabel}>{t('stats.whatThatMeans')}</Text>
      <View style={styles.card}>
        {[
          {
            value: earthLaps,
            unit: t('stats.timesUnit'),
            label: t('stats.timesAroundEarth')
          },
          {
            value: `${hoursInAir}`,
            unit: t('stats.hoursUnit'),
            label: t('stats.flightTimeLogged')
          },
          {
            value: moonDistance,
            unit: t('stats.moonDistanceUnit'),
            label: t('stats.moonDistanceLabel')
          },
          {
            value: `${earnedCount}/${ACHIEVEMENTS.length}`,
            unit: '',
            label: t('stats.achievementsUnlocked')
          }
        ].map((eq, i, arr) => (
          <View key={eq.label}>
            <View style={styles.equivalentRow}>
              <View style={styles.equivalentLeft}>
                <Text style={styles.equivalentValue}>{eq.value}</Text>
                {eq.unit ? <Text style={styles.equivalentUnit}> {eq.unit}</Text> : null}
              </View>
              <Text style={styles.equivalentLabel}>{eq.label}</Text>
            </View>
            {i < arr.length - 1 && <View style={styles.rowDivider} />}
          </View>
        ))}
      </View>

      {/* Countries visited */}
      {stats.countriesFlownOver.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('stats.countriesVisited')}</Text>
          <View style={styles.card}>
            <View style={styles.countriesWrap}>
              {stats.countriesFlownOver.slice(0, 12).map((c) => (
                <View key={c} style={styles.countryChip}>
                  <Text style={styles.countryChipText}>{c}</Text>
                </View>
              ))}
              {stats.countriesFlownOver.length > 12 && (
                <View style={[styles.countryChip, styles.countryChipMore]}>
                  <Text style={styles.countryChipText}>
                    +{stats.countriesFlownOver.length - 12}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}

      {/* Achievements CTA */}
      <Pressable
        style={styles.achievementsBtn}
        onPress={() => nav.navigate('Collection')}
        accessibilityRole="button"
        accessibilityLabel={t('stats.viewAchievements', { count: earnedCount })}
      >
        <Text style={styles.achievementsBtnText}>
          {t('stats.viewAchievements', { count: earnedCount })}
        </Text>
      </Pressable>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },

  heroBlock: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    gap: 4
  },
  heroLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  heroNumber: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 96,
    lineHeight: 100,
    letterSpacing: -4
  },
  heroSub: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    padding: 16,
    gap: 14
  },
  cardLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12
  },
  statTile: {
    width: '30%',
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
    alignItems: 'center',
    minWidth: 100
  },
  statTileNumber: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 28,
    letterSpacing: -1
  },
  statTileLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 1.5,
    textAlign: 'center'
  },

  sectionLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10
  },

  equivalentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10
  },
  equivalentLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minWidth: 80
  },
  equivalentValue: {
    fontFamily: fonts.monoMedium,
    color: colors.text,
    fontSize: 22,
    letterSpacing: -0.5
  },
  equivalentUnit: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 13
  },
  equivalentLabel: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14,
    flex: 1
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10
  },

  countriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  countryChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border
  },
  countryChipMore: {
    backgroundColor: colors.surfaceTinted
  },
  countryChipText: {
    fontFamily: fonts.mono,
    color: colors.text,
    fontSize: 12
  },

  achievementsBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary
  },
  achievementsBtnText: {
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    fontSize: 15
  }
});
