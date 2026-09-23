import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { palette, s, gutter, line, radius } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall } from '../design/type';
import { Screen, Gutter, Cells, Space, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import { social, type PublicStats } from '../../src/core/api/social';
import { haptics } from '../../src/core/ux/haptics';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Person'>;
type R = RouteProp<RootStackParamList, 'Person'>;

interface Profile {
  id: string;
  handle: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  stats: PublicStats;
  /** `name` is null when the server has never stored that place. */
  recent: { poiId: string; name: string | null; discoveredAt: string }[];
}

/**
 * Somebody else's atlas.
 *
 * Shows what they have collected and nothing else — no activity feed, no
 * mutual friends, no last-seen. A public profile in a travel app is a record of
 * places, and every field beyond that is a privacy question nobody asked to
 * answer.
 */
export default function PersonScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const reveal = useReveal();

  useEffect(() => {
    let alive = true;
    social.profile(userId).then((p) => {
      if (!alive) return;
      setProfile(p as Profile | null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const toggleFollow = useCallback(async () => {
    haptics.light?.();
    const next = !following;
    setFollowing(next);
    await social.follow(userId, false);
  }, [userId, following]);

  /** Blocking is a follow row with the flag set — one table, one source of truth. */
  const block = useCallback(async () => {
    haptics.warning?.();
    setBlocked(true);
    setFollowing(false);
    await social.follow(userId, true);
  }, [userId]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={palette.amber} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen style={styles.center}>
        <Body tone="muted">{t('person.notFound')}</Body>
        <Space h={s.x4} />
        <PressSurface onPress={() => nav.goBack()} accessibilityLabel={t('common.back')}>
          <Label tone="accent">{t('common.back')}</Label>
        </PressSurface>
      </Screen>
    );
  }

  const joined = new Date(profile.joinedAt);
  // The app's language, not the device's: `undefined` here rendered "August
  // 2026" in the middle of a Russian profile for anyone whose phone is English.
  const joinedLabel = Number.isNaN(joined.getTime())
    ? ''
    : joined.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter style={styles.head}>
            <PressSurface
              onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))}
              accessibilityLabel={t('common.back')}
              style={styles.back}
            >
              <Label tone="muted">{t('common.back')}</Label>
            </PressSurface>
          </Gutter>

          <Space h={s.x5} />
          <Gutter>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <DataSmall tone="accent" allowFontScaling={false}>
                    {(profile.handle ?? '?').slice(0, 2).toUpperCase()}
                  </DataSmall>
                )}
              </View>
              <View style={styles.identityText}>
                <Display numberOfLines={1}>{profile.handle ?? t('reviews.anonymous')}</Display>
                {joinedLabel ? (
                  <>
                    <Space h={s.x1} />
                    <Body tone="muted">
                      {/* A separator, not a preposition. "с" + a nominative
                          month gave "с август 2026 г.", and Japanese wants its
                          particle after the date, not a word before it. A
                          labelled datum is grammatical in every language and is
                          how the rest of the app presents readings anyway. */}
                      {t('person.since')} · {joinedLabel}
                    </Body>
                  </>
                ) : null}
              </View>
            </View>
          </Gutter>

          <Space h={s.x6} />
          <Cells
            items={[
              { value: String(profile.stats.placesDiscovered), label: t('atlas.placesShort'), tone: 'accent' },
              { value: String(profile.stats.countries), label: t('atlas.countriesShort') },
              { value: String(profile.stats.level), label: t('atlas.level') }
            ]}
          />

          <Space h={s.x8} />
          <Rule />
          <PressSurface
            onPress={toggleFollow}
            accessibilityLabel={following ? t('person.unfollow') : t('person.follow')}
            style={styles.action}
          >
            <Label tone={following ? 'muted' : 'accent'}>
              {following ? t('person.following') : t('person.follow')}
            </Label>
          </PressSurface>

          {/* Required alongside any user content: a person must be able to stop
              seeing someone without leaving the app. */}
          <PressSurface
            onPress={block}
            accessibilityLabel={t('person.block')}
            style={styles.action}
          >
            <Label tone={blocked ? 'bad' : 'dim'}>
              {blocked ? t('person.blocked') : t('person.block')}
            </Label>
          </PressSurface>
          <Rule />

          {profile.recent.length > 0 ? (
            <>
              <Space h={s.x8} />
              <Gutter>
                <Label tone="dim">{t('person.recent')}</Label>
              </Gutter>
              <Space h={s.x3} />
              {profile.recent.map((d) => (
                <View key={d.poiId} style={styles.recentRow}>
                  {/* Never the id. An internal key on a public profile reads as
                      a broken screen, and it leaks how places are stored. */}
                  <Body numberOfLines={1} style={styles.recentName} tone={d.name ? 'default' : 'muted'}>
                    {d.name ?? t('person.unnamedPlace')}
                  </Body>
                  <View style={styles.leader} />
                  <DataSmall allowFontScaling={false}>
                    {new Date(d.discoveredAt).toLocaleDateString(getLocale(), {
                      day: '2-digit',
                      month: 'short'
                    })}
                  </DataSmall>
                </View>
              ))}
            </>
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
  head: { flexDirection: 'row', paddingTop: s.x3 },
  back: { paddingVertical: s.x2, paddingRight: s.x4 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: s.x4 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: line.hair,
    borderColor: palette.amberDim,
    backgroundColor: palette.warm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  avatarImage: { width: '100%', height: '100%' },
  identityText: { flex: 1, minWidth: 0 },

  action: {
    alignItems: 'center',
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  recentName: { flexShrink: 1 },
  leader: { flex: 1, height: line.hair, backgroundColor: palette.ruleSoft, marginBottom: 4 }
});
