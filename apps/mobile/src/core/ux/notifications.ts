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
  /** Where a tap should lead; read back by `onNotificationResponse`. */
  data?: AlertData;
  /** A registered category, for lock-screen action buttons. */
  category?: string;
}

export interface AlertData {
  kind: 'sight' | 'flight' | 'takeoff' | 'seat';
  flightId: string;
  poiId?: string;
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
          data: a.data ? { ...a.data } : {},
          ...(a.category ? { categoryIdentifier: a.category } : {}),
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

/** A lock-screen button: one tap on "Took off" without unlocking into a menu. */
export async function registerCategory(id: string, actions: Array<{ id: string; title: string }>): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.setNotificationCategoryAsync(
    id,
    actions.map((a) => ({ identifier: a.id, buttonTitle: a.title, options: { opensAppToForeground: true } }))
  ).catch(() => {});
}

export interface AlertResponse {
  data: AlertData;
  /** The action button pressed, or null for a plain tap. */
  action: string | null;
}

/**
 * Calls `handle` for every tap on one of our notifications — including the one
 * that launched the app from cold, which arrives before any listener exists.
 */
export function onNotificationResponse(handle: (r: AlertResponse) => void): () => void {
  const seen = new Set<string>();
  const deliver = (res: Notifications.NotificationResponse | null) => {
    if (!res) return;
    const key = `${res.notification.request.identifier}:${res.notification.date}:${res.actionIdentifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    const data = res.notification.request.content.data as Partial<AlertData> | undefined;
    if (!data?.kind || !data.flightId) return;
    const action = res.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? null : res.actionIdentifier;
    handle({ data: data as AlertData, action });
  };
  const sub = Notifications.addNotificationResponseReceivedListener(deliver);
  Notifications.getLastNotificationResponseAsync()
    .then((res) => {
      deliver(res);
      // Cleared so the same tap is not replayed on the next launch.
      if (res) Notifications.clearLastNotificationResponseAsync().catch(() => {});
    })
    .catch(() => {});
  return () => sub.remove();
}
