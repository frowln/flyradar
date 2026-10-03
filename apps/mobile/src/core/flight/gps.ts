import type { GpsFix } from './session';

/**
 * The phone's own GPS, while the flight screen is open.
 *
 * A GPS receiver needs no network and keeps working in flight mode; it only
 * needs sky, which a window seat has. Loaded lazily, so a build without the
 * location module simply runs on the clock-based estimate.
 */

type LocationModule = typeof import('expo-location');

function load(): LocationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-location') as LocationModule;
  } catch {
    return null;
  }
}

declare const require: (m: string) => unknown;

export async function gpsPermission(ask: boolean): Promise<boolean> {
  const Location = load();
  if (!Location) return false;
  try {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.granted) return true;
    if (!ask || !cur.canAskAgain) return false;
    return (await Location.requestForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Starts watching; resolves to a stop function, or null when GPS is unavailable. */
export async function watchGps(onFix: (fix: GpsFix) => void): Promise<(() => void) | null> {
  const Location = load();
  if (!Location) return null;
  if (!(await gpsPermission(false))) return null;
  try {
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 20_000, distanceInterval: 400 },
      (p) => {
        onFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          alt: p.coords.altitude ?? undefined,
          accuracyM: p.coords.accuracy ?? undefined,
          // Negative means "not known" on iOS.
          speedKmh: p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed * 3.6 : undefined,
          courseDeg: p.coords.heading != null && p.coords.heading >= 0 ? p.coords.heading : undefined,
          at: p.timestamp
        });
      }
    );
    return () => sub.remove();
  } catch {
    return null;
  }
}
