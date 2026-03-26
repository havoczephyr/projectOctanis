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

export type SfuConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export type SfuConfig = {
  provider: 'janus'
  serverUrl: string
  roomId: number
  secret?: string
  displayName?: string
}

export interface StreamStatus {
  connectionState: SfuConnectionState
  serverUrl: string | null
  roomName: string | null
  participantCount: number
  uptimeSec: number
}
