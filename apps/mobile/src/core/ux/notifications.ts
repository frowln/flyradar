import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let initialized = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

export async function initNotifications(): Promise<boolean> {
  if (initialized) return true;
  if (Platform.OS === 'web') return false;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;

  initialized = true;
  return true;
}

export async function scheduleFlightReminder(
  flightId: string,
  flightNumber: string,
  takeoffAt: Date
): Promise<void> {
  await initNotifications();

  // Cancel any existing for this flight
  await cancelFlightReminders(flightId);

  const now = Date.now();
  const reminders = [
    {
      offsetMs: 2 * 60 * 60 * 1000,
      title: `Flight ${flightNumber} in 2 hours`,
      body: 'Make sure SkyAtlas has the latest offline package'
    },
    {
      offsetMs: 30 * 60 * 1000,
      title: `Flight ${flightNumber} in 30 minutes`,
      body: 'Open SkyAtlas to start tracking when you board'
    }
  ];

  for (const r of reminders) {
    const triggerAt = takeoffAt.getTime() - r.offsetMs;
    if (triggerAt <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `flight-${flightId}-${r.offsetMs}`,
      content: {
        title: r.title,
        body: r.body,
        data: { flightId, type: 'flight_reminder' }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerAt)
      }
    });
  }
}

export async function cancelFlightReminders(flightId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(`flight-${flightId}-`)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export async function sendAchievementNotification(
  achievementName: string,
  achievementDescription: string
): Promise<void> {
  const ok = await initNotifications();
  if (!ok) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🏆 Achievement unlocked!',
      body: `${achievementName} — ${achievementDescription}`,
      data: { type: 'achievement' }
    },
    trigger: null // immediate
  });
}
