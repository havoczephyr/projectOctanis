/**
 * Shared IPC type definitions — imported by both main and renderer processes.
 * Must not import any Node.js or browser-only APIs.
 */

// ─── FFmpeg types ──────────────────────────────────────────────────────────────

export interface PeakOpts {
  /** How many peak buckets per second of audio to generate */
  peaksPerSecond: number
  /** Start of range to extract (seconds) */
  startSec?: number
  /** End of range to extract (seconds) */
  endSec?: number
}

export interface PeaksResult {
  /** Number of peak buckets */
  count: number
  /** Minimum (negative) amplitude per bucket, range [-1, 0] */
  min: number[]
  /** Maximum (positive) amplitude per bucket, range [0, 1] */
  max: number[]
  /** Duration of audio covered, in seconds */
  durationSec: number
}

// ─── File system types ─────────────────────────────────────────────────────────

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isAudioFile: boolean
}
