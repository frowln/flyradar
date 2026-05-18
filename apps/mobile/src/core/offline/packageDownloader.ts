import type { OfflinePackage } from '@skyatlas/shared';
import { apiClient } from '../api/client';
import { savePackage } from './poiDatabase';

export async function downloadPackage(
  flightNumber: string,
  date: string
): Promise<OfflinePackage> {
  const pkg = await apiClient.post<OfflinePackage>('/flights/package', {
    flightNumber,
    date
  });
  await savePackage(pkg);
  return pkg;
}

export async function lookupFlight(flightNumber: string, date: string) {
  return apiClient.post('/flights/lookup', { flightNumber, date });
}
