import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Animated, Share, Platform, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall, Title, Small } from '../design/type';
import { Screen, Gutter, Row, Space, PressSurface, Rule, textHitSlop } from '../design/layout';
import { useReveal } from '../motion';
import Avatar, { MEDAL } from '../components/Avatar';
import FlightsMap from '../components/FlightsMap';
import Stamp from '../components/Stamp';
import { social, type Board, type BoardMetric, type BoardScope, type FeedItem, type LeaderboardEntry, type LiveFlight } from '../../src/core/api/social';
import { DEMO_SOCIAL } from '../../src/core/api/demoFlag';
import { liveState } from '../../src/core/social/live';
import { airportByIata } from '../../src/core/data/datasets';
import { cityName } from '../../src/core/data/airports';
import { countryName } from '../../src/core/places/names';
import { formatInt, km } from '../../src/core/units';
import { t, getLocale } from '../../src/i18n';
import { duration } from '../format';
import { haptics } from '../../src/core/ux/haptics';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const METRICS: BoardMetric[] = ['distance', 'countries', 'places', 'xp'];
const SCOPES: BoardScope[] = ['friends', 'all', 'month'];

/**
 * The people you fly with.
 *
 * Three things, in the order they matter: who is in the air right now, how
 * you stand against them, and what they have been up to. Every figure on the
 * board comes from flights — kilometres, countries, places — so someone who
 * flies every week climbs it, and a first flight still puts you on it.
 */
export default function PeopleScreen() {
  const nav = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const locale = getLocale();
  const reveal = useReveal();
  const [metric, setMetric] = useState<BoardMetric>('distance');
  const [scope, setScope] = useState<BoardScope>('friends');
  const [board, setBoard] = useState<Board | null>(null);
  const [live, setLive] = useState<LiveFlight[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBoard = useCallback(async (m: BoardMetric, sc: BoardScope) => {
    const b = await social.leaderboard({ metric: m, scope: sc });
    setBoard(b);
    return b;
  }, []);

  const load = useCallback(async () => {
    const [b, l, f] = await Promise.all([loadBoard(metric, scope), social.live(), social.feed()]);
    setLive(l?.flights ?? []);
    setFeed(f?.items ?? []);
    setOffline(!b && !l && !f);
    setLoading(false);
  }, [loadBoard, metric, scope]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const pick = useCallback(
    (m: BoardMetric, sc: BoardScope) => {
      haptics.light?.();
      setMetric(m);
      setScope(sc);
      loadBoard(m, sc);
    },
    [loadBoard]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const cheer = useCallback((item: FeedItem) => {
    haptics.light?.();
    const on = !item.cheered;
    setFeed((all) => all.map((x) => (x.id === item.id ? { ...x, cheered: on, cheers: x.cheers + (on ? 1 : -1) } : x)));
    social.cheer(item.id, on);
  }, []);

  const invite = useCallback(() => {
    Share.share({ message: t('people.inviteMessage') }).catch(() => {});
  }, []);

  const openPerson = useCallback((id: string) => nav.navigate('Person', { userId: id }), [nav]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={palette.amber} accessibilityLabel={t('common.loading')} />
      </Screen>
    );
  }

  // No signal: say so plainly rather than an empty board that reads as "nobody is here".
  if (offline) {
    return (
      <Screen>
        <Gutter style={styles.offline}>
          <Label tone="dim">{t('people.title')}</Label>
          <Space h={s.x4} />
          <Display accessibilityRole="header">{t('people.offlineTitle')}</Display>
          <Space h={s.x3} />
          <Body tone="muted" style={styles.measure}>
            {t('people.offlineBody')}
          </Body>
        </Gutter>
      </Screen>
    );
  }

  const entries = board?.entries ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  // The segment above names the figure; only distance and XP need a unit beside it.
  const unit = (m: BoardMetric) => (m === 'distance' ? t(`unit.${km(1).unit}`) : m === 'xp' ? 'XP' : '');
  const fmt = (e: LeaderboardEntry) => (metric === 'distance' ? km(e.value ?? 0).value : formatInt(e.value ?? 0));
  const nameOf = (e: { name?: string | null; handle: string | null; isMe?: boolean }) => (e.isMe ? t('people.you') : e.name ?? e.handle ?? t('reviews.anonymous'));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.amber} />}
      >
        <Animated.View style={reveal}>
          <Gutter>
            <Space h={s.x3} />
            <Row style={styles.spread}>
              <Label tone="dim" accessibilityRole="header">
                {t('people.title')}
              </Label>
              {Platform.OS !== 'web' ? (
                <PressSurface onPress={invite} accessibilityLabel={t('people.invite')} hitSlop={textHitSlop} style={styles.headAction}>
                  <Label tone="accent">{t('people.invite')}</Label>
                </PressSurface>
              ) : null}
            </Row>
            <Space h={s.x4} />
            <Display>{live.length ? t('people.liveCount', { count: live.length }) : t('people.headline')}</Display>
          </Gutter>

          {live.length ? (
            <>
              <Space h={s.x5} />
              <Gutter>
                <Label tone="accent" accessibilityRole="header">
                  {t('people.liveTitle')}
                </Label>
              </Gutter>
              <Space h={s.x3} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRow}>
                {live.map((f) => (
                  <LiveCard key={f.user.id} flight={f} locale={locale} onPress={() => openPerson(f.user.id)} />
                ))}
              </ScrollView>
            </>
          ) : null}

          <Space h={s.x8} />
          <Gutter>
            <Label tone="dim" accessibilityRole="header">
              {t('people.board')}
            </Label>
            <Space h={s.x3} />
            <Segments items={METRICS.map((m) => ({ key: m, label: t(`people.metric_${m}`) }))} value={metric} onChange={(m) => pick(m as BoardMetric, scope)} />
            <Space h={s.x2} />
            <Segments small items={SCOPES.map((sc) => ({ key: sc, label: t(`people.scope_${sc}`) }))} value={scope} onChange={(sc) => pick(metric, sc as BoardScope)} />
          </Gutter>

          {podium.length ? (
            <View style={styles.podium}>
              {[podium[1], podium[0], podium[2]].map((e, i) =>
                e ? (
                  <PressSurface
                    key={e.userId}
                    onPress={() => (e.isMe ? nav.navigate('Tabs', { screen: 'Atlas' }) : openPerson(e.userId))}
                    accessibilityLabel={`${e.rank}. ${nameOf(e)}, ${fmt(e)} ${unit(metric)}`}
                    style={[styles.step, i === 1 && styles.stepFirst]}
                  >
                    <DataSmall tone={e.rank === 1 ? 'brass' : 'dim'} allowFontScaling={false}>
                      {String(e.rank)}
                    </DataSmall>
                    <Space h={s.x2} />
                    <Avatar id={e.userId} name={e.isMe ? t('people.you') : e.name ?? e.handle} size={i === 1 ? 72 : 56} ring={[MEDAL.gold, MEDAL.silver, MEDAL.bronze][e.rank - 1] ?? palette.amber} />
                    <Space h={s.x2} />
                    <Small numberOfLines={1} tone={e.isMe ? 'accent' : 'default'} style={styles.podiumName}>
                      {nameOf(e)}
                    </Small>
                    <Data tone={e.rank === 1 ? 'accent' : 'default'} allowFontScaling={false}>
                      {fmt(e)}
                    </Data>
                    <DataSmall allowFontScaling={false}>{unit(metric)}</DataSmall>
                  </PressSurface>
                ) : (
                  <View key={i} style={styles.step} />
                )
              )}
            </View>
          ) : null}

          <Rule />
          {rest.map((e) => (
            <BoardRow key={e.userId} e={e} value={fmt(e)} unit={unit(metric)} name={nameOf(e)} onPress={() => (e.isMe ? nav.navigate('Tabs', { screen: 'Atlas' }) : openPerson(e.userId))} />
          ))}
          {board?.me ? (
            <>
              <View style={styles.gap}>
                <DataSmall tone="dim">⋯</DataSmall>
              </View>
              <BoardRow e={board.me} value={fmt(board.me)} unit={unit(metric)} name={nameOf(board.me)} onPress={() => nav.navigate('Tabs', { screen: 'Atlas' })} />
              <Gutter style={styles.place}>
                <Small tone="muted">{t('people.yourPlace', { rank: formatInt(board.me.rank), total: formatInt(board.total ?? board.me.rank) })}</Small>
              </Gutter>
            </>
          ) : null}

          {feed.length ? (
            <>
              <Space h={s.x10} />
              <Gutter>
                <Label tone="dim" accessibilityRole="header">
                  {t('people.feed')}
                </Label>
              </Gutter>
              <Space h={s.x3} />
              <Rule />
              {feed.map((item) => (
                <FeedRow key={item.id} item={item} width={width} locale={locale} onPerson={() => openPerson(item.user.id)} onCheer={() => cheer(item)} />
              ))}
            </>
          ) : null}

          {DEMO_SOCIAL ? (
            <Gutter style={styles.demo}>
              <Small tone="dim">{t('people.demoNote')}</Small>
            </Gutter>
          ) : null}
        </Animated.View>
        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

function Segments({ items, value, onChange, small }: { items: Array<{ key: string; label: string }>; value: string; onChange: (key: string) => void; small?: boolean }) {
  return (
    <View style={[styles.segments, small && styles.segmentsSmall]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <PressSurface
            key={it.key}
            onPress={() => onChange(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            style={[styles.segment, on && (small ? styles.segmentOnSmall : styles.segmentOn)]}
          >
            <Label tone={on ? 'accent' : 'muted'} numberOfLines={1}>
              {it.label}
            </Label>
          </PressSurface>
        );
      })}
    </View>
  );
}

function BoardRow({ e, value, unit, name, onPress }: { e: LeaderboardEntry; value: string; unit: string; name: string; onPress: () => void }) {
  return (
    <PressSurface onPress={onPress} accessibilityLabel={`${e.rank}. ${name}, ${value} ${unit}`} style={[styles.row, e.isMe && styles.rowMine]}>
      <DataSmall tone={e.isMe ? 'accent' : 'dim'} allowFontScaling={false} numberOfLines={1} style={styles.rank}>
        {formatInt(e.rank)}
      </DataSmall>
      <Avatar id={e.userId} name={name} size={32} ring={e.isMe ? palette.amber : undefined} />
      <View style={styles.flex}>
        <Body numberOfLines={1} tone={e.isMe ? 'accent' : 'default'}>
          {name}
        </Body>
        <Small tone="dim" numberOfLines={1}>
          {t('people.levelShort', { n: e.level })} · {t('people.flightsShort', { count: e.flights })}
        </Small>
      </View>
      <Data tone={e.isMe ? 'accent' : 'default'} allowFontScaling={false}>
        {value}
      </Data>
      <DataSmall style={styles.unit} allowFontScaling={false}>
        {unit}
      </DataSmall>
    </PressSurface>
  );
}

function LiveCard({ flight, locale, onPress }: { flight: LiveFlight; locale: string; onPress: () => void }) {
  const st = useMemo(() => liveState(flight), [flight]);
  const from = airportByIata(flight.from.iata);
  const to = airportByIata(flight.to.iata);
  const name = flight.user.name ?? flight.user.handle ?? t('reviews.anonymous');
  return (
    <PressSurface onPress={onPress} accessibilityLabel={`${name}: ${flight.from.iata} — ${flight.to.iata}`} style={styles.live}>
      <Row gap={s.x3}>
        <Avatar id={flight.user.id} name={name} size={36} ring={palette.amber} />
        <View style={styles.flex}>
          <Body numberOfLines={1}>{name}</Body>
          <Small tone="dim" numberOfLines={1}>
            {from ? cityName(from, locale) : flight.from.iata} → {to ? cityName(to, locale) : flight.to.iata}
          </Small>
        </View>
      </Row>
      <Space h={s.x4} />
      <Row gap={s.x2} style={styles.liveTrack}>
        <DataSmall allowFontScaling={false}>{flight.from.iata}</DataSmall>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${st.progress * 100}%` }]} />
          <View style={[styles.trackPlane, { left: `${st.progress * 100}%` }]} />
        </View>
        <DataSmall allowFontScaling={false}>{flight.to.iata}</DataSmall>
      </Row>
      <Space h={s.x3} />
      <Small tone="muted" numberOfLines={1}>
        {st.below ? `${t('people.below', { country: countryName(st.below, locale) })} · ` : ''}
        {t('people.toLanding', { time: duration(st.leftS) })}
      </Small>
    </PressSurface>
  );
}

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 2) return t('people.justNow');
  if (min < 60) return t('people.minutesAgo', { count: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('people.hoursAgo', { count: h });
  return t('people.daysAgo', { count: Math.round(h / 24) });
}

function FeedRow({ item, width, locale, onPerson, onCheer }: { item: FeedItem; width: number; locale: string; onPerson: () => void; onCheer: () => void }) {
  const name = item.user.name ?? item.user.handle ?? t('reviews.anonymous');
  const f = item.flight;
  const city = (iata: string) => {
    const a = airportByIata(iata);
    return a ? cityName(a, locale) : iata;
  };
  let title = '';
  let detail = '';
  if (item.kind === 'flight' && f) {
    title = `${city(f.from.iata)} → ${city(f.to.iata)}`;
    const d = km(f.distanceKm);
    detail = `${d.value} ${t(`unit.${d.unit}`)} · ${t('atlas.journalCountries', { count: f.countries.length })}`;
  } else if (item.kind === 'country' && item.cc) {
    title = countryName(item.cc, locale);
  } else if ((item.kind === 'spotted' || item.kind === 'review') && item.place) {
    title = item.place.name;
  } else if (item.kind === 'achievement' && item.achievement) {
    title = t(`ach.${item.achievement}.name`);
    detail = t(`ach.${item.achievement}.desc`);
  } else if (item.kind === 'streak' && item.weeks) {
    title = t('people.streakWeeks', { count: item.weeks });
  }
  return (
    <View style={styles.feedItem}>
      <PressSurface onPress={onPerson} accessibilityLabel={name} style={styles.feedHead}>
        <Avatar id={item.user.id} name={name} size={36} />
        <View style={styles.flex}>
          <Body numberOfLines={1}>{name}</Body>
          <Small tone="dim">
            {t(`people.kind_${item.kind}`)} · {ago(item.at)}
          </Small>
        </View>
      </PressSurface>
      <Gutter>
        <Space h={s.x3} />
        <Row gap={s.x3} style={styles.feedTitle}>
          {item.kind === 'country' && item.cc ? <Stamp code={item.cc} name={title} size={44} /> : null}
          <View style={styles.flex}>
            <Title tone={item.kind === 'spotted' || item.kind === 'achievement' || item.kind === 'streak' ? 'accent' : 'default'}>{title}</Title>
            {detail ? (
              <>
                <Space h={s.x1} />
                <Small tone="muted">{detail}</Small>
              </>
            ) : null}
          </View>
        </Row>
        {item.kind === 'review' && item.text ? (
          <>
            <Space h={s.x2} />
            <DataSmall tone="accent" allowFontScaling={false}>
              {'★'.repeat(item.rating ?? 5)}
            </DataSmall>
            <Space h={s.x1} />
            <Body tone="muted">{`«${item.text}»`}</Body>
          </>
        ) : null}
      </Gutter>
      {item.kind === 'flight' && f ? (
        <>
          <Space h={s.x3} />
          <FlightsMap flights={[{ from: f.from, to: f.to }]} visited={f.countries} width={width} height={Math.round(width * 0.42)} />
        </>
      ) : null}
      <Gutter>
        <Space h={s.x3} />
        <PressSurface
          onPress={onCheer}
          accessibilityLabel={`${t('people.cheer')}, ${item.cheers}`}
          accessibilityState={{ selected: !!item.cheered }}
          hitSlop={textHitSlop}
          style={[styles.cheer, item.cheered && styles.cheerOn]}
        >
          <Label tone={item.cheered ? 'accent' : 'muted'}>{`${t('people.cheer')} · ${item.cheers}`}</Label>
        </PressSurface>
      </Gutter>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: s.x8 },
  offline: { flex: 1, justifyContent: 'center' },
  measure: { maxWidth: 330 },
  spread: { justifyContent: 'space-between' },
  headAction: { paddingVertical: s.x1, paddingLeft: s.x4 },
  flex: { flex: 1, minWidth: 0 },

  liveRow: { paddingHorizontal: gutter, gap: s.x3 },
  live: {
    width: 270,
    padding: s.x4,
    backgroundColor: palette.raised,
    borderWidth: line.hair,
    borderColor: palette.rule,
    borderTopWidth: 2,
    borderTopColor: palette.amber
  },
  liveTrack: { alignItems: 'center' },
  track: { flex: 1, height: 2, backgroundColor: palette.rule, justifyContent: 'center' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: palette.amber },
  trackPlane: { position: 'absolute', width: 10, height: 10, borderRadius: 5, marginLeft: -5, backgroundColor: palette.amber, borderWidth: 2, borderColor: palette.ground },

  segments: { flexDirection: 'row', borderWidth: line.hair, borderColor: palette.rule },
  segmentsSmall: { borderWidth: 0, gap: s.x4 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: s.x3 },
  segmentOn: { backgroundColor: palette.warm },
  segmentOnSmall: { borderBottomWidth: 2, borderBottomColor: palette.amber },

  podium: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: gutter, paddingTop: s.x6, paddingBottom: s.x5, gap: s.x2 },
  step: { flex: 1, alignItems: 'center', paddingBottom: s.x2 },
  stepFirst: { paddingBottom: s.x6 },
  podiumName: { maxWidth: '100%', textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  rowMine: { backgroundColor: palette.warm },
  rank: { minWidth: 34 },
  unit: { marginLeft: 2, minWidth: 34 },
  gap: { alignItems: 'center', paddingVertical: s.x1 },
  place: { paddingVertical: s.x3 },

  feedItem: { paddingVertical: s.x5, borderBottomWidth: line.hair, borderBottomColor: palette.ruleSoft },
  feedHead: { flexDirection: 'row', alignItems: 'center', gap: s.x3, paddingHorizontal: gutter },
  feedTitle: { alignItems: 'center' },
  cheer: { alignSelf: 'flex-start', paddingVertical: s.x2, paddingHorizontal: s.x3, borderWidth: line.hair, borderColor: palette.rule },
  cheerOn: { borderColor: palette.amber, backgroundColor: palette.warm },

  demo: { paddingTop: s.x8 }
});
