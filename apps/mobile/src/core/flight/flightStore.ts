import { create } from 'zustand';
import type { OfflinePackage, RoutePoint } from '@skyatlas/shared';

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

export const useFlightStore = create<FlightState>((set) => ({
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
}));
