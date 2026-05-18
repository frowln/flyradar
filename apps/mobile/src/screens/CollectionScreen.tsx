import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import { ACHIEVEMENTS } from '../core/gamification/achievements';

type Tab = 'countries' | 'achievements' | 'stats';

export default function CollectionScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('achievements');

  const stats = collectionsStore.getStats();
  const earnedIds = new Set(collectionsStore.getEarnedAchievements());

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TabButton label="Achievements" tab="achievements" active={activeTab} onPress={setActiveTab} />
        <TabButton label="Countries" tab="countries" active={activeTab} onPress={setActiveTab} />
        <TabButton label="Stats" tab="stats" active={activeTab} onPress={setActiveTab} />
      </View>

      {activeTab === 'achievements' && (
        <AchievementsTab earnedIds={earnedIds} />
      )}
      {activeTab === 'countries' && (
        <CountriesTab countries={stats.countriesFlownOver} />
      )}
      {activeTab === 'stats' && (
        <StatsTab stats={stats} earnedCount={earnedIds.size} />
      )}
    </View>
  );
}

function TabButton({
  label, tab, active, onPress
}: {
  label: string;
  tab: Tab;
  active: Tab;
  onPress: (t: Tab) => void;
}) {
  const isActive = tab === active;
  return (
    <Pressable
      style={[styles.tabButton, isActive && styles.tabButtonActive]}
      onPress={() => onPress(tab)}
    >
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function AchievementsTab({ earnedIds }: { earnedIds: Set<string> }) {
  return (
    <FlatList
      data={ACHIEVEMENTS}
      keyExtractor={(a) => a.id}
      numColumns={2}
      contentContainerStyle={styles.achievGrid}
      columnWrapperStyle={styles.achievRow}
      renderItem={({ item }) => {
        const earned = earnedIds.has(item.id);
        return (
          <View style={[styles.achievCard, !earned && styles.achievCardLocked]}>
            <Text style={[styles.achievIcon, !earned && styles.achievIconLocked]}>
              {earned ? item.icon : '🔒'}
            </Text>
            <Text style={[styles.achievName, !earned && styles.achievNameLocked]} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.achievDesc} numberOfLines={2}>{item.description}</Text>
          </View>
        );
      }}
    />
  );
}

function CountriesTab({ countries }: { countries: string[] }) {
  if (countries.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={[typography.h3, { textAlign: 'center' }]}>No countries yet</Text>
        <Text style={[typography.body, styles.emptyText]}>
          Start your first flight to collect countries you fly over.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.countriesList}>
      <Text style={styles.countriesCount}>{countries.length} countries visited</Text>
      {[...countries].sort().map((country) => (
        <View key={country} style={styles.countryRow}>
          <Text style={styles.countryFlag}>🌍</Text>
          <Text style={styles.countryName}>{country}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function StatsTab({ stats, earnedCount }: { stats: ReturnType<typeof collectionsStore.getStats>; earnedCount: number }) {
  return (
    <ScrollView contentContainerStyle={styles.statsList}>
      <StatRow label="Total Flights" value={stats.totalFlights.toString()} icon="✈️" />
      <StatRow label="Total Distance" value={`${stats.totalDistanceKm.toLocaleString()} km`} icon="📏" />
      <StatRow label="Places Discovered" value={stats.poisDiscovered.toString()} icon="🗺️" />
      <StatRow label="Countries Flown Over" value={stats.countriesFlownOver.length.toString()} icon="🌍" />
      <StatRow label="Night Flights" value={stats.nightFlights.toString()} icon="🌙" />
      <StatRow label="Longest Flight" value={`${stats.longestFlightHours.toFixed(1)}h`} icon="⏰" />
      <StatRow label="Achievements Earned" value={`${earnedCount} / ${ACHIEVEMENTS.length}`} icon="🏆" />
    </ScrollView>
  );
}

function StatRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 8
  },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabButtonActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabLabelActive: { color: colors.primary },

  achievGrid: { padding: 12, gap: 10 },
  achievRow: { gap: 10 },
  achievCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary + '66',
    alignItems: 'center'
  },
  achievCardLocked: {
    borderColor: colors.border,
    opacity: 0.55
  },
  achievIcon: { fontSize: 28 },
  achievIconLocked: { opacity: 0.4 },
  achievName: {
    color: colors.text, fontSize: 13, fontWeight: '700',
    textAlign: 'center'
  },
  achievNameLocked: { color: colors.textMuted },
  achievDesc: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },

  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  countriesList: { padding: 16, gap: 4 },
  countriesCount: { color: colors.textMuted, fontSize: 13, marginBottom: 10 },
  countryRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  countryFlag: { fontSize: 18 },
  countryName: { color: colors.text, fontSize: 15 },

  statsList: { padding: 16, gap: 0 },
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  statIcon: { fontSize: 20, width: 28 },
  statLabel: { flex: 1, color: colors.textMuted, fontSize: 14 },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '700' }
});
