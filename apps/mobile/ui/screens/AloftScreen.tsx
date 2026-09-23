import { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp as NavRouteProp } from '@react-navigation/native';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Title, Data, DataSmall, Body } from '../design/type';
import { Screen, Cells, PressSurface, Space } from '../design/layout';
import { useReveal, useReducedMotion } from '../motion';
import Dial from '../components/Dial';
import RouteMap from '../components/RouteMap';
import { useFlightStore } from '../../src/core/flight/flightStore';
import { computePosition, computeHeading } from '../../src/core/flight/positionEngine';
import { tryFetchLivePosition } from '../../src/core/flight/liveTracker';
import { getNextPOI } from '../../src/core/flight/poiScheduler';
import type { ScheduledPOI } from '../../src/core/flight/poiScheduler';
import { viewingSide } from '../../src/core/geo/viewingSide';
import { haversine } from '../../src/core/geo/greatCircle';
import { collectionsStore } from '../../src/core/gamification/collections';
import { analytics } from '../../src/core/analytics';
import { haptics } from '../../src/core/ux/haptics';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';
import type { POI } from '@skyatlas/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'InFlight'>;
type R = NavRouteProp<RootStackParamList, 'InFlight'>;

const TICK_MS = 5000;

const placeName = (poi: POI) => {
  const loc = getLocale().slice(0, 2) as keyof NonNullable<POI['translations']>;
  return poi.translations?.[loc]?.name ?? poi.name;
};

function remainingLabel(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Cruise.
 *
 * The map is the surface and the instruments sit on top of it, because the
 * question at 11 km is "what is that" long before it is "how long left".
 *
 * The old screen interrupted with a modal card whenever a place came near. This
 * one lights the rail instead: a passenger halfway through a film gets a signal
 * they can act on when they want, not a dialog they must dismiss. The rail stays
 * lit for as long as the place is in view, which is minutes, not seconds.
 */
export default function AloftScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const { flightId } = route.params;

  const { activePackage, takeoffAt, currentPosition, updatePosition } = useFlightStore();
  const [near, setNear] = useState<ScheduledPOI | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAnnounced = useRef<string | null>(null);
  const reveal = useReveal(120);
  const reduced = useReducedMotion();

  // A slow breath on the rail when a place is in view — the only ambient motion
  // on the screen, and it stops the moment the place is opened.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!near || reduced) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [near, pulse, reduced]);

  useEffect(() => {
    if (!activePackage || !takeoffAt) return;

    const run = async () => {
      const { mode, timeMultiplier, seenPOIs } = useFlightStore.getState();
      let pos =
        mode === 'live' ? await tryFetchLivePosition(activePackage.flight.flightNumber) : null;
      if (!pos) pos = computePosition(activePackage.route, takeoffAt, new Date(), timeMultiplier);
      updatePosition(pos);

      const last = activePackage.route[activePackage.route.length - 1]!;
      if (pos.elapsedSeconds >= last.elapsedSeconds) {
        if (tick.current) clearInterval(tick.current);
        nav.replace('FlightSummary', { flightId });
        return;
      }

      const seen = new Set(seenPOIs.map((x) => x.poiId));
      const upcoming = await getNextPOI(flightId, pos, seen);
      setNear(upcoming);

      // One haptic per place, when it first comes into view.
      if (upcoming && upcoming.poi.id !== lastAnnounced.current) {
        lastAnnounced.current = upcoming.poi.id;
        haptics.light?.();
      }
    };

    analytics.track('flight_started', { flightId });
    run();
    tick.current = setInterval(run, TICK_MS);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [activePackage, takeoffAt, flightId, nav, updatePosition]);

  const openPlace = useCallback(
    (poi: POI) => {
      analytics.track('poi_viewed', { poiId: poi.id, name: poi.name });
      useFlightStore.getState().markPOISeen(poi.id);
      nav.navigate('POIDetail', { poiId: poi.id, flightId });
    },
    [nav, flightId]
  );

  if (!activePackage || !takeoffAt || !currentPosition) {
    return (
      <Screen style={styles.center}>
        <Body tone="muted">{t('inFlight.noActiveFlight')}</Body>
        <Space h={s.x4} />
        <PressSurface onPress={() => nav.navigate('Tabs')} accessibilityLabel={t('inFlight.goHome')}>
          <Label tone="accent">{t('inFlight.goHome')}</Label>
        </PressSurface>
      </Screen>
    );
  }

  const { flight, route: legs, pois } = activePackage;
  const last = legs[legs.length - 1]!;
  const progress = Math.min(1, currentPosition.elapsedSeconds / (last.elapsedSeconds || 1));
  const secondsLeft = Math.max(0, last.elapsedSeconds - currentPosition.elapsedSeconds);
  const heading = computeHeading(legs, takeoffAt, new Date(), useFlightStore.getState().timeMultiplier);
  const seenIds = new Set(useFlightStore.getState().seenPOIs.map((x) => x.poiId));

  const distanceLeft = Math.round(haversine(currentPosition.lat, currentPosition.lon, last.lat, last.lon));
  const speed = Math.round(
    haversine(legs[0]!.lat, legs[0]!.lon, last.lat, last.lon) / ((last.elapsedSeconds || 1) / 3600)
  );

  const sighting = near
    ? viewingSide(
        currentPosition.lat,
        currentPosition.lon,
        heading,
        near.poi.lat,
        near.poi.lon,
        currentPosition.altitude / 1000
      )
    : null;

  return (
    <Screen>
      {/* The bar is opaque, so there is nothing to gain from floating the map
          underneath it — and a laid-out bar cannot land under the notch. */}
      <View style={styles.topRow}>
        <PressSurface
          onPress={() => nav.navigate('Tabs')}
          accessibilityLabel={t('inFlight.exit')}
          style={styles.exit}
        >
          <Label tone="muted">{t('inFlight.exit')}</Label>
        </PressSurface>
        <DataSmall allowFontScaling={false}>{flight.flightNumber}</DataSmall>
      </View>

      <View style={styles.map}>
        <RouteMap
          route={legs}
          position={currentPosition}
          pois={pois}
          seen={seenIds}
          onSelectPOI={openPlace}
          labelFor={placeName}
        />
      </View>


      <Animated.View style={[styles.panel, reveal]}>
        {near && sighting ? (
          <PressSurface
            onPress={() => openPlace(near.poi)}
            accessibilityLabel={placeName(near.poi)}
            style={styles.rail}
          >
            <Animated.View
              style={[
                styles.railPip,
                { opacity: reduced ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }
              ]}
            />
            <View style={styles.railText}>
              <Label tone="accent" numberOfLines={1}>
                {`${Math.max(1, Math.round(near.distanceKm))} ${t('atlas.km')} · ${t(
                  `inFlight.side_${sighting.side}`
                )}`}
              </Label>
              <Space h={s.x1} />
              <Title numberOfLines={1}>{placeName(near.poi)}</Title>
            </View>
            <Data tone="dim" allowFontScaling={false}>
              ›
            </Data>
          </PressSurface>
        ) : null}

        <View style={styles.dialRow}>
          <Dial
            size={196}
            progress={progress}
            reading={remainingLabel(secondsLeft)}
            caption={`${t('inFlight.remaining')} · ${flight.destination.iata}`}
            accessibilityLabel={`${remainingLabel(secondsLeft)} ${t('inFlight.remaining')}`}
          />
        </View>

        <Cells
          items={[
            { value: Math.round(currentPosition.altitude).toLocaleString(), label: `${t('inFlight.altitude')} · M` },
            { value: String(speed), label: t('inFlight.kmh') },
            { value: distanceLeft.toLocaleString(), label: `${t('inFlight.remaining')} · KM` }
          ]}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    backgroundColor: palette.ground,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  exit: { paddingVertical: s.x1, paddingRight: s.x4 },

  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.ground,
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    paddingBottom: s.x8
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule,
    backgroundColor: palette.warm
  },
  railPip: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.amber },
  railText: { flex: 1, minWidth: 0 },

  dialRow: { alignItems: 'center', paddingTop: s.x2, paddingBottom: s.x2 }
});
