import { z } from 'zod'

// ─── Primitives ───────────────────────────────────────────────────────────────

export const FadeCurveSchema = z.enum(['linear', 'exponential', 'logarithmic'])
export type FadeCurve = z.infer<typeof FadeCurveSchema>

export const FadeHandleSchema = z.object({
  durationSec: z.number().min(0),
  curve: FadeCurveSchema,
})
export type FadeHandle = z.infer<typeof FadeHandleSchema>

export const EnvelopePointSchema = z.object({
  timeSec: z.number().min(0), // relative to clip startSec
  gain: z.number().min(0).max(2),
})
export type EnvelopePoint = z.infer<typeof EnvelopePointSchema>

export const LoopRegionSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  count: z.union([z.number().int().min(1), z.literal('infinite')]),
})
export type LoopRegion = z.infer<typeof LoopRegionSchema>

// ─── Audio File Registry ──────────────────────────────────────────────────────

export const AudioFileSchema = z.object({
  id: z.string(),
  absolutePath: z.string(),
  durationSec: z.number().min(0),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().min(1).max(8),
})
export type AudioFile = z.infer<typeof AudioFileSchema>

// ─── Clip ─────────────────────────────────────────────────────────────────────

export const ClipSchema = z.object({
  id: z.string(),
  audioFileId: z.string(),
  /** Position of clip on the timeline, in seconds from time=0 */
  startSec: z.number().min(0),
  /** How far into the source file this clip starts (trim from front) */
  trimStartSec: z.number().min(0),
  /** Where in the source file this clip ends (trim from front) — null means use full file */
  trimEndSec: z.number().min(0).nullable(),
  /** Clip-level gain multiplier (0..2, where 1.0 = original volume) */
  volume: z.number().min(0).max(2),
  /** Volume automation — sparse list of (time, gain) pairs, linearly interpolated */
  envelope: z.array(EnvelopePointSchema),
  fadeIn: FadeHandleSchema,
  fadeOut: FadeHandleSchema,
  loop: LoopRegionSchema.nullable(),
})
export type Clip = z.infer<typeof ClipSchema>

// ─── Track ────────────────────────────────────────────────────────────────────

export const TrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Hex color for the track lane (e.g. "#00FFCC") */
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  muted: z.boolean(),
  soloed: z.boolean(),
  /** Track-level gain multiplier (0..2) */
  volume: z.number().min(0).max(2),
  clips: z.array(ClipSchema),
})
export type Track = z.infer<typeof TrackSchema>

// ─── Project ──────────────────────────────────────────────────────────────────

export const ProjectMetaSchema = z.object({
  title: z.string(),
  author: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>

export const OctanisProjectSchema = z.object({
  version: z.literal('1.0'),
  meta: ProjectMetaSchema,
  bpm: z.number().min(1).max(999),
  timeSignature: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  /** Total project length in seconds */
  durationSec: z.number().min(0),
  /** Master gain multiplier (0..2) */
  masterVolume: z.number().min(0).max(2),
  tracks: z.array(TrackSchema),
})
export type OctanisProject = z.infer<typeof OctanisProjectSchema>

// ─── Root file format ─────────────────────────────────────────────────────────

export const OctanisProjectFileSchema = z.object({
  project: OctanisProjectSchema,
  /** Registry of all referenced audio files, keyed by AudioFile.id */
  audioFiles: z.record(z.string(), AudioFileSchema),
})
export type OctanisProjectFile = z.infer<typeof OctanisProjectFileSchema>

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultFadeHandle(): FadeHandle {
  return { durationSec: 0, curve: 'linear' }
}

export function defaultClip(audioFileId: string, id: string): Clip {
  return {
    id,
    audioFileId,
    startSec: 0,
    trimStartSec: 0,
    trimEndSec: null,
    volume: 1.0,
    envelope: [],
    fadeIn: defaultFadeHandle(),
    fadeOut: defaultFadeHandle(),
    loop: null,
  }
}

export function defaultTrack(id: string, name: string, color: string): Track {
  return {
    id,
    name,
    color,
    muted: false,
    soloed: false,
    volume: 1.0,
    clips: [],
  }
}

/** Neon palette for track colors — assigned round-robin */
export const TRACK_COLORS = [
  '#00FFCC',
  '#39FF14',
  '#FF00FF',
  '#FF6B35',
  '#00BFFF',
  '#FFE600',
  '#FF3366',
  '#9B59B6',
] as const

export function pickTrackColor(trackIndex: number): string {
  return TRACK_COLORS[trackIndex % TRACK_COLORS.length]
}

// ─── Interpolation helpers ────────────────────────────────────────────────────

/**
 * Linearly interpolate the gain value from an envelope at a given clip-relative time.
 * If the envelope is empty, returns 1.0 (unity gain).
 */
export function interpolateEnvelope(envelope: EnvelopePoint[], timeSec: number): number {
  if (envelope.length === 0) return 1.0
  if (timeSec <= envelope[0].timeSec) return envelope[0].gain
  if (timeSec >= envelope[envelope.length - 1].timeSec) return envelope[envelope.length - 1].gain

  for (let i = 1; i < envelope.length; i++) {
    const prev = envelope[i - 1]
    const next = envelope[i]
    if (timeSec >= prev.timeSec && timeSec <= next.timeSec) {
      const t = (timeSec - prev.timeSec) / (next.timeSec - prev.timeSec)
      return prev.gain + t * (next.gain - prev.gain)
    }
  }
  return 1.0
}
