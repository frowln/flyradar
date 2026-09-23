import type { OfflinePackage } from '@skyatlas/shared';
import { apiClient } from '../api/client';
import { savePackage } from './poiDatabase';
import { downloadCorridor, type CorridorProgress } from '../map/offlineMap';
import { getLocale } from '../../i18n';

export async function downloadPackage(
  flightNumber: string,
  date: string,
  onMapProgress?: (p: CorridorProgress) => void
): Promise<OfflinePackage> {
  const locale = getLocale();
  const pkg = await apiClient.post<OfflinePackage>('/flights/package', {
    flightNumber,
    date,
    locale
  });
  await savePackage(pkg);

  // Map tiles come down with everything else, while the passenger still has
  // Wi-Fi. Their absence must not cost them the flight data they already have,
  // so a failed corridor is reported and swallowed rather than thrown.
  try {
    await downloadCorridor(pkg.flight.id, pkg.route, onMapProgress);
  } catch (err) {
    console.warn('[offline] map corridor unavailable', err);
  }

  return pkg;
}

export async function lookupFlight(flightNumber: string, date: string) {
  return apiClient.post('/flights/lookup', { flightNumber, date });
}
