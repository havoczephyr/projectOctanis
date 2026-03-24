import { create } from 'zustand'
import type { PeaksResult } from '../../../ipcTypes'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface PeaksCacheStore {
  peaks: Record<string, PeaksResult>
  loadState: Record<string, LoadState>
  setPeaks: (audioFileId: string, result: PeaksResult) => void
  setLoadState: (audioFileId: string, state: LoadState) => void
  getPeaks: (audioFileId: string) => PeaksResult | undefined
  getLoadState: (audioFileId: string) => LoadState
}

export const usePeaksCache = create<PeaksCacheStore>((set, get) => ({
  peaks: {},
  loadState: {},

  setPeaks: (audioFileId, result) =>
    set((s) => ({
      peaks: { ...s.peaks, [audioFileId]: result },
      loadState: { ...s.loadState, [audioFileId]: 'ready' },
    })),

  setLoadState: (audioFileId, state) =>
    set((s) => ({
      loadState: { ...s.loadState, [audioFileId]: state },
    })),

  getPeaks: (audioFileId) => get().peaks[audioFileId],
  getLoadState: (audioFileId) => get().loadState[audioFileId] ?? 'idle',
}))
