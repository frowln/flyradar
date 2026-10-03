import type { OfflinePackage } from '@skyatlas/shared';
import { useSession } from './session';
import { alertsForFlight } from './alerts';
import { cancelAlerts, notificationPermission, registerCategory, scheduleAlerts } from '../ux/notifications';
import { remindersFor, reminderIds, TAKEOFF_CATEGORY, TOOK_OFF_ACTION } from './reminders';
import { listPackages } from '../offline/packageStore';
import { t } from '../../i18n';
import { settings } from '../settings';
import { recordFromFlight } from '../game/record';
import { buildPassport } from '../game/passport';
import { getRecords, saveRecord } from '../game/journal';
import { newlyEarned, type AchievementDef } from '../game/achievements';
import { xpLedger, totalXP } from '../game/xp';
import type { FlightRecord, Passport } from '../game/types';
import { countryByCode } from '../data/datasets';
import { DEMO_COUNTS } from '../api/demoFlag';

/**
 * The verbs of a flight: take off, correct the takeoff time, land.
 *
 * Screens call these instead of touching the session, the scheduler and the
 * journal separately — the previous version did that from three screens, and
 * each had its own idea of when a flight counted.
 */

export const continentOf = (cc: string): string | undefined => {
  try {
    return countryByCode(cc)?.cont;
  } catch {
    return undefined;
  }
};

async function reschedule(pkg: OfflinePackage, takeoffAt: Date, multiplier: number) {
  const s = useSession.getState();
  await cancelAlerts(s.alertIds);
  const ids = await scheduleAlerts(alertsForFlight(pkg, takeoffAt, multiplier));
  useSession.getState().setAlertIds(ids);
}

/**
 * Schedules the ground reminders for a flight just added. Asks for permission
 * here: a passenger who has just entered a flight sees why the app would want
 * to speak up later.
 */
export async function remindAbout(pkg: OfflinePackage, opts: { ask?: boolean } = {}): Promise<void> {
  await cancelAlerts(reminderIds(pkg.flight.id));
  if (settings.getAlerts() === 'off') return;
  if (!(await notificationPermission(opts.ask ?? false))) return;
  await registerCategory(TAKEOFF_CATEGORY, [{ id: TOOK_OFF_ACTION, title: t('remind.tookOffAction') }]);
  await scheduleAlerts(remindersFor(pkg));
}

/**
 * Re-schedules reminders for every flight still ahead — at launch, so they
 * follow a change of language or alert setting, and survive a reinstall of
 * the notification schedule by the OS.
 */
export async function refreshReminders(now: Date = new Date()): Promise<void> {
  const s = useSession.getState();
  const pkgs = await listPackages();
  for (const pkg of pkgs) {
    if (pkg.demo || s.flightId === pkg.flight.id) continue;
    if (new Date(pkg.flight.scheduledDeparture).getTime() < now.getTime() - 3600_000) continue;
    await remindAbout(pkg);
  }
}

export async function forgetReminders(flightId: string): Promise<void> {
  await cancelAlerts(reminderIds(flightId));
}

export async function takeOff(pkg: OfflinePackage, takeoffAt: Date, opts: { multiplier?: number } = {}): Promise<void> {
  const multiplier = opts.multiplier ?? (pkg.demo ? 20 : 1);
  await forgetReminders(pkg.flight.id);
  useSession.getState().start(pkg.flight.id, takeoffAt, { multiplier });
  // Asked here, at the moment the benefit is obvious, rather than at first launch.
  await notificationPermission(true);
  await reschedule(pkg, takeoffAt, multiplier);
}

export async function retimeTakeoff(pkg: OfflinePackage, takeoffAt: Date): Promise<void> {
  useSession.getState().retime(takeoffAt);
  await reschedule(pkg, takeoffAt, useSession.getState().timeMultiplier);
}

export interface Landing {
  record: FlightRecord | null;
  before: Passport;
  after: Passport;
  earned: AchievementDef[];
  xp: number;
  xpBefore: number;
}

/**
 * Lands the flight and writes it to the passport — once.
 *
 * Calling it again for the same flight (the arrival screen re-mounting, the app
 * restoring a landed session) returns the same result without counting twice.
 * Demo flights land but are never recorded.
 */
export async function land(pkg: OfflinePackage, elapsedS: number, now: Date = new Date()): Promise<Landing> {
  const s = useSession.getState();
  const others = getRecords().filter((r) => r.flightId !== pkg.flight.id);
  const before = buildPassport(others, continentOf);
  const xpBefore = totalXP(others);

  let record: FlightRecord | null = null;
  if ((!pkg.demo || DEMO_COUNTS) && s.flightId === pkg.flight.id && s.takeoffAt) {
    record = recordFromFlight(pkg, {
      takeoffAt: new Date(s.takeoffAt),
      landedAt: s.landedAt ? new Date(s.landedAt) : now,
      spotted: s.spotted,
      guesses: s.guesses,
      elapsedS
    });
    saveRecord(record);
  } else {
    record = getRecords().find((r) => r.flightId === pkg.flight.id) ?? null;
  }
  if (s.flightId === pkg.flight.id && !s.landedAt) {
    s.land(now);
    await cancelAlerts(s.alertIds);
    useSession.getState().setAlertIds([]);
  }

  const all = getRecords();
  const after = buildPassport(all, continentOf);
  const ledger = xpLedger(all);
  return {
    record,
    before,
    after,
    earned: newlyEarned(before, after),
    xp: ledger.find((f) => f.flightId === pkg.flight.id)?.total ?? 0,
    xpBefore
  };
}

/** Leaves the flight screen without landing: the session stays, so it can be resumed. */
export function pauseFlight(): void {}

/** Forgets the session entirely (after landing, or when a flight is deleted). */
export async function endSession(): Promise<void> {
  const s = useSession.getState();
  await cancelAlerts(s.alertIds);
  s.end();
}
