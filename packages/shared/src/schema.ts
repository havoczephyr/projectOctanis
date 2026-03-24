import { z } from 'zod'

// ─── Primitives ───────────────────────────────────────────────────────────────

export const GainControlPointSchema = z.object({
  id: z.string(),
  /** Normalized position within the fade region (0 = start edge, 1 = end edge) */
  x: z.number().min(0).max(1),
  /** Gain value at this point (0..2, where 1.0 = original volume) */
  gain: z.number().min(0).max(2),
})
export type GainControlPoint = z.infer<typeof GainControlPointSchema>

export const FadeRegionSchema = z.object({
  id: z.string(),
  /** Start of the fade region, relative to clip start (seconds) */
  startSec: z.number().min(0),
  /** End of the fade region, relative to clip start (seconds) */
  endSec: z.number().min(0),
  /** Gain at the left edge of the region (0..2) */
  startGain: z.number().min(0).max(2),
  /** Gain at the right edge of the region (0..2) */
  endGain: z.number().min(0).max(2),
  /** User-placed control points, sorted by x (0..1). Can be empty. */
  controlPoints: z.array(GainControlPointSchema),
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
 * @deprecated Kept for backward compatibility. Use interpolateFadeRegionGain instead.
 */
export function quadBezier(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
}

/**
 * Monotone cubic Hermite interpolation (Fritsch-Carlson).
 * Evaluates the curve at parameter `t` within the segment between knots[i] and knots[i+1].
 * Guarantees no overshoot — critical for gain values staying in range.
 */
function hermiteSegment(
  x0: number, y0: number, m0: number,
  x1: number, y1: number, m1: number,
  t: number
): number {
  const dx = x1 - x0
  const s = (t - x0) / dx
  const s2 = s * s
  const s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1
  const h10 = s3 - 2 * s2 + s
  const h01 = -2 * s3 + 3 * s2
  const h11 = s3 - s2
  return h00 * y0 + h10 * dx * m0 + h01 * y1 + h11 * dx * m1
}

/**
 * Evaluate the gain curve of a fade region at normalized position t (0..1).
 * Uses monotone cubic Hermite interpolation through all knots:
 * [(0, startGain), ...controlPoints sorted by x, (1, endGain)]
 */
export function interpolateFadeRegionGain(region: FadeRegion, t: number): number {
  // Build knot sequence
  const knots: Array<{ x: number; y: number }> = [
    { x: 0, y: region.startGain },
    ...region.controlPoints
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((p) => ({ x: p.x, y: p.gain })),
    { x: 1, y: region.endGain },
  ]

  const n = knots.length
  if (n === 1) return knots[0].y
  if (t <= knots[0].x) return knots[0].y
  if (t >= knots[n - 1].x) return knots[n - 1].y

  // Two knots = linear
  if (n === 2) {
    const dx = knots[1].x - knots[0].x
    if (dx <= 0) return knots[0].y
    const s = (t - knots[0].x) / dx
    return knots[0].y + s * (knots[1].y - knots[0].y)
  }

  // Compute secants
  const deltas: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = knots[i + 1].x - knots[i].x
    deltas.push(dx > 0 ? (knots[i + 1].y - knots[i].y) / dx : 0)
  }

  // Initial tangents (Catmull-Rom style)
  const tangents: number[] = new Array(n)
  tangents[0] = deltas[0]
  tangents[n - 1] = deltas[n - 2]
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = (deltas[i - 1] + deltas[i]) / 2
  }

  // Fritsch-Carlson monotonicity enforcement
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(deltas[i]) < 1e-12) {
      tangents[i] = 0
      tangents[i + 1] = 0
    } else {
      const alpha = tangents[i] / deltas[i]
      const beta = tangents[i + 1] / deltas[i]
      const mag = alpha * alpha + beta * beta
      if (mag > 9) {
        const tau = 3 / Math.sqrt(mag)
        tangents[i] = tau * alpha * deltas[i]
        tangents[i + 1] = tau * beta * deltas[i]
      }
    }
  }

  // Find segment and evaluate
  for (let i = 0; i < n - 1; i++) {
    if (t >= knots[i].x && t <= knots[i + 1].x) {
      return hermiteSegment(
        knots[i].x, knots[i].y, tangents[i],
        knots[i + 1].x, knots[i + 1].y, tangents[i + 1],
        t
      )
    }
  }

  return knots[n - 1].y
}

/**
 * Compute gain from fade regions at a given clip-relative time.
 * Outside all regions returns clipVolume. Inside a region, uses monotone
 * cubic Hermite interpolation through the region's control points.
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
      return interpolateFadeRegionGain(region, t)
    }
  }
  return clipVolume
}
