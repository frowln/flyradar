import type { OfflinePackage } from '@skyatlas/shared';
import { listPackages, deletePackage } from '../offline/packageStore';
import { deletePhotos } from '../offline/photoCache';
import { deleteCorridor } from '../map/offlineMap';
import { hasRecord, removeRecord } from '../game/journal';
import { useSession } from './session';

/**
 * The passenger's flights, in the order they matter.
 *
 * A flight whose departure has passed is not gone — delays are the rule, and
 * the old board hid any flight once its scheduled time was behind it, so a late
 * departure could never be started at all. Such flights stay startable for a
 * day, as "due".
 */

export type FlightStatus = 'airborne' | 'due' | 'upcoming' | 'flown' | 'missed';

export interface FlightEntry {
  pkg: OfflinePackage;
  status: FlightStatus;
  departure: Date;
}

const DUE_BEFORE_MS = 3 * 3600_000;
const DUE_AFTER_MS = 24 * 3600_000;

export function classify(pkg: OfflinePackage, now: Date, session: { flightId: string | null; landedAt: string | null }): FlightStatus {
  if (session.flightId === pkg.flight.id && !session.landedAt) return 'airborne';
  if (hasRecord(pkg.flight.id)) return 'flown';
  const dep = new Date(pkg.flight.scheduledDeparture).getTime();
  const diff = dep - now.getTime();
  if (diff > DUE_BEFORE_MS) return 'upcoming';
  if (diff > -DUE_AFTER_MS) return 'due';
  return 'missed';
}

const ORDER: Record<FlightStatus, number> = { airborne: 0, due: 1, upcoming: 2, missed: 3, flown: 4 };

export async function loadLibrary(now: Date = new Date()): Promise<FlightEntry[]> {
  const session = useSession.getState();
  const pkgs = await listPackages();
  return pkgs
    .filter((p) => !p.demo || session.flightId === p.flight.id)
    .map((pkg) => ({ pkg, status: classify(pkg, now, session), departure: new Date(pkg.flight.scheduledDeparture) }))
    .sort((a, b) => {
      const byStatus = ORDER[a.status] - ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      // Future flights soonest first; past ones most recent first.
      return a.status === 'flown' || a.status === 'missed'
        ? b.departure.getTime() - a.departure.getTime()
        : a.departure.getTime() - b.departure.getTime();
    });
}

export async function removeFlight(flightId: string, opts: { keepRecord?: boolean } = { keepRecord: true }): Promise<void> {
  await deletePackage(flightId);
  await deletePhotos(flightId);
  await deleteCorridor(flightId).catch(() => {});
  if (!opts.keepRecord) removeRecord(flightId);
  const s = useSession.getState();
  if (s.flightId === flightId) s.end();
}
