/**
 * Shared IPC type definitions for the broadcaster.
 * Must not import any Node.js or browser-only APIs.
 */

export interface PeakOpts {
  peaksPerSecond: number
  startSec?: number
  endSec?: number
}

export interface PeaksResult {
  count: number
  min: number[]
  max: number[]
  durationSec: number
}

export interface DecodeAudioResult {
  pcmData: ArrayBuffer
  sampleRate: number
  channels: number
}

export interface StreamStatus {
  running: boolean
  port: number
  format: 'mp3' | 'opus'
  listenerCount: number
  uptimeSec: number
}
