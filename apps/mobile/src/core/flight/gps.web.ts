import type { GpsFix } from './session';

/** Browser preview: no GPS; the flight runs on the clock. */
export async function gpsPermission(_ask: boolean): Promise<boolean> {
  return false;
}

export async function watchGps(_onFix: (fix: GpsFix) => void): Promise<(() => void) | null> {
  return null;
}
