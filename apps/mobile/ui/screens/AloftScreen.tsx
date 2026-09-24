import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated, Easing, Alert, Pressable, AccessibilityInfo, useWindowDimensions } from 'react-native';
import * as Speech from 'expo-speech';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OfflinePackage, POI, Moment } from '@skyatlas/shared';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Title, Body, Data, DataSmall, Small, typeStyles } from '../design/type';
import { Screen, Cells, PressSurface, Space, Row, Gutter, textHitSlop } from '../design/layout';
import { useReducedMotion } from '../motion';
import RouteMap from '../components/RouteMap';
import RouteRule from '../components/RouteRule';
import SideMark from '../components/SideMark';
import { loadPackage } from '../../src/core/offline/packageStore';
import { useSession } from '../../src/core/flight/session';
import { positionNow, offsetFromFix, type Now } from '../../src/core/flight/position';
import { whatsOutside, type InView } from '../../src/core/flight/nowView';
import { nextGuess, type Guess } from '../../src/core/flight/guess';
import { retimeTakeoff } from '../../src/core/flight/controller';
import { watchGps } from '../../src/core/flight/gps';
import { settings } from '../../src/core/settings';
import { distinctCountries } from '../../src/core/places/countries';
import { placeName, placeText, countryName } from '../../src/core/places/names';
import { cityName } from '../../src/core/data/airports';
import { km, metres } from '../../src/core/units';
import { haversine } from '../../src/core/geo/greatCircle';
import { haptics } from '../../src/core/ux/haptics';
import { t, getLocale } from '../../src/i18n';
import { clock, relative, spokenDuration, spokenRelative, timeAt } from '../format';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'InFlight'>;
type R = RouteProp<RootStackParamList, 'InFlight'>;

const TICK_MS = 5000;

function momentTitle(m: Moment, pkg: OfflinePackage, locale: string): string {
  if (m.kind === 'sight' && m.poiId) {
    const poi = pkg.pois.find((p) => p.id === m.poiId);
    return poi ? placeName(poi, locale) : '';
  }
  if (m.kind === 'border' && m.cc) return t('moment.border', { country: countryName(m.cc, locale) });
  if (m.kind === 'line' && m.line) return t(`line.${m.line}`);
  return t(`moment.${m.kind}`);
}

/** One side of the aircraft: what is out of that window now. */
function SideColumn({
  side,
  items,
  onOpen,
  spotted
}: {
  side: 'left' | 'right';
  items: InView[];
  onOpen: (poi: POI) => void;
  spotted: string[];
}) {
  const locale = getLocale();
  return (
    <View style={[styles.column, side === 'right' && styles.columnRight]}>
      <Row gap={s.x2} style={styles.columnHead}>
        <SideMark side={side} size={16} />
        <Label tone="dim" accessibilityRole="header">{t(`side.${side}`)}</Label>
      </Row>
      {items.length === 0 ? (
        <Small tone="muted" style={styles.columnEmpty}>
          {t('aloft.nothingThisSide')}
        </Small>
      ) : (
        items.map((v) => {
          const d = km(v.distanceKm);
          const got = spotted.includes(v.poi.id);
          // One element, read name first: "Tuapse, city, left, abeam 42 km".
          const spoken = [
            placeName(v.poi, locale),
            t(`category.${v.poi.category}`),
            t(`side.${side}`),
            `${t(`where.${v.where}`)} ${d.value} ${t(`unit.${d.unit}`)}`,
            got ? t('place.seen') : null
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <PressSurface key={v.poi.id} onPress={() => onOpen(v.poi)} accessibilityLabel={spoken} style={styles.item}>
              <Label tone={got ? 'brass' : 'accent'} numberOfLines={1}>
                {`${t(`where.${v.where}`)} · ${d.value} ${t(`unit.${d.unit}`)}`}
              </Label>
              <Space h={s.x1} />
              <Body numberOfLines={2}>{placeName(v.poi, locale)}</Body>
              <Small numberOfLines={1}>{t(`category.${v.poi.category}`)}</Small>
            </PressSurface>
          );
        })
      )}
    </View>
  );
}


/**
 * "What is about to appear?" — asked a few minutes before a notable place.
 * The answer is out of the window a minute later, which is the whole game.
 */
function GuessCard({ guess, onAnswer }: { guess: Guess; onAnswer: (correct: boolean) => void }) {
  const locale = getLocale();
  const [picked, setPicked] = useState<number | null>(null);
  const side = guess.poi.side ?? 'below';
  const revealed = picked !== null;
  const right = picked === guess.correctIdx;
  return (
    <View style={styles.guess} testID="guess-card">
      <Gutter>
        <Row style={styles.spread} accessible accessibilityRole="header" accessibilityLabel={`${t('guess.label')}, ${spokenRelative(guess.inS)}`}>
          <Label tone="accent">{t('guess.label')}</Label>
          <DataSmall allowFontScaling={false}>{relative(guess.inS)}</DataSmall>
        </Row>
        <Space h={s.x2} />
        <Title>
          {side === 'below'
            ? t('guess.promptBelow', { kind: t(`category.${guess.poi.category}`) })
            : t('guess.prompt', { side: t(`side.${side}`), kind: t(`category.${guess.poi.category}`) })}
        </Title>
      </Gutter>
      <Space h={s.x3} />
      {guess.options.map((o, i) => {
        const isAnswer = i === guess.correctIdx;
        return (
          <Pressable
            key={o.id}
            disabled={revealed}
            onPress={() => {
              setPicked(i);
              if (isAnswer) haptics.success();
              else haptics.error();
              // The reveal is colour and weight; a screen reader needs it said.
              AccessibilityInfo.announceForAccessibility(
                isAnswer ? t('guess.right') : t('guess.wrong', { name: placeName(guess.poi, locale) })
              );
              // Let the reveal show for a beat before the card leaves.
              setTimeout(() => onAnswer(isAnswer), 2600);
            }}
            accessibilityRole="button"
            accessibilityLabel={revealed && isAnswer ? `${placeName(o, locale)}, ${t('a11y.correctAnswer')}` : placeName(o, locale)}
            accessibilityState={{ selected: picked === i }}
            style={({ pressed }) => [
              styles.guessOption,
              pressed && styles.guessPressed,
              revealed && isAnswer && styles.guessRight,
              revealed && picked === i && !isAnswer && styles.guessWrong
            ]}
          >
            <Body tone={revealed && isAnswer ? 'accent' : 'default'}>{placeName(o, locale)}</Body>
          </Pressable>
        );
      })}
      {revealed ? (
        <Gutter style={styles.guessResult}>
          <Small tone={right ? 'accent' : 'muted'}>{right ? t('guess.right') : t('guess.wrong', { name: placeName(guess.poi, locale) })}</Small>
        </Gutter>
      ) : null}
    </View>
  );
}

export default function AloftScreen() {
  const nav = useNavigation<Nav>();
  const { flightId } = useRoute<R>().params;
  const { height } = useWindowDimensions();
  const locale = getLocale();
  const session = useSession();
  const [pkg, setPkg] = useState<OfflinePackage | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [retiming, setRetiming] = useState(false);
  const landed = useRef(false);
  const reduced = useReducedMotion();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadPackage(flightId).then((p) => {
        if (!alive) return;
        if (p) setPkg(p);
        else setMissing(true);
      });
      const id = setInterval(() => setNow(Date.now()), TICK_MS);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }, [flightId])
  );

  const active = session.flightId === flightId && session.takeoffAt;
  const takeoff = active ? new Date(session.takeoffAt!) : null;

  // The phone's GPS, while this screen is open and the passenger allows it.
  useEffect(() => {
    if (!pkg || !takeoff || pkg.demo || !settings.getUseGps()) return;
    let stop: (() => void) | null = null;
    let alive = true;
    watchGps((fix) => {
      const offset = offsetFromFix(pkg.route, takeoff, fix, useSession.getState().timeMultiplier);
      useSession.getState().applyFix(fix, offset);
    }).then((s) => {
      if (alive) stop = s;
      else s?.();
    });
    return () => {
      alive = false;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, session.takeoffAt]);

  const pos: Now | null = useMemo(
    () =>
      pkg && takeoff
        ? positionNow(pkg.route, takeoff, new Date(now), {
            multiplier: session.timeMultiplier,
            clockOffsetS: session.clockOffsetS,
            fix: session.lastFix
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pkg, now, session.takeoffAt, session.timeMultiplier, session.clockOffsetS, session.lastFix]
  );

  const outside = useMemo(() => (pkg && pos ? whatsOutside(pkg, pos, takeoff) : null), [pkg, pos, takeoff]);

  const [narrate, setNarrate] = useState(settings.getNarration());
  const guess = useMemo(
    () => (pkg && pos && settings.getGuessing() ? nextGuess(pkg, pos.elapsedS, session.guesses) : null),
    [pkg, pos, session.guesses]
  );

  // One haptic when something new comes abeam — a tap on the wrist, not a
  // dialog — and, with the audio guide on, its name and first lines aloud.
  const lastAbeam = useRef<string | null>(null);
  useEffect(() => {
    const first = [...(outside?.left ?? []), ...(outside?.right ?? []), ...(outside?.below ?? [])].find(
      (v) => (v.where === 'abeam' || v.where === 'below') && v.weight > 0.3
    );
    if (first && first.poi.id !== lastAbeam.current) {
      lastAbeam.current = first.poi.id;
      haptics.light?.();
      if (narrate) {
        const text = placeText(first.poi, locale);
        const where = first.where === 'below' ? t('side.below') : t(`side.${first.poi.side ?? 'below'}`);
        const lead = (text.summary.split(/(?<=[.!?。])\s/)[0] ?? '').slice(0, 280);
        Speech.stop();
        Speech.speak(`${where}: ${placeName(first.poi, locale)}. ${lead}`, { language: text.textLang ?? locale });
      }
    }
  }, [outside, narrate, locale]);
  useEffect(
    () => () => {
      Speech.stop();
    },
    []
  );

  useEffect(() => {
    if (pos?.ended && !landed.current) {
      landed.current = true;
      nav.replace('FlightSummary', { flightId });
    }
  }, [pos?.ended, nav, flightId]);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  const openPlace = useCallback(
    (poi: POI) => {
      useSession.getState().open(poi.id);
      nav.navigate('POIDetail', { poiId: poi.id, flightId });
    },
    [nav, flightId]
  );

  const finishEarly = useCallback(() => {
    Alert.alert(t('aloft.finishTitle'), t('aloft.finishBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('aloft.finish'),
        style: 'destructive',
        onPress: () => {
          landed.current = true;
          nav.replace('FlightSummary', { flightId });
        }
      }
    ]);
  }, [nav, flightId]);

  if (missing || (pkg && !active)) {
    return (
      <Screen style={styles.center}>
        <Gutter>
          <Body tone="muted">{t('aloft.notActive')}</Body>
          <Space h={s.x4} />
          <PressSurface onPress={() => nav.navigate('Tabs', { screen: 'Board' })} accessibilityLabel={t('aloft.toBoard')} hitSlop={s.x4}>
            <Label tone="accent">{t('aloft.toBoard')}</Label>
          </PressSurface>
        </Gutter>
      </Screen>
    );
  }
  if (!pkg || !pos || !outside || !takeoff) return <Screen />;

  const { flight, route } = pkg;
  const end = route[route.length - 1]!.elapsedSeconds;
  const last = route[route.length - 1]!;
  const leftKm = km(haversine(pos.lat, pos.lon, last.lat, last.lon));
  const alt = metres(pos.altitude);
  const countries = distinctCountries(pkg.countries ?? []);
  const passedCountries = distinctCountries((pkg.countries ?? []).filter((c) => c.enterAt <= pos.elapsedS));
  const lit = new Set([...session.opened, ...session.spotted]);
  const nothing = outside.left.length === 0 && outside.right.length === 0 && outside.below.length === 0;
  const nextSight = outside.next[0];

  return (
    <Screen>
      <View style={styles.topRow}>
        <PressSurface onPress={() => nav.navigate('Tabs', { screen: 'Board' })} accessibilityLabel={t('aloft.toBoard')} hitSlop={textHitSlop} style={styles.topBtn}>
          <Label tone="muted">{`‹ ${t('tabs.board')}`}</Label>
        </PressSurface>
        <Row gap={s.x2}>
          <Animated.View
            style={[
              styles.srcPip,
              { backgroundColor: pos.source === 'gps' ? palette.good : palette.amber },
              !reduced && { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }
            ]}
          />
          <DataSmall allowFontScaling={false}>
            {pkg.demo ? t('aloft.demo', { x: session.timeMultiplier }) : pos.source === 'gps' ? t('aloft.srcGps') : t('aloft.srcEstimate')}
          </DataSmall>
        </Row>
      </View>

      <View style={{ height: Math.round(height * 0.34) }}>
        <RouteMap
          route={route}
          position={{ lat: pos.lat, lon: pos.lon, elapsedS: pos.elapsedS }}
          pois={pkg.pois}
          seen={lit}
          highlight={countries}
          onSelectPOI={openPlace}
          labelFor={(p) => placeName(p, locale)}
        />
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Space h={s.x4} />
        <RouteRule
          fromCode={flight.origin.iata}
          toCode={flight.destination.iata}
          fromCity={cityName(flight.origin, locale)}
          toCity={cityName(flight.destination, locale)}
          progress={pos.progress}
        />
        <Space h={s.x4} />
        <Cells
          items={[
            {
              value: clock(end - pos.elapsedS),
              label: t('aloft.remaining'),
              tone: 'accent',
              spoken: `${t('aloft.remaining')}: ${spokenDuration(end - pos.elapsedS)}`
            },
            {
              value: leftKm.value,
              label: t(`unit.${leftKm.unit}`).toUpperCase(),
              spoken: `${t('aloft.remaining')}: ${leftKm.value} ${t(`unit.${leftKm.unit}`)}`
            },
            {
              value: alt.value,
              label: `${t('aloft.altitude')} · ${t(`unit.${alt.unit}`)}`,
              spoken: `${t('aloft.altitude')}: ${alt.value} ${t(`unit.${alt.unit}`)}`
            }
          ]}
        />

        <Gutter style={styles.nowHead}>
          <Row style={styles.spread}>
            <Label tone="accent" accessibilityRole="header" style={typeStyles.shrink}>
              {t('aloft.outside')}
            </Label>
            <DataSmall style={typeStyles.shrink}>
              {outside.countryNow ? countryName(outside.countryNow, locale) : t('aloft.overWater')}
              {!outside.daylight ? ` · ${t('aloft.night')}` : ''}
            </DataSmall>
          </Row>
          {!outside.daylight ? (
            <>
              <Space h={s.x1} />
              <Small>{t('aloft.nightHint')}</Small>
            </>
          ) : null}
          {pkg.routeKind === 'approximate' && pos.source !== 'gps' ? (
            <>
              <Space h={s.x1} />
              <Small tone="accent">{t('board.routeApprox')}</Small>
            </>
          ) : null}
        </Gutter>

        {outside.below.length > 0 ? (
          <View style={styles.below}>
            {outside.below.map((v) => (
              <PressSurface
                key={v.poi.id}
                onPress={() => openPlace(v.poi)}
                accessibilityLabel={`${placeName(v.poi, locale)}, ${t('side.below')}`}
                style={styles.belowRow}
              >
                <SideMark side="below" size={18} />
                <View style={styles.flex}>
                  <Label tone="dim">{t('side.below')}</Label>
                  <Title numberOfLines={1}>{placeName(v.poi, locale)}</Title>
                </View>
                <Data tone="dim" allowFontScaling={false}>
                  ›
                </Data>
              </PressSurface>
            ))}
          </View>
        ) : null}

        {nothing ? (
          <Gutter style={styles.quiet}>
            <Body tone="muted">
              {nextSight ? t('aloft.quietNext', { when: relative(nextSight.at - pos.elapsedS) }) : t('aloft.quiet')}
            </Body>
          </Gutter>
        ) : (
          <View style={styles.columns}>
            <SideColumn side="left" items={outside.left} onOpen={openPlace} spotted={session.spotted} />
            <SideColumn side="right" items={outside.right} onOpen={openPlace} spotted={session.spotted} />
          </View>
        )}

        {guess ? <GuessCard key={guess.poi.id} guess={guess} onAnswer={(ok) => useSession.getState().answerGuess(guess.poi.id, ok)} /> : null}

        {outside.next.length > 0 ? (
          <View style={styles.next}>
            <Gutter>
              <Label tone="dim" accessibilityRole="header">{t('aloft.next')}</Label>
            </Gutter>
            <Space h={s.x2} />
            {outside.next.map((m) => {
              const poi = m.poiId ? pkg.pois.find((p) => p.id === m.poiId) : undefined;
              // "Black Sea, left, in 13 min" — not "zero colon thirteen", then an icon, then a name.
              const spoken = [
                momentTitle(m, pkg, locale),
                m.kind === 'sight' && m.side ? t(`side.${m.side}`) : null,
                spokenRelative(m.at - pos.elapsedS)
              ]
                .filter(Boolean)
                .join(', ');
              const row = (
                <View style={styles.nextRow}>
                  <DataSmall tone="accent" allowFontScaling={false} style={styles.nextAt}>
                    {clock((m.at - pos.elapsedS) / 1)}
                  </DataSmall>
                  <SideMark side={m.kind === 'sight' ? m.side : 'mark'} size={16} />
                  <Body numberOfLines={1} style={styles.flex}>
                    {momentTitle(m, pkg, locale)}
                  </Body>
                </View>
              );
              return poi ? (
                <PressSurface key={m.id} onPress={() => openPlace(poi)} accessibilityLabel={spoken}>
                  {row}
                </PressSurface>
              ) : (
                <View key={m.id} accessible accessibilityLabel={spoken}>
                  {row}
                </View>
              );
            })}
          </View>
        ) : null}

        <Gutter style={styles.stamps}>
          <Label tone="dim" accessibilityRole="header">
            {t('aloft.countries', { n: passedCountries.length, total: countries.length })}
          </Label>
          <Space h={s.x2} />
          {/* Brass or dim is the only difference on screen; say it. */}
          <Body
            accessibilityLabel={countries
              .map((cc) => (passedCountries.includes(cc) ? countryName(cc, locale) : `${countryName(cc, locale)}, ${t('a11y.notCrossed')}`))
              .join('; ')}
          >
            {countries.map((cc, i) => (
              <Body key={cc} tone={passedCountries.includes(cc) ? 'brass' : 'dim'}>
                {`${i ? ' · ' : ''}${countryName(cc, locale)}`}
              </Body>
            ))}
          </Body>
        </Gutter>

        {retiming ? (
          <View style={styles.retime}>
            <Gutter>
              <Label tone="dim" accessibilityRole="header">{t('aloft.takeoffAt')}</Label>
              <Space h={s.x2} />
              <Row style={styles.spread}>
                {[-10, -5].map((d) => (
                  <PressSurface
                    key={d}
                    onPress={() => retimeTakeoff(pkg, new Date(takeoff.getTime() + d * 60_000))}
                    accessibilityLabel={t('a11y.earlier', { m: -d })}
                    hitSlop={{ top: s.x1, bottom: s.x1 }}
                    style={styles.stepBtn}
                  >
                    <Data>{`${d}`}</Data>
                  </PressSurface>
                ))}
                <Data tone="accent">
                  {timeAt(takeoff.toISOString())}
                </Data>
                {[5, 10].map((d) => (
                  <PressSurface
                    key={d}
                    onPress={() => retimeTakeoff(pkg, new Date(takeoff.getTime() + d * 60_000))}
                    accessibilityLabel={t('a11y.later', { m: d })}
                    hitSlop={{ top: s.x1, bottom: s.x1 }}
                    style={styles.stepBtn}
                  >
                    <Data>{`+${d}`}</Data>
                  </PressSurface>
                ))}
              </Row>
              <Space h={s.x2} />
              <Small>{t('aloft.retimeHint')}</Small>
            </Gutter>
            <PressSurface onPress={() => setRetiming(false)} accessibilityLabel={t('common.done')} style={styles.linkRow}>
              <Label tone="accent">{t('common.done')}</Label>
            </PressSurface>
          </View>
        ) : (
          <View style={styles.links}>
            <PressSurface
              onPress={() => {
                const next = !narrate;
                settings.setNarration(next);
                setNarrate(next);
                if (!next) Speech.stop();
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: narrate }}
              accessibilityLabel={t('aloft.narration')}
              accessibilityHint={t('aloft.narrationHint')}
              style={styles.linkRow}
            >
              <View style={styles.flex}>
                <Body>{t('aloft.narration')}</Body>
                <Small>{t('aloft.narrationHint')}</Small>
              </View>
              <DataSmall tone={narrate ? 'accent' : 'muted'} allowFontScaling={false}>
                {narrate ? t('settings.on') : t('settings.off')}
              </DataSmall>
            </PressSurface>
            {!pkg.demo ? (
              <PressSurface
                onPress={() => setRetiming(true)}
                accessibilityLabel={`${t('aloft.adjust')}, ${timeAt(takeoff.toISOString())}`}
                style={styles.linkRow}
              >
                <Body>{t('aloft.adjust')}</Body>
                <View style={styles.flex} />
                <DataSmall allowFontScaling={false}>{timeAt(takeoff.toISOString())}</DataSmall>
              </PressSurface>
            ) : null}
            <PressSurface onPress={finishEarly} accessibilityLabel={t('aloft.finish')} style={styles.linkRow}>
              <Body tone="muted">{t('aloft.finish')}</Body>
            </PressSurface>
          </View>
        )}
        <Space h={s.x10} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  spread: { justifyContent: 'space-between' },
  center: { justifyContent: 'center' },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  topBtn: { paddingVertical: s.x1, paddingRight: s.x4 },
  srcPip: { width: 6, height: 6, borderRadius: 3 },

  panel: { flex: 1, borderTopWidth: line.hair, borderTopColor: palette.rule },
  panelContent: { paddingBottom: s.x8 },

  nowHead: { paddingTop: s.x6, paddingBottom: s.x3 },
  below: { borderTopWidth: line.hair, borderTopColor: palette.rule },
  belowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    backgroundColor: palette.warm,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  quiet: { paddingVertical: s.x4 },
  columns: { flexDirection: 'row', borderTopWidth: line.hair, borderBottomWidth: line.hair, borderColor: palette.rule },
  column: { flex: 1, paddingTop: s.x3, paddingBottom: s.x2 },
  columnRight: { borderLeftWidth: line.hair, borderLeftColor: palette.rule },
  columnHead: { paddingHorizontal: s.x4, paddingBottom: s.x2 },
  columnEmpty: { paddingHorizontal: s.x4, paddingVertical: s.x3 },
  item: { paddingHorizontal: s.x4, paddingVertical: s.x3, borderTopWidth: line.hair, borderTopColor: palette.ruleSoft },

  next: { marginTop: s.x6 },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  nextAt: { width: 44 },

  stamps: { paddingTop: s.x6 },
  guess: { marginTop: s.x6, paddingTop: s.x4, backgroundColor: palette.warm, borderTopWidth: line.hair, borderBottomWidth: line.hair, borderColor: palette.amberDim },
  guessOption: { paddingHorizontal: gutter, paddingVertical: s.x3, borderTopWidth: line.hair, borderTopColor: palette.ruleSoft },
  guessPressed: { backgroundColor: palette.lifted },
  guessRight: { backgroundColor: palette.raised, borderLeftWidth: 2, borderLeftColor: palette.amber },
  guessWrong: { opacity: 0.45 },
  guessResult: { paddingVertical: s.x3 },
  links: { marginTop: s.x8, borderTopWidth: line.hair, borderTopColor: palette.rule },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  retime: { marginTop: s.x8, paddingTop: s.x4, backgroundColor: palette.raised },
  stepBtn: { paddingHorizontal: s.x3, paddingVertical: s.x2, borderWidth: line.hair, borderColor: palette.rule }
});
