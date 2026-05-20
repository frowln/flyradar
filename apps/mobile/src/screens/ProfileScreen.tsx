import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import { levelFromXP, calculateXP, rankFromLevel } from '../core/gamification/levels';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const [kidsMode, setKidsModeState] = useState(() => collectionsStore.isKidsMode());

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
  const rank = rankFromLevel(lvl.level);

  function toggleKidsMode(val: boolean) {
    collectionsStore.setKidsMode(val);
    setKidsModeState(val);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={[styles.avatarCircle, { borderColor: rank.color }]}>
          <Text style={styles.avatarIcon}>{rank.icon}</Text>
        </View>
        <Text style={styles.displayName}>Guest</Text>
        <Text style={[styles.rankName, { color: rank.color }]}>{rank.name}</Text>
        <Text style={styles.levelLabel}>Level {lvl.level}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${lvl.progress * 100}%` as any, backgroundColor: rank.color }]} />
        </View>
        <Text style={styles.xpLabel}>{lvl.currentLevelXP} / {lvl.nextLevelXP} XP</Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{stats.totalFlights}</Text>
          <Text style={styles.statLabel}>Flights</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{stats.countriesFlownOver.length}</Text>
          <Text style={styles.statLabel}>Countries</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{earnedCount}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
      </View>

      {/* Menu */}
      <Text style={styles.sectionHeader}>My Stuff</Text>
      <View style={styles.section}>
        <Pressable style={styles.menuRow} onPress={() => nav.navigate('Collection')}>
          <Text style={styles.menuIcon}>🏆</Text>
          <Text style={[typography.body, styles.menuLabel]}>My Collection</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.menuRow} onPress={() => nav.navigate('Wrapped')}>
          <Text style={styles.menuIcon}>🎉</Text>
          <Text style={[typography.body, styles.menuLabel]}>Year Wrapped</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.menuRow} onPress={() => nav.navigate('Referral')}>
          <Text style={styles.menuIcon}>🎁</Text>
          <Text style={[typography.body, styles.menuLabel]}>Invite Friends</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.menuRow} onPress={() => nav.navigate('Settings')}>
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={[typography.body, styles.menuLabel]}>Settings</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      {/* Upgrade */}
      <Pressable style={styles.upgradeButton} onPress={() => nav.navigate('Paywall')}>
        <Text style={styles.upgradeIcon}>⭐</Text>
        <Text style={styles.upgradeText}>Upgrade to Pro</Text>
      </Pressable>

      {/* Kids mode */}
      <Text style={styles.sectionHeader}>Parental</Text>
      <View style={styles.section}>
        <View style={styles.menuRow}>
          <Text style={styles.menuIcon}>🧒</Text>
          <View style={styles.menuLabelGroup}>
            <Text style={[typography.body, styles.menuLabel]}>Kids Mode</Text>
            <Text style={typography.caption}>Hides mature POI content</Text>
          </View>
          <Switch
            value={kidsMode}
            onValueChange={toggleKidsMode}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 8 },

  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
    gap: 6
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  avatarIcon: { fontSize: 36 },
  displayName: { color: colors.text, fontSize: 22, fontWeight: '700' },
  rankName: { fontSize: 14, fontWeight: '600' },
  levelLabel: { color: colors.textMuted, fontSize: 13 },
  progressBar: {
    width: '60%',
    height: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4
  },
  progressFill: { height: '100%', borderRadius: 3 },
  xpLabel: { color: colors.textMuted, fontSize: 12 },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16
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
    marginLeft: 4
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden'
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

  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
    marginTop: 4
  },
  upgradeIcon: { fontSize: 18 },
  upgradeText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});
