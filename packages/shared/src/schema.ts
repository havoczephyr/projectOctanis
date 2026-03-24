import { z } from 'zod'

// ─── Primitives ───────────────────────────────────────────────────────────────

export const FadeRegionSchema = z.object({
  id: z.string(),
  /** Start of the fade region, relative to clip start (seconds) */
  startSec: z.number().min(0),
  /** End of the fade region, relative to clip start (seconds) */
  endSec: z.number().min(0),
  /** Gain value at the apex/nadir of the bezier curve (0..2) */
  peakGain: z.number().min(0).max(2),
  /** Normalized horizontal position of bezier control point (0..1, 0.5 = centered) */
  controlPointX: z.number().min(0).max(1),
})
export type FadeRegion = z.infer<typeof FadeRegionSchema>

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
  /** Bounded gain-modification zones (layer masks for gain shaping) */
  fadeRegions: z.array(FadeRegionSchema),
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

export function defaultClip(audioFileId: string, id: string): Clip {
  return {
    id,
    audioFileId,
    startSec: 0,
    trimStartSec: 0,
    trimEndSec: null,
    volume: 1.0,
    fadeRegions: [],
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
 * Evaluate a quadratic bezier at parameter t (0..1).
 * P0 = start, P1 = control, P2 = end.
 */
export function quadBezier(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
}

/**
 * Compute gain from fade regions at a given clip-relative time.
 * Outside all regions returns clipVolume. Inside a region, returns the
 * quadratic bezier value (departing from clipVolume, peaking at peakGain,
 * returning to clipVolume).
 */
export function interpolateFadeRegions(
  regions: FadeRegion[],
  timeSec: number,
  clipVolume: number
): number {
  for (const region of regions) {
    if (timeSec >= region.startSec && timeSec <= region.endSec) {
      const duration = region.endSec - region.startSec
      if (duration <= 0) return clipVolume
      const t = (timeSec - region.startSec) / duration
      return quadBezier(clipVolume, region.peakGain, clipVolume, t)
    }
  }
  return clipVolume
}
