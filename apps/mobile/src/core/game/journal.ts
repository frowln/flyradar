import { createMMKV } from 'react-native-mmkv';
import type { FlightRecord } from './types';

/**
 * The flight log, on the phone.
 *
 * Recording is keyed by flight id, so landing twice (a re-opened arrival
 * screen, a restored session) replaces the entry instead of counting the
 * flight again.
 */

const storage = createMMKV({ id: 'skyatlas-journal' });
const KEY = 'records.v1';

let cache: FlightRecord[] | null = null;
const listeners = new Set<() => void>();

export function getRecords(): FlightRecord[] {
  if (!cache) {
    try {
      cache = JSON.parse(storage.getString(KEY) ?? '[]') as FlightRecord[];
    } catch {
      cache = [];
    }
  }
  return cache;
}

function persist(next: FlightRecord[]) {
  cache = next;
  storage.set(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function saveRecord(record: FlightRecord): void {
  const others = getRecords().filter((r) => r.flightId !== record.flightId);
  persist([...others, record].sort((a, b) => a.takeoffAt.localeCompare(b.takeoffAt)));
}

/** The after-landing quiz score, kept once: answering again does not add XP. */
export function noteQuiz(flightId: string, correct: number, total: number): void {
  const r = getRecords().find((x) => x.flightId === flightId);
  if (!r || r.quiz) return;
  saveRecord({ ...r, quiz: { correct, total } });
}

export function hasRecord(flightId: string): boolean {
  return getRecords().some((r) => r.flightId === flightId);
}

export function removeRecord(flightId: string): void {
  persist(getRecords().filter((r) => r.flightId !== flightId));
}

export function clearJournal(): void {
  persist([]);
}

export function subscribeJournal(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
