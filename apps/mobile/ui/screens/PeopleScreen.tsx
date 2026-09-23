import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall, Title } from '../design/type';
import { Screen, Gutter, Space, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import { social, type LeaderboardEntry, type PublicStats } from '../../src/core/api/social';
import { t } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'People'>;

interface Friend {
  id: string;
  handle: string | null;
  avatarUrl: string | null;
  stats: PublicStats;
}

/**
 * The board, and the people on it.
 *
 * Ranks are set in the mono face at the same size as every other reading in the
 * app: a leaderboard is a column of numbers, and dressing it up as a podium
 * would import a second visual language for no gain.
 *
 * Friends come first when there are any. A global top fifty is a curiosity;
 * the four people you actually know are the reason to look.
 */
export default function PeopleScreen() {
  const nav = useNavigation<Nav>();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const reveal = useReveal();

  const load = useCallback(async () => {
    const [board, mine, me] = await Promise.all([
      social.leaderboard(),
      social.friends(),
      social.me()
    ]);
    setEntries(board?.entries ?? null);
    setFriends(mine?.friends ?? []);
    setMeId(me?.id ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={palette.amber} />
      </Screen>
    );
  }

  // No signal, or the server has never been reached. Say so plainly rather than
  // showing an empty board that reads as "nobody is playing".
  if (!entries) {
    return (
      <Screen>
        <Gutter style={styles.offline}>
          <Label tone="dim">{t('people.title')}</Label>
          <Space h={s.x4} />
          <Display>{t('people.offlineTitle')}</Display>
          <Space h={s.x3} />
          <Body tone="muted" style={styles.measure}>
            {t('people.offlineBody')}
          </Body>
        </Gutter>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.amber} />
        }
      >
        <Animated.View style={reveal}>
          <Gutter>
            <Space h={s.x3} />
            <Label tone="dim">{t('people.title')}</Label>
            <Space h={s.x3} />
            <Display>
              {entries.length} {t('people.pilots')}
            </Display>
          </Gutter>

          {friends.length > 0 ? (
            <>
              <Space h={s.x8} />
              <Gutter>
                <Label tone="accent">{t('people.friends')}</Label>
              </Gutter>
              <Space h={s.x3} />
              <Rule />
              {friends.map((f) => (
                <PressSurface
                  key={f.id}
                  onPress={() => nav.navigate('Person', { userId: f.id })}
                  accessibilityLabel={f.handle ?? t('reviews.anonymous')}
                  style={styles.row}
                >
                  <Body numberOfLines={1} style={styles.name}>
                    {f.handle ?? t('reviews.anonymous')}
                  </Body>
                  <View style={styles.leader} />
                  <DataSmall allowFontScaling={false}>
                    {f.stats.placesDiscovered} {t('atlas.placesShort')}
                  </DataSmall>
                </PressSurface>
              ))}
            </>
          ) : null}

          <Space h={s.x8} />
          <Gutter>
            <Label tone="dim">{t('people.top')}</Label>
          </Gutter>
          <Space h={s.x3} />
          <Rule />

          {entries.map((e) => {
            const isMe = e.userId === meId;
            return (
              <PressSurface
                key={e.userId}
                onPress={() => nav.navigate('Person', { userId: e.userId })}
                accessibilityLabel={`${e.rank}. ${e.handle ?? t('reviews.anonymous')}, ${e.xp} XP`}
                style={[styles.row, isMe && styles.rowMine]}
              >
                <DataSmall tone={isMe ? 'accent' : 'dim'} allowFontScaling={false} style={styles.rank}>
                  {String(e.rank).padStart(2, '0')}
                </DataSmall>
                <Body numberOfLines={1} tone={isMe ? 'accent' : 'default'} style={styles.name}>
                  {e.handle ?? t('reviews.anonymous')}
                </Body>
                <View style={styles.leader} />
                <Data tone={isMe ? 'accent' : 'default'} allowFontScaling={false}>
                  {e.xp}
                </Data>
                <DataSmall style={styles.unit}>XP</DataSmall>
              </PressSurface>
            );
          })}

          {entries.length === 0 ? (
            <Gutter style={styles.emptyBoard}>
              <Body tone="muted">{t('people.emptyBoard')}</Body>
            </Gutter>
          ) : null}
        </Animated.View>

        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: s.x8 },
  offline: { flex: 1, justifyContent: 'center' },
  measure: { maxWidth: 330 },

  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  rowMine: { backgroundColor: palette.warm },
  rank: { width: 26 },
  name: { flexShrink: 1 },
  leader: { flex: 1, height: line.hair, backgroundColor: palette.ruleSoft, marginBottom: 4 },
  unit: { marginLeft: 2 },
  emptyBoard: { paddingVertical: s.x8 }
});
