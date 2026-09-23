import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall, Title } from '../design/type';
import { Screen, Gutter, Cells, Space, ActionBar, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import Dial from '../components/Dial';
import RouteRule from '../components/RouteRule';
import { loadPackage } from '../../src/core/offline/poiDatabase';
import { useFlightStore } from '../../src/core/flight/flightStore';
import { haversine } from '../../src/core/geo/greatCircle';
import { collectionsStore } from '../../src/core/gamification/collections';
import { ACHIEVEMENTS, evaluateAchievements } from '../../src/core/gamification/achievements';
import { analytics } from '../../src/core/analytics';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';
import type { OfflinePackage, POI } from '@skyatlas/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'FlightSummary'>;
type R = RouteProp<RootStackParamList, 'FlightSummary'>;

const placeName = (poi: POI) => {
  const loc = getLocale().slice(0, 2) as keyof NonNullable<POI['translations']>;
  return poi.translations?.[loc]?.name ?? poi.name;
};

/**
 * Arrival.
 *
 * The dial closes here at full — the same instrument that counted down to the
 * gate and tracked the cruise, now complete. Three appearances of one object
 * across one journey is what makes the flight feel like a thing that happened
 * rather than a session that ended.
 *
 * What the passenger collected leads; the statistics support it. A summary that
 * opens with distance flown is a receipt, not a memory.
 */
export default function ArrivalScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const { flightId } = route.params;

  const [pkg, setPkg] = useState<OfflinePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const reveal = useReveal();

  const seenIds = useFlightStore((st) => st.seenPOIs);

  useEffect(() => {
    let alive = true;
    loadPackage(flightId)
      .then((loaded) => {
        if (!alive || !loaded) return;
        setPkg(loaded);

        const first = loaded.route[0]!;
        const last = loaded.route[loaded.route.length - 1]!;
        const distanceKm = haversine(first.lat, first.lon, last.lat, last.lon);
        const durationHours = last.elapsedSeconds / 3600;
        const departureHour = new Date(loaded.flight.scheduledDeparture).getHours();

        collectionsStore.recordFlight({
          distanceKm,
          durationHours,
          poisSeen: seenIds.length,
          isNight: departureHour >= 22 || departureHour <= 5
        });
        collectionsStore.addCountry(loaded.flight.destination.country);

        const earned = collectionsStore.getEarnedAchievements();
        const fresh = evaluateAchievements(collectionsStore.getStats(), earned);
        if (fresh.length) {
          collectionsStore.addAchievements(fresh);
          setUnlocked(fresh);
        }

        analytics.track('flight_completed', { flightId, poisSeen: seenIds.length });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // Recording must happen exactly once per arrival, so seenIds is read but not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightId]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={palette.amber} />
      </Screen>
    );
  }

  if (!pkg) {
    return (
      <Screen style={styles.center}>
        <Body tone="muted">{t('flightDetail.flightNotFound')}</Body>
      </Screen>
    );
  }

  const { flight, route: legs, pois } = pkg;
  const last = legs[legs.length - 1]!;
  const distanceKm = Math.round(haversine(legs[0]!.lat, legs[0]!.lon, last.lat, last.lon));
  const hours = Math.floor(last.elapsedSeconds / 3600);
  const minutes = Math.round((last.elapsedSeconds % 3600) / 60);

  const seenSet = new Set(seenIds.map((x) => x.poiId));
  const discovered = pois.filter((p) => seenSet.has(p.id));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter>
            <Space h={s.x3} />
            <Label tone="accent">{t('arrival.landed')}</Label>
          </Gutter>

          <View style={styles.dial}>
            <Dial
              progress={1}
              reading={`${hours}:${String(minutes).padStart(2, '0')}`}
              caption={`${t('arrival.inTheAir')} · ${flight.destination.iata}`}
              accessibilityLabel={t('arrival.landed')}
            />
          </View>

          <RouteRule
            fromCode={flight.origin.iata}
            toCode={flight.destination.iata}
            fromCity={flight.origin.city}
            toCity={flight.destination.city}
            progress={1}
          />

          <Space h={s.x6} />
          <Cells
            items={[
              { value: distanceKm.toLocaleString(), label: `${t('atlas.km')}` },
              { value: String(discovered.length), label: t('arrival.discovered'), tone: 'accent' },
              { value: String(pois.length), label: t('arrival.onRoute') }
            ]}
          />

          {discovered.length > 0 ? (
            <>
              <Space h={s.x10} />
              <Gutter>
                <Label tone="dim">{t('arrival.collected')}</Label>
              </Gutter>
              <Space h={s.x3} />
              {discovered.map((poi, i) => (
                <PressSurface
                  key={poi.id}
                  onPress={() => nav.navigate('POIDetail', { poiId: poi.id, flightId })}
                  accessibilityLabel={placeName(poi)}
                  style={styles.row}
                >
                  <DataSmall tone="accent" allowFontScaling={false} style={styles.plate}>
                    {String(i + 1).padStart(3, '0')}
                  </DataSmall>
                  <Body numberOfLines={1} style={styles.rowName}>
                    {placeName(poi)}
                  </Body>
                  <View style={styles.leader} />
                  <DataSmall allowFontScaling={false}>{t(`category.${poi.category}`)}</DataSmall>
                </PressSurface>
              ))}
            </>
          ) : (
            <>
              <Space h={s.x10} />
              <Gutter>
                <Body tone="muted">{t('arrival.nothingOpened')}</Body>
              </Gutter>
            </>
          )}

          {unlocked.length > 0 ? (
            <>
              <Space h={s.x10} />
              <Gutter>
                <Label tone="dim">{t('arrival.newAchievements')}</Label>
              </Gutter>
              <Space h={s.x3} />
              <Rule />
              {unlocked.map((id) => {
                const a = ACHIEVEMENTS.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <View key={id} style={styles.achievement}>
                    <Title tone="accent">{a.name}</Title>
                    <Space h={s.x1} />
                    <Body tone="muted">{a.description}</Body>
                  </View>
                );
              })}
            </>
          ) : null}
        </Animated.View>

        <Space h={s.x12} />
      </ScrollView>

      <ActionBar label={t('arrival.toAtlas')} onPress={() => nav.navigate('Tabs')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: s.x4 },
  dial: { alignItems: 'center', paddingVertical: s.x2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  plate: { width: 30 },
  rowName: { flexShrink: 1 },
  leader: { flex: 1, height: line.hair, backgroundColor: palette.ruleSoft },

  achievement: {
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft,
    backgroundColor: palette.warm
  }
});
