import { Platform } from 'react-native';
import { collectionsStore } from '../gamification/collections';

let iCloudStorage: {
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
} | null = null;

try {
  if (Platform.OS === 'ios') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    iCloudStorage = require('react-native-icloudstore').default;
  }
} catch {
  // Library not installed or not available — no-op
}

const BACKUP_KEY = 'skyatlas-collection-backup';

interface BackupPayload {
  version: 1;
  timestamp: number;
  stats: ReturnType<typeof collectionsStore.getStats>;
  earned: string[];
  installDate: string | null;
}

/**
 * Serialize current collectionsStore state to iCloud KV store.
 * Returns true on success, false if iCloud is unavailable or an error occurs.
 */
export async function backupToiCloud(): Promise<boolean> {
  if (!iCloudStorage) return false;
  try {
    const stats = collectionsStore.getStats();
    const payload: BackupPayload = {
      version: 1,
      timestamp: Date.now(),
      stats,
      earned: collectionsStore.getEarnedAchievements(),
      installDate: collectionsStore.getInstallDate()?.toISOString() ?? null
    };
    await iCloudStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to restore from iCloud if the cloud copy has more flights than local.
 * Returns true if data was restored, false otherwise.
 */
export async function restoreFromiCloud(): Promise<boolean> {
  if (!iCloudStorage) return false;
  try {
    const raw = await iCloudStorage.getItem(BACKUP_KEY);
    if (!raw) return false;

    const payload: BackupPayload = JSON.parse(raw);
    if (payload.version !== 1) return false;

    const localStats = collectionsStore.getStats();
    // Only restore if cloud has more flights — prevents overwriting fresher local data
    if (localStats.totalFlights >= (payload.stats?.totalFlights ?? 0)) {
      return false;
    }

    collectionsStore.updateStats(payload.stats);
    collectionsStore.addAchievements(payload.earned);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget backup suitable for calling after significant user events.
 */
export async function autoBackup(): Promise<void> {
  try {
    await backupToiCloud();
  } catch {
    // Intentionally swallowed — backup is best-effort
  }
}

/**
 * Returns a human-readable "last backed up" string stored alongside the payload,
 * or null if no backup exists yet.
 */
export async function getLastBackupTimestamp(): Promise<number | null> {
  if (!iCloudStorage) return null;
  try {
    const raw = await iCloudStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const payload: BackupPayload = JSON.parse(raw);
    return payload.timestamp ?? null;
  } catch {
    return null;
  }
}
