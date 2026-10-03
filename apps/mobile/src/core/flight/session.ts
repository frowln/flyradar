import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

/**
 * The flight in progress.
 *
 * Only facts are stored — which flight, when it took off, what the passenger
 * opened and confirmed — never derived state like the current position, which
 * is recomputed from them on every tick. That is what lets a flight survive the
 * phone killing the app at cruise: on relaunch the same facts give the same
 * position, and the passenger is back where they were.
 *
 * Starting a flight never clears another one's record; the previous build did,
 * and a second tap on "start" erased everything seen so far.
 */

const storage = createMMKV({ id: 'skyatlas-session' });

export interface GpsFix {
  lat: number;
  lon: number;
  /** Metres, when the receiver reports it. */
  alt?: number;
  /** Epoch ms. */
  at: number;
  accuracyM?: number;
  /** Ground speed from the satellites, km/h, when the receiver reports it. */
  speedKmh?: number;
  /** Course over the ground, degrees from north, when the receiver reports it. */
  courseDeg?: number;
}

export interface SessionState {
  flightId: string | null;
  /** ISO, when the wheels left the ground. */
  takeoffAt: string | null;
  landedAt: string | null;
  /** Demo flights run faster than real time. */
  timeMultiplier: number;
  /**
   * Correction to the clock-based position, seconds of flight. A GPS fix that
   * puts the aircraft ten minutes behind schedule sets this to −600 and every
   * later estimate, fix or no fix, inherits it.
   */
  clockOffsetS: number;
  opened: string[];
  spotted: string[];
  /** Answers to "what is about to appear", by place: true when guessed right. */
  guesses: Record<string, boolean>;
  lastFix: GpsFix | null;
  /** Ids of scheduled notifications, so they can be cancelled. */
  alertIds: string[];

  start: (flightId: string, takeoffAt: Date, opts?: { multiplier?: number }) => void;
  retime: (takeoffAt: Date) => void;
  land: (at: Date) => void;
  open: (poiId: string) => void;
  toggleSpotted: (poiId: string) => void;
  answerGuess: (poiId: string, correct: boolean) => void;
  applyFix: (fix: GpsFix, clockOffsetS: number) => void;
  setAlertIds: (ids: string[]) => void;
  end: () => void;
}

const empty = {
  flightId: null,
  takeoffAt: null,
  landedAt: null,
  timeMultiplier: 1,
  clockOffsetS: 0,
  opened: [] as string[],
  spotted: [] as string[],
  guesses: {} as Record<string, boolean>,
  lastFix: null,
  alertIds: [] as string[]
};

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      ...empty,

      start: (flightId, takeoffAt, opts) => {
        const cur = get();
        // Resuming the same flight keeps what was already seen.
        if (cur.flightId === flightId && !cur.landedAt) {
          set({ takeoffAt: takeoffAt.toISOString(), timeMultiplier: opts?.multiplier ?? cur.timeMultiplier });
          return;
        }
        set({ ...empty, flightId, takeoffAt: takeoffAt.toISOString(), timeMultiplier: opts?.multiplier ?? 1 });
      },
      retime: (takeoffAt) => set({ takeoffAt: takeoffAt.toISOString(), clockOffsetS: 0 }),
      land: (at) => set({ landedAt: at.toISOString() }),
      open: (poiId) => set((s) => (s.opened.includes(poiId) ? s : { opened: [...s.opened, poiId] })),
      toggleSpotted: (poiId) =>
        set((s) => ({
          spotted: s.spotted.includes(poiId) ? s.spotted.filter((x) => x !== poiId) : [...s.spotted, poiId]
        })),
      answerGuess: (poiId, correct) => set((s) => ({ guesses: { ...s.guesses, [poiId]: correct } })),
      applyFix: (fix, clockOffsetS) => set({ lastFix: fix, clockOffsetS }),
      setAlertIds: (ids) => set({ alertIds: ids }),
      end: () => set({ ...empty })
    }),
    {
      name: 'session.v2',
      storage: createJSONStorage(() => ({
        getItem: (k: string) => storage.getString(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.remove(k)
      })),
      partialize: ({ flightId, takeoffAt, landedAt, timeMultiplier, clockOffsetS, opened, spotted, guesses, lastFix, alertIds }) => ({
        flightId,
        takeoffAt,
        landedAt,
        timeMultiplier,
        clockOffsetS,
        opened,
        spotted,
        guesses,
        lastFix,
        alertIds
      })
    }
  )
);
