import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import { levelFromXP, calculateXP, rankFromLevel } from '../core/gamification/levels';
import { ACHIEVEMENTS } from '../core/gamification/achievements';
import { MOCK_USERS } from '../core/social/mockLeaderboard';

const AVATAR_COLORS: [string, string][] = [
  ['#FF6B6B', '#EE5A24'],
  ['#A29BFE', '#6C5CE7'],
  ['#55EFC4', '#00B894'],
  ['#FD79A8', '#E84393'],
  ['#FDCB6E', '#E17055'],
  ['#74B9FF', '#0984E3'],
  ['#FAB1A0', '#E17055'],
  ['#81ECEC', '#00CEC9'],
  ['#B2BEFF', '#6C5CE7'],
  ['#FFEAA7', '#FDCB6E']
];

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

interface LeaderboardEntry {
  id: string;
  name: string;
  level: number;
  country: string;
  flights: number;
  km: number;
  isMe: boolean;
  rank: number;
  avatarColors: [string, string];
  initial: string;
}

export default function LeaderboardScreen() {
  const entries = useMemo<LeaderboardEntry[]>(() => {
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

    const me = {
      id: 'me',
      name: 'You',
      level: lvl.level,
      country: '🌍',
      flights: stats.totalFlights,
      km: Math.round(stats.totalDistanceKm),
      isMe: true
    };

    // Merge me into the sorted list by level
    const allUsers = [...MOCK_USERS, me].sort((a, b) => b.level - a.level);

    return allUsers.map((u, i) => ({
      ...u,
      isMe: u.id === 'me',
      rank: i + 1,
      avatarColors: AVATAR_COLORS[i % AVATAR_COLORS.length],
      initial: u.name.charAt(0).toUpperCase()
    }));
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>🏆 Global Leaderboard</Text>
      <Text style={styles.pageSubtitle}>Top flyers this month</Text>

      <View style={styles.list}>
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </View>

      <Text style={styles.disclaimer}>Rankings are based on level • Updated daily</Text>
    </ScrollView>
  );
}

function EntryRow({ entry }: { entry: LeaderboardEntry }) {
  const rankFromLvl = rankFromLevel(entry.level);

  return (
    <View style={[styles.row, entry.isMe && styles.rowMe]}>
      {/* Rank */}
      <View style={styles.rankCol}>
        {MEDAL[entry.rank] ? (
          <Text style={styles.medal}>{MEDAL[entry.rank]}</Text>
        ) : (
          <Text style={[styles.rankNum, entry.isMe && styles.rankNumMe]}>
            {entry.rank}
          </Text>
        )}
      </View>

      {/* Avatar */}
      <LinearGradient
        colors={entry.avatarColors}
        style={styles.avatar}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.avatarInitial}>{entry.initial}</Text>
      </LinearGradient>

      {/* Name + rank */}
      <View style={styles.nameCol}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, entry.isMe && styles.nameMe]} numberOfLines={1}>
            {entry.isMe ? 'You' : entry.name}
          </Text>
          <Text style={styles.flag}>{entry.country}</Text>
        </View>
        <Text style={[styles.rankLabel, { color: rankFromLvl.color }]}>
          {rankFromLvl.icon} {rankFromLvl.name} • Lv. {entry.level}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsCol}>
        <Text style={[styles.statValue, entry.isMe && styles.statValueMe]}>
          {entry.flights}
        </Text>
        <Text style={styles.statLabel}>flights</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 12 },

  pageTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4
  },

  list: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden'
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rowMe: {
    backgroundColor: `${colors.primary}18`
  },

  rankCol: { width: 32, alignItems: 'center' },
  medal: { fontSize: 22 },
  rankNum: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  rankNumMe: { color: colors.primary },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '800' },

  nameCol: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  nameMe: { color: colors.primary },
  flag: { fontSize: 16 },
  rankLabel: { fontSize: 11, fontWeight: '600' },

  statsCol: { alignItems: 'flex-end', gap: 2 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  statValueMe: { color: colors.primary },
  statLabel: { color: colors.textMuted, fontSize: 10 },

  disclaimer: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4
  }
});
