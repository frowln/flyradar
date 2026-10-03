import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Animated, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, DataSmall, Title, Small } from '../design/type';
import { Screen, Gutter, Row, Cells, Space, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import Avatar from '../components/Avatar';
import FlightsMap from '../components/FlightsMap';
import Stamp from '../components/Stamp';
import { social, type Profile } from '../../src/core/api/social';
import { rankFor } from '../../src/core/game/xp';
import { countryName } from '../../src/core/places/names';
import { airportByIata } from '../../src/core/data/datasets';
import { cityName } from '../../src/core/data/airports';
import { formatInt, km } from '../../src/core/units';
import { haptics } from '../../src/core/ux/haptics';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Person'>;
type R = RouteProp<RootStackParamList, 'Person'>;

const STAMPS_SHOWN = 15;

/**
 * Somebody else's atlas: where they fly, what they have collected.
 *
 * A public profile in a travel app is a record of places — the map of their
 * flights, their countries, what they saw with their own eyes — and nothing
 * beyond it: no last-seen, no mutual friends.
 */
export default function PersonScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const { userId } = route.params;
  const { width } = useWindowDimensions();
  const locale = getLocale();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const reveal = useReveal();

  useEffect(() => {
    let alive = true;
    social.profile(userId).then((p) => {
      if (!alive) return;
      setProfile(p);
      setFollowing(!!p?.following);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const toggleFollow = useCallback(async () => {
    haptics.light?.();
    setFollowing((f) => !f);
    await social.follow(userId, false);
  }, [userId]);

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
        <ActivityIndicator color={palette.amber} accessibilityLabel={t('common.loading')} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen style={styles.center}>
        <Body tone="muted">{t('person.notFound')}</Body>
        <Space h={s.x4} />
        <PressSurface onPress={() => nav.goBack()} accessibilityLabel={t('common.back')} hitSlop={s.x4}>
          <Label tone="accent">{t('common.back')}</Label>
        </PressSurface>
      </Screen>
    );
  }

  const name = profile.name ?? profile.handle ?? t('reviews.anonymous');
  const joined = new Date(profile.joinedAt);
  // The app's language, not the device's.
  const joinedLabel = Number.isNaN(joined.getTime()) ? '' : joined.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const dist = km(profile.stats.distanceKm);
  const flights = profile.flights ?? [];
  const countries = profile.countries ?? [];
  const home = profile.home ? airportByIata(profile.home) : undefined;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter style={styles.head}>
            <PressSurface onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))} accessibilityLabel={t('common.back')} hitSlop={s.x2} style={styles.back}>
              <Label tone="muted">{`‹ ${t('common.back')}`}</Label>
            </PressSurface>
          </Gutter>

          <Space h={s.x4} />
          <Gutter style={styles.identity}>
            <Avatar id={profile.id} name={name} url={profile.avatarUrl} size={88} ring={palette.amber} />
            <Space h={s.x4} />
            <Display numberOfLines={1} accessibilityRole="header" style={styles.centerText}>
              {name}
            </Display>
            <Space h={s.x1} />
            <Small tone="muted" style={styles.centerText}>
              {[profile.handle ? `@${profile.handle}` : null, home ? cityName(home, locale) : null].filter(Boolean).join('  ·  ')}
            </Small>
            {joinedLabel ? (
              <Small tone="dim" style={styles.centerText}>
                {`${t('person.since')} · ${joinedLabel}`}
              </Small>
            ) : null}
            <Space h={s.x3} />
            <Row gap={s.x3}>
              <Title tone="accent">{t(`rank.${rankFor(profile.stats.level)}`)}</Title>
              <DataSmall allowFontScaling={false}>{t('atlas.level', { n: profile.stats.level })}</DataSmall>
            </Row>
            {profile.streakWeeks && profile.streakWeeks >= 2 ? (
              <>
                <Space h={s.x3} />
                <View style={styles.streak}>
                  <View style={styles.bars}>
                    {Array.from({ length: Math.min(8, profile.streakWeeks) }, (_, i) => (
                      <View key={i} style={[styles.bar, { height: 6 + i * 1.5 }]} />
                    ))}
                  </View>
                  <Label tone="accent">{t('people.streakWeeks', { count: profile.streakWeeks })}</Label>
                </View>
              </>
            ) : null}
            {profile.id !== 'me' ? (
              <>
                <Space h={s.x5} />
                <PressSurface
                  onPress={toggleFollow}
                  accessibilityLabel={following ? t('person.unfollow') : t('person.follow')}
                  accessibilityState={{ selected: following }}
                  style={[styles.follow, following && styles.following]}
                >
                  <Label tone={following ? 'muted' : 'accent'}>{following ? t('person.following') : t('person.follow')}</Label>
                </PressSurface>
              </>
            ) : null}
          </Gutter>

          <Space h={s.x6} />
          <Cells
            items={[
              { value: formatInt(profile.stats.flights), label: t('atlas.flights') },
              { value: dist.value, label: t(`unit.${dist.unit}`) },
              { value: String(profile.stats.countries), label: t('atlas.countriesShort') },
              { value: formatInt(profile.stats.placesDiscovered), label: t('atlas.placesShort'), tone: 'accent' }
            ]}
          />

          {flights.length ? (
            <>
              <Space h={s.x8} />
              <Gutter>
                <Label tone="dim" accessibilityRole="header">
                  {t('person.map')}
                </Label>
              </Gutter>
              <Space h={s.x3} />
              <FlightsMap flights={flights} visited={countries} width={width} height={Math.round(width * 0.62)} />
            </>
          ) : null}

          {countries.length ? (
            <>
              <Space h={s.x8} />
              <Gutter>
                <Row style={styles.spread}>
                  <Label tone="dim" accessibilityRole="header">
                    {t('person.countries')}
                  </Label>
                  <DataSmall allowFontScaling={false}>{String(countries.length)}</DataSmall>
                </Row>
                <Space h={s.x4} />
                <View style={styles.stamps}>
                  {countries.slice(0, STAMPS_SHOWN).map((cc) => (
                    <Stamp key={cc} code={cc} name={countryName(cc, locale)} size={46} />
                  ))}
                  {countries.length > STAMPS_SHOWN ? (
                    <View style={styles.more}>
                      <DataSmall allowFontScaling={false}>{`+${countries.length - STAMPS_SHOWN}`}</DataSmall>
                    </View>
                  ) : null}
                </View>
              </Gutter>
            </>
          ) : null}

          {profile.achievements ? (
            <>
              <Space h={s.x8} />
              <Rule />
              <View style={styles.line}>
                <Body style={styles.flexText}>{t('person.achievements')}</Body>
                <DataSmall tone="brass" allowFontScaling={false}>
                  {String(profile.achievements)}
                </DataSmall>
              </View>
              <Rule />
            </>
          ) : null}

          {profile.recent.length > 0 ? (
            <>
              <Space h={s.x8} />
              <Gutter>
                <Label tone="dim" accessibilityRole="header">
                  {t('person.recent')}
                </Label>
              </Gutter>
              <Space h={s.x3} />
              {profile.recent.map((d) => (
                <View key={d.poiId} style={styles.recentRow}>
                  {/* Never the id: an internal key on a public profile reads as a broken screen. */}
                  <View style={styles.gold} />
                  <Body numberOfLines={1} style={styles.recentName} tone={d.name ? 'default' : 'muted'}>
                    {d.name ?? t('person.unnamedPlace')}
                  </Body>
                  <View style={styles.leader} />
                  <DataSmall allowFontScaling={false}>{new Date(d.discoveredAt).toLocaleDateString(locale, { day: '2-digit', month: 'short' })}</DataSmall>
                </View>
              ))}
            </>
          ) : null}

          {profile.id !== 'me' ? (
            <>
              <Space h={s.x8} />
              <Rule />
              {/* Required alongside any user content: a person must be able to stop seeing someone without leaving the app. */}
              <PressSurface onPress={block} accessibilityLabel={blocked ? t('person.blocked') : t('person.block')} style={styles.action}>
                <Label tone={blocked ? 'bad' : 'dim'}>{blocked ? t('person.blocked') : t('person.block')}</Label>
              </PressSurface>
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
  centerText: { textAlign: 'center' },
  scroll: { paddingBottom: s.x8 },
  head: { flexDirection: 'row', paddingTop: s.x3 },
  back: { paddingVertical: s.x2, paddingRight: s.x4 },
  spread: { justifyContent: 'space-between' },
  flexText: { flex: 1 },

  identity: { alignItems: 'center' },
  streak: { flexDirection: 'row', alignItems: 'flex-end', gap: s.x2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingBottom: 3 },
  bar: { width: 3, backgroundColor: palette.amber },
  follow: { minWidth: 180, alignItems: 'center', paddingVertical: s.x3, paddingHorizontal: s.x6, borderWidth: 1, borderColor: palette.amber, backgroundColor: palette.warm },
  following: { borderColor: palette.rule, backgroundColor: 'transparent' },

  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x3 },
  more: { width: 46, height: 46, borderRadius: 23, borderWidth: line.hair, borderColor: palette.rule, alignItems: 'center', justifyContent: 'center' },

  line: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: gutter, paddingVertical: s.x4 },
  action: { alignItems: 'center', paddingVertical: s.x4, borderBottomWidth: line.hair, borderBottomColor: palette.ruleSoft },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  gold: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.brass },
  recentName: { flexShrink: 1 },
  leader: { flex: 1, height: line.hair, backgroundColor: palette.ruleSoft }
});
