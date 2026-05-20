import type { RoutePoint } from '@skyatlas/shared';
import { fetchFlightByCallsign } from '../api/openSky';

export async function tryFetchLivePosition(callsign: string): Promise<RoutePoint | null> {
  const state = await fetchFlightByCallsign(callsign);
  if (!state || state.onGround) return null;
  return {
    lat: state.latitude,
    lon: state.longitude,
    altitude: state.altitude,
    elapsedSeconds: 0  // not used in live mode
  };
}
