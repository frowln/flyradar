import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Pressable
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SeatInfo } from '@skyatlas/shared';
import { palette, s, gutter, line, family } from '../design/tokens';
import { Label, Body, Small, Data, DataSmall, Code, Title } from '../design/type';
import { Screen, Gutter, Row, Space, ActionBar, PressSurface, Rule, textHitSlop } from '../design/layout';
import { useReveal, useReducedMotion } from '../motion';
import BoardingPassScanner from '../components/BoardingPassScanner';
import { useToast } from '../components/Toast';
import { searchAirports, cityName } from '../../src/core/data/airports';
import { airportByIata } from '../../src/core/data/datasets';
import type { DataAirport } from '../../src/core/data/types';
import { prepareFlight } from '../../src/core/offline/prepare';
import { lookupFlight, formFromFlight, normaliseFlightNumber } from '../../src/core/api/flights';
import { API_ENABLED } from '../../src/core/api/client';
import { remindAbout } from '../../src/core/flight/controller';
import type { BuildProgress, BuildStage } from '../../src/core/offline/buildPackage';
import { estimateAirborneSeconds } from '../../src/core/route/profile';
import { haversine } from '../../src/core/geo/greatCircle';
import { localDate } from '../../src/core/time/zones';
import { seatSide, type BoardingPass } from '../../src/core/wallet/bcbp';
import { parsePkpassFile } from '../../src/core/wallet/pkpassParser';
import { countryName } from '../../src/core/places/names';
import { km } from '../../src/core/units';
import { haptics } from '../../src/core/ux/haptics';
import { analytics } from '../../src/core/analytics';
import { t, getLocale } from '../../src/i18n';
import { duration } from '../format';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddFlight'>;

const DAYS_AHEAD = 90;

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayChip(date: string, today: string): { top: string; bottom: string } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const locale = getLocale();
  const weekday = at.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
  const month = at.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  if (date === today) return { top: t('addFlight.today'), bottom: `${d} ${month}` };
  if (date === addDays(today, 1)) return { top: t('addFlight.tomorrow'), bottom: `${d} ${month}` };
  return { top: weekday, bottom: `${d} ${month}` };
}

/** "0930" / "9:30" / "09.30" → "09:30"; null when not a time. */
function normaliseTime(v: string): string | null {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 4) return null;
  const h = Number(digits.slice(0, digits.length - 2));
  const m = Number(digits.slice(-2));
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function AirportField({
  label,
  value,
  onChange,
  active,
  onActivate
}: {
  label: string;
  value: DataAirport | null;
  onChange: (a: DataAirport) => void;
  active: boolean;
  onActivate: () => void;
}) {
  const [query, setQuery] = useState('');
  const locale = getLocale();
  const results = useMemo(() => (query.trim() ? searchAirports(query, 7) : []), [query]);
  // Choosing the origin makes the destination active: the keyboard goes there
  // too, so the second city is typed without another tap. (autoFocus alone
  // only acts when the field first appears.)
  const input = useRef<TextInput>(null);
  useEffect(() => {
    if (active) input.current?.focus();
  }, [active]);

  if (!active && value) {
    return (
      <PressSurface onPress={onActivate} accessibilityLabel={`${label}: ${cityName(value, locale)}`} style={styles.field}>
        <Label tone="dim">{label}</Label>
        <Row gap={s.x4} style={styles.fieldRow}>
          <Code>{value.i}</Code>
          <View style={styles.flex}>
            <Title numberOfLines={1}>{cityName(value, locale)}</Title>
            <Small numberOfLines={1}>{`${value.n} · ${countryName(value.cc, locale)}`}</Small>
          </View>
        </Row>
      </PressSurface>
    );
  }

  return (
    <View style={styles.field}>
      <Label tone={active ? 'accent' : 'dim'}>{label}</Label>
      <TextInput
        ref={input}
        value={query}
        onChangeText={setQuery}
        onFocus={onActivate}
        autoFocus={active}
        placeholder={t('addFlight.searchPlaceholder')}
        placeholderTextColor={palette.inkDim}
        autoCorrect={false}
        autoCapitalize="words"
        style={styles.search}
        accessibilityLabel={label}
      />
      {active && results.length > 0 ? (
        <View style={styles.results}>
          {results.map((a) => (
            <Pressable
              key={a.i}
              onPress={() => {
                haptics.light?.();
                onChange(a);
                setQuery('');
              }}
              accessibilityRole="button"
              accessibilityLabel={`${a.i} ${cityName(a, locale)}`}
              style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
            >
              <Data tone="accent" style={styles.resultCode}>
                {a.i}
              </Data>
              <View style={styles.flex}>
                <Body numberOfLines={1}>{cityName(a, locale)}</Body>
                <Small numberOfLines={1}>{`${a.n} · ${countryName(a.cc, locale)}`}</Small>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {active && query.trim().length >= 2 && results.length === 0 ? (
        <Small style={styles.noResults}>{t('addFlight.noResults')}</Small>
      ) : null}
    </View>
  );
}

const STAGES: BuildStage[] = ['route', 'places', 'stories', 'photos', 'map'];

function Preparing({ progress, onBackground }: { progress: BuildProgress; onBackground: () => void }) {
  const current = STAGES.indexOf(progress.stage === 'done' ? 'map' : progress.stage);
  return (
    <View style={styles.preparing}>
      <Gutter>
        <Label tone="accent" accessibilityRole="header">{t('addFlight.preparing')}</Label>
        <Space h={s.x2} />
        <Small>{t('addFlight.preparingHint')}</Small>
      </Gutter>
      <Space h={s.x4} />
      {STAGES.map((st, i) => {
        const done = progress.stage === 'done' || i < current;
        const now = i === current && progress.stage !== 'done';
        const pct = now && progress.progress > 0 && progress.progress < 1 ? `${Math.round(progress.progress * 100)}%` : null;
        return (
          <View
            key={st}
            style={styles.stageRow}
            accessible
            accessibilityLabel={[t(`addFlight.stage_${st}`), done ? t('a11y.stageDone') : now ? pct ?? t('a11y.stageNow') : null]
              .filter(Boolean)
              .join(', ')}
          >
            <View style={[styles.stagePip, done && styles.stageDone, now && styles.stageNow]} />
            <Body tone={done ? 'default' : now ? 'accent' : 'dim'} style={styles.flex}>
              {t(`addFlight.stage_${st}`)}
            </Body>
            {now && progress.progress > 0 && progress.progress < 1 ? (
              <DataSmall allowFontScaling={false}>{`${Math.round(progress.progress * 100)}%`}</DataSmall>
            ) : done ? (
              <DataSmall tone="good" allowFontScaling={false}>
                ✓
              </DataSmall>
            ) : null}
          </View>
        );
      })}
      {current >= STAGES.indexOf('stories') ? (
        <PressSurface onPress={onBackground} accessibilityLabel={t('addFlight.continueBackground')} style={styles.stageButton}>
          <Label tone="muted">{t('addFlight.continueBackground')}</Label>
        </PressSurface>
      ) : null}
    </View>
  );
}

export default function AddFlightScreen() {
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const reveal = useReveal();
  const reduced = useReducedMotion();
  const locale = getLocale();

  const [from, setFrom] = useState<DataAirport | null>(null);
  const [to, setTo] = useState<DataAirport | null>(null);
  const [active, setActive] = useState<'from' | 'to' | null>('from');
  const today = useMemo(() => localDate(new Date()), []);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const timeInput = useRef<TextInput>(null);
  const [details, setDetails] = useState(false);
  const [flightNumber, setFlightNumber] = useState('');
  const [arrival, setArrival] = useState('');
  const [seat, setSeat] = useState<SeatInfo>({ side: 'unknown' });
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [looking, setLooking] = useState(false);
  const leaving = useRef(false);

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD + 2 }, (_, i) => addDays(today, i - 1)), [today]);
  const depTime = normaliseTime(time);
  const arrTime = arrival ? normaliseTime(arrival) : null;
  const valid = !!from && !!to && from.i !== to.i && !!depTime;

  const summary = useMemo(() => {
    if (!from || !to || from.i === to.i) return null;
    const d = haversine(from.lat, from.lon, to.lat, to.lon);
    const k = km(d);
    return t('addFlight.summary', { dist: k.value, unit: t(`unit.${k.unit}`), time: duration(estimateAirborneSeconds(d)) });
  }, [from, to]);

  const applyPass = useCallback(
    (pass: { from?: string; to?: string; date?: string; flightNumber?: string; seat?: string }) => {
      const a = pass.from ? airportByIata(pass.from) : undefined;
      const b = pass.to ? airportByIata(pass.to) : undefined;
      if (a) setFrom(a);
      if (b) setTo(b);
      if (pass.date) setDate(pass.date);
      if (pass.flightNumber) setFlightNumber(pass.flightNumber);
      if (pass.seat) {
        const side = seatSide(pass.seat);
        setSeat({ side: side.side, label: pass.seat });
      }
      setDetails(true);
      setActive(null);
      toast.show(a && b ? t('addFlight.passRead') : t('addFlight.passPartial'), 'good');
    },
    [toast]
  );

  // With a server: the number and the date are enough, the rest is filled in.
  const findByNumber = useCallback(async () => {
    const number = normaliseFlightNumber(flightNumber);
    if (!number) {
      toast.show(t('addFlight.numberInvalid'), 'bad');
      return;
    }
    setLooking(true);
    const found = await lookupFlight(number, date);
    setLooking(false);
    if (!found) {
      toast.show(t('addFlight.notFound'), 'bad');
      return;
    }
    const form = formFromFlight(found);
    const a = airportByIata(form.fromIata);
    const b = airportByIata(form.toIata);
    if (a) setFrom(a);
    if (b) setTo(b);
    setDate(form.date);
    setTime(form.departureTime);
    setArrival(form.arrivalTime);
    setActive(null);
    haptics.success();
    toast.show(
      [t('addFlight.found', { from: form.fromIata, to: form.toIata, time: form.departureTime }), found.aircraftType].filter(Boolean).join(' · '),
      'good'
    );
  }, [flightNumber, date, toast]);

  const onScanned = useCallback(
    (pass: BoardingPass) => {
      setScanning(false);
      applyPass(pass);
    },
    [applyPass]
  );

  const importWallet = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const parsed = await parsePkpassFile(picked.assets[0].uri);
      if (!parsed) {
        toast.show(t('addFlight.walletParseError'), 'bad');
        return;
      }
      applyPass({ from: parsed.origin, to: parsed.destination, date: parsed.date, flightNumber: parsed.flightNumber, seat: parsed.seat });
    } catch {
      toast.show(t('addFlight.walletParseError'), 'bad');
    }
  }, [applyPass, toast]);

  const submit = useCallback(async () => {
    if (!from || !to || !depTime) return;
    setActive(null);
    setProgress({ stage: 'route', progress: 0 });
    try {
      const pkg = await prepareFlight(
        {
          from,
          to,
          date,
          departureTime: depTime,
          arrivalTime: arrTime ?? undefined,
          flightNumber: flightNumber.trim() || undefined,
          seat: seat.side === 'unknown' && !seat.label ? undefined : seat,
          locale
        },
        (p) => {
          if (!leaving.current) setProgress(p);
        }
      );
      analytics.track('flight_added', { from: from.i, to: to.i, pois: pkg.pois.length });
      remindAbout(pkg, { ask: true }).catch(() => {});
      haptics.success();
      if (!leaving.current) nav.navigate('Tabs', { screen: 'Board' });
    } catch (e) {
      haptics.error();
      setProgress(null);
      toast.show(t('addFlight.failed'), 'bad');
      console.warn('[add] prepare failed', e);
    }
  }, [from, to, depTime, arrTime, date, flightNumber, seat, locale, nav, toast]);

  const close = () => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs', { screen: 'Board' }));

  const seatOptions: Array<{ side: SeatInfo['side']; key: string }> = [
    { side: 'left', key: 'seatLeft' },
    { side: 'right', key: 'seatRight' },
    { side: 'middle', key: 'seatAisle' },
    { side: 'unknown', key: 'seatUnknown' }
  ];

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={reveal}>
            <Gutter>
              <Row style={styles.head}>
                <Label tone="dim" accessibilityRole="header">{t('addFlight.title')}</Label>
                <PressSurface onPress={close} accessibilityLabel={t('common.cancel')} hitSlop={textHitSlop} style={styles.close}>
                  <Label tone="muted">{t('common.cancel')}</Label>
                </PressSurface>
              </Row>
            </Gutter>

            <Rule />
            {API_ENABLED ? (
              <View style={styles.lookup}>
                <Gutter>
                  <Label tone="accent">{t('addFlight.byNumber')}</Label>
                  <Space h={s.x1} />
                  <Small>{t('addFlight.byNumberHint')}</Small>
                </Gutter>
                <Gutter style={styles.lookupRow}>
                  <TextInput
                    value={flightNumber}
                    onChangeText={(v) => setFlightNumber(v.toUpperCase())}
                    placeholder="SU 1234"
                    placeholderTextColor={palette.inkDim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={findByNumber}
                    style={styles.lookupInput}
                    accessibilityLabel={t('addFlight.flightNumber')}
                  />
                  <PressSurface
                    onPress={findByNumber}
                    disabled={looking || !flightNumber.trim()}
                    accessibilityLabel={t('addFlight.find')}
                    accessibilityState={{ busy: looking }}
                    style={styles.lookupBtn}
                  >
                    <Label tone={flightNumber.trim() ? 'accent' : 'dim'}>{looking ? t('common.loading') : t('addFlight.find')}</Label>
                  </PressSurface>
                </Gutter>
                <Small style={styles.lookupOr}>{t('addFlight.orManual')}</Small>
              </View>
            ) : null}
            <AirportField
              label={t('addFlight.from')}
              value={from}
              active={active === 'from'}
              onActivate={() => setActive('from')}
              onChange={(a) => {
                setFrom(a);
                setActive(to ? null : 'to');
              }}
            />
            <Rule soft />
            <AirportField
              label={t('addFlight.to')}
              value={to}
              active={active === 'to'}
              onActivate={() => setActive('to')}
              onChange={(a) => {
                setTo(a);
                setActive(null);
                // The time is the one thing left to fill: go there.
                if (!depTime) setTimeout(() => timeInput.current?.focus(), 50);
              }}
            />
            <Rule />

            {summary ? (
              <Gutter style={styles.summary}>
                <Small tone="muted">{summary}</Small>
              </Gutter>
            ) : null}

            <Gutter style={styles.section}>
              <Label tone="dim" accessibilityRole="header">{t('addFlight.date')}</Label>
            </Gutter>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
              {days.map((d) => {
                const chip = dayChip(d, today);
                const on = d === date;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDate(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${chip.top} ${chip.bottom}`}
                    style={[styles.day, on && styles.dayOn]}
                  >
                    <Label tone={on ? 'accent' : 'muted'} numberOfLines={1}>
                      {chip.top}
                    </Label>
                    <Space h={s.x1} />
                    <DataSmall tone={on ? 'accent' : 'default'} allowFontScaling={false}>
                      {chip.bottom}
                    </DataSmall>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Gutter style={styles.timeRow}>
              <View style={styles.flex}>
                {/* Lit while it is all that stands between the passenger and the button. */}
                <Label tone={from && to && !depTime ? 'accent' : 'dim'}>{t('addFlight.departureTime')}</Label>
                <Small>{from ? t('addFlight.localTimeAt', { city: cityName(from, locale) }) : t('addFlight.localTime')}</Small>
              </View>
              <TextInput
                ref={timeInput}
                value={time}
                onChangeText={setTime}
                onBlur={() => {
                  const n = normaliseTime(time);
                  if (n) setTime(n);
                }}
                placeholder="--:--"
                placeholderTextColor={palette.inkDim}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={[styles.time, time && !depTime && styles.timeBad]}
                accessibilityLabel={t('addFlight.departureTime')}
                accessibilityHint={from ? t('addFlight.localTimeAt', { city: cityName(from, locale) }) : t('addFlight.localTime')}
              />
            </Gutter>
            <Rule soft />

            <PressSurface
              onPress={() => setDetails((v) => !v)}
              accessibilityLabel={t('addFlight.details')}
              accessibilityState={{ expanded: details }}
              style={styles.optionRow}
            >
              <Body>{t('addFlight.details')}</Body>
              <View style={styles.flex} />
              <Data tone="dim" allowFontScaling={false}>
                {details ? '−' : '+'}
              </Data>
            </PressSurface>

            {details ? (
              <View style={styles.details}>
                <Gutter style={styles.detailRow}>
                  <Label tone="dim" style={styles.flex}>
                    {t('addFlight.flightNumber')}
                  </Label>
                  <TextInput
                    value={flightNumber}
                    onChangeText={(v) => setFlightNumber(v.toUpperCase())}
                    placeholder="SU 1234"
                    placeholderTextColor={palette.inkDim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={styles.detailInput}
                    accessibilityLabel={t('addFlight.flightNumber')}
                  />
                </Gutter>
                <Gutter style={styles.detailRow}>
                  <View style={styles.flex}>
                    <Label tone="dim">{t('addFlight.arrivalTime')}</Label>
                    <Small>{to ? t('addFlight.localTimeAt', { city: cityName(to, locale) }) : t('addFlight.optional')}</Small>
                  </View>
                  <TextInput
                    value={arrival}
                    onChangeText={setArrival}
                    placeholder="—"
                    placeholderTextColor={palette.inkDim}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={[styles.detailInput, arrival && !arrTime && styles.timeBad]}
                    accessibilityLabel={t('addFlight.arrivalTime')}
                    accessibilityHint={to ? t('addFlight.localTimeAt', { city: cityName(to, locale) }) : t('addFlight.optional')}
                  />
                </Gutter>
                <Gutter style={styles.seatBlock}>
                  <Row style={styles.spread}>
                    <Label tone="dim" accessibilityRole="header">{t('addFlight.seat')}</Label>
                    {seat.label ? <DataSmall allowFontScaling={false}>{seat.label}</DataSmall> : null}
                  </Row>
                  <Space h={s.x3} />
                  <View style={styles.segment}>
                    {seatOptions.map((o) => {
                      const on = seat.side === o.side;
                      return (
                        <Pressable
                          key={o.key}
                          onPress={() => setSeat((cur) => ({ ...cur, side: o.side }))}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={t(`addFlight.${o.key}`)}
                          accessibilityHint={t('addFlight.seatWhy')}
                          // 37pt tall as drawn; four points each way reach 44.
                          hitSlop={{ top: s.x1, bottom: s.x1 }}
                          style={[styles.segmentItem, on && styles.segmentOn]}
                        >
                          <Label tone={on ? 'accent' : 'muted'} numberOfLines={1}>
                            {t(`addFlight.${o.key}`)}
                          </Label>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Space h={s.x2} />
                  <Small>{t('addFlight.seatWhy')}</Small>
                </Gutter>
              </View>
            ) : null}

            <Rule soft />
            <PressSurface
              onPress={() => setScanning(true)}
              accessibilityLabel={t('addFlight.scan')}
              accessibilityHint={t('addFlight.scanHint')}
              style={styles.optionRow}
            >
              <View style={styles.flex}>
                <Body>{t('addFlight.scan')}</Body>
                <Small>{t('addFlight.scanHint')}</Small>
              </View>
              <Data tone="dim" allowFontScaling={false}>
                ›
              </Data>
            </PressSurface>
            {Platform.OS === 'ios' ? (
              <PressSurface onPress={importWallet} accessibilityLabel={t('addFlight.importWallet')} style={styles.optionRow}>
                <Body style={styles.flex}>{t('addFlight.importWallet')}</Body>
                <Data tone="dim" allowFontScaling={false}>
                  ›
                </Data>
              </PressSurface>
            ) : null}

            <Space h={s.x6} />
            <Gutter>
              <Small style={styles.hint}>{t('addFlight.hint')}</Small>
            </Gutter>
          </Animated.View>
        </ScrollView>

        {progress ? (
          <Preparing
            progress={progress}
            onBackground={() => {
              leaving.current = true;
              nav.navigate('Tabs', { screen: 'Board' });
            }}
          />
        ) : (
          <ActionBar
            label={t('addFlight.prepare')}
            onPress={() => (valid ? submit() : toast.show(from && to && from.i === to.i ? t('addFlight.sameAirport') : t('addFlight.incomplete')))}
            tone={valid ? 'accent' : 'quiet'}
          />
        )}
      </KeyboardAvoidingView>

      <Modal visible={scanning} animationType={reduced ? 'none' : 'slide'} onRequestClose={() => setScanning(false)}>
        <BoardingPassScanner onScan={onScanned} onClose={() => setScanning(false)} />
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lookup: { paddingTop: s.x4, paddingBottom: s.x3, borderBottomWidth: line.hair, borderBottomColor: palette.rule, backgroundColor: palette.warm },
  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: s.x3, paddingTop: s.x3 },
  lookupInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: family.data,
    fontSize: 24,
    color: palette.ink,
    paddingVertical: s.x2,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.amberDim
  },
  lookupBtn: { paddingVertical: s.x2, paddingHorizontal: s.x4, borderWidth: line.hair, borderColor: palette.amberDim },
  lookupOr: { paddingHorizontal: gutter, paddingTop: s.x3 },
  flex: { flex: 1, minWidth: 0 },
  spread: { justifyContent: 'space-between' },
  scroll: { paddingBottom: s.x8 },
  head: { justifyContent: 'space-between', paddingTop: s.x3, paddingBottom: s.x3 },
  close: { paddingVertical: s.x1, paddingLeft: s.x4 },

  field: { paddingHorizontal: gutter, paddingVertical: s.x4 },
  fieldRow: { marginTop: s.x2 },
  search: {
    width: '100%',
    fontFamily: family.displayMid,
    fontSize: 24,
    color: palette.ink,
    paddingVertical: s.x2,
    marginTop: s.x1
  },
  results: { marginTop: s.x2, borderTopWidth: line.hair, borderTopColor: palette.rule },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  resultPressed: { backgroundColor: palette.raised },
  resultCode: { width: 44 },
  noResults: { marginTop: s.x2 },

  summary: { paddingVertical: s.x3 },
  section: { paddingTop: s.x5, paddingBottom: s.x3 },
  days: { paddingHorizontal: gutter, gap: s.x2 },
  day: {
    width: 68,
    paddingVertical: s.x3,
    alignItems: 'center',
    borderWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.raised
  },
  dayOn: { borderColor: palette.amber, backgroundColor: palette.warm },

  timeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: s.x5, gap: s.x4 },
  // Fixed widths: a text input's intrinsic width is otherwise the whole row,
  // and the label beside it collapses to one letter per line.
  time: {
    fontFamily: family.dataMid,
    fontSize: 30,
    color: palette.ink,
    width: 120,
    flexShrink: 0,
    textAlign: 'right',
    paddingVertical: s.x1
  },
  timeBad: { color: palette.bad },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  details: { backgroundColor: palette.raised },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  detailInput: {
    fontFamily: family.data,
    fontSize: 17,
    color: palette.ink,
    width: 130,
    flexShrink: 0,
    textAlign: 'right',
    paddingVertical: s.x1
  },
  seatBlock: { paddingVertical: s.x4 },
  segment: { flexDirection: 'row', borderWidth: line.hair, borderColor: palette.rule },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: s.x3, paddingHorizontal: s.x1 },
  segmentOn: { backgroundColor: palette.warm },
  hint: { maxWidth: 340 },

  preparing: {
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    backgroundColor: palette.raised,
    paddingTop: s.x5,
    paddingBottom: s.x8
  },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: s.x3, paddingHorizontal: gutter, paddingVertical: s.x2 },
  stagePip: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: palette.inkDim },
  stageDone: { backgroundColor: palette.good, borderColor: palette.good },
  stageNow: { borderColor: palette.amber, backgroundColor: palette.amber },
  stageButton: { alignItems: 'center', paddingVertical: s.x4, marginTop: s.x3, borderTopWidth: line.hair, borderTopColor: palette.ruleSoft }
});
