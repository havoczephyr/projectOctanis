import { create } from 'zustand'
import type { OctanisProjectFile } from '@octanis/shared'
import type { StreamStatus } from '../../../ipcTypes'

interface BroadcasterStore {
  // Project
  projectFile: OctanisProjectFile | null
  currentFilePath: string | null
  setProject: (file: OctanisProjectFile, path: string) => void
  clearProject: () => void

  // Transport
  transportState: 'stopped' | 'playing' | 'paused'
  playheadSec: number
  play: () => void
  pause: () => void
  stop: () => void
  setPlayhead: (sec: number) => void

  // Stream
  streamStatus: StreamStatus
  setStreamStatus: (status: StreamStatus) => void

  // Volume
  masterVolume: number
  setMasterVolume: (vol: number) => void

  // Microphone
  micActive: boolean
  micDuckAmount: number
  micThreshold: number
  duckAttackMs: number
  duckReleaseMs: number
  setMicActive: (active: boolean) => void
  setMicDuckAmount: (amount: number) => void
  setMicThreshold: (threshold: number) => void
  setDuckAttackMs: (ms: number) => void
  setDuckReleaseMs: (ms: number) => void
}

export const useBroadcasterStore = create<BroadcasterStore>((set) => ({
  // Project
  projectFile: null,
  currentFilePath: null,
  setProject: (file, path) => set({ projectFile: file, currentFilePath: path }),
  clearProject: () => set({ projectFile: null, currentFilePath: null, transportState: 'stopped', playheadSec: 0 }),

  // Transport
  transportState: 'stopped',
  playheadSec: 0,
  play: () => set({ transportState: 'playing' }),
  pause: () => set({ transportState: 'paused' }),
  stop: () => set({ transportState: 'stopped', playheadSec: 0 }),
  setPlayhead: (sec) => set({ playheadSec: sec }),

  // Stream
  streamStatus: { running: false, port: 8080, format: 'mp3', listenerCount: 0, uptimeSec: 0 },
  setStreamStatus: (status) => set({ streamStatus: status }),

  // Volume
  masterVolume: 1.0,
  setMasterVolume: (vol) => set({ masterVolume: Math.max(0, Math.min(1, vol)) }),

  // Microphone
  micActive: false,
  micDuckAmount: 0.7,
  micThreshold: -30,
  duckAttackMs: 50,
  duckReleaseMs: 300,
  setMicActive: (active) => set({ micActive: active }),
  setMicDuckAmount: (amount) => set({ micDuckAmount: amount }),
  setMicThreshold: (threshold) => set({ micThreshold: threshold }),
  setDuckAttackMs: (ms) => set({ duckAttackMs: ms }),
  setDuckReleaseMs: (ms) => set({ duckReleaseMs: ms }),
}))
