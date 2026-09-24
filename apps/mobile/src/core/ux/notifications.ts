import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local notifications — the only channel that reaches a passenger at cruise.
 *
 * They are scheduled on the ground or at takeoff and fire from the phone's own
 * clock, so they need no network. The app never plays its own sounds: the
 * system sound follows the silent switch, and in the foreground there is none.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

export async function notificationPermission(ask: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!ask || !cur.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export interface LocalAlert {
  id: string;
  at: Date;
  title: string;
  body: string;
}

export async function scheduleAlerts(alerts: LocalAlert[]): Promise<string[]> {
  if (!(await notificationPermission(false))) return [];
  const ids: string[] = [];
  const now = Date.now();
  for (const a of alerts) {
    if (a.at.getTime() <= now + 5_000) continue;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier: a.id,
        content: {
          title: a.title,
          body: a.body,
          sound: 'default',
          // Time-sensitive alerts break through Focus modes on iOS — this is
          // exactly the "look now or miss it" case they exist for.
          interruptionLevel: 'timeSensitive'
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.at }
      });
      ids.push(id);
    } catch {
      // One refused alert should not cost the others.
    }
  }
  return ids;
}

export async function cancelAlerts(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}
