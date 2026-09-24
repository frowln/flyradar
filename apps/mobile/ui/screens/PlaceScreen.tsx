import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Pressable, Linking, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OfflinePackage, POI } from '@skyatlas/shared';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, BodyLarge, Data, DataSmall, Small } from '../design/type';
import { Screen, Gutter, Cells, Space, PressSurface, Rule, Row, decorative } from '../design/layout';
import { useReveal, useReducedMotion } from '../motion';
import PlaceFigure from '../components/PlaceFigure';
import SideMark from '../components/SideMark';
import PlaceReviews from '../components/PlaceReviews';
import { loadPackage } from '../../src/core/offline/packageStore';
import { useSession } from '../../src/core/flight/session';
import { positionNow } from '../../src/core/flight/position';
import { placeName, placeText, countryName } from '../../src/core/places/names';
import { describePlace } from '../../src/core/places/describe';
import { placeFacts, inViewSeconds } from '../../src/core/places/facts';
import { canOpenPlace, notePlaceOpened, fullAccess } from '../../src/core/monetization/entitlement';
import { MONETIZATION_ENABLED } from '../../src/core/monetization/revenueCat';
import { getRecords } from '../../src/core/game/journal';
import { SOCIAL_ENABLED } from '../../src/core/features';
import { social } from '../../src/core/api/social';
import { km, metres, formatInt } from '../../src/core/units';
import { haptics } from '../../src/core/ux/haptics';
import { t, getLocale } from '../../src/i18n';
import { clock, relative, spokenDuration } from '../format';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'POIDetail'>;
type R = RouteProp<RootStackParamList, 'POIDetail'>;

const HERO_HEIGHT = 260;

const coords = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

/** Where and when, relative to the flight — the line that turns an article into a sighting. */
function PassLine({ poi, pkg }: { poi: POI; pkg: OfflinePackage }) {
  const session = useSession();
  const active = session.flightId === pkg.flight.id && session.takeoffAt && !session.landedAt;
  const d = km(poi.closestApproachKm ?? 0);
  const side = poi.side ?? 'below';
  const raw = side === 'below' ? t('place.overhead') : t('place.sideDistance', { side: t(`side.${side}`), dist: d.value, unit: t(`unit.${d.unit}`) });
  const where = raw.charAt(0).toUpperCase() + raw.slice(1);

  let when: string;
  if (active && poi.passAt != null) {
    const now = positionNow(pkg.route, new Date(session.takeoffAt!), new Date(), {
      multiplier: session.timeMultiplier,
      clockOffsetS: session.clockOffsetS
    });
    // An area flown over is "below you now" for its whole window, not at its
    // centre point; before and after, the countdown counts to its edges.
    if (poi.overFrom != null && poi.overTo != null && now.elapsedS >= poi.overFrom && now.elapsedS <= poi.overTo) when = t('place.belowNow');
    else if (poi.overFrom != null && now.elapsedS < poi.overFrom) when = relative(poi.overFrom - now.elapsedS);
    else when = relative(poi.passAt - now.elapsedS);
  } else {
    when = poi.passAt != null ? t('place.afterTakeoff', { t: clock(poi.passAt) }) : '';
  }

  return (
    <View style={styles.pass} accessible accessibilityLabel={when ? `${where}, ${when}` : where}>
      <SideMark side={side} size={28} />
      <View style={styles.flex}>
        <Body>{where}</Body>
        {when ? <Small tone="accent">{when}</Small> : null}
      </View>
    </View>
  );
}

/** The photos, swiped through, each with its own author and licence. */
function Gallery({ poi, name }: { poi: POI; name: string }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const photos = poi.photos;
  const credits = poi.photoCredits ?? (poi.photoCredit ? [poi.photoCredit] : []);
  const credit = credits[page];
  return (
    <View style={styles.hero}>
      {photos.length ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {photos.map((uri, i) => (
            <Image
              key={`${uri}-${i}`}
              source={{ uri }}
              style={{ width, height: HERO_HEIGHT }}
              contentFit="cover"
              transition={240}
              accessibilityLabel={photos.length > 1 ? t('place.photo', { name, n: i + 1, total: photos.length }) : name}
            />
          ))}
        </ScrollView>
      ) : (
        <PlaceFigure category={poi.category} seed={poi.id} height={HERO_HEIGHT} />
      )}
      <View style={styles.plate}>
        <Label tone="accent" numberOfLines={1}>
          {t(`category.${poi.category}`)}
        </Label>
      </View>
      {photos.length > 1 ? (
        <View style={styles.pager} {...decorative}>
          <DataSmall allowFontScaling={false}>{`${page + 1} / ${photos.length}`}</DataSmall>
        </View>
      ) : null}
      {photos.length && credit ? (
        <View style={styles.credit}>
          <DataSmall numberOfLines={1} allowFontScaling={false}>
            {`© ${credit}`}
          </DataSmall>
        </View>
      ) : null}
    </View>
  );
}

function SeeIt({ poi, pkg }: { poi: POI; pkg: OfflinePackage }) {
  const session = useSession();
  const got = session.spotted.includes(poi.id);
  const active = session.flightId === pkg.flight.id && session.takeoffAt && !session.landedAt;
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  if (!active) return null;

  const now = positionNow(pkg.route, new Date(session.takeoffAt!), new Date(), {
    multiplier: session.timeMultiplier,
    clockOffsetS: session.clockOffsetS
  });
  // "I see it" only means something while the place can be seen.
  const open = poi.visibleFrom == null || now.elapsedS >= poi.visibleFrom - 600;

  const press = () => {
    if (!open) return;
    useSession.getState().toggleSpotted(poi.id);
    if (!got) {
      haptics.success();
      if (reduced) return;
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, tension: 300, friction: 8 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 })
      ]).start();
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={press}
        accessibilityRole="button"
        accessibilityState={{ selected: got, disabled: !open }}
        accessibilityLabel={got ? t('place.seen') : t('place.seeIt')}
        accessibilityHint={got ? t('place.seenHint') : open ? t('place.seeItHint') : t('place.seeItLater')}
        style={({ pressed }) => [styles.seeIt, got && styles.seeItOn, !open && styles.seeItOff, pressed && open && styles.seeItPressed]}
      >
        <Label tone={got ? 'brass' : open ? 'accent' : 'dim'}>{got ? t('place.seen') : t('place.seeIt')}</Label>
        <Small tone="muted" style={styles.seeItHint}>
          {got ? t('place.seenHint') : open ? t('place.seeItHint') : t('place.seeItLater')}
        </Small>
      </Pressable>
    </Animated.View>
  );
}

export default function PlaceScreen() {
  const nav = useNavigation<Nav>();
  const { poiId, flightId } = useRoute<R>().params;
  const insets = useSafeAreaInsets();
  const locale = getLocale();
  const reveal = useReveal();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [pkg, setPkg] = useState<OfflinePackage | null>(null);
  const [poi, setPoi] = useState<POI | null>(null);
  const [loading, setLoading] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPackage(flightId)
      .then((p) => {
        if (!alive || !p) return;
        setPkg(p);
        const found = p.pois.find((x) => x.id === poiId) ?? null;
        setPoi(found);
        if (found) {
          const first = getRecords().filter((r) => r.flightId !== flightId).length === 0;
          if (fullAccess(first) || canOpenPlace(flightId, found.id)) notePlaceOpened(flightId, found.id);
          if (SOCIAL_ENABLED) social.discover(found.id, flightId);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      Speech.stop();
    };
  }, [poiId, flightId]);

  const speak = useCallback(() => {
    if (!poi) return;
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    const text = placeText(poi, locale);
    setSpeaking(true);
    Speech.speak([placeName(poi, locale), text.summary || describePlace(poi, locale), text.look].filter(Boolean).join('. '), {
      language: text.textLang ?? locale,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false)
    });
  }, [poi, speaking, locale]);

  const maskOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, HERO_HEIGHT - insets.top - 20), Math.max(1, HERO_HEIGHT - insets.top)],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  if (loading) return <Screen />;
  if (!poi || !pkg) {
    return (
      <Screen style={styles.center}>
        <Gutter>
          <Body tone="muted">{t('place.notFound')}</Body>
        </Gutter>
      </Screen>
    );
  }

  const name = placeName(poi, locale);
  const text = placeText(poi, locale);
  // Written facts first; the ones computed from the flight add what they cannot know.
  const facts = [...text.facts, ...placeFacts(poi, pkg)];
  const locked =
    MONETIZATION_ENABLED &&
    !fullAccess(getRecords().filter((r) => r.flightId !== flightId).length === 0) &&
    !canOpenPlace(flightId, poi.id);
  const seen = inViewSeconds(poi);
  const closest = km(poi.closestApproachKm ?? 0);
  const cells = [
    poi.elevation ? (() => { const m = metres(poi.elevation); return { value: m.value, label: `${t('place.elevation')} · ${t(`unit.${m.unit}`)}`, spoken: `${t('place.elevation')}: ${m.value} ${t(`unit.${m.unit}`)}` }; })() : null,
    poi.population ? { value: formatInt(poi.population), label: t('place.population') } : null,
    poi.extentKm && !poi.population ? (() => { const k = km(poi.extentKm * 2); return { value: k.value, label: `${t('place.extent')} · ${t(`unit.${k.unit}`)}`, spoken: `${t('place.extent')}: ${k.value} ${t(`unit.${k.unit}`)}` }; })() : null,
    poi.side !== 'below' && poi.closestApproachKm != null ? { value: closest.value, label: `${t('place.closest')} · ${t(`unit.${closest.unit}`)}`, spoken: `${t('place.closest')}: ${closest.value} ${t(`unit.${closest.unit}`)}` } : null,
    seen && seen >= 60 ? { value: clock(seen), label: t('place.inView'), spoken: `${t('place.inView')}: ${spokenDuration(seen)}` } : null
  ].filter(Boolean) as { value: string; label: string; spoken?: string }[];

  return (
    <Screen edges={[]}>
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <Gallery poi={poi} name={name} />

        <Animated.View style={reveal}>
          <Gutter>
            <Space h={s.x5} />
            <Display accessibilityRole="header">{name}</Display>
            {text.tagline ? (
              <>
                <Space h={s.x2} />
                <Body tone="muted">{text.tagline}</Body>
              </>
            ) : null}
            <Space h={s.x2} />
            <DataSmall>
              {[text.era, poi.country ? countryName(poi.country, locale) : null, coords(poi.lat, poi.lon)].filter(Boolean).join('  ·  ')}
            </DataSmall>
          </Gutter>

          <Space h={s.x5} />
          <PassLine poi={poi} pkg={pkg} />
          <SeeIt poi={poi} pkg={pkg} />

          {cells.length > 0 ? <Cells items={cells} /> : null}

          {text.look && !locked ? (
            <View style={styles.look}>
              <Label tone="accent" accessibilityRole="header">
                {t('place.lookTitle')}
              </Label>
              <Space h={s.x2} />
              <Body>{text.look}</Body>
            </View>
          ) : null}

          <Space h={s.x6} />
          {locked ? (
            <Gutter>
              <Body tone="muted">{t('place.locked')}</Body>
              <Space h={s.x3} />
              <PressSurface onPress={() => nav.navigate('Paywall')} accessibilityLabel={t('place.unlock')} hitSlop={s.x4}>
                <Label tone="accent">{t('place.unlock')}</Label>
              </PressSurface>
            </Gutter>
          ) : (
            <Gutter>
              {text.textLang ? (
                <>
                  <Label tone="dim">{t('place.inEnglish')}</Label>
                  <Space h={s.x2} />
                </>
              ) : null}
              {text.summary ? (
                <BodyLarge style={styles.measure}>{text.summary}</BodyLarge>
              ) : cells.length === 0 ? (
                <BodyLarge style={styles.measure}>{describePlace(poi, locale)}</BodyLarge>
              ) : null}
            </Gutter>
          )}

          {facts.length > 0 ? (
            <View style={styles.facts}>
              <Gutter>
                <Label tone="dim" accessibilityRole="header">{t('facts.title')}</Label>
              </Gutter>
              <Space h={s.x2} />
              {facts.map((f) => (
                <View key={f} style={styles.factRow}>
                  <View style={styles.factPip} />
                  <Body tone="muted" style={styles.flex}>
                    {f}
                  </Body>
                </View>
              ))}
            </View>
          ) : null}

          <Space h={s.x8} />
          <Rule />
          <PressSurface onPress={speak} accessibilityLabel={speaking ? t('place.stop') : t('place.listen')} style={styles.row}>
            <Body>{speaking ? t('place.stop') : t('place.listen')}</Body>
            <View style={styles.flex} />
            <Data tone="dim" allowFontScaling={false}>
              {speaking ? '■' : '▶'}
            </Data>
          </PressSurface>
          <Rule />

          {poi.sourceUrl ? (
            <PressSurface
              onPress={() => Linking.openURL(poi.sourceUrl!)}
              accessibilityRole="link"
              accessibilityLabel={poi.textSource === 'editorial' ? t('place.readMore') : `${t('place.source')}: ${t('place.sourceWikipedia')}`}
              style={styles.row}
            >
              <View style={styles.flex}>
                <Small>{poi.textSource === 'editorial' ? t('place.readMore') : t('place.sourceWikipedia')}</Small>
              </View>
              <Data tone="dim" allowFontScaling={false}>
                ↗
              </Data>
            </PressSurface>
          ) : null}

          {SOCIAL_ENABLED ? <PlaceReviews poiId={poi.id} /> : null}
        </Animated.View>
        <Space h={s.x16} />
      </Animated.ScrollView>

      <Animated.View pointerEvents="none" style={[styles.statusMask, { height: insets.top, opacity: maskOpacity }]} />
      <View style={[styles.backFloat, { top: insets.top + s.x2 }]} pointerEvents="box-none">
        <Row style={styles.spreadTop}>
          <PressSurface
            onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs', { screen: 'Board' }))}
            accessibilityLabel={t('common.back')}
            hitSlop={s.x2}
            style={styles.backBtn}
          >
            <Label tone="muted">{`‹ ${t('common.back')}`}</Label>
          </PressSurface>
        </Row>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center' },
  scroll: { paddingBottom: s.x8 },
  measure: { maxWidth: 520 },
  hero: { height: HERO_HEIGHT, backgroundColor: palette.warm },
  pager: {
    position: 'absolute',
    right: s.x2,
    top: s.x12,
    paddingHorizontal: s.x2,
    paddingVertical: 2,
    backgroundColor: 'rgba(8,10,12,0.7)'
  },
  look: {
    marginHorizontal: gutter,
    marginTop: s.x5,
    padding: s.x4,
    borderLeftWidth: line.bold,
    borderLeftColor: palette.amber,
    backgroundColor: palette.warm
  },
  plate: {
    position: 'absolute',
    left: gutter,
    bottom: s.x3,
    paddingHorizontal: s.x2,
    paddingVertical: s.x1,
    borderWidth: line.hair,
    borderColor: palette.amberDim,
    backgroundColor: palette.ground
  },
  credit: {
    position: 'absolute',
    right: s.x2,
    bottom: s.x2,
    maxWidth: '55%',
    paddingHorizontal: s.x2,
    paddingVertical: 2,
    backgroundColor: 'rgba(8,10,12,0.7)'
  },
  pass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.rule
  },
  seeIt: {
    marginHorizontal: gutter,
    marginBottom: s.x5,
    paddingVertical: s.x4,
    paddingHorizontal: s.x4,
    alignItems: 'center',
    borderWidth: line.bold,
    borderColor: palette.amber,
    backgroundColor: palette.warm
  },
  seeItOn: { borderColor: palette.brass, backgroundColor: palette.raised },
  seeItOff: { borderColor: palette.rule, backgroundColor: palette.ground },
  seeItPressed: { backgroundColor: palette.lifted },
  seeItHint: { marginTop: s.x1, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: s.x3, paddingHorizontal: gutter, paddingVertical: s.x4 },
  facts: { marginTop: s.x8 },
  factRow: {
    flexDirection: 'row',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  factPip: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.amber, marginTop: 9 },
  statusMask: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: palette.ground },
  backFloat: { position: 'absolute', left: 0, right: 0 },
  spreadTop: { justifyContent: 'space-between', paddingHorizontal: gutter },
  backBtn: {
    paddingVertical: s.x2,
    paddingHorizontal: s.x3,
    borderWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.ground
  }
});
