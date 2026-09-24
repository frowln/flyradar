import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated, Alert, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OfflinePackage, POI } from '@skyatlas/shared';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Title, DataSmall, Small, Data, typeStyles } from '../design/type';
import { Screen, Gutter, Row, Cells, ActionBar, PressSurface, Space, Rule, textHitSlop } from '../design/layout';
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
import { localDate } from '../../src/core/time/zones';
import { startDemo, demoPreviewRoute } from '../../src/core/offline/demo';
import { useToast } from '../components/Toast';
import { t, getLocale } from '../../src/i18n';
import { clock, duration, spokenDuration, timeAt, weekdayDayMonth } from '../format';
import type { RootStackParamList, TabParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** How far out the dial starts filling toward departure. */
const WINDOW_MS = 24 * 3600_000;

/** Whole days from one YYYY-MM-DD date to another. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

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
    <View style={styles.advice} testID="window-advice">
      <Row style={styles.spread}>
        <Label tone="dim" accessibilityRole="header">{t('advice.label')}</Label>
        {advice.daylight !== null ? (
          <DataSmall style={typeStyles.shrink}>
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
      {seat?.label && seat.side !== 'unknown' ? (
        <>
          <Space h={s.x3} />
          <Small tone={seatMatches ? 'accent' : 'muted'}>
            {seat.side === 'middle'
              ? t('advice.yourSeatNoWindow', { seat: seat.label })
              : t('advice.yourSeat', { seat: seat.label, side: t(`side.${seat.side}`) })}
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
        <Label tone="dim" accessibilityRole="header">{t('board.highlights')}</Label>
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
        // "Black Sea, left, 13 min after takeoff" as one element, not "plus zero colon thirteen".
        const spoken = [
          title,
          m.kind === 'sight' && m.side ? t(`side.${m.side}`) : null,
          t('place.afterTakeoff', { t: spokenDuration(m.at) })
        ]
          .filter(Boolean)
          .join(', ');
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
          <PressSurface key={m.id} onPress={() => onOpen(poi)} accessibilityLabel={spoken}>
            {row}
          </PressSurface>
        ) : (
          <View key={m.id} accessible accessibilityLabel={spoken}>
            {row}
          </View>
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
  const dated = [flight.flightNumber, weekdayDayMonth(flight.scheduledDeparture, flight.origin.tz)].filter(Boolean).join(' · ');
  // Local time at the destination, marked when it falls on another calendar day.
  const dayShift = daysBetween(localDate(new Date(flight.scheduledDeparture), flight.origin.tz), localDate(new Date(flight.scheduledArrival), flight.destination.tz));
  const arrival = `${timeAt(flight.scheduledArrival, flight.destination.tz)}${dayShift ? ` ${dayShift > 0 ? '+' : '−'}${Math.abs(dayShift)}` : ''}`;

  return (
    <View>
      <Gutter>
        <Row style={styles.head}>
          <Label tone="accent" accessibilityRole="header">{t(`board.status_${status}`)}</Label>
          {/* Tapping the date deletes the flight; the spoken label says both. */}
          <PressSurface onPress={onRemove} accessibilityLabel={`${dated}, ${t('board.remove')}`} hitSlop={textHitSlop} style={styles.more}>
            <DataSmall allowFontScaling={false}>{dated}</DataSmall>
          </PressSurface>
        </Row>
      </Gutter>

      <View style={styles.dial}>
        {pos ? (
          <Dial
            progress={pos.progress}
            reading={clock(end - pos.elapsedS)}
            caption={`${t('board.remaining')} · ${flight.destination.iata}`}
            accessibilityLabel={t('a11y.toGo', { place: cityName(flight.destination, locale), d: spokenDuration(end - pos.elapsedS) })}
          />
        ) : (
          <Dial
            progress={1 - Math.min(1, left / WINDOW_MS)}
            reading={untilDeparture(entry.departure, now)}
            caption={`${t('board.untilDeparture')} · ${timeAt(flight.scheduledDeparture, flight.origin.tz)}`}
            speakProgress={false}
            accessibilityLabel={`${
              left > 0 ? t('a11y.departsIn', { d: spokenDuration(left / 1000) }) : t(`board.status_${status}`)
            }, ${timeAt(flight.scheduledDeparture, flight.origin.tz)}`}
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
          {
            value: arrival,
            label: t('board.arrival'),
            // "+1" is read as "plus one"; say which day instead.
            spoken: `${t('board.arrival')}: ${timeAt(flight.scheduledArrival, flight.destination.tz)}${
              dayShift ? `, ${t(dayShift > 0 ? 'a11y.nextDay' : 'a11y.prevDay', { count: Math.abs(dayShift) })}` : ''
            }`
          },
          { value: clock(end), label: t('board.inAir'), spoken: `${t('board.inAir')}: ${spokenDuration(end)}` },
          { value: String(countries.length), label: t('board.countries', { count: countries.length }) }
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
          <Label tone="dim" accessibilityRole="header">{t('board.underWing')}</Label>
          <Space h={s.x2} />
          <Body>{countries.map((cc) => countryName(cc, locale)).join(' · ')}</Body>
        </Gutter>
      ) : null}
      {pkg.routeKind === 'approximate' ? (
        <Gutter style={styles.countries}>
          <Small tone="accent">{t('board.routeApprox')}</Small>
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
        <Label tone="dim" accessibilityRole="header">{t('board.takeoffWhen')}</Label>
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
  const route = useRoute<RouteProp<TabParamList, 'Board'>>();
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

  // Arrived from the "Took off?" notification: ask when, for that flight.
  const takeoffFor = route.params?.takeoff;
  useEffect(() => {
    if (!takeoffFor) return;
    setFeaturedId(takeoffFor);
    setConfirming(true);
    nav.setParams({ takeoff: undefined } as never);
  }, [takeoffFor, nav]);

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
              <Display accessibilityRole="header">{t('board.emptyTitle')}</Display>
              <Space h={s.x3} />
              <Body tone="muted" style={styles.measure}>
                {t('board.emptyBody')}
              </Body>
            </Gutter>
            <Space h={s.x8} />
            <View style={styles.emptyPoints}>
              {(['one', 'two', 'three'] as const).map((k, i) => (
                <View key={k} style={styles.point} accessible accessibilityLabel={`${i + 1}. ${t(`board.emptyPoint_${k}`)}`}>
                  <Data tone="accent">{`0${i + 1}`}</Data>
                  <View style={styles.flex}>
                    <Body>{t(`board.emptyPoint_${k}`)}</Body>
                  </View>
                </View>
              ))}
            </View>
            <Space h={s.x6} />
            <PressSurface
              onPress={beginDemo}
              accessibilityLabel={t('board.demo')}
              accessibilityHint={t('board.demoHint')}
              accessibilityState={{ busy: busyDemo }}
              style={styles.demoRow}
            >
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
                <Label tone="dim" accessibilityRole="header">{t('board.later')}</Label>
              </Gutter>
              <Space h={s.x2} />
              {others.map((e) => (
                <PressSurface
                  key={e.pkg.flight.id}
                  onPress={() => setFeaturedId(e.pkg.flight.id)}
                  accessibilityLabel={`${t('a11y.route', {
                    from: cityName(e.pkg.flight.origin, getLocale()),
                    to: cityName(e.pkg.flight.destination, getLocale())
                  })}, ${weekdayDayMonth(e.pkg.flight.scheduledDeparture, e.pkg.flight.origin.tz)}`}
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
                <Label tone="dim" accessibilityRole="header">{t('board.flown')}</Label>
              </Gutter>
              <Space h={s.x2} />
              {flown.map((e) => (
                <PressSurface
                  key={e.pkg.flight.id}
                  onPress={() => nav.navigate('FlightSummary', { flightId: e.pkg.flight.id })}
                  accessibilityLabel={`${t('a11y.route', {
                    from: cityName(e.pkg.flight.origin, getLocale()),
                    to: cityName(e.pkg.flight.destination, getLocale())
                  })}, ${spokenDuration(e.pkg.route[e.pkg.route.length - 1]?.elapsedSeconds ?? 0)}`}
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
