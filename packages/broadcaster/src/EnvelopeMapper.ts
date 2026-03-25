import type { Clip } from '@octanis/shared'

/**
 * Converts a clip's fade regions and mute regions into FFmpeg filter expressions.
 * Returns a filter chain string suitable for use in a filter_complex.
 */
export const EnvelopeMapper = {
  buildFilters(clip: Clip, clipDurationSec: number, absoluteStartSec: number): string[] {
    const filters: string[] = []

    // Base volume
    if (clip.volume !== 1.0) {
      filters.push(`volume=${clip.volume.toFixed(4)}`)
    }

    // Fade regions — build piecewise volume expression
    if (clip.fadeRegions.length > 0) {
      const segments: string[] = []
      for (const region of clip.fadeRegions) {
        const rStart = (region.startSec).toFixed(4)
        const rEnd = (region.endSec).toFixed(4)
        const dur = region.endSec - region.startSec
        if (dur <= 0) continue
        // Linear interpolation from startGain to endGain within region
        const slope = ((region.endGain - region.startGain) / dur)
        const expr = `${region.startGain.toFixed(4)}+${slope.toFixed(6)}*(t-${rStart})`
        segments.push(`if(between(t,${rStart},${rEnd}),${expr},1)`)
      }
      if (segments.length > 0) {
        // Outside all regions gain is 1 (clip volume already applied above)
        const combined = segments.length === 1
          ? segments[0]
          : segments.join('*')
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
