import { cacheGet, cacheSet } from './redis.js';

/**
 * Answers kept for a while, so a paid lookup is paid once per flight rather
 * than once per passenger.
 *
 * Two levels: this process's memory, then Redis when configured. Memory alone
 * already covers the case that costs money — a hundred people on one flight
 * preparing it the evening before — and keeps working when Redis is absent or
 * down. Concurrent misses for one key share a single load.
 */

export interface Loaded<T> {
  value: T;
  /** 0 = do not keep (a failure, or anything that should be asked again). */
  ttlSec: number;
}

interface Entry {
  value: unknown;
  expires: number;
}

/** Enough for every flight in a busy day; each entry is at most a few kB. */
const MAX_ENTRIES = 2_000;

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function remember(key: string, value: unknown, expires: number): void {
  memory.delete(key);
  memory.set(key, { value, expires });
  // Map keeps insertion order, so the first key is the oldest write.
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value as string);
}

export async function cached<T>(key: string, load: () => Promise<Loaded<T>>): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  if (hit) memory.delete(key);

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const task = (async () => {
    // Stored with its expiry so memory can hold it exactly as long as Redis does.
    const shared = await cacheGet<{ v: T; exp: number }>(key);
    if (shared && shared.exp > Date.now()) {
      remember(key, shared.v, shared.exp);
      return shared.v;
    }
    const { value, ttlSec } = await load();
    if (ttlSec > 0) {
      const exp = Date.now() + ttlSec * 1000;
      remember(key, value, exp);
      await cacheSet(key, { v: value, exp }, ttlSec);
    }
    return value;
  })().finally(() => inflight.delete(key));

  inflight.set(key, task);
  return task;
}

/** A kept value without loading anything; undefined on a miss. */
export async function peekCached<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const shared = await cacheGet<{ v: T; exp: number }>(key);
  if (shared && shared.exp > Date.now()) {
    remember(key, shared.v, shared.exp);
    return shared.v;
  }
  return undefined;
}

export async function storeCached<T>(key: string, value: T, ttlSec: number): Promise<void> {
  const exp = Date.now() + ttlSec * 1000;
  remember(key, value, exp);
  await cacheSet(key, { v: value, exp }, ttlSec);
}

/** For tests. */
export function clearMemoryCache(): void {
  memory.clear();
  inflight.clear();
}
