import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
  Animated,
  RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography, fonts } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import { levelFromXP, calculateXP, rankFromLevel } from '../core/gamification/levels';
import { ACHIEVEMENTS } from '../core/gamification/achievements';
import { calculateStreaks } from '../core/gamification/streaks';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

const MEMBER_SINCE = '2024';

// Circular XP progress ring drawn with Animated Views
function XPRing({
  progress,
  color,
  size = 110
}: {
  progress: number;
  color: string;
  size?: number;
}) {
  const clipped = Math.min(1, Math.max(0, progress));
  // We draw a ring using two half-circle masks — pure View approach
  const borderW = 5;
  const r = size / 2;
  // Degrees for progress
  const deg = clipped * 360;

  return (
    <View
      style={{
        width: size,
        height: size,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {/* Background ring */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: r,
          borderWidth: borderW,
          borderColor: 'rgba(255,255,255,0.08)'
        }}
      />
      {/* Progress fill — left half */}
      {deg >= 180 && (
        <View
          style={{
            position: 'absolute',
            width: size / 2,
            height: size,
            left: 0,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: r,
              borderWidth: borderW,
              borderColor: color,
              position: 'absolute',
              left: 0
            }}
          />
        </View>
      )}
      {/* Progress fill — right half */}
      <View
        style={{
          position: 'absolute',
          width: size / 2,
          height: size,
          right: 0,
          overflow: 'hidden'
        }}
      >
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: r,
              borderWidth: borderW,
              borderColor: color,
              position: 'absolute',
              right: 0
            },
            deg < 180
              ? {
                  transform: [{ rotate: `${deg - 180}deg` }]
                }
              : undefined
          ]}
        />
      </View>
      {/* Mask center to make it a ring, not a filled circle */}
      <View
        style={{
          width: size - borderW * 2 - 4,
          height: size - borderW * 2 - 4,
          borderRadius: r,
          backgroundColor: 'transparent',
          position: 'absolute'
        }}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const [kidsMode, setKidsModeState] = useState(() => collectionsStore.isKidsMode());
  const [refreshing, setRefreshing] = useState(false);
  const [statsVersion, setStatsVersion] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const stats = collectionsStore.getStats();
  const earnedAchievements = collectionsStore.getEarnedAchievements();
  const earnedCount = earnedAchievements.length;
  const totalAchievements = ACHIEVEMENTS.length;

  const streakFlights = stats.firstFlightDate ? [{ date: stats.firstFlightDate }] : [];
  const { currentStreak } = calculateStreaks(streakFlights);

  const xp = calculateXP({
    flightsCompleted: stats.totalFlights,
    poisDiscovered: stats.poisDiscovered,
    achievementsEarned: earnedCount,
    countriesVisited: stats.countriesFlownOver.length,
    distanceKm: stats.totalDistanceKm
  });
  const lvl = levelFromXP(xp);
  const rank = rankFromLevel(lvl.level);

  // Latest earned achievement for featured card
  const featuredAchievement =
    earnedAchievements.length > 0
      ? ACHIEVEMENTS.find((a) => a.id === earnedAchievements[earnedAchievements.length - 1])
      : null;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true
    }).start();
  }, [statsVersion]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setStatsVersion((v) => v + 1);
    setRefreshing(false);
  }, []);

  function toggleKidsMode(val: boolean) {
    collectionsStore.setKidsMode(val);
    setKidsModeState(val);
  }

  const kmFormatted =
    stats.totalDistanceKm >= 1000
      ? `${Math.round(stats.totalDistanceKm / 1000)}k`
      : String(Math.round(stats.totalDistanceKm));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* PASSPORT HERO — full-width gradient with avatar ring */}
      <LinearGradient
        colors={[rank.color + 'CC', rank.color + '44', colors.bg]}
        style={styles.hero}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
      >
        {/* Subtle grid lines — passport feel */}
        <View style={styles.passportLines} pointerEvents="none">
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.passportLine, { top: `${i * 22 + 4}%` as any }]}
            />
          ))}
        </View>

        {/* XP Ring + Avatar */}
        <View style={styles.avatarSection}>
          {/* Simplified ring indicator as border glow */}
          <View
            style={[
              styles.avatarRing,
              {
                borderColor: rank.color,
                shadowColor: rank.color
              }
            ]}
          >
            <Text style={styles.avatarEmoji}>🧑‍✈️</Text>
          </View>

          {/* XP progress arc label */}
          <View style={[styles.xpPill, { backgroundColor: rank.color + '33', borderColor: rank.color + '66' }]}>
            <Text style={[styles.xpPillText, { color: rank.color }]}>
              {lvl.currentLevelXP} / {lvl.nextLevelXP} XP
            </Text>
          </View>
        </View>

        {/* Name + Rank */}
        <Text style={styles.displayName}>{t('profile.guest')}</Text>
        <View style={styles.rankRow}>
          <View style={[styles.rankBadge, { backgroundColor: rank.color }]}>
            <Text style={styles.rankBadgeIcon}>{rank.icon}</Text>
            <Text style={styles.rankBadgeText}>{rank.name}</Text>
          </View>
          <Text style={[styles.levelChip, { color: 'rgba(255,255,255,0.5)' }]}>
            LVL {lvl.level}
          </Text>
        </View>

        {/* Member since — passport stamp style */}
        <Text style={styles.memberSince}>MEMBER SINCE {MEMBER_SINCE}</Text>
      </LinearGradient>

      {/* 3 HERO STATS — tall cards, typography only */}
      <View style={styles.heroStats}>
        <Pressable
          style={styles.heroStatCard}
          onPress={() => nav.navigate('Stats' as any)}
          accessibilityRole="button"
          accessibilityLabel="View flight statistics"
        >
          <Text style={styles.heroStatNumber}>{stats.totalFlights}</Text>
          <Text style={styles.heroStatLabel}>FLIGHTS</Text>
        </Pressable>

        <Pressable
          style={styles.heroStatCard}
          onPress={() => nav.navigate('Stats' as any)}
          accessibilityRole="button"
          accessibilityLabel="View distance statistics"
        >
          <Text style={styles.heroStatNumber}>{kmFormatted}</Text>
          <Text style={styles.heroStatLabel}>KM</Text>
        </Pressable>

        <Pressable
          style={styles.heroStatCard}
          onPress={() => nav.navigate('Stats' as any)}
          accessibilityRole="button"
          accessibilityLabel="View countries visited"
        >
          <Text style={styles.heroStatNumber}>{stats.countriesFlownOver.length}</Text>
          <Text style={styles.heroStatLabel}>COUNTRIES</Text>
        </Pressable>
      </View>

      {/* CONTINUE YOUR JOURNEY */}
      <Text style={styles.sectionHeader}>CONTINUE YOUR JOURNEY</Text>

      {/* Streak callout */}
      {currentStreak > 0 && (
        <View style={[styles.journeyCard, styles.streakCard]}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <View style={styles.journeyCardText}>
            <Text style={styles.journeyCardTitle}>
              {currentStreak} month{currentStreak !== 1 ? 's' : ''} flying
            </Text>
            <Text style={styles.journeyCardSub}>Keep your streak alive</Text>
          </View>
        </View>
      )}

      {/* Featured achievement */}
      {featuredAchievement && (
        <Pressable
          style={[styles.journeyCard, styles.achievementCard]}
          onPress={() => nav.navigate('Collection')}
          accessibilityRole="button"
          accessibilityLabel={`View achievement: ${featuredAchievement.name}`}
        >
          <Text style={styles.achievementIcon}>{featuredAchievement.icon}</Text>
          <View style={styles.journeyCardText}>
            <Text style={styles.journeyCardTitle}>{featuredAchievement.name}</Text>
            <Text style={styles.journeyCardSub}>{featuredAchievement.description}</Text>
          </View>
          <Text style={styles.journeyCardChevron}>›</Text>
        </Pressable>
      )}

      {/* Year Wrapped CTA */}
      <Pressable
        onPress={() => nav.navigate('Wrapped')}
        accessibilityRole="button"
        accessibilityLabel="View your year wrapped"
      >
        <LinearGradient
          colors={['#7C3AED', '#2563EB', '#0EA5E9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.wrappedCard}
        >
          <View>
            <Text style={styles.wrappedLabel}>YOUR YEAR IN FLIGHT</Text>
            <Text style={styles.wrappedTitle}>2024 Wrapped</Text>
            <Text style={styles.wrappedSub}>See your year at 35,000 ft</Text>
          </View>
          <Text style={styles.wrappedArrow}>→</Text>
        </LinearGradient>
      </Pressable>

      {/* MENU — minimal text + chevron */}
      <Text style={styles.sectionHeader}>EXPLORE</Text>
      <View style={styles.menuList}>
        {[
          { label: t('profile.myCollection'), route: 'Collection', note: `${earnedCount}/${totalAchievements} earned` },
          { label: 'Leaderboard', route: 'Leaderboard', note: undefined },
          { label: t('profile.inviteFriends'), route: 'Referral', note: undefined },
          { label: t('profile.settings'), route: 'Settings', note: undefined }
        ].map((item, idx, arr) => (
          <View key={item.route}>
            <Pressable
              style={styles.menuRow}
              onPress={() => nav.navigate(item.route as any)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={styles.menuRowLeft}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.note && <Text style={styles.menuNote}>{item.note}</Text>}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            {idx < arr.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>

      {/* Upgrade */}
      <Pressable
        style={styles.upgradeButton}
        onPress={() => nav.navigate('Paywall')}
        accessibilityLabel="Upgrade to Pro"
        accessibilityRole="button"
      >
        <Text style={styles.upgradeText}>{t('profile.upgradeToPro')}</Text>
      </Pressable>

      {/* PARENTAL */}
      <Text style={styles.sectionHeader}>{t('profile.parental')}</Text>
      <View style={styles.menuList}>
        <View style={styles.menuRow}>
          <View style={styles.menuRowLeft}>
            <Text style={styles.menuLabel}>{t('profile.kidsMode')}</Text>
            <Text style={styles.menuNote}>{t('profile.kidsModeDesc')}</Text>
          </View>
          <Switch
            value={kidsMode}
            onValueChange={toggleKidsMode}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.text}
            accessibilityLabel="Toggle kids mode"
          />
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>SkyAtlas · v1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 56 },

  // HERO
  hero: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
    gap: 8,
    overflow: 'hidden'
  },
  passportLines: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0
  },
  passportLine: {
    position: 'absolute',
    left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },

  avatarSection: {
    alignItems: 'center',
    marginBottom: 8
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12
  },
  avatarEmoji: { fontSize: 48 },
  xpPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1
  },
  xpPillText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5
  },

  displayName: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 36,
    letterSpacing: -1,
    textAlign: 'center'
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20
  },
  rankBadgeIcon: { fontSize: 13 },
  rankBadgeText: {
    fontFamily: fonts.bodySemi,
    color: '#000',
    fontSize: 12
  },
  levelChip: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1
  },
  memberSince: {
    fontFamily: fonts.mono,
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 4
  },

  // HERO STATS — 3 tall cards
  heroStats: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 16
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6
  },
  heroStatNumber: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.5
  },
  heroStatLabel: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.8
  },

  // SECTION HEADER
  sectionHeader: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 20
  },

  // JOURNEY CARDS
  journeyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14
  },
  streakCard: {
    backgroundColor: colors.surface,
    borderColor: '#FF6B2B44'
  },
  achievementCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  streakEmoji: { fontSize: 28 },
  achievementIcon: { fontSize: 28 },
  journeyCardText: { flex: 1, gap: 2 },
  journeyCardTitle: {
    fontFamily: fonts.bodySemi,
    color: colors.text,
    fontSize: 15
  },
  journeyCardSub: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
  journeyCardChevron: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 22
  },

  // WRAPPED CTA
  wrappedCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  wrappedLabel: {
    fontFamily: fonts.bodySemi,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 4
  },
  wrappedTitle: {
    fontFamily: fonts.display,
    color: '#FFFFFF',
    fontSize: 26,
    letterSpacing: -0.8
  },
  wrappedSub: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    marginTop: 2
  },
  wrappedArrow: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.8)'
  },

  // MENU LIST
  menuList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginHorizontal: 16
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  menuRowLeft: { flex: 1, gap: 2 },
  menuLabel: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 15
  },
  menuNote: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12
  },
  chevron: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 22
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 18
  },

  // UPGRADE
  upgradeButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12
  },
  upgradeText: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
    fontSize: 16
  },

  // FOOTER
  footer: {
    alignItems: 'center',
    paddingVertical: 20
  },
  footerText: {
    fontFamily: fonts.mono,
    color: colors.textDim,
    fontSize: 11,
    letterSpacing: 0.5
  }
});
