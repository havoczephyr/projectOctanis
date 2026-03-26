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
    const steps = Math.min(200, Math.max(10, Math.ceil(dur * 50)))
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

  // Build nested if() expression: piecewise linear between sample points
  // Returns 1.0 outside the region
  const inner = buildPiecewiseExpr(samples)
  return `if(between(t,${f(absStart)},${f(absEnd)}),${inner},1)`
}

/**
 * Build a nested if(lt(t,...)) piecewise-linear expression from sorted samples.
 */
function buildPiecewiseExpr(samples: Array<{ t: number; gain: number }>): string {
  if (samples.length <= 1) return f(samples[0]?.gain ?? 1)

  // Build from end backwards: if(lt(t,t1), seg0, if(lt(t,t2), seg1, ... gN))
  let expr = f(samples[samples.length - 1].gain)

  for (let i = samples.length - 2; i >= 0; i--) {
    const s0 = samples[i]
    const s1 = samples[i + 1]
    const dt = s1.t - s0.t

    let segExpr: string
    if (Math.abs(s1.gain - s0.gain) < 1e-6 || dt < 1e-6) {
      // Constant gain in this segment
      segExpr = f(s0.gain)
    } else {
      // Linear: g0 + slope * (t - t0)
      const slope = (s1.gain - s0.gain) / dt
      segExpr = `${f(s0.gain)}+${slope.toFixed(6)}*(t-${f(s0.t)})`
    }

    expr = `if(lt(t,${f(s1.t)}),${segExpr},${expr})`
  }

  return expr
}

/** Format a number to 4 decimal places for FFmpeg */
function f(n: number): string {
  return n.toFixed(4)
}
