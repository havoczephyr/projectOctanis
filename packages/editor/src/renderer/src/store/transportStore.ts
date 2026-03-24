import { create } from 'zustand'

type TransportState = 'stopped' | 'playing' | 'paused'

interface TransportStore {
  state: TransportState
  playheadSec: number
  play: () => void
  pause: () => void
  stop: () => void
  seekTo: (sec: number) => void
  setPlayhead: (sec: number) => void
}

export const useTransportStore = create<TransportStore>((set) => ({
  state: 'stopped',
  playheadSec: 0,

  play: () => set({ state: 'playing' }),
  pause: () => set({ state: 'paused' }),
  stop: () => set({ state: 'stopped', playheadSec: 0 }),
  seekTo: (sec) => set({ playheadSec: Math.max(0, sec) }),
  setPlayhead: (sec) => set({ playheadSec: Math.max(0, sec) }),
}))
