import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  type RefreshControlProps
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import EmptyState from '../components/EmptyState';
import { ACHIEVEMENTS } from '../core/gamification/achievements';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';

type Tab = 'countries' | 'achievements' | 'stats';

export default function CollectionScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('achievements');
  const [refreshing, setRefreshing] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const stats = collectionsStore.getStats();
  const earnedIds = new Set(collectionsStore.getEarnedAchievements());

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setDataVersion((v) => v + 1);
    setRefreshing(false);
  }, []);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TabButton label={t('collection.achievements')} tab="achievements" active={activeTab} onPress={setActiveTab} />
        <TabButton label={t('collection.countries')} tab="countries" active={activeTab} onPress={setActiveTab} />
        <TabButton label={t('collection.stats')} tab="stats" active={activeTab} onPress={setActiveTab} />
      </View>

      {activeTab === 'achievements' && (
        <AchievementsTab earnedIds={earnedIds} refreshControl={refreshControl} />
      )}
      {activeTab === 'countries' && (
        <CountriesTab countries={stats.countriesFlownOver} refreshControl={refreshControl} />
      )}
      {activeTab === 'stats' && (
        <StatsTab stats={stats} earnedCount={earnedIds.size} onWrappedPress={() => navigation.navigate('Wrapped')} refreshControl={refreshControl} />
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

function AchievementsTab({ earnedIds, refreshControl }: { earnedIds: Set<string>; refreshControl: React.ReactElement<RefreshControlProps> }) {
  return (
    <FlatList
      data={ACHIEVEMENTS}
      keyExtractor={(a) => a.id}
      numColumns={2}
      contentContainerStyle={styles.achievGrid}
      columnWrapperStyle={styles.achievRow}
      refreshControl={refreshControl}
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

function CountriesTab({ countries, refreshControl }: { countries: string[]; refreshControl: React.ReactElement<RefreshControlProps> }) {
  if (countries.length === 0) {
    return (
      <EmptyState
        icon="🌍"
        title={t('collection.noCountriesYet')}
        description={t('collection.noCountriesDesc')}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.countriesList} refreshControl={refreshControl}>
      <Text style={styles.countriesCount}>{t('collection.countriesVisited', { count: countries.length })}</Text>
      {[...countries].sort().map((country) => (
        <View key={country} style={styles.countryRow}>
          <Text style={styles.countryFlag}>🌍</Text>
          <Text style={styles.countryName}>{country}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function StatsTab({ stats, earnedCount, onWrappedPress, refreshControl }: { stats: ReturnType<typeof collectionsStore.getStats>; earnedCount: number; onWrappedPress: () => void; refreshControl: React.ReactElement<RefreshControlProps> }) {
  return (
    <ScrollView contentContainerStyle={styles.statsList} refreshControl={refreshControl}>
      <Pressable style={styles.wrappedBanner} onPress={onWrappedPress}>
        <Text style={styles.wrappedBannerText}>{t('collection.seeYearWrapped')}</Text>
      </Pressable>
      <StatRow label={t('collection.totalFlights')} value={stats.totalFlights.toString()} icon="✈️" />
      <StatRow label={t('collection.totalDistance')} value={`${stats.totalDistanceKm.toLocaleString()} km`} icon="📏" />
      <StatRow label={t('collection.placesDiscovered')} value={stats.poisDiscovered.toString()} icon="🗺️" />
      <StatRow label={t('collection.countriesFlownOver')} value={stats.countriesFlownOver.length.toString()} icon="🌍" />
      <StatRow label={t('collection.nightFlights')} value={stats.nightFlights.toString()} icon="🌙" />
      <StatRow label={t('collection.longestFlight')} value={`${stats.longestFlightHours.toFixed(1)}h`} icon="⏰" />
      <StatRow label={t('collection.achievementsEarned')} value={`${earnedCount} / ${ACHIEVEMENTS.length}`} icon="🏆" />
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

  countriesList: { padding: 16, gap: 4 },
  countriesCount: { color: colors.textMuted, fontSize: 13, marginBottom: 10 },
  countryRow: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  countryFlag: { fontSize: 18 },
  countryName: { color: colors.text, fontSize: 15 },

  wrappedBanner: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  wrappedBannerText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },

  statsList: { padding: 16, gap: 0 },
  statRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  statIcon: { fontSize: 20, width: 28 },
  statLabel: { flex: 1, color: colors.textMuted, fontSize: 14 },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '700' }
});
