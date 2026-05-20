import type { OfflinePackage } from '@skyatlas/shared';
import { apiClient } from '../api/client';
import { savePackage } from './poiDatabase';
import { getLocale } from '../../i18n';

export async function downloadPackage(
  flightNumber: string,
  date: string
): Promise<OfflinePackage> {
  const locale = getLocale();
  const pkg = await apiClient.post<OfflinePackage>('/flights/package', {
    flightNumber,
    date,
    locale
  });
  await savePackage(pkg);
  return pkg;
}

export async function lookupFlight(flightNumber: string, date: string) {
  return apiClient.post('/flights/lookup', { flightNumber, date });
}
