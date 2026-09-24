import type { OfflinePackage } from '@skyatlas/shared';

/** Browser preview: the same API over localStorage. */

const KEY = 'skyatlas.packages';

function read(): Record<string, OfflinePackage> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Record<string, OfflinePackage>;
  } catch {
    return {};
  }
}

function write(all: Record<string, OfflinePackage>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota exceeded in a preview is not worth failing over.
  }
}

export async function initStore(): Promise<void> {}

export async function savePackage(pkg: OfflinePackage): Promise<void> {
  const all = read();
  all[pkg.flight.id] = pkg;
  write(all);
}

export async function loadPackage(flightId: string): Promise<OfflinePackage | null> {
  return read()[flightId] ?? null;
}

export async function listPackages(): Promise<OfflinePackage[]> {
  return Object.values(read());
}

export async function deletePackage(flightId: string): Promise<void> {
  const all = read();
  delete all[flightId];
  write(all);
}
