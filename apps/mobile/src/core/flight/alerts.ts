import type { Moment, OfflinePackage } from '@skyatlas/shared';
import { pickAlerts, computeMoments } from './moments';
import { interpolateAlongRoute, headingAt } from '../geo/greatCircle';
import { solarElevation, sunsetThreshold, sunSide } from '../geo/sun';
import { placeName, placeText, countryName } from '../places/names';
import { km } from '../units';
import { t, getLocale } from '../../i18n';
import { settings } from '../settings';
import type { LocalAlert } from '../ux/notifications';
import { groundHidden } from './clouds';

/**
 * What the phone will say at cruise, decided at takeoff.
 *
 * Alerts fire a few minutes before the moment, so there is time to lift a
 * blind. Sights are only announced in daylight, not under a forecast low
 * overcast (borders, lines and the sun still are — they need no view of the
 * ground), and, when the seat is known, only on the passenger's side.
 */

const LEAD_S = 4 * 60;

function daylightAt(pkg: OfflinePackage, takeoff: Date, at: number): boolean {
  const p = interpolateAlongRoute(pkg.route, at);
  const when = new Date(takeoff.getTime() + at * 1000);
  return solarElevation(p.lat, p.lon, when) > sunsetThreshold(p.altitude) - 2;
}

export function sideLabel(side: string | undefined): string {
  return t(`side.${side ?? 'below'}`);
}

/** Notification titles start a sentence, whatever the template put first. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A tagline ends without a full stop; a notification body reads better with one. */
function sentence(s: string, locale: string): string {
  const x = s.trim();
  if (/[.!?…。！？]$/.test(x)) return x;
  return x + (locale === 'ja' ? '。' : '.');
}

/**
 * What to say about a place on the lock screen: what to look for, when it has
 * been written, else its one-line hook. "Look out, it is 80 km away" alone
 * does not tell anyone why to lift the blind.
 */
function hook(poi: OfflinePackage['pois'][number], locale: string): string | undefined {
  const text = placeText(poi, locale);
  const s = text.look ?? text.tagline;
  return s ? sentence(s, locale) : undefined;
}

export function alertFor(m: Moment, pkg: OfflinePackage, takeoff: Date, multiplier = 1): LocalAlert | null {
  const locale = getLocale();
  const at = new Date(takeoff.getTime() + (Math.max(10, m.at - LEAD_S) * 1000) / multiplier);
  const id = `${pkg.flight.id}:${m.id}`.slice(0, 120);
  const data = { kind: 'flight' as const, flightId: pkg.flight.id };

  if (m.kind === 'sight' && m.poiId) {
    const poi = pkg.pois.find((p) => p.id === m.poiId);
    if (!poi) return null;
    const name = placeName(poi, locale);
    const dist = km(poi.closestApproachKm ?? 0);
    const toPlace = { kind: 'sight' as const, flightId: pkg.flight.id, poiId: poi.id };
    const text = hook(poi, locale);
    return m.side === 'below'
      ? { id, at, title: t('alert.belowTitle', { name }), body: text ?? t('alert.belowBody'), data: toPlace }
      : {
          id,
          at,
          title: cap(t('alert.sightTitle', { side: sideLabel(m.side), name })),
          body: text
            ? t('alert.sightBodyWith', { text, dist: dist.value, unit: t(`unit.${dist.unit}`) })
            : t('alert.sightBody', { dist: dist.value, unit: t(`unit.${dist.unit}`) }),
          data: toPlace
        };
  }
  if (m.kind === 'line' && m.line) {
    return { id, at, title: t(`alert.line.${m.line}`), body: t('alert.lineBody'), data };
  }
  if (m.kind === 'sunrise' || m.kind === 'sunset') {
    const p = interpolateAlongRoute(pkg.route, m.at);
    const side = sunSide(p.lat, p.lon, new Date(takeoff.getTime() + m.at * 1000), headingAt(pkg.route, m.at));
    return { id, at, title: t(`alert.${m.kind}`), body: t('alert.sunBody', { side: t(`side.${side}`) }), data };
  }
  if (m.kind === 'border' && m.cc) {
    return { id, at, title: t('alert.borderTitle', { country: countryName(m.cc, locale) }), body: t('alert.borderBody'), data };
  }
  return null;
}

/** The alerts for a flight, per the passenger's setting. */
export function alertsForFlight(pkg: OfflinePackage, takeoff: Date, multiplier = 1): LocalAlert[] {
  const level = settings.getAlerts();
  if (level === 'off') return [];
  const moments = computeMoments({ route: pkg.route, pois: pkg.pois, countries: pkg.countries, takeoff }).filter(
    (m) => !(m.kind === 'sight' && groundHidden(pkg, m.at))
  );
  const picked = pickAlerts(moments, {
    max: level === 'more' ? 6 : 3,
    minGapS: level === 'more' ? 10 * 60 : 15 * 60,
    seatSide: pkg.seat?.side,
    daylight: (at) => daylightAt(pkg, takeoff, at)
  });
  return picked.map((m) => alertFor(m, pkg, takeoff, multiplier)).filter((a): a is LocalAlert => !!a);
}

export { headingAt };
