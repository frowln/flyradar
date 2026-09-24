import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';
import type { AlertResponse } from '../core/ux/notifications';
import { loadPackage } from '../core/offline/packageStore';
import { takeOff } from '../core/flight/controller';
import { useSession } from '../core/flight/session';
import { TOOK_OFF_ACTION } from '../core/flight/reminders';

export const navRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Where a tap on one of our notifications leads.
 *
 * A sight opens its card over the flight screen, so "back" returns to the
 * window view; the takeoff prompt's lock-screen button starts the flight at
 * the moment it was pressed.
 */
export async function openFromNotification({ data, action }: AlertResponse): Promise<void> {
  if (!navRef.isReady()) return;
  const { flightId } = data;
  switch (data.kind) {
    case 'takeoff': {
      if (action !== TOOK_OFF_ACTION) {
        navRef.navigate('Tabs', { screen: 'Board', params: { takeoff: flightId } });
        return;
      }
      const pkg = await loadPackage(flightId);
      if (!pkg) return;
      const s = useSession.getState();
      if (s.flightId !== flightId || s.landedAt) await takeOff(pkg, new Date());
      navRef.navigate('InFlight', { flightId });
      return;
    }
    case 'sight':
      navRef.navigate('InFlight', { flightId });
      if (data.poiId) navRef.navigate('POIDetail', { flightId, poiId: data.poiId });
      return;
    case 'flight':
      navRef.navigate('InFlight', { flightId });
      return;
    case 'seat':
      navRef.navigate('Tabs', { screen: 'Board' });
      return;
  }
}
