import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { collectionsStore } from '../gamification/collections';
import { initNotifications } from './notifications';
import { loadPackage, listPackages } from '../offline/poiDatabase';
import type { POI } from '@skyatlas/shared';

const DAILY_FACT_ID_PREFIX = 'sky-fact-';

interface DailyFactPayload {
  title: string;
  body: string;
  poiId: string;
  flightId: string;
}

async function pickFact(): Promise<DailyFactPayload | null> {
  const pkgs = await listPackages();
  if (pkgs.length === 0) return null;

  const allPois: Array<POI & { flightId: string }> = [];
  for (const row of pkgs) {
    const pkg = await loadPackage(row.flightId);
    if (pkg) pkg.pois.forEach((p) => allPois.push({ ...p, flightId: row.flightId }));
  }

  if (allPois.length === 0) return null;

  // Pick rotating POI based on day of year for variety
  const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const poi = allPois[dayOfYear % allPois.length];
  const fact = (poi as any).facts?.[0] ?? poi.summary?.slice(0, 140) ?? `Discover ${poi.name}`;

  return {
    title: '✨ Sky Fact of the Day',
    body: `${poi.name} — ${fact}`,
    poiId: poi.id,
    flightId: (poi as any).flightId
  };
}

export async function scheduleDailyFact(): Promise<void> {
  if (collectionsStore.getDailyFactsEnabled?.() === false) return;
  const ok = await initNotifications();
  if (!ok || Platform.OS === 'web') return;

  // Cancel existing fact notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(DAILY_FACT_ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  // Schedule next 7 days of facts so they fire even offline
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const fact = await pickFact();
    if (!fact) break;

    const trigger = new Date();
    trigger.setDate(trigger.getDate() + dayOffset);
    trigger.setHours(9, 0, 0, 0);

    await Notifications.scheduleNotificationAsync({
      identifier: `${DAILY_FACT_ID_PREFIX}${dayOffset}`,
      content: {
        title: fact.title,
        body: fact.body,
        data: { poiId: fact.poiId, flightId: fact.flightId, type: 'daily_fact' }
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger }
    });
  }
}

export async function disableDailyFacts(): Promise<void> {
  collectionsStore.setDailyFactsEnabled?.(false);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(DAILY_FACT_ID_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export async function enableDailyFacts(): Promise<void> {
  collectionsStore.setDailyFactsEnabled?.(true);
  await scheduleDailyFact();
}
