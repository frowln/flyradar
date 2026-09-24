import Redis from 'ioredis';

let client: Redis | null = null;

/**
 * The package cache. Optional: without `REDIS_URL`, or with Redis down, every
 * call degrades to a miss and packages are simply built again.
 */
export function getRedis(): Redis | null {
  const url = process.env['REDIS_URL'];
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      lazyConnect: true,
      // With lazyConnect the connection only starts on the first command. With
      // the offline queue off as well, that first command found no connection
      // and was rejected — so the first lookup after every restart missed the
      // cache by construction. Queued instead, it waits for the connection.
      enableOfflineQueue: true,
      connectTimeout: 2_000,
      // The bound that makes a dead Redis cheap: a queued or unanswered command
      // fails after this long instead of holding the request open.
      commandTimeout: 1_500,
      maxRetriesPerRequest: 1
    });
    client.on('error', (e) => console.warn('[Redis] error:', e.message));
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSec = 604800): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch (e) {
    console.warn('[Redis] cacheSet failed:', (e as Error).message);
  }
}
