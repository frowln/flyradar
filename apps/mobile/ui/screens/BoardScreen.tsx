import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, DataSmall, Title } from '../design/type';
import { Screen, Gutter, Row, Cells, ActionBar, PressSurface, Space } from '../design/layout';
import { useReveal } from '../motion';
import Dial from '../components/Dial';
import RouteRule from '../components/RouteRule';
import { listPackages, loadPackage, initDb } from '../../src/core/offline/poiDatabase';
import { useFlightStore } from '../../src/core/flight/flightStore';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';
import type { OfflinePackage, POI } from '@skyatlas/shared';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

interface Row_ {
  flightId: string;
  pkg: OfflinePackage;
}

/** How far out the dial starts filling toward departure. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '--:--'
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function legLength(from: string, to: string): string {
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins <= 0) return '--';
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

function untilDeparture(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return '00:00';
  const mins = Math.floor(diff / 60_000);
  const days = Math.floor(mins / 1440);
  if (days > 0) return `${days}·${String(Math.floor((mins % 1440) / 60)).padStart(2, '0')}`;
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

const upcoming = (iso: string) => new Date(iso).getTime() > Date.now();

function placeName(poi: POI): string {
  const loc = getLocale().slice(0, 2) as keyof NonNullable<POI['translations']>;
  return poi.translations?.[loc]?.name ?? poi.name;
}

/**
 * What is under the route, shown before boarding.
 *
 * This strip is the reason to open the app at the gate rather than at 11 km:
 * it answers "is this flight worth it" while the passenger still has signal and
 * nothing to do.
 */
function Beneath({ pois, onOpen }: { pois: POI[]; onOpen: (poi: POI) => void }) {
  if (pois.length === 0) return null;

  return (
    <View style={styles.beneath}>
      <Gutter>
        <Label tone="dim">{t('board.beneath')}</Label>
      </Gutter>
      <Space h={s.x3} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {pois.slice(0, 10).map((poi) => (
          <PressSurface
            key={poi.id}
            onPress={() => onOpen(poi)}
            accessibilityLabel={placeName(poi)}
            style={styles.card}
          >
            <Label tone="accent" numberOfLines={1}>
              {t(`category.${poi.category}`)}
            </Label>
            <Space h={s.x2} />
            <Body numberOfLines={2}>{placeName(poi)}</Body>
          </PressSurface>
        ))}
      </ScrollView>
    </View>
  );
}

export default function BoardScreen() {
  const nav = useNavigation<Nav>();
  const [rows, setRows] = useState<Row_[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, tick] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const reveal = useReveal();

  /**
   * Starting a flight asks one question first: did you actually leave on time?
   *
   * Position at cruise is dead-reckoned from the departure moment, so a takeoff
   * that ran forty minutes late puts every place forty minutes out for the whole
   * flight. One tap here is worth more to accuracy than any amount of smoothing
   * later.
   */
  const begin = useCallback(
    (pkg: OfflinePackage, flightId: string, at: Date) => {
      const store = useFlightStore.getState();
      store.clearFlight();
      store.setPackage(pkg);
      store.confirmTakeoff(at);
      setConfirming(false);
      nav.navigate('InFlight', { flightId });
    },
    [nav]
  );

  const load = useCallback(async () => {
    await initDb();
    const stored = await listPackages();
    const out: Row_[] = [];
    for (const row of stored) {
      const pkg = await loadPackage(row.flightId);
      if (pkg) out.push({ flightId: row.flightId, pkg });
    }
    out.sort(
      (a, b) =>
        new Date(a.pkg.flight.scheduledDeparture).getTime() -
        new Date(b.pkg.flight.scheduledDeparture).getTime()
    );
    setRows(out);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Advance the countdown without touching storage.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={palette.amber} />
      </Screen>
    );
  }

  const next = rows.find((r) => upcoming(r.pkg.flight.scheduledDeparture));

  if (!next) {
    return (
      <Screen>
        <Animated.View style={[styles.emptyBody, reveal]}>
          <Gutter>
            <Label tone="accent" style={styles.wordmark}>
              SKYATLAS
            </Label>
            <Space h={s.x4} />
            <Display>{t('board.noFlightTitle')}</Display>
            <Space h={s.x3} />
            <Body tone="muted" style={styles.measure}>
              {t('board.noFlightBody')}
            </Body>
          </Gutter>
        </Animated.View>
        <ActionBar label={t('board.addFlight')} onPress={() => nav.navigate('AddFlight')} />
      </Screen>
    );
  }

  const { flight, pois } = next.pkg;
  const left = Math.max(0, new Date(flight.scheduledDeparture).getTime() - Date.now());
  const readiness = 1 - Math.min(1, left / WINDOW_MS);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.amber} />
        }
      >
        <Animated.View style={reveal}>
          <Gutter>
            <Row style={styles.head}>
              <Label tone="accent">{t('board.nextFlight')}</Label>
              <DataSmall allowFontScaling={false}>{flight.flightNumber}</DataSmall>
            </Row>
          </Gutter>

          <View style={styles.dial}>
            <Dial
              progress={readiness}
              reading={untilDeparture(flight.scheduledDeparture)}
              caption={`${t('board.untilDeparture')} · ${hhmm(flight.scheduledDeparture)}`}
              accessibilityLabel={`${untilDeparture(flight.scheduledDeparture)} ${t('board.untilDeparture')}`}
            />
          </View>

          <RouteRule
            fromCode={flight.origin.iata}
            toCode={flight.destination.iata}
            fromCity={flight.origin.city}
            toCity={flight.destination.city}
          />

          <Space h={s.x6} />
          <Cells
            items={[
              { value: hhmm(flight.scheduledDeparture), label: t('board.departure') },
              {
                value: legLength(flight.scheduledDeparture, flight.scheduledArrival),
                label: t('board.duration')
              },
              { value: String(pois.length), label: t('board.places') }
            ]}
          />

          <Beneath
            pois={pois}
            onOpen={(poi) => nav.navigate('POIDetail', { poiId: poi.id, flightId: next.flightId })}
          />

          {rows.length > 1 ? (
            <View style={styles.later}>
              <Gutter>
                <Label tone="dim">{t('board.later')}</Label>
              </Gutter>
              <Space h={s.x2} />
              {rows
                .filter((r) => r.flightId !== next.flightId)
                .map((r) => (
                  <View
                    key={r.flightId}
                    accessible
                    accessibilityLabel={`${r.pkg.flight.origin.iata} — ${r.pkg.flight.destination.iata}`}
                    style={styles.laterRow}
                  >
                    <Title>
                      {r.pkg.flight.origin.iata} — {r.pkg.flight.destination.iata}
                    </Title>
                    <View style={styles.laterFill} />
                    <DataSmall allowFontScaling={false}>
                      {hhmm(r.pkg.flight.scheduledDeparture)}
                    </DataSmall>
                  </View>
                ))}
            </View>
          ) : null}
        </Animated.View>

        <Space h={s.x8} />
      </ScrollView>

      {confirming ? (
        <View style={styles.confirm}>
          <Gutter>
            <Label tone="dim">{t('board.takeoffWhen')}</Label>
          </Gutter>
          <Space h={s.x3} />
          <PressSurface
            onPress={() => begin(next.pkg, next.flightId, new Date())}
            accessibilityLabel={t('board.takeoffNow')}
            style={styles.confirmRow}
          >
            <Label tone="accent">{t('board.takeoffNow')}</Label>
          </PressSurface>
          <PressSurface
            onPress={() =>
              begin(next.pkg, next.flightId, new Date(flight.scheduledDeparture))
            }
            accessibilityLabel={t('board.takeoffScheduled')}
            style={styles.confirmRow}
          >
            <Label tone="muted">{`${t('board.takeoffScheduled')} · ${hhmm(flight.scheduledDeparture)}`}</Label>
          </PressSurface>
          <PressSurface
            onPress={() => setConfirming(false)}
            accessibilityLabel={t('common.cancel')}
            style={styles.confirmRow}
          >
            <Label tone="dim">{t('common.cancel')}</Label>
          </PressSurface>
        </View>
      ) : (
        <ActionBar label={t('board.start')} onPress={() => setConfirming(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: s.x2 },
  head: { justifyContent: 'space-between', paddingTop: s.x3, paddingBottom: s.x2 },
  wordmark: { letterSpacing: 3.5 },
  dial: { alignItems: 'center', paddingVertical: s.x2 },
  measure: { maxWidth: 330 },

  emptyBody: { flex: 1, justifyContent: 'center' },

  beneath: { marginTop: s.x10 },
  strip: { paddingHorizontal: gutter, gap: s.x2 },
  card: {
    width: 150,
    padding: s.x3,
    borderWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.raised
  },

  later: { marginTop: s.x10 },
  laterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  laterFill: { flex: 1, height: line.hair, backgroundColor: palette.ruleSoft },

  confirm: {
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    backgroundColor: palette.raised,
    paddingTop: s.x4,
    paddingBottom: s.x6
  },
  confirmRow: {
    alignItems: 'center',
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  }
});
