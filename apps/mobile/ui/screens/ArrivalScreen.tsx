import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OfflinePackage, POI } from '@skyatlas/shared';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Body, Title, Data, DataSmall, Small, Readout } from '../design/type';
import { Screen, Gutter, Cells, Space, ActionBar, PressSurface, Rule, Row } from '../design/layout';
import { useReveal, useCountUp } from '../motion';
import Dial from '../components/Dial';
import RouteRule from '../components/RouteRule';
import Stamp from '../components/Stamp';
import Postcard from '../components/Postcard';
import { loadPackage } from '../../src/core/offline/packageStore';
import { land, endSession, type Landing } from '../../src/core/flight/controller';
import { useSession } from '../../src/core/flight/session';
import { positionNow } from '../../src/core/flight/position';
import { removeFlight } from '../../src/core/flight/library';
import { distinctCountries } from '../../src/core/places/countries';
import { lineCrossings } from '../../src/core/geo/lines';
import { placeName, countryName } from '../../src/core/places/names';
import { cityName } from '../../src/core/data/airports';
import { flightQuiz, type QuizQuestion } from '../../src/core/game/quiz';
import { levelFromXP, rankFor } from '../../src/core/game/xp';
import { km } from '../../src/core/units';
import { routeLengthKm } from '../../src/core/geo/greatCircle';
import { shareView } from '../../src/core/ux/share';
import { haptics } from '../../src/core/ux/haptics';
import { analytics } from '../../src/core/analytics';
import { t, getLocale } from '../../src/i18n';
import { clock, weekdayDayMonth } from '../format';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'FlightSummary'>;
type R = RouteProp<RootStackParamList, 'FlightSummary'>;

function QuizCard({ q }: { q: QuizQuestion }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <View style={styles.quiz}>
      <Gutter>
        <BodyLead text={t(q.prompt, q.params)} />
      </Gutter>
      <Space h={s.x3} />
      {q.options.map((o, i) => {
        const revealed = picked !== null;
        const right = i === q.correctIdx;
        return (
          <Pressable
            key={`${o}-${i}`}
            disabled={revealed}
            onPress={() => {
              setPicked(i);
              if (right) haptics.success();
              else haptics.error();
            }}
            accessibilityRole="button"
            accessibilityLabel={o}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
              revealed && right && styles.optionRight,
              revealed && picked === i && !right && styles.optionWrong
            ]}
          >
            <Body tone={revealed && right ? 'accent' : 'default'}>{o}</Body>
            {revealed && right ? (
              <DataSmall tone="accent" allowFontScaling={false}>
                ✓
              </DataSmall>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function BodyLead({ text }: { text: string }) {
  return <Title>{text}</Title>;
}

function XpBlock({ landing }: { landing: Landing }) {
  const before = levelFromXP(landing.xpBefore);
  const after = levelFromXP(landing.xpBefore + landing.xp);
  const format = useCallback((n: number) => `+${Math.round(n)}`, []);
  const counted = useCountUp(landing.xp, format);
  const up = after.level > before.level;
  return (
    <Gutter style={styles.xp}>
      <Row style={styles.spread}>
        <Label tone="dim">{t('arrival.experience')}</Label>
        <Label tone="accent">{t(`rank.${rankFor(after.level)}`)}</Label>
      </Row>
      <Space h={s.x2} />
      <Row style={styles.spread}>
        <Readout tone="accent" allowFontScaling={false}>{`${counted} XP`}</Readout>
        <Data allowFontScaling={false}>{t('arrival.level', { n: after.level })}</Data>
      </Row>
      <Space h={s.x3} />
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${after.progress * 100}%` }]} />
      </View>
      {up ? (
        <>
          <Space h={s.x2} />
          <Small tone="accent">{t('arrival.levelUp', { n: after.level })}</Small>
        </>
      ) : null}
    </Gutter>
  );
}

export default function ArrivalScreen() {
  const nav = useNavigation<Nav>();
  const { flightId } = useRoute<R>().params;
  const { width } = useWindowDimensions();
  const locale = getLocale();
  const reveal = useReveal();
  const postcard = useRef<View>(null);

  const [pkg, setPkg] = useState<OfflinePackage | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await loadPackage(flightId);
      if (!alive) return;
      if (!p) {
        setMissing(true);
        return;
      }
      setPkg(p);
      const sess = useSession.getState();
      const end = p.route[p.route.length - 1]?.elapsedSeconds ?? 0;
      const elapsed =
        sess.flightId === flightId && sess.takeoffAt
          ? positionNow(p.route, new Date(sess.takeoffAt), new Date(), {
              multiplier: sess.timeMultiplier,
              clockOffsetS: sess.clockOffsetS
            }).elapsedS
          : end;
      const result = await land(p, elapsed);
      if (!alive) return;
      setLanding(result);
      if (result.earned.length > 0) haptics.success();
      analytics.track('flight_completed', { flightId, demo: !!p.demo });
      if (p.demo) {
        // A demo leaves nothing behind but the memory of it.
        await endSession();
        removeFlight(flightId).catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
  }, [flightId]);

  const quiz = useMemo(
    () =>
      pkg
        ? flightQuiz(pkg, {
            place: (p: POI) => placeName(p, locale),
            country: (cc) => countryName(cc, locale),
            side: (sd) => t(`side.${sd}`)
          })
        : [],
    [pkg, locale]
  );

  if (missing) {
    return (
      <Screen style={styles.center}>
        <Gutter>
          <Body tone="muted">{t('arrival.missing')}</Body>
        </Gutter>
      </Screen>
    );
  }
  if (!pkg || !landing) return <Screen />;

  const { flight, route } = pkg;
  const record = landing.record;
  const reachedS = record?.airborneS ?? route[route.length - 1]!.elapsedSeconds;
  const countries = record?.countries ?? distinctCountries(pkg.countries ?? []);
  const lines = record?.lines ?? lineCrossings(route).map((c) => c.line);
  const spottedIds = new Set(record?.spotted ?? []);
  const spotted = pkg.pois.filter((p) => spottedIds.has(p.id));
  const passed = record?.passed.length ?? pkg.pois.length;
  const fresh = new Set(landing.after.countries.filter((c) => !landing.before.countries.includes(c)));
  const dist = km(record?.distanceKm ?? routeLengthKm(route));
  const landedCC = record?.toCC || (pkg.demo ? flight.destination.country : '');

  const byCat = new Map<string, number>();
  for (const p of record?.passed ?? []) byCat.set(p.cat, (byCat.get(p.cat) ?? 0) + 1);
  const cats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter>
            <Row style={styles.head}>
              <Label tone="accent">{pkg.demo ? t('arrival.demoDone') : t('arrival.landed')}</Label>
              <DataSmall allowFontScaling={false}>{weekdayDayMonth(flight.scheduledDeparture, flight.origin.tz)}</DataSmall>
            </Row>
          </Gutter>

          <View style={styles.dial}>
            <Dial progress={1} reading={clock(reachedS)} caption={`${t('arrival.inTheAir')} · ${flight.destination.iata}`} />
          </View>
          <RouteRule
            fromCode={flight.origin.iata}
            toCode={flight.destination.iata}
            fromCity={cityName(flight.origin, locale)}
            toCity={cityName(flight.destination, locale)}
            progress={1}
          />
          <Space h={s.x6} />
          <Cells
            items={[
              { value: dist.value, label: t(`unit.${dist.unit}`).toUpperCase() },
              { value: String(countries.length), label: t('arrival.countries', { count: countries.length }) },
              { value: String(passed), label: t('arrival.passed', { count: passed }) },
              { value: String(spotted.length), label: t('arrival.spotted'), tone: 'accent' }
            ]}
          />

          {countries.length > 0 ? (
            <>
              <Gutter style={styles.section}>
                <Label tone="dim">{t('arrival.stamps')}</Label>
              </Gutter>
              <Gutter>
                <View style={styles.stamps}>
                  {countries.map((cc, i) => (
                    <View key={cc} style={styles.stampCell}>
                      <Stamp code={cc} name={countryName(cc, locale)} kind={cc === landedCC ? 'landed' : 'overflown'} fresh={fresh.has(cc)} stampDelay={300 + i * 280} />
                      <Space h={s.x1} />
                      <Small numberOfLines={2} style={styles.stampName}>
                        {countryName(cc, locale)}
                      </Small>
                    </View>
                  ))}
                </View>
              </Gutter>
              {fresh.size > 0 ? (
                <Gutter>
                  <Small tone="accent">{t('arrival.newCountries', { count: fresh.size })}</Small>
                </Gutter>
              ) : null}
            </>
          ) : null}

          {lines.length > 0 ? (
            <View style={styles.lines}>
              {Array.from(new Set(lines)).map((l) => (
                <View key={l} style={styles.lineRow}>
                  <View style={styles.linePip} />
                  <Body style={styles.flex}>{t(`line.${l}`)}</Body>
                  <DataSmall tone="brass" allowFontScaling={false}>
                    {t('arrival.crossed')}
                  </DataSmall>
                </View>
              ))}
            </View>
          ) : null}

          {!pkg.demo ? <XpBlock landing={landing} /> : (
            <Gutter style={styles.section}>
              <Small>{t('arrival.demoNote')}</Small>
            </Gutter>
          )}

          {landing.earned.length > 0 ? (
            <>
              <Gutter style={styles.section}>
                <Label tone="dim">{t('arrival.newAchievements')}</Label>
              </Gutter>
              {landing.earned.map((a) => (
                <View key={a.id} style={styles.achievement}>
                  <Title tone="accent">{t(`ach.${a.id}.name`)}</Title>
                  <Space h={s.x1} />
                  <Body tone="muted">{t(`ach.${a.id}.desc`)}</Body>
                </View>
              ))}
            </>
          ) : null}

          {spotted.length > 0 || cats.length > 0 ? (
            <>
              <Gutter style={styles.section}>
                <Label tone="dim">{t('arrival.collected')}</Label>
                {cats.length > 0 ? (
                  <>
                    <Space h={s.x2} />
                    <Body tone="muted">{cats.map(([c, n]) => `${t(`category.${c}`)} ${n}`).join(' · ')}</Body>
                  </>
                ) : null}
              </Gutter>
              {spotted.map((p) => (
                <PressSurface key={p.id} onPress={() => nav.navigate('POIDetail', { poiId: p.id, flightId })} accessibilityLabel={placeName(p, locale)} style={styles.row}>
                  <DataSmall tone="brass" allowFontScaling={false}>
                    ★
                  </DataSmall>
                  <Body numberOfLines={1} style={styles.flex}>
                    {placeName(p, locale)}
                  </Body>
                  <DataSmall allowFontScaling={false}>{t(`category.${p.category}`)}</DataSmall>
                </PressSurface>
              ))}
            </>
          ) : null}

          {quiz.length > 0 ? (
            <>
              <Gutter style={styles.section}>
                <Label tone="dim">{t('arrival.quiz')}</Label>
              </Gutter>
              {quiz.map((q) => (
                <QuizCard key={q.id} q={q} />
              ))}
            </>
          ) : null}

          <Gutter style={styles.section}>
            <Label tone="dim">{t('arrival.postcard')}</Label>
          </Gutter>
          <View style={styles.postcardWrap}>
            <Postcard ref={postcard} pkg={pkg} width={Math.min(width - gutter * 2, 420)} spotted={spotted.length} />
          </View>
          {Platform.OS !== 'web' ? (
            <PressSurface onPress={() => shareView(postcard).catch(() => {})} accessibilityLabel={t('arrival.share')} style={styles.row}>
              <Body style={styles.flex}>{t('arrival.share')}</Body>
              <Data tone="accent" allowFontScaling={false}>
                ↗
              </Data>
            </PressSurface>
          ) : null}
          <Rule />
          {!pkg.demo ? (
            <PressSurface onPress={() => nav.navigate('AddFlight', { returnOf: flightId })} accessibilityLabel={t('arrival.addReturn')} style={styles.row}>
              <Body style={styles.flex}>{t('arrival.addReturn')}</Body>
              <Data tone="dim" allowFontScaling={false}>
                +
              </Data>
            </PressSurface>
          ) : null}
        </Animated.View>
        <Space h={s.x10} />
      </ScrollView>
      <ActionBar
        label={pkg.demo ? t('arrival.toBoard') : t('arrival.toPassport')}
        onPress={() => nav.navigate('Tabs', { screen: pkg.demo ? 'Board' : 'Atlas' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center' },
  spread: { justifyContent: 'space-between' },
  scroll: { paddingBottom: s.x4 },
  head: { justifyContent: 'space-between', paddingTop: s.x3, paddingBottom: s.x2 },
  dial: { alignItems: 'center', paddingVertical: s.x2 },
  section: { paddingTop: s.x10, paddingBottom: s.x3 },

  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x4 },
  stampCell: { width: 80, alignItems: 'center' },
  stampName: { textAlign: 'center', fontSize: 11, lineHeight: 14 },

  lines: { marginTop: s.x6, borderTopWidth: line.hair, borderTopColor: palette.rule },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft,
    backgroundColor: palette.warm
  },
  linePip: { width: 10, height: 2, backgroundColor: palette.brass },

  xp: { paddingTop: s.x10 },
  track: { height: 2, backgroundColor: palette.rule },
  fill: { height: 2, backgroundColor: palette.amber },

  achievement: {
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft,
    backgroundColor: palette.warm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },

  quiz: { marginBottom: s.x6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  optionPressed: { backgroundColor: palette.raised },
  optionRight: { backgroundColor: palette.warm, borderLeftWidth: 2, borderLeftColor: palette.amber },
  optionWrong: { opacity: 0.45 },

  postcardWrap: { alignItems: 'center', paddingBottom: s.x4 }
});
