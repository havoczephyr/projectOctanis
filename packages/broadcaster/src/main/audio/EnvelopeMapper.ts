import type { Clip, FadeRegion } from '@octanis/shared'
import { interpolateFadeRegionGain, DUCK_OFFSET } from '@octanis/shared'

/**
 * Converts a clip's fade regions and mute regions into FFmpeg filter expressions.
 * Samples the shared Hermite interpolation at N points to build piecewise-linear
 * FFmpeg volume expressions, matching the editor's Web Audio scheduling exactly.
 */
export const EnvelopeMapper = {
  buildFilters(clip: Clip, _clipDurationSec: number, absoluteStartSec: number): string[] {
    const filters: string[] = []

    // Base volume
    if (clip.volume !== 1.0) {
      filters.push(`volume=${clip.volume.toFixed(4)}`)
    }

    // Fade regions — build piecewise volume expression
    if (clip.fadeRegions.length > 0) {
      const segments: string[] = []
      for (const region of clip.fadeRegions) {
        const expr = buildFadeRegionExpr(region, absoluteStartSec)
        if (expr) segments.push(expr)
      }
      if (segments.length > 0) {
        // Multiply all region expressions (outside each region returns 1)
        const combined = segments.length === 1 ? segments[0] : segments.join('*')
        filters.push(`volume='${combined}':eval=frame`)
      }
    }

    // Mute regions — volume=0 for each muted time range
    for (const muteRegion of clip.muteRegions) {
      const absStart = (absoluteStartSec + muteRegion.startSec).toFixed(4)
      const absEnd = (absoluteStartSec + muteRegion.endSec).toFixed(4)
      filters.push(
        `volume=enable='between(t,${absStart},${absEnd})':volume=0`
      )
    }

    return filters
  },
}

/**
 * Build an FFmpeg volume expression for a single fade region.
 * Uses absolute timeline times (post-adelay).
 */
function buildFadeRegionExpr(region: FadeRegion, absoluteStartSec: number): string | null {
  const dur = region.endSec - region.startSec
  if (dur <= 0) return null

  const absStart = absoluteStartSec + region.startSec
  const absEnd = absoluteStartSec + region.endSec

  const hasControlPoints = region.controlPoints.length > 0

  // Build time-gain sample points
  const samples: Array<{ t: number; gain: number }> = []

  if (!hasControlPoints) {
    // 2-knot Hermite = linear — just use endpoints
    samples.push({ t: absStart, gain: region.startGain })
    samples.push({ t: absEnd, gain: region.endGain })
  } else {
    // Sample the Hermite curve at N steps, matching the editor's approach
    const steps = Math.min(20, Math.max(4, Math.ceil(dur * 8)))
    const duckPoints = region.controlPoints.filter((cp) => cp.duck)

    for (let i = 0; i <= steps; i++) {
      const normT = i / steps

      // Skip neighbors of duck points (matches editor useAudioEngine.ts:174-177)
      const isDuckNeighbor = duckPoints.some(
        (cp) => Math.abs(normT - cp.x) < DUCK_OFFSET * 2
      )
      if (isDuckNeighbor) continue

      const gain = interpolateFadeRegionGain(region, normT)
      samples.push({ t: absStart + normT * dur, gain })
    }

    // Insert duck points at their exact positions (matches editor useAudioEngine.ts:186-192)
    for (const cp of duckPoints) {
      samples.push({ t: absStart + cp.x * dur, gain: cp.gain })
    }

    // Sort by time
    samples.sort((a, b) => a.t - b.t)
  }

  if (samples.length < 2) return null

  // Merge consecutive samples with identical gain to avoid ffmpeg nesting depth limits.
  // A flat region that would generate 200 identical if-levels collapses to 2 endpoints.
  const merged = mergeConstantSegments(samples)

  // Cap total terms to keep expression length reasonable (depth is no longer an issue)
  const MAX_TERMS = 128
  const final = merged.length > MAX_TERMS ? downsample(merged, MAX_TERMS) : merged

  if (final.length < 2) return null

  // Build nested if() expression: piecewise linear between sample points
  // Returns 1.0 outside the region
  const inner = buildPiecewiseExpr(final)
  return `if(between(t,${f(absStart)},${f(absEnd)}),${inner},1)`
}

/**
 * Merge consecutive samples that share the same gain (within tolerance).
 * Keeps the first and last sample of each constant run so the piecewise
 * expression covers the full time range without redundant nesting levels.
 */
function mergeConstantSegments(
  samples: Array<{ t: number; gain: number }>
): Array<{ t: number; gain: number }> {
  if (samples.length <= 2) return samples
  const TOLERANCE = 1e-4
  const result: Array<{ t: number; gain: number }> = [samples[0]]

  for (let i = 1; i < samples.length; i++) {
    const prev = result[result.length - 1]
    const cur = samples[i]
    const next = i < samples.length - 1 ? samples[i + 1] : null

    const sameAsPrev = Math.abs(cur.gain - prev.gain) < TOLERANCE
    const sameAsNext = next !== null && Math.abs(cur.gain - next.gain) < TOLERANCE

    if (sameAsPrev && sameAsNext) {
      // Interior of a constant run — skip
      continue
    }

    result.push(cur)
  }

  return result
}

/**
 * Downsample to at most maxPoints by keeping first, last, and evenly spaced points.
 */
function downsample(
  samples: Array<{ t: number; gain: number }>,
  maxPoints: number
): Array<{ t: number; gain: number }> {
  if (samples.length <= maxPoints) return samples
  const result: Array<{ t: number; gain: number }> = [samples[0]]
  const step = (samples.length - 1) / (maxPoints - 1)
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(samples[Math.round(i * step)])
  }
  result.push(samples[samples.length - 1])
  return result
}

/**
 * Build a flat sum-of-products expression from sorted samples.
 * Uses half-open intervals: gte(t,a)*lt(t,b) for each segment, summed together.
 * This has O(1) nesting depth regardless of segment count, avoiding ffmpeg's
 * expression stack limit that the previous nested-if approach hit.
 */
function buildPiecewiseExpr(samples: Array<{ t: number; gain: number }>): string {
  if (samples.length <= 1) return f(samples[0]?.gain ?? 1)

  const terms: string[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i]
    const s1 = samples[i + 1]
    const isLast = i === samples.length - 2
    const dt = s1.t - s0.t

    // Half-open [t0, t1) for all but last; closed [tN-1, tN] for last
    const guard = isLast
      ? `gte(t,${f(s0.t)})*lte(t,${f(s1.t)})`
      : `gte(t,${f(s0.t)})*lt(t,${f(s1.t)})`

    if (Math.abs(s1.gain - s0.gain) < 1e-6 || dt < 1e-6) {
      terms.push(`${guard}*${f(s0.gain)}`)
    } else {
      const slope = (s1.gain - s0.gain) / dt
      const slopeStr = slope.toFixed(6)
      const op = slope < 0 ? '' : '+'
      terms.push(`${guard}*(${f(s0.gain)}${op}${slopeStr}*(t-${f(s0.t)}))`)
    }
  }

  return terms.join('+')
}

/** Format a number to 4 decimal places for FFmpeg */
function f(n: number): string {
  return n.toFixed(4)
}
