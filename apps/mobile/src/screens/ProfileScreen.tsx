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
import { typography } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import { levelFromXP, calculateXP, rankFromLevel } from '../core/gamification/levels';
import { ACHIEVEMENTS } from '../core/gamification/achievements';
import { calculateStreaks } from '../core/gamification/streaks';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenHex(hex: string): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 60);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 60);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 60);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const MEMBER_SINCE = '2024';

const CONFETTI = ['✈', '⭐', '🌍', '🏆', '✦', '·'];

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const [kidsMode, setKidsModeState] = useState(() => collectionsStore.isKidsMode());
  const [refreshing, setRefreshing] = useState(false);
  const [statsVersion, setStatsVersion] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const stats = collectionsStore.getStats();
  const earnedCount = collectionsStore.getEarnedAchievements().length;
  const totalAchievements = ACHIEVEMENTS.length;
  // Build flight logs from firstFlightDate for streak calculation (simple: use total flights as proxy)
  // Use firstFlightDate if available; streak shows currentStreak from stored stats
  const streakFlights = stats.firstFlightDate
    ? [{ date: stats.firstFlightDate }]
    : [];
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

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: lvl.progress,
      tension: 40,
      friction: 8,
      useNativeDriver: false
    }).start();
  }, [lvl.progress, statsVersion]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // collectionsStore is synchronous MMKV — bump version to re-render fresh stats
    setStatsVersion((v) => v + 1);
    setRefreshing(false);
  }, []);

  function toggleKidsMode(val: boolean) {
    collectionsStore.setKidsMode(val);
    setKidsModeState(val);
  }

  const darkRankColor = darkenHex(rank.color);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
    >
      {/* Hero with gradient */}
      <LinearGradient
        colors={[rank.color, darkRankColor, colors.bg]}
        style={styles.heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        {/* Confetti background pattern */}
        <View style={styles.confettiLayer} pointerEvents="none">
          {CONFETTI.map((char, i) => (
            <Text
              key={i}
              style={[
                styles.confettiChar,
                {
                  top: `${10 + (i * 17) % 70}%` as any,
                  left: `${(i * 23 + 5) % 90}%` as any,
                  fontSize: 12 + (i % 3) * 6,
                  transform: [{ rotate: `${i * 37}deg` }]
                }
              ]}
            >
              {char}
            </Text>
          ))}
        </View>

        {/* Avatar with rank icon overlay */}
        <View style={styles.avatarContainer}>
          <View style={[
            styles.avatarCircle,
            {
              borderColor: rank.color,
              shadowColor: rank.color,
            }
          ]}>
            <Text style={styles.avatarEmoji}>🧑‍✈️</Text>
          </View>
          <View style={[styles.rankIconBadge, { backgroundColor: rank.color }]}>
            <Text style={styles.rankIconText}>{rank.icon}</Text>
          </View>
        </View>

        <Text style={styles.displayName}>{t('profile.guest')}</Text>
        <Text style={[styles.rankName, { color: rank.color }]}>{rank.name}</Text>
        <Text style={styles.levelLabel}>{t('profile.level', { level: lvl.level })}</Text>

        {/* Larger animated XP progress bar */}
        <View style={styles.progressBarOuter}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: rank.color,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%']
                })
              }
            ]}
          />
        </View>
        <Text style={styles.xpLabel}>{lvl.currentLevelXP} / {lvl.nextLevelXP} XP</Text>
        <Text style={styles.memberSince}>Member since {MEMBER_SINCE}</Text>
      </LinearGradient>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{stats.totalFlights}</Text>
          <Text style={styles.statLabel}>{t('profile.flights')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{stats.countriesFlownOver.length}</Text>
          <Text style={styles.statLabel}>{t('profile.countries')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{earnedCount}</Text>
          <Text style={styles.statLabel}>{t('profile.badges')}</Text>
        </View>
      </View>

      {/* Statistics grid */}
      <Text style={styles.sectionHeader}>STATISTICS</Text>
      <View style={styles.statsGrid}>
        {[
          { icon: '✈️', value: String(stats.totalFlights), label: 'Total Flights' },
          { icon: '📏', value: `${Math.round(stats.totalDistanceKm).toLocaleString()}`, label: 'km Flown' },
          { icon: '🌍', value: String(stats.countriesFlownOver.length), label: 'Countries' },
          { icon: '🏆', value: `${earnedCount}/${totalAchievements}`, label: 'Achievements' },
          { icon: '🔥', value: String(currentStreak), label: 'Month Streak' },
          { icon: '📅', value: MEMBER_SINCE, label: 'Member Since' }
        ].map((item) => (
          <LinearGradient
            key={item.label}
            colors={[colors.surfaceElevated, colors.surface]}
            style={styles.statCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.statCardIcon}>{item.icon}</Text>
            <Text style={styles.statCardValue}>{item.value}</Text>
            <Text style={styles.statCardLabel}>{item.label}</Text>
          </LinearGradient>
        ))}
      </View>

      {/* Menu */}
      <Text style={styles.sectionHeader}>{t('profile.myStuff')}</Text>
      <View style={styles.section}>
        <Pressable
          style={styles.menuRow}
          onPress={() => nav.navigate('Collection')}
          accessibilityLabel="Open my collection"
          accessibilityRole="button"
        >
          <Text style={styles.menuIcon}>🏆</Text>
          <Text style={[typography.body, styles.menuLabel]}>{t('profile.myCollection')}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.menuRow}
          onPress={() => nav.navigate('Wrapped')}
          accessibilityLabel="View year in review wrapped"
          accessibilityRole="button"
        >
          <Text style={styles.menuIcon}>🎉</Text>
          <Text style={[typography.body, styles.menuLabel]}>{t('profile.yearWrapped')}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.menuRow}
          onPress={() => nav.navigate('Referral')}
          accessibilityLabel="Invite friends to SkyAtlas"
          accessibilityRole="button"
        >
          <Text style={styles.menuIcon}>🎁</Text>
          <Text style={[typography.body, styles.menuLabel]}>{t('profile.inviteFriends')}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.menuRow}
          onPress={() => nav.navigate('Leaderboard')}
          accessibilityLabel="Open global leaderboard"
          accessibilityRole="button"
        >
          <Text style={styles.menuIcon}>🏆</Text>
          <Text style={[typography.body, styles.menuLabel]}>Leaderboard</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.menuRow}
          onPress={() => nav.navigate('Settings')}
          accessibilityLabel="Open settings"
          accessibilityRole="button"
        >
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={[typography.body, styles.menuLabel]}>{t('profile.settings')}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      {/* Upgrade */}
      <Pressable
        style={styles.upgradeButton}
        onPress={() => nav.navigate('Paywall')}
        accessibilityLabel="Upgrade to Pro"
        accessibilityRole="button"
      >
        <Text style={styles.upgradeIcon}>⭐</Text>
        <Text style={styles.upgradeText}>{t('profile.upgradeToPro')}</Text>
      </Pressable>

      {/* Kids mode */}
      <Text style={styles.sectionHeader}>{t('profile.parental')}</Text>
      <View style={styles.section}>
        <View style={styles.menuRow}>
          <Text style={styles.menuIcon}>🧒</Text>
          <View style={styles.menuLabelGroup}>
            <Text style={[typography.body, styles.menuLabel]}>{t('profile.kidsMode')}</Text>
            <Text style={typography.caption}>{t('profile.kidsModeDesc')}</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 48, gap: 8 },

  heroGradient: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
    gap: 6,
    overflow: 'hidden'
  },

  confettiLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  confettiChar: {
    position: 'absolute',
    color: '#FFFFFF',
    opacity: 0.05
  },

  avatarContainer: {
    position: 'relative',
    marginBottom: 4
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8
  },
  avatarEmoji: { fontSize: 42 },
  rankIconBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.bg
  },
  rankIconText: { fontSize: 16 },

  displayName: { color: colors.text, fontSize: 22, fontWeight: '700' },
  rankName: { fontSize: 14, fontWeight: '600' },
  levelLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },

  progressBarOuter: {
    width: '72%',
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 6
  },
  progressFill: { height: '100%', borderRadius: 5 },
  xpLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  memberSince: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    marginHorizontal: 16
  },
  statCell: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  statDivider: { width: 1, backgroundColor: colors.border },

  sectionHeader: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 2,
    marginLeft: 20
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginHorizontal: 16
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12
  },
  menuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuLabel: { flex: 1, color: colors.text },
  menuLabelGroup: { flex: 1, gap: 2 },
  chevron: { color: colors.textMuted, fontSize: 20 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 56 },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginHorizontal: 16
  },
  statCard: {
    width: '47%',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border
  },
  statCardIcon: { fontSize: 24 },
  statCardValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  statCardLabel: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },

  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
    marginTop: 4,
    marginHorizontal: 16
  },
  upgradeIcon: { fontSize: 18 },
  upgradeText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});
