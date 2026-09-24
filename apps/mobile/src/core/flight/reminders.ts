import type { OfflinePackage } from '@skyatlas/shared';
import { windowAdvice } from './windowAdvice';
import { placeName } from '../places/names';
import { t, getLocale } from '../../i18n';
import type { LocalAlert } from '../ux/notifications';

/**
 * The two nudges on the ground, scheduled when a flight is added.
 *
 * - At check-in (a day before departure): which window to ask for, named by
 *   what will be on that side. Skipped when the seat is already known, or
 *   when neither side will show much — the honest advice then is not to fight
 *   for a window.
 * - Just after the scheduled departure: "Took off?", with a lock-screen button
 *   that starts the flight in one tap. Without it the passenger has to
 *   remember the app at the exact moment they are told to put phones away.
 */

export const TAKEOFF_CATEGORY = 'takeoff';
export const TOOK_OFF_ACTION = 'took-off';

/** Off-block to wheels-up, typically; the prompt should arrive once airborne. */
const TAKEOFF_PROMPT_AFTER_MS = 15 * 60_000;
const CHECK_IN_BEFORE_MS = 24 * 3600_000;

export function reminderIds(flightId: string): string[] {
  return [`${flightId}:seat`, `${flightId}:takeoff`];
}

export function remindersFor(pkg: OfflinePackage, now: Date = new Date()): LocalAlert[] {
  if (pkg.demo) return [];
  const locale = getLocale();
  const f = pkg.flight;
  const route = `${f.origin.iata} — ${f.destination.iata}`;
  const dep = new Date(f.scheduledDeparture).getTime();
  if (Number.isNaN(dep)) return [];
  const [seatId, takeoffId] = reminderIds(f.id);
  const out: LocalAlert[] = [];

  const checkIn = dep - CHECK_IN_BEFORE_MS;
  const seatKnown = pkg.seat?.side === 'left' || pkg.seat?.side === 'right';
  if (!seatKnown && checkIn > now.getTime() + 10 * 60_000) {
    const advice = windowAdvice(pkg.route, pkg.pois, new Date(dep + 10 * 60_000));
    const names = (ids: string[]) =>
      ids
        .slice(0, 2)
        .map((id) => pkg.pois.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => placeName(p, locale));
    if (advice.best === 'left' || advice.best === 'right') {
      const top = names(advice.best === 'left' ? advice.leftIds : advice.rightIds);
      out.push({
        id: seatId,
        at: new Date(checkIn),
        title: t(advice.best === 'left' ? 'remind.seatLeftTitle' : 'remind.seatRightTitle'),
        body: top.length ? t('remind.seatBody', { route, names: top.join(', ') }) : t('remind.seatBodyPlain', { route }),
        data: { kind: 'seat', flightId: f.id }
      });
    } else if (advice.best === 'either') {
      out.push({
        id: seatId,
        at: new Date(checkIn),
        title: t('remind.seatEitherTitle'),
        body: t('remind.seatEitherBody', { route }),
        data: { kind: 'seat', flightId: f.id }
      });
    }
  }

  const prompt = dep + TAKEOFF_PROMPT_AFTER_MS;
  if (prompt > now.getTime() + 60_000) {
    out.push({
      id: takeoffId,
      at: new Date(prompt),
      title: t('remind.takeoffTitle', { route }),
      body: t('remind.takeoffBody'),
      data: { kind: 'takeoff', flightId: f.id },
      category: TAKEOFF_CATEGORY
    });
  }
  return out;
}
