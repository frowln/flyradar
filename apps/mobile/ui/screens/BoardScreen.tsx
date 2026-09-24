import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated, Alert, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OfflinePackage, POI } from '@skyatlas/shared';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Title, DataSmall, Small, Data } from '../design/type';
import { Screen, Gutter, Row, Cells, ActionBar, PressSurface, Space, Rule } from '../design/layout';
import { useReveal } from '../motion';
import Dial from '../components/Dial';
import RouteRule from '../components/RouteRule';
import RouteSketch from '../components/RouteSketch';
import SideMark from '../components/SideMark';
import { loadLibrary, removeFlight, type FlightEntry } from '../../src/core/flight/library';
import { takeOff } from '../../src/core/flight/controller';
import { useSession } from '../../src/core/flight/session';
import { positionNow } from '../../src/core/flight/position';
import { windowAdvice } from '../../src/core/flight/windowAdvice';
import { computeMoments } from '../../src/core/flight/moments';
import { distinctCountries } from '../../src/core/places/countries';
import { placeName, placeText, countryName } from '../../src/core/places/names';
import { cityName } from '../../src/core/data/airports';
import { startDemo, demoPreviewRoute } from '../../src/core/offline/demo';
import { useToast } from '../components/Toast';
import { t, getLocale } from '../../src/i18n';
import { clock, duration, timeAt, weekdayDayMonth } from '../format';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** How far out the dial starts filling toward departure. */
const WINDOW_MS = 24 * 3600_000;

function untilDeparture(dep: Date, now: number): string {
  const diff = dep.getTime() - now;
  if (diff <= 0) return '0:00';
  const mins = Math.floor(diff / 60_000);
  const days = Math.floor(mins / 1440);
  if (days > 0) return t('fmt.daysShort', { d: days, h: Math.floor((mins % 1440) / 60) });
  return clock(diff / 1000);
}

/** The window advice, in one sentence a passenger can repeat at the check-in desk. */
function Advice({ pkg }: { pkg: OfflinePackage }) {
  const locale = getLocale();
  const advice = useMemo(
    () => windowAdvice(pkg.route, pkg.pois, new Date(pkg.flight.scheduledDeparture)),
    [pkg]
  );
  const byId = new Map(pkg.pois.map((p) => [p.id, p]));
  const names = (ids: string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((p): p is POI => !!p)
      .map((p) => placeName(p, locale))
      .join(', ');

  const seat = pkg.seat;
  const night = advice.daylight !== null && advice.daylight < 0.25;
  let title: string;
  let body: string;
  if (advice.best === 'left' || advice.best === 'right') {
    title = t(`advice.${advice.best}`);
    body = names(advice.best === 'left' ? advice.leftIds : advice.rightIds);
  } else if (advice.best === 'either') {
    title = t('advice.either');
    body = names([...advice.leftIds.slice(0, 2), ...advice.rightIds.slice(0, 2)]);
  } else {
    title = t('advice.none');
    body = night ? t('advice.nightBody') : t('advice.noneBody');
  }

  const seatMatches = seat && (seat.side === advice.best || advice.best === 'either');
  return (
    <View style={styles.advice}>
      <Row style={styles.spread}>
        <Label tone="dim">{t('advice.label')}</Label>
        {advice.daylight !== null ? (
          <DataSmall allowFontScaling={false}>
            {night ? t('advice.night') : t('advice.daylight', { pct: Math.round(advice.daylight * 100) })}
          </DataSmall>
        ) : null}
      </Row>
      <Space h={s.x3} />
      <Row gap={s.x3}>
        <SideMark side={advice.best === 'left' || advice.best === 'right' ? advice.best : advice.best === 'either' ? 'both' : 'mark'} size={26} />
        <Title style={styles.flex}>{title}</Title>
      </Row>
      {body ? (
        <>
          <Space h={s.x2} />
          <Body tone="muted">{body}</Body>
        </>
      ) : null}
      {seat?.label ? (
        <>
          <Space h={s.x3} />
          <Small tone={seatMatches ? 'accent' : 'muted'}>
            {t('advice.yourSeat', { seat: seat.label, side: t(`side.${seat.side === 'middle' || seat.side === 'unknown' ? 'aisle' : seat.side}`) })}
          </Small>
        </>
      ) : null}
    </View>
  );
}

/** The flight's best moments, as they will come. */
function Highlights({ pkg, onOpen }: { pkg: OfflinePackage; onOpen: (poi: POI) => void }) {
  const locale = getLocale();
  const moments = useMemo(() => {
    const all = computeMoments({
      route: pkg.route,
      pois: pkg.pois,
      countries: pkg.countries,
      takeoff: new Date(pkg.flight.scheduledDeparture)
    });
    return all
      .filter((m) => m.kind !== 'takeoff' && m.kind !== 'landing' && m.kind !== 'descent')
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .sort((a, b) => a.at - b.at);
  }, [pkg]);
  if (moments.length === 0) return null;
  const byId = new Map(pkg.pois.map((p) => [p.id, p]));

  return (
    <View>
      <Gutter>
        <Label tone="dim">{t('board.highlights')}</Label>
      </Gutter>
      <Space h={s.x2} />
      {moments.map((m) => {
        const poi = m.poiId ? byId.get(m.poiId) : undefined;
        const title =
          m.kind === 'sight' && poi
            ? placeName(poi, locale)
            : m.kind === 'border' && m.cc
              ? t('moment.border', { country: countryName(m.cc, locale) })
              : m.kind === 'line' && m.line
                ? t(`line.${m.line}`)
                : t(`moment.${m.kind}`);
        const row = (
          <View style={styles.momentRow}>
            <DataSmall allowFontScaling={false} style={styles.momentAt}>
              {`+${clock(m.at)}`}
            </DataSmall>
            <SideMark side={m.kind === 'sight' ? m.side : 'mark'} size={16} />
            <Body numberOfLines={1} style={styles.flex}>
              {title}
            </Body>
            {m.kind === 'sight' && m.side && m.side !== 'below' ? (
              <DataSmall allowFontScaling={false}>{t(`side.${m.side}`)}</DataSmall>
            ) : null}
          </View>
        );
        return poi ? (
          <PressSurface key={m.id} onPress={() => onOpen(poi)} accessibilityLabel={title}>
            {row}
          </PressSurface>
        ) : (
          <View key={m.id}>{row}</View>
        );
      })}
    </View>
  );
}

function FeaturedFlight({
  entry,
  onOpenPlace,
  onRemove
}: {
  entry: FlightEntry;
  onOpenPlace: (poi: POI) => void;
  onRemove: () => void;
}) {
  const { pkg, status } = entry;
  const { flight } = pkg;
  const { width } = useWindowDimensions();
  const locale = getLocale();
  const session = useSession();
  const now = Date.now();

  const end = pkg.route[pkg.route.length - 1]?.elapsedSeconds ?? 0;
  const airborne = status === 'airborne' && session.takeoffAt;
  const pos = airborne
    ? positionNow(pkg.route, new Date(session.takeoffAt!), new Date(now), {
        multiplier: session.timeMultiplier,
        clockOffsetS: session.clockOffsetS
      })
    : null;

  const left = Math.max(0, entry.departure.getTime() - now);
  const stories = pkg.pois.filter((p) => placeText(p, locale).summary).length;
  const countries = distinctCountries(pkg.countries ?? []);

  return (
    <View>
      <Gutter>
        <Row style={styles.head}>
          <Label tone="accent">{t(`board.status_${status}`)}</Label>
          <PressSurface onPress={onRemove} accessibilityLabel={t('board.remove')} style={styles.more}>
            <DataSmall allowFontScaling={false}>
              {[flight.flightNumber, weekdayDayMonth(flight.scheduledDeparture, flight.origin.tz)].filter(Boolean).join(' · ')}
            </DataSmall>
          </PressSurface>
        </Row>
      </Gutter>

      <View style={styles.dial}>
        {pos ? (
          <Dial
            progress={pos.progress}
            reading={clock(end - pos.elapsedS)}
            caption={`${t('board.remaining')} · ${flight.destination.iata}`}
          />
        ) : (
          <Dial
            progress={1 - Math.min(1, left / WINDOW_MS)}
            reading={untilDeparture(entry.departure, now)}
            caption={`${t('board.untilDeparture')} · ${timeAt(flight.scheduledDeparture, flight.origin.tz)}`}
          />
        )}
      </View>

      <RouteRule
        fromCode={flight.origin.iata}
        toCode={flight.destination.iata}
        fromCity={cityName(flight.origin, locale)}
        toCity={cityName(flight.destination, locale)}
        progress={pos ? pos.progress : undefined}
      />

      <Space h={s.x6} />
      <Cells
        items={[
          { value: timeAt(flight.scheduledDeparture, flight.origin.tz), label: t('board.departure') },
          { value: clock(end), label: t('board.inAir') },
          { value: String(pkg.pois.length), label: t('board.places') },
          { value: String(countries.length), label: t('board.countries') }
        ]}
      />

      <View style={styles.ready}>
        <View style={styles.readyPip} />
        <Small tone="muted" style={styles.flex}>
          {stories > 0 ? t('board.readyStories', { count: stories }) : t('board.readyOffline')}
        </Small>
      </View>

      <View style={styles.sketch}>
        <RouteSketch
          route={pkg.route}
          width={width}
          height={Math.round(width * 0.62)}
          pois={pkg.pois}
          highlight={countries}
          flownS={pos?.elapsedS}
          plane={pos}
        />
      </View>

      {countries.length > 0 ? (
        <Gutter style={styles.countries}>
          <Label tone="dim">{t('board.underWing')}</Label>
          <Space h={s.x2} />
          <Body>{countries.map((cc) => countryName(cc, locale)).join(' · ')}</Body>
        </Gutter>
      ) : null}

      <Space h={s.x8} />
      <Advice pkg={pkg} />
      <Space h={s.x8} />
      <Highlights pkg={pkg} onOpen={onOpenPlace} />
    </View>
  );
}

function TakeoffSheet({ entry, onPick, onCancel }: { entry: FlightEntry; onPick: (at: Date) => void; onCancel: () => void }) {
  const dep = entry.departure;
  const now = Date.now();
  // Scheduled departure is off-block; wheels-up is typically ten minutes later.
  const scheduledTakeoff = new Date(dep.getTime() + 10 * 60_000);
  const options: Array<{ label: string; at: Date; accent?: boolean }> = [
    { label: t('board.takeoffNow'), at: new Date(now), accent: true },
    { label: t('board.takeoffAgo', { m: 10 }), at: new Date(now - 10 * 60_000) },
    { label: t('board.takeoffAgo', { m: 25 }), at: new Date(now - 25 * 60_000) }
  ];
  if (scheduledTakeoff.getTime() < now) {
    options.push({
      label: `${t('board.takeoffScheduled')} · ${timeAt(scheduledTakeoff.toISOString(), entry.pkg.flight.origin.tz)}`,
      at: scheduledTakeoff
    });
  }
  return (
    <View style={styles.sheet}>
      <Gutter>
        <Label tone="dim">{t('board.takeoffWhen')}</Label>
        <Space h={s.x1} />
        <Small tone="muted">{t('board.takeoffWhy')}</Small>
      </Gutter>
      <Space h={s.x3} />
      {options.map((o) => (
        <PressSurface key={o.label} onPress={() => onPick(o.at)} accessibilityLabel={o.label} style={styles.sheetRow}>
          <Label tone={o.accent ? 'accent' : 'default'}>{o.label}</Label>
        </PressSurface>
      ))}
      <PressSurface onPress={onCancel} accessibilityLabel={t('common.cancel')} style={styles.sheetRow}>
        <Label tone="dim">{t('common.cancel')}</Label>
      </PressSurface>
    </View>
  );
}

export default function BoardScreen() {
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const [entries, setEntries] = useState<FlightEntry[] | null>(null);
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busyDemo, setBusyDemo] = useState(false);
  const [, tick] = useState(0);
  const reveal = useReveal();
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    try {
      setEntries(await loadLibrary());
    } catch {
      setEntries([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(() => tick((n) => n + 1), 30_000);
      return () => clearInterval(id);
    }, [load])
  );

  const sampleRoute = useMemo(() => demoPreviewRoute(getLocale()), []);

  const active = (entries ?? []).filter((e) => e.status !== 'flown');
  const featured = active.find((e) => e.pkg.flight.id === featuredId) ?? active[0];

  const beginDemo = useCallback(async () => {
    setBusyDemo(true);
    try {
      const pkg = await startDemo(getLocale());
      nav.navigate('InFlight', { flightId: pkg.flight.id });
    } catch {
      toast.show(t('errors.somethingWrong'), 'bad');
    } finally {
      setBusyDemo(false);
    }
  }, [nav, toast]);

  const onTakeoff = useCallback(
    async (at: Date) => {
      if (!featured) return;
      setConfirming(false);
      await takeOff(featured.pkg, at);
      nav.navigate('InFlight', { flightId: featured.pkg.flight.id });
    },
    [featured, nav]
  );

  const confirmRemove = useCallback(
    (entry: FlightEntry) => {
      const f = entry.pkg.flight;
      Alert.alert(t('board.removeTitle'), `${f.origin.iata} — ${f.destination.iata}`, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('board.remove'),
          style: 'destructive',
          onPress: async () => {
            await removeFlight(f.id);
            setFeaturedId(null);
            load();
          }
        }
      ]);
    },
    [load]
  );

  if (entries === null) return <Screen />;

  if (!featured) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          <Animated.View style={reveal}>
            <Gutter>
              <Space h={s.x4} />
              <Label tone="accent" style={styles.wordmark}>
                SKYATLAS
              </Label>
            </Gutter>
            {sampleRoute ? (
              <View style={styles.hero}>
                <RouteSketch
                  route={sampleRoute}
                  width={width}
                  height={Math.round(width * 0.5)}
                  flownS={sampleRoute[Math.floor(sampleRoute.length * 0.55)]!.elapsedSeconds}
                  plane={sampleRoute[Math.floor(sampleRoute.length * 0.55)]!}
                />
              </View>
            ) : null}
            <Gutter>
              <Space h={s.x5} />
              <Display>{t('board.emptyTitle')}</Display>
              <Space h={s.x3} />
              <Body tone="muted" style={styles.measure}>
                {t('board.emptyBody')}
              </Body>
            </Gutter>
            <Space h={s.x8} />
            <View style={styles.emptyPoints}>
              {(['one', 'two', 'three'] as const).map((k, i) => (
                <View key={k} style={styles.point}>
                  <Data tone="accent" allowFontScaling={false}>{`0${i + 1}`}</Data>
                  <View style={styles.flex}>
                    <Body>{t(`board.emptyPoint_${k}`)}</Body>
                  </View>
                </View>
              ))}
            </View>
            <Space h={s.x6} />
            <PressSurface onPress={beginDemo} accessibilityLabel={t('board.demo')} style={styles.demoRow}>
              <View style={styles.flex}>
                <Body>{busyDemo ? t('common.loading') : t('board.demo')}</Body>
                <Small>{t('board.demoHint')}</Small>
              </View>
              <Data tone="dim" allowFontScaling={false}>
                ›
              </Data>
            </PressSurface>
          </Animated.View>
        </ScrollView>
        <ActionBar label={t('board.addFlight')} onPress={() => nav.navigate('AddFlight')} />
      </Screen>
    );
  }

  const others = active.filter((e) => e !== featured);
  const flown = entries.filter((e) => e.status === 'flown').slice(0, 3);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <FeaturedFlight
            entry={featured}
            onOpenPlace={(poi) => nav.navigate('POIDetail', { poiId: poi.id, flightId: featured.pkg.flight.id })}
            onRemove={() => confirmRemove(featured)}
          />

          {others.length > 0 ? (
            <View style={styles.later}>
              <Gutter>
                <Label tone="dim">{t('board.later')}</Label>
              </Gutter>
              <Space h={s.x2} />
              {others.map((e) => (
                <PressSurface
                  key={e.pkg.flight.id}
                  onPress={() => setFeaturedId(e.pkg.flight.id)}
                  accessibilityLabel={`${e.pkg.flight.origin.iata} — ${e.pkg.flight.destination.iata}`}
                  style={styles.laterRow}
                >
                  <Title>
                    {e.pkg.flight.origin.iata} — {e.pkg.flight.destination.iata}
                  </Title>
                  <View style={styles.leader} />
                  <DataSmall allowFontScaling={false}>
                    {weekdayDayMonth(e.pkg.flight.scheduledDeparture, e.pkg.flight.origin.tz)}
                  </DataSmall>
                </PressSurface>
              ))}
            </View>
          ) : null}

          {flown.length > 0 ? (
            <View style={styles.later}>
              <Gutter>
                <Label tone="dim">{t('board.flown')}</Label>
              </Gutter>
              <Space h={s.x2} />
              {flown.map((e) => (
                <PressSurface
                  key={e.pkg.flight.id}
                  onPress={() => nav.navigate('FlightSummary', { flightId: e.pkg.flight.id })}
                  accessibilityLabel={`${e.pkg.flight.origin.iata} — ${e.pkg.flight.destination.iata}`}
                  style={styles.laterRow}
                >
                  <Body>
                    {e.pkg.flight.origin.iata} — {e.pkg.flight.destination.iata}
                  </Body>
                  <View style={styles.leader} />
                  <DataSmall allowFontScaling={false}>{duration(e.pkg.route[e.pkg.route.length - 1]?.elapsedSeconds ?? 0)}</DataSmall>
                </PressSurface>
              ))}
            </View>
          ) : null}

          <Space h={s.x6} />
          <Rule />
          <PressSurface onPress={() => nav.navigate('AddFlight')} accessibilityLabel={t('board.addAnother')} style={styles.addRow}>
            <Body>{t('board.addAnother')}</Body>
            <View style={styles.flex} />
            <Data tone="dim" allowFontScaling={false}>
              +
            </Data>
          </PressSurface>
          <Rule />
        </Animated.View>
        <Space h={s.x8} />
        <View style={{ width }} />
      </ScrollView>

      {confirming ? (
        <TakeoffSheet entry={featured} onPick={onTakeoff} onCancel={() => setConfirming(false)} />
      ) : featured.status === 'airborne' ? (
        <ActionBar label={t('board.resume')} onPress={() => nav.navigate('InFlight', { flightId: featured.pkg.flight.id })} />
      ) : (
        <ActionBar label={t('board.tookOff')} onPress={() => setConfirming(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spread: { justifyContent: 'space-between' },
  scroll: { paddingBottom: s.x2 },
  emptyScroll: { flexGrow: 1, paddingBottom: s.x8 },
  head: { justifyContent: 'space-between', paddingTop: s.x3, paddingBottom: s.x2 },
  more: { paddingVertical: s.x1, paddingLeft: s.x3 },
  wordmark: { letterSpacing: 3.5 },
  dial: { alignItems: 'center', paddingVertical: s.x2 },
  measure: { maxWidth: 340 },

  ready: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x2,
    paddingHorizontal: gutter,
    paddingVertical: s.x3
  },
  readyPip: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.good },

  hero: { marginTop: s.x4, borderTopWidth: line.hair, borderBottomWidth: line.hair, borderColor: palette.rule },
  sketch: { borderTopWidth: line.hair, borderBottomWidth: line.hair, borderColor: palette.rule },
  countries: { paddingTop: s.x4 },

  advice: {
    marginHorizontal: gutter,
    padding: s.x4,
    borderWidth: line.hair,
    borderColor: palette.amberDim,
    backgroundColor: palette.warm
  },

  momentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  momentAt: { width: 48 },

  later: { marginTop: s.x8 },
  laterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  leader: { flex: 1, height: line.hair, backgroundColor: palette.ruleSoft },
  addRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: gutter, paddingVertical: s.x4 },

  emptyPoints: { paddingHorizontal: gutter, gap: s.x4 },
  point: { flexDirection: 'row', gap: s.x4, alignItems: 'flex-start' },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderBottomWidth: line.hair,
    borderColor: palette.rule
  },

  sheet: {
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    backgroundColor: palette.raised,
    paddingTop: s.x4,
    paddingBottom: s.x6
  },
  sheetRow: {
    alignItems: 'center',
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  }
});
