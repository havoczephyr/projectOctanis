import type { Clip, EnvelopePoint } from '@octanis/shared'

/**
 * Converts a clip's volume envelope + fades into FFmpeg filter expressions.
 * Returns a filter chain string suitable for use in a filter_complex.
 */
export const EnvelopeMapper = {
  /**
   * Build a volume filter for a clip.
   * Outputs an afade (in) + volume (envelope) + afade (out) chain.
   */
  buildFilters(clip: Clip, clipDurationSec: number, absoluteStartSec: number): string[] {
    const filters: string[] = []

    // Base volume
    if (clip.volume !== 1.0) {
      filters.push(`volume=${clip.volume.toFixed(4)}`)
    }

    // Envelope automation using volume=eval=frame
    if (clip.envelope.length > 0) {
      const expr = buildEnvelopeExpression(clip.envelope, clipDurationSec)
      filters.push(`volume='${expr}':eval=frame`)
    }

    // Fade in
    if (clip.fadeIn.durationSec > 0) {
      const curve = fadeCurveToFfmpeg(clip.fadeIn.curve)
      filters.push(
        `afade=t=in:st=${absoluteStartSec.toFixed(4)}:d=${clip.fadeIn.durationSec.toFixed(4)}:curve=${curve}`
      )
    }

    // Fade out
    if (clip.fadeOut.durationSec > 0) {
      const fadeOutStart = absoluteStartSec + clipDurationSec - clip.fadeOut.durationSec
      const curve = fadeCurveToFfmpeg(clip.fadeOut.curve)
      filters.push(
        `afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${clip.fadeOut.durationSec.toFixed(4)}:curve=${curve}`
      )
    }

    return filters
  },
}

function fadeCurveToFfmpeg(curve: string): string {
  switch (curve) {
    case 'exponential': return 'exp'
    case 'logarithmic': return 'log'
    default: return 'tri'
  }
}

/**
 * Build an FFmpeg volume expression that linearly interpolates between envelope points.
 * Uses FFmpeg's `t` variable (time in seconds from stream start).
 */
function buildEnvelopeExpression(envelope: EnvelopePoint[], _clipDuration: number): string {
  if (envelope.length === 0) return '1'
  if (envelope.length === 1) return envelope[0].gain.toFixed(4)

  // Build piecewise linear expression using FFmpeg's if/between functions
  const segments: string[] = []

  for (let i = 0; i < envelope.length - 1; i++) {
    const p0 = envelope[i]
    const p1 = envelope[i + 1]
    const duration = p1.timeSec - p0.timeSec

    if (duration <= 0) continue

    // Linear interpolation: gain0 + (gain1 - gain0) * (t - t0) / (t1 - t0)
    const slope = (p1.gain - p0.gain) / duration
    const expr = `${p0.gain.toFixed(4)}+${slope.toFixed(6)}*(t-${p0.timeSec.toFixed(4)})`
    segments.push(`if(between(t,${p0.timeSec.toFixed(4)},${p1.timeSec.toFixed(4)}),${expr},0)`)
  }

  // Add clamp for before first point and after last point
  const first = envelope[0]
  const last = envelope[envelope.length - 1]

  return `if(lt(t,${first.timeSec.toFixed(4)}),${first.gain.toFixed(4)},if(gt(t,${last.timeSec.toFixed(4)}),${last.gain.toFixed(4)},${segments.join('+')}+0))`
}
