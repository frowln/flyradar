import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Share,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { POICategory } from '@skyatlas/shared';
import { palette, s, gutter, line, motion } from '../design/tokens';
import { Display, Title, Body, Small, Label, Data, DataSmall, Readout, typeStyles } from '../design/type';
import { Screen, Gutter, Row, Space, Rule, PressSurface, ActionBar, decorative, textHitSlop } from '../design/layout';
import { useReveal, useReducedMotion } from '../motion';
import Stamp, { stampLabel } from '../components/Stamp';
import FlightsMap, { type MapFlight } from '../components/FlightsMap';
import StreakBadge from '../components/StreakBadge';
import { getRecords, subscribeJournal } from '../../src/core/game/journal';
import { yearSummary, flightYears, defaultYear, type YearSummary } from '../../src/core/game/year';
import { streaks, type Streaks } from '../../src/core/game/streaks';
import type { FlightRecord } from '../../src/core/game/types';
import { airportByIata } from '../../src/core/data/datasets';
import { cityName } from '../../src/core/data/airports';
import { countryName } from '../../src/core/places/names';
import { km, formatInt } from '../../src/core/units';
import { t, getLocale } from '../../src/i18n';
import { duration, spokenDuration, dayMonth } from '../format';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
/** What the `Year` route carries: the year to open on, or nothing for the default. */
type Params = { year?: number } | undefined;

/** Count-ups on this screen take their time: it is the one screen built to be savoured. */
const COUNT_MS = 1400;

/* ─── Formatting ──────────────────────────────────────────────────────────── */

const int = (n: number) => formatInt(n);
const distanceValue = (n: number) => km(n).value;

/** One decimal, with the decimal comma where the language writes one. */
function decimal(n: number, locale: string): string {
  const v = n.toFixed(1);
  return /^(en|ja)/.test(locale) ? v : v.replace('.', ',');
}

/**
 * "1.7 times around the Earth", or "43% of the way around" below one lap.
 * A whole number of laps goes through the plural forms; a fractional one has
 * its own string, because languages with real plurals inflect "1,7 раза"
 * differently from any whole count.
 */
function earthLine(laps: number, locale: string): string {
  const pct = Math.round(laps * 100);
  if (pct < 100) return t('year.aroundEarthPct', { pct: Math.max(1, pct) });
  if (laps >= 10) return t('year.aroundEarth', { count: Math.round(laps) });
  const r = Math.round(laps * 10) / 10;
  return Number.isInteger(r) ? t('year.aroundEarth', { count: r }) : t('year.aroundEarthFraction', { n: decimal(r, locale) });
}

/** "4% of the way to the Moon"; past it, "to the Moon and 30% of the way back". */
function moonLine(share: number, locale: string): string {
  const pct = share * 100;
  if (pct < 99.5) return t('year.toMoonPct', { pct: pct < 1 ? decimal(Math.max(0.1, pct), locale) : Math.round(pct) });
  if (share < 2) {
    const back = Math.round((share - 1) * 100);
    return back < 1 ? t('year.moonReached') : t('year.moonAndBack', { pct: back });
  }
  return t('year.moonTimes', { n: decimal(share, locale) });
}

function monthName(month: number, locale: string, style: 'long' | 'short' = 'long'): string {
  try {
    const name = new Date(Date.UTC(2001, month, 15)).toLocaleDateString(locale, { month: style, timeZone: 'UTC' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return String(month + 1);
  }
}

/** The city an airport serves, in the reader's language; the code when it is not in the dataset. */
function place(iata: string, locale: string): string {
  try {
    const a = airportByIata(iata);
    return a ? cityName(a, locale) : iata;
  } catch {
    return iata;
  }
}

function mapFlights(records: FlightRecord[]): MapFlight[] {
  const out: MapFlight[] = [];
  for (const r of records) {
    try {
      const a = airportByIata(r.from);
      const b = airportByIata(r.to);
      if (a && b) out.push({ from: { lat: a.lat, lon: a.lon }, to: { lat: b.lat, lon: b.lon } });
    } catch {
      // Datasets not loaded: the map draws the world without arcs.
    }
  }
  return out;
}

function shareText(y: YearSummary, locale: string): string {
  const dist = km(y.distanceKm);
  return [
    t('year.shareTitle', { year: y.year }),
    t('year.shareStats', {
      flights: y.flights,
      countries: y.countries.length,
      dist: dist.value,
      unit: t(`unit.${dist.unit}`),
      hours: formatInt(Math.round(y.airborneS / 3600))
    }),
    earthLine(y.aroundEarth, locale),
    y.spotted > 0 ? t('postcard.spotted', { count: y.spotted }) : null
  ]
    .filter(Boolean)
    .join('\n');
}

/** The browser preview has a share sheet only where the browser offers one. */
const CAN_SHARE =
  Platform.OS !== 'web' || typeof (globalThis as { navigator?: { share?: unknown } }).navigator?.share === 'function';

/* ─── Motion ──────────────────────────────────────────────────────────────── */

/**
 * Counts a number up from zero, once, after `delay`. Reduce Motion lands on the
 * final figure at once. Kept inside the small component that shows the number,
 * so a frame of counting re-renders one readout and not the screen.
 */
function useCountIn(target: number, format: (n: number) => string, delay = 0): string {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  const [text, setText] = useState(() => format(0));

  useEffect(() => {
    const id = v.addListener(({ value }) => setText(format(value)));
    return () => v.removeListener(id);
  }, [v, format]);

  useEffect(() => {
    if (reduced) {
      v.setValue(target);
      setText(format(target));
      return;
    }
    const anim = Animated.timing(v, {
      toValue: target,
      duration: COUNT_MS,
      delay,
      easing: Easing.bezier(...motion.ease),
      useNativeDriver: false
    });
    anim.start();
    return () => anim.stop();
  }, [v, target, delay, reduced, format]);

  return text;
}

/* ─── Pieces ──────────────────────────────────────────────────────────────── */

function TopBar({ onBack, years, year, onYear }: { onBack: () => void; years: number[]; year: number; onYear: (y: number) => void }) {
  return (
    <View style={styles.top}>
      <PressSurface onPress={onBack} accessibilityLabel={t('common.back')} hitSlop={textHitSlop} style={styles.back}>
        <Label tone="muted">{`‹ ${t('common.back')}`}</Label>
      </PressSurface>
      {years.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.years} contentContainerStyle={styles.yearsContent}>
          {years.map((y) => (
            <PressSurface
              key={y}
              onPress={() => onYear(y)}
              accessibilityLabel={String(y)}
              accessibilityState={{ selected: y === year }}
              hitSlop={textHitSlop}
              style={[styles.yearChip, y === year && styles.yearChipOn]}
            >
              <DataSmall tone={y === year ? 'accent' : 'dim'} allowFontScaling={false}>
                {String(y)}
              </DataSmall>
            </PressSurface>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function HeroDistance({ distanceKm }: { distanceKm: number }) {
  const dist = km(distanceKm);
  const unit = t(`unit.${dist.unit}`);
  const counted = useCountIn(distanceKm, distanceValue, 250);
  return (
    <View style={styles.heroRow} accessible accessibilityLabel={`${dist.value} ${unit}`}>
      <Readout tone="accent" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1} style={styles.heroNumber}>
        {counted}
      </Readout>
      <Title tone="accent" maxFontSizeMultiplier={1.3}>
        {unit}
      </Title>
    </View>
  );
}

/** The Earth on the left, the Moon on the right, and how far along the year got. */
function MoonTrack({ share }: { share: number }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: COUNT_MS,
      delay: 450,
      easing: Easing.bezier(...motion.ease),
      useNativeDriver: false
    });
    anim.start();
    return () => anim.stop();
  }, [v, reduced]);

  // Never quite empty: a first year of short hops still shows the start of the way.
  const end = `${Math.max(1, Math.min(1, share) * 100)}%`;
  const at = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', end] });
  const reached = share >= 1;

  return (
    <View {...decorative}>
      <View style={styles.track}>
        <View style={styles.earth} />
        <View style={styles.trackLine}>
          <Animated.View style={[styles.trackFill, { width: at }]} />
          <Animated.View style={[styles.trackKnot, { left: at }]} />
        </View>
        <View style={[styles.moon, reached && styles.moonReached]} />
      </View>
      <Space h={s.x2} />
      <Row style={styles.spread}>
        <Label tone="dim">{t('year.earth')}</Label>
        <Label tone="dim">{t('year.moon')}</Label>
      </Row>
    </View>
  );
}

function BigCell({ value, label, delay, divider }: { value: number; label: string; delay: number; divider?: boolean }) {
  const text = useCountIn(value, int, delay);
  return (
    <View style={[styles.bigCell, divider && styles.bigCellDivider]} accessible accessibilityLabel={`${formatInt(value)} ${label}`}>
      <Readout numberOfLines={1} adjustsFontSizeToFit>
        {text}
      </Readout>
      <Space h={s.x1} />
      <Label numberOfLines={2}>{label}</Label>
    </View>
  );
}

function Moment({
  label,
  title,
  detail,
  spoken,
  warm,
  children
}: {
  label: string;
  title: string;
  detail?: string;
  spoken?: string;
  warm?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[styles.moment, warm && styles.momentWarm]}
      accessible
      accessibilityLabel={[label, title, spoken ?? detail].filter(Boolean).join(', ')}
    >
      <Label tone={warm ? 'accent' : 'dim'}>{label}</Label>
      <Space h={s.x2} />
      <Title>{title}</Title>
      {detail ? (
        <>
          <Space h={s.x1} />
          <DataSmall>{detail}</DataSmall>
        </>
      ) : null}
      {children}
    </View>
  );
}

function FlightMoment({ label, r, locale, warm }: { label: string; r: FlightRecord; locale: string; warm?: boolean }) {
  const dist = km(r.distanceKm);
  const unit = t(`unit.${dist.unit}`);
  const date = dayMonth(r.takeoffAt);
  return (
    <Moment
      label={label}
      warm={warm}
      title={`${place(r.from, locale)} — ${place(r.to, locale)}`}
      detail={[`${r.from} — ${r.to}`, duration(r.airborneS), `${dist.value} ${unit}`, date].filter(Boolean).join(' · ')}
      spoken={[spokenDuration(r.airborneS), `${dist.value} ${unit}`, date].filter(Boolean).join(', ')}
    />
  );
}

/** Flights per month, the busiest one lit; the text above it already says which. */
function MonthBars({ byMonth, busiest, locale }: { byMonth: number[]; busiest: number; locale: string }) {
  const max = Math.max(1, ...byMonth);
  return (
    <View {...decorative}>
      <Space h={s.x4} />
      <View style={styles.months}>
        {byMonth.map((n, m) => (
          <View
            key={m}
            style={[
              styles.monthBar,
              { height: n ? Math.max(s.x1, Math.round((n / max) * MONTHS_H)) : line.hair },
              m === busiest ? styles.monthOn : n ? styles.monthSome : styles.monthNone
            ]}
          />
        ))}
      </View>
      <Space h={s.x1} />
      <Row style={styles.spread}>
        <DataSmall tone="dim" allowFontScaling={false}>
          {monthName(0, locale, 'short')}
        </DataSmall>
        <DataSmall tone="dim" allowFontScaling={false}>
          {monthName(11, locale, 'short')}
        </DataSmall>
      </Row>
    </View>
  );
}

function CountRow({ label, n }: { label: string; n: number }) {
  return (
    <View style={styles.countRow} accessible accessibilityLabel={`${label}: ${n}`}>
      <Body style={styles.flex}>{label}</Body>
      <Data tone="brass">{formatInt(n)}</Data>
    </View>
  );
}

function Empty({ year, title, body }: { year: number; title: string; body?: string }) {
  const reveal = useReveal();
  return (
    <Animated.View style={[styles.empty, reveal]}>
      <Gutter>
        <Label tone="accent" accessibilityRole="header">{t('year.label')}</Label>
        <Display tone="dim" maxFontSizeMultiplier={1} style={styles.year}>
          {String(year)}
        </Display>
        <Space h={s.x6} />
        <Title>{title}</Title>
        {body ? (
          <>
            <Space h={s.x2} />
            <Body tone="muted" style={typeStyles.measure}>{body}</Body>
          </>
        ) : null}
      </Gutter>
    </Animated.View>
  );
}

/* ─── The year ────────────────────────────────────────────────────────────── */

function YearStory({ y, streak, markNew }: { y: YearSummary; streak: Streaks | null; markNew: boolean }) {
  const locale = getLocale();
  const { width } = useWindowDimensions();
  const mapW = Math.min(width, 640);

  // Each section settles in turn, top to bottom.
  const r0 = useReveal(0);
  const r1 = useReveal(160);
  const r2 = useReveal(320);
  const r3 = useReveal(480);
  const r4 = useReveal(560);
  const r5 = useReveal(640);
  const r6 = useReveal(720);

  // The stamps come down when the reader reaches them, not offscreen at load.
  // Until then they rest in place, so a reader who never scrolls (or a
  // screenshot) still sees every one.
  const [stampsIn, setStampsIn] = useState(false);
  const stampsY = useRef<number | null>(null);
  const viewH = useRef(0);
  const scrollY = useRef(0);
  const check = useCallback(() => {
    if (stampsY.current != null && viewH.current > 0 && scrollY.current + viewH.current > stampsY.current) setStampsIn(true);
  }, []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
      check();
    },
    [check]
  );

  const flights = useMemo(() => mapFlights(y.records), [y.records]);
  const landed = useMemo(() => new Set(y.landedCountries), [y.landedCountries]);
  const fresh = useMemo(() => new Set(markNew ? y.newCountries : []), [markNew, y.newCountries]);
  const topCats = useMemo(
    () =>
      (Object.entries(y.byCategory) as Array<[POICategory, number]>)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    [y.byCategory]
  );
  const hours = Math.round(y.airborneS / 3600);
  const span = y.flights > 1 ? `${dayMonth(y.firstFlight.takeoffAt)} — ${dayMonth(y.lastFlight.takeoffAt)}` : dayMonth(y.firstFlight.takeoffAt);
  const showStreak = !!streak && (streak.weeks >= 2 || streak.months >= 2);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      onScroll={onScroll}
      scrollEventThrottle={100}
      onLayout={(e: LayoutChangeEvent) => {
        viewH.current = e.nativeEvent.layout.height;
        check();
      }}
    >
      <Animated.View style={r0}>
        <Gutter style={styles.hero}>
          <Label tone="accent" accessibilityRole="header">{t('year.label')}</Label>
          <Display maxFontSizeMultiplier={1} style={styles.year}>
            {String(y.year)}
          </Display>
          {streak && showStreak ? (
            <View style={styles.streak}>
              <StreakBadge {...streak} />
            </View>
          ) : null}
        </Gutter>
      </Animated.View>

      <Animated.View style={r1}>
        <Rule />
        <Gutter style={styles.block}>
          <Label tone="dim">{t('year.distance')}</Label>
          <Space h={s.x3} />
          <HeroDistance distanceKm={y.distanceKm} />
          <Space h={s.x4} />
          <Title>{earthLine(y.aroundEarth, locale)}</Title>
          <Space h={s.x1} />
          <Body tone="muted">{moonLine(y.toMoon, locale)}</Body>
          <Space h={s.x6} />
          <MoonTrack share={y.toMoon} />
        </Gutter>
      </Animated.View>

      <Animated.View style={[styles.grid, r2]}>
        <BigCell value={y.flights} label={t('year.flights', { count: y.flights })} delay={400} divider />
        <BigCell value={hours} label={t('year.hours', { count: hours })} delay={480} />
        <BigCell value={y.countries.length} label={t('year.countries', { count: y.countries.length })} delay={560} divider />
        <BigCell value={y.airports.length} label={t('year.airports', { count: y.airports.length })} delay={640} />
      </Animated.View>

      <Animated.View style={r3}>
        <Gutter style={styles.section}>
          <Row style={styles.spread}>
            <Label tone="dim" accessibilityRole="header">{t('year.routes')}</Label>
            <DataSmall allowFontScaling={false} style={typeStyles.trailing}>
              {span}
            </DataSmall>
          </Row>
        </Gutter>
        <View style={styles.map}>
          <FlightsMap flights={flights} width={mapW} height={Math.round(mapW * 0.6)} visited={y.countries} />
        </View>
      </Animated.View>

      <Animated.View
        style={r4}
        onLayout={(e: LayoutChangeEvent) => {
          stampsY.current = e.nativeEvent.layout.y;
          check();
        }}
      >
        <Gutter style={styles.section}>
          <Row style={styles.spread}>
            <Label tone="dim" accessibilityRole="header">{t('year.stamps')}</Label>
            <DataSmall allowFontScaling={false}>{String(y.countries.length)}</DataSmall>
          </Row>
        </Gutter>
        <Gutter>
          <View style={styles.stamps}>
            {y.countries.map((cc, i) => {
              const name = countryName(cc, locale);
              const kind = landed.has(cc) ? 'landed' : 'overflown';
              return (
                <View key={cc} style={styles.stampCell} accessible accessibilityLabel={stampLabel(name, kind, fresh.has(cc))}>
                  <Stamp
                    key={stampsIn ? 'in' : 'rest'}
                    code={cc}
                    name={name}
                    kind={kind}
                    fresh={fresh.has(cc)}
                    stampDelay={stampsIn ? 200 + Math.min(i, 24) * 70 : undefined}
                  />
                  <Space h={s.x1} />
                  <Small numberOfLines={2} style={styles.stampName}>
                    {name}
                  </Small>
                </View>
              );
            })}
          </View>
          <Space h={s.x4} />
          {fresh.size > 0 ? (
            <>
              <Small tone="accent">{t('year.newCountries', { count: fresh.size })}</Small>
              <Space h={s.x1} />
            </>
          ) : null}
          <Small>{t('atlas.stampsLegend')}</Small>
        </Gutter>
      </Animated.View>

      <Animated.View style={r5}>
        <Gutter style={styles.section}>
          <Label tone="dim" accessibilityRole="header">{t('year.moments')}</Label>
        </Gutter>
        <FlightMoment label={t('year.longest')} r={y.longest} locale={locale} warm />
        {y.flights > 1 && y.shortest !== y.longest ? <FlightMoment label={t('year.shortest')} r={y.shortest} locale={locale} /> : null}
        {y.flights > 1 ? (
          <Moment
            label={t('year.busiestMonth')}
            title={monthName(y.busiestMonth.month, locale)}
            detail={t('year.flightCount', { count: y.busiestMonth.flights })}
          >
            <MonthBars byMonth={y.byMonth} busiest={y.busiestMonth.month} locale={locale} />
          </Moment>
        ) : null}
        {y.topRoute ? (
          <Moment
            label={t('year.topRoute')}
            title={`${place(y.topRoute.from, locale)} — ${place(y.topRoute.to, locale)}`}
            detail={`${y.topRoute.from} — ${y.topRoute.to} · ${t('year.flightCount', { count: y.topRoute.count })}`}
          />
        ) : null}
        {y.bestWeeksStreak >= 2 ? <Moment label={t('year.bestStreak')} title={t('streak.weeks', { count: y.bestWeeksStreak })} /> : null}
        {y.nightFlights > 0 ? <CountRow label={t('year.nightFlights')} n={y.nightFlights} /> : null}
        {y.sunrises > 0 ? <CountRow label={t('year.sunrises')} n={y.sunrises} /> : null}
        {y.sunsets > 0 ? <CountRow label={t('year.sunsets')} n={y.sunsets} /> : null}
        {y.linesCrossed.map((l) => (
          <View key={l} style={styles.countRow} accessible accessibilityLabel={`${t(`line.${l}`)}, ${t('arrival.crossed')}`}>
            <View style={styles.linePip} />
            <Body style={styles.flex}>{t(`line.${l}`)}</Body>
            <DataSmall tone="brass" style={typeStyles.trailing}>
              {t('arrival.crossed')}
            </DataSmall>
          </View>
        ))}
      </Animated.View>

      {y.places > 0 ? (
        <Animated.View style={r6}>
          <Gutter style={styles.section}>
            <Label tone="dim" accessibilityRole="header">{t('year.underWing')}</Label>
          </Gutter>
          <View style={styles.pair}>
            <View
              style={[styles.pairCell, styles.bigCellDivider]}
              accessible
              accessibilityLabel={`${formatInt(y.places)} ${t('year.passed', { count: y.places })}`}
            >
              <Readout>{formatInt(y.places)}</Readout>
              <Space h={s.x1} />
              <Label>{t('year.passed', { count: y.places })}</Label>
            </View>
            <View style={[styles.pairCell, y.spotted > 0 && styles.pairWarm]} accessible accessibilityLabel={`${formatInt(y.spotted)} ${t('year.spotted')}`}>
              <Readout tone={y.spotted > 0 ? 'accent' : 'dim'}>{formatInt(y.spotted)}</Readout>
              <Space h={s.x1} />
              <Label tone={y.spotted > 0 ? 'accent' : 'muted'}>{t('year.spotted')}</Label>
            </View>
          </View>
          {topCats.length > 0 ? (
            <View style={styles.cats}>
              {topCats.map(([c, n]) => (
                <View key={c} style={styles.cat} accessible accessibilityLabel={`${t(`categoryPlural.${c}`)}: ${n}`}>
                  <Data>{formatInt(n)}</Data>
                  <Label numberOfLines={1}>{t(`categoryPlural.${c}`)}</Label>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <Space h={s.x12} />
    </ScrollView>
  );
}

/* ─── Screen ──────────────────────────────────────────────────────────────── */

/** "My year in the sky": the passport, one year at a time, told as a celebration. */
export default function YearScreen() {
  const nav = useNavigation<Nav>();
  const params = useRoute().params as Params;
  const locale = getLocale();

  const [records, setRecords] = useState<FlightRecord[]>(() => getRecords());
  useEffect(() => {
    const off = subscribeJournal(() => setRecords([...getRecords()]));
    return () => {
      off();
    };
  }, []);

  const [year, setYear] = useState<number>(() => params?.year ?? defaultYear(getRecords()));
  useEffect(() => {
    if (params?.year) setYear(params.year);
  }, [params?.year]);

  const summary = useMemo(() => yearSummary(records, year), [records, year]);
  const years = useMemo(() => {
    const ys = flightYears(records);
    return (ys.includes(year) ? ys : [...ys, year]).sort((a, b) => a - b);
  }, [records, year]);
  const streak = useMemo(() => (year === new Date().getFullYear() ? streaks(records) : null), [records, year]);
  // "New this year" means something only once there is an earlier year to be new against.
  const markNew = years.some((y) => y < year);

  return (
    <Screen>
      <TopBar onBack={() => nav.goBack()} years={records.length ? years : []} year={year} onYear={setYear} />
      {records.length === 0 ? (
        <Empty year={year} title={t('year.emptyTitle')} body={t('year.empty')} />
      ) : summary ? (
        <YearStory key={year} y={summary} streak={streak} markNew={markNew} />
      ) : (
        <Empty key={year} year={year} title={t('year.emptyYear', { year })} />
      )}
      {summary && CAN_SHARE ? (
        <ActionBar label={t('year.share')} onPress={() => Share.share({ message: shareText(summary, locale) }).catch(() => {})} />
      ) : null}
    </Screen>
  );
}

const MONTHS_H = 40;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spread: { justifyContent: 'space-between' },
  scroll: { paddingBottom: s.x8 },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: s.x4,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  back: { paddingVertical: s.x1, paddingRight: s.x4 },
  years: { flexGrow: 0, flexShrink: 1 },
  yearsContent: { gap: s.x4, alignItems: 'center' },
  yearChip: { paddingVertical: s.x1, borderBottomWidth: line.bold, borderBottomColor: 'transparent' },
  yearChipOn: { borderBottomColor: palette.amber },

  hero: { paddingTop: s.x10, paddingBottom: s.x8 },
  // The one number this screen is named for. Drawn at poster size, and capped
  // at it: it is already larger than any text size a reader could ask for.
  year: { fontSize: 112, lineHeight: 116, letterSpacing: -5, marginTop: s.x2, marginLeft: -s.x1 },
  streak: { marginTop: s.x3 },

  block: { paddingTop: s.x8, paddingBottom: s.x8 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: s.x2 },
  heroNumber: { fontSize: 64, lineHeight: 70, letterSpacing: -3, flexShrink: 1 },

  track: { flexDirection: 'row', alignItems: 'center', gap: s.x2 },
  earth: { width: s.x2, height: s.x2, borderRadius: s.x1, backgroundColor: palette.inkMuted },
  moon: { width: s.x2, height: s.x2, borderRadius: s.x1, borderWidth: line.hair, borderColor: palette.inkDim },
  moonReached: { backgroundColor: palette.amber, borderColor: palette.amber },
  trackLine: { flex: 1, height: line.bold, backgroundColor: palette.rule, justifyContent: 'center' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: palette.amber },
  trackKnot: {
    position: 'absolute',
    top: -2,
    width: 6,
    height: 6,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: palette.amber
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: line.hair,
    borderTopColor: palette.rule
  },
  bigCell: {
    width: '50%',
    paddingHorizontal: gutter,
    paddingVertical: s.x6,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  bigCellDivider: { borderRightWidth: line.hair, borderRightColor: palette.rule },

  section: { paddingTop: s.x10, paddingBottom: s.x3 },
  map: { alignItems: 'center', backgroundColor: palette.void },

  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x4 },
  stampCell: { width: 76, alignItems: 'center' },
  stampName: { textAlign: 'center', fontSize: 11, lineHeight: 14 },

  moment: {
    paddingHorizontal: gutter,
    paddingVertical: s.x5,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  momentWarm: { backgroundColor: palette.warm, borderLeftWidth: line.bold, borderLeftColor: palette.amber },

  months: { flexDirection: 'row', alignItems: 'flex-end', gap: s.x1, height: MONTHS_H },
  monthBar: { flex: 1 },
  monthOn: { backgroundColor: palette.amber },
  monthSome: { backgroundColor: palette.inkDim, opacity: 0.55 },
  monthNone: { backgroundColor: palette.rule },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  linePip: { width: 10, height: 2, backgroundColor: palette.brass },

  pair: { flexDirection: 'row', borderTopWidth: line.hair, borderBottomWidth: line.hair, borderColor: palette.rule },
  pairCell: { flex: 1, paddingHorizontal: gutter, paddingVertical: s.x6 },
  pairWarm: { backgroundColor: palette.warm },

  cats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: gutter,
    marginTop: s.x4,
    borderTopWidth: line.hair,
    borderLeftWidth: line.hair,
    borderColor: palette.rule
  },
  cat: {
    width: '33.333%',
    paddingHorizontal: s.x3,
    paddingVertical: s.x3,
    borderRightWidth: line.hair,
    borderBottomWidth: line.hair,
    borderColor: palette.rule,
    gap: s.x1
  },

  empty: { flex: 1, justifyContent: 'center', paddingBottom: s.x16 }
});
