import { collectionsStore } from '../gamification/collections';
import type { POI } from '@skyatlas/shared';

export type POICategory = string;

export function recordPOIView(category: POICategory): void {
  const current = collectionsStore.getCategoryInterests();
  current[category] = (current[category] ?? 0) + 1;
  collectionsStore.setCategoryInterests(current);
}

export function getCategoryInterests(): Record<string, number> {
  return collectionsStore.getCategoryInterests();
}

export function rankPOIsByInterest(pois: POI[]): POI[] {
  const interests = getCategoryInterests();
  return [...pois].sort((a, b) => (interests[b.category] ?? 0) - (interests[a.category] ?? 0));
}
