import { settings } from '../settings';
import { apiClient } from './client';

/**
 * The social surface: accounts, discoveries, reviews, people.
 *
 * Everything here is best-effort by design. The product's promise is that it
 * works at 11 km with the radio off, so no screen may block on the network and
 * no failure here may cost the passenger something they already have. Reads
 * return null on failure; writes are queued and replayed when signal returns.
 */

export interface PublicStats {
  flights: number;
  distanceKm: number;
  placesDiscovered: number;
  countries: number;
  xp: number;
  level: number;
}

export interface Me {
  id: string;
  handle: string | null;
  avatarUrl: string | null;
  linked: boolean;
  stats: PublicStats;
}

export interface PlaceSocial {
  discoveries: number;
  reviews: number;
  rating: number | null;
  /** Share of all users who have opened it — 0.004 means "0.4% of pilots". */
  rarity: number;
}

export interface Review {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  helpful: number;
  author: { id: string; handle: string | null; avatarUrl: string | null };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  handle: string | null;
  avatarUrl: string | null;
  xp: number;
  level: number;
  flights: number;
  places: number;
  countries: number;
}

export const REPORT_REASONS = ['spam', 'offensive', 'off_topic', 'false_info', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Discoveries made offline, replayed on the next successful call. */
const PENDING_KEY = 'pending_discoveries';

function pending(): { poiId: string; flightId?: string }[] {
  try {
    return JSON.parse(settings.getPendingDiscoveries?.() ?? '[]');
  } catch {
    return [];
  }
}

function setPending(items: { poiId: string; flightId?: string }[]): void {
  settings.setPendingDiscoveries?.(JSON.stringify(items.slice(-500)));
}

async function quiet<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    // Best-effort in production — a social call must never break a flight. But
    // swallowed silently it also hides a misconfigured API URL behind a screen
    // that simply says "no signal", which cost an hour of looking in the wrong
    // place. Development gets to see what actually failed.
    if (__DEV__) console.info('[social] request failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export const social = {
  me: () => quiet(() => apiClient.get<Me>('/social/me')),

  /**
   * Claims this device's anonymous account with an Apple identity.
   *
   * The server merges rather than duplicates when the subject already has an
   * account, so reinstalling never leaves someone with two atlases.
   */
  /**
   * Links this device's account to an Apple ID. Sends Apple's signed identity
   * token, never the bare subject: the server verifies the signature, which is
   * what stops anyone who learns a subject id from claiming the account.
   */
  linkApple: (identityToken: string) =>
    quiet(() => apiClient.post<{ id: string; merged: boolean }>('/social/link/apple', { identityToken })),

  setHandle: (handle: string) =>
    quiet(() => apiClient.patch<Me>('/social/me', { handle: handle.trim() })),

  /**
   * Records a discovery, or remembers it for later.
   *
   * Called the moment a card is opened — which is usually at cruise, with no
   * signal at all. Queuing rather than failing is what makes the counters
   * complete rather than a sample of who happened to have Wi-Fi.
   */
  async discover(poiId: string, flightId?: string): Promise<void> {
    const ok = await quiet(() =>
      apiClient.post<{ created: boolean }>('/social/discoveries', { poiId, flightId })
    );
    if (ok) return;
    const queue = pending();
    if (!queue.some((q) => q.poiId === poiId)) {
      queue.push({ poiId, ...(flightId ? { flightId } : {}) });
      setPending(queue);
    }
  },

  /** Replays everything collected offline. Safe to call on every app start. */
  async flushPending(): Promise<number> {
    const queue = pending();
    if (queue.length === 0) return 0;
    const remaining: typeof queue = [];
    for (const item of queue) {
      const ok = await quiet(() => apiClient.post('/social/discoveries', item));
      if (!ok) remaining.push(item);
    }
    setPending(remaining);
    return queue.length - remaining.length;
  },

  placeStats: (poiId: string) =>
    quiet(() => apiClient.get<PlaceSocial>(`/social/pois/${encodeURIComponent(poiId)}/stats`)),

  reviews: (poiId: string) =>
    quiet(() =>
      apiClient.get<{ reviews: Review[]; nextCursor: string | null }>(
        `/social/pois/${encodeURIComponent(poiId)}/reviews`
      )
    ),

  writeReview: (poiId: string, rating: number, body?: string) =>
    quiet(() =>
      apiClient.put<{ id: string; replaced: boolean }>(
        `/social/pois/${encodeURIComponent(poiId)}/review`,
        { rating, body }
      )
    ),

  deleteReview: (poiId: string) =>
    quiet(() => apiClient.del<{ deleted: boolean }>(`/social/pois/${encodeURIComponent(poiId)}/review`)),

  voteReview: (reviewId: string, helpful = true) =>
    quiet(() => apiClient.post(`/social/reviews/${reviewId}/vote`, { helpful })),

  reportReview: (reviewId: string, reason: ReportReason, note?: string) =>
    quiet(() => apiClient.post(`/social/reviews/${reviewId}/report`, { reason, note })),

  leaderboard: () =>
    quiet(() => apiClient.get<{ entries: LeaderboardEntry[] }>('/social/leaderboard')),

  profile: (userId: string) =>
    quiet(() =>
      apiClient.get<{
        id: string;
        handle: string | null;
        avatarUrl: string | null;
        joinedAt: string;
        stats: PublicStats;
        /** `name` is null when the server has no record of that place. */
        recent: { poiId: string; name: string | null; discoveredAt: string }[];
      }>(`/social/users/${userId}`)
    ),

  follow: (userId: string, blocked = false) =>
    quiet(() => apiClient.post(`/social/users/${userId}/follow`, { blocked })),

  friends: () =>
    quiet(() =>
      apiClient.get<{ friends: { id: string; handle: string | null; avatarUrl: string | null; stats: PublicStats }[] }>(
        '/social/friends'
      )
    )
};

export { PENDING_KEY };
