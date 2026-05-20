import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import type { OfflinePackage, RoutePoint } from '@skyatlas/shared';

const storage = createMMKV({ id: 'skyatlas-flight' });

const mmkvStorage = {
  getItem: (key: string) => {
    const v = storage.getString(key);
    return v ?? null;
  },
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key)
};

interface SeenPOI {
  poiId: string;
  seenAt: number; // timestamp
}

interface FlightState {
  // Active flight data
  activePackage: OfflinePackage | null;
  takeoffAt: Date | null;
  currentPosition: RoutePoint | null;
  seenPOIs: SeenPOI[];
  mode: 'offline' | 'live';

  // Actions
  setPackage: (pkg: OfflinePackage) => void;
  confirmTakeoff: (at: Date) => void;
  updatePosition: (pos: RoutePoint) => void;
  markPOISeen: (poiId: string) => void;
  clearFlight: () => void;
  setMode: (mode: 'offline' | 'live') => void;
  timeMultiplier: number;
  setTimeMultiplier: (n: number) => void;
}

export const useFlightStore = create<FlightState>()(
  persist(
    (set) => ({
      activePackage: null,
      takeoffAt: null,
      currentPosition: null,
      seenPOIs: [],
      mode: 'offline',
      timeMultiplier: 1,

      setPackage: (pkg) => set({ activePackage: pkg }),
      confirmTakeoff: (at) => set({ takeoffAt: at }),
      updatePosition: (pos) => set({ currentPosition: pos }),
      markPOISeen: (poiId) => set((state) => ({
        seenPOIs: [...state.seenPOIs, { poiId, seenAt: Date.now() }]
      })),
      clearFlight: () => set({
        activePackage: null,
        takeoffAt: null,
        currentPosition: null,
        seenPOIs: [],
        mode: 'offline'
      }),
      setMode: (mode) => set({ mode }),
      setTimeMultiplier: (n) => set({ timeMultiplier: n })
    }),
    {
      name: 'flight-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        activePackage: state.activePackage,
        takeoffAt: state.takeoffAt,
        seenPOIs: state.seenPOIs,
        timeMultiplier: state.timeMultiplier,
        mode: state.mode
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.takeoffAt && typeof state.takeoffAt === 'string') {
          state.takeoffAt = new Date(state.takeoffAt as unknown as string);
        }
      }
    }
  )
);
