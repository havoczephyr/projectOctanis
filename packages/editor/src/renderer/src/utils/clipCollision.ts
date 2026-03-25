import type { Track, Clip, AudioFile } from '@octanis/shared'

/** Get the effective duration of a clip (accounting for trim + loop) */
export function getClipDurationSec(clip: Clip, audioFiles: Record<string, AudioFile>): number {
  const af = audioFiles[clip.audioFileId]
  const baseDur = clip.trimEndSec != null
    ? clip.trimEndSec - clip.trimStartSec
    : af?.durationSec ?? 30
  const loopExtra = clip.loop
    ? (clip.loop.endSec - clip.loop.startSec) *
      (typeof clip.loop.count === 'number' ? clip.loop.count : 10)
    : 0
  return baseDur + loopExtra
}

/** Get the absolute end time of a clip on the timeline */
export function getClipEndSec(clip: Clip, audioFiles: Record<string, AudioFile>): number {
  return clip.startSec + getClipDurationSec(clip, audioFiles)
}

/**
 * Check if placing a clip at `startSec` with `durationSec` would overlap
 * any existing clip on the track. Returns the first colliding clip, or null.
 */
export function findClipCollision(
  track: Track,
  durationSec: number,
  startSec: number,
  excludeClipId: string | null,
  audioFiles: Record<string, AudioFile>
): Clip | null {
  const endSec = startSec + durationSec
  for (const clip of track.clips) {
    if (clip.id === excludeClipId) continue
    const clipEnd = getClipEndSec(clip, audioFiles)
    if (startSec < clipEnd && endSec > clip.startSec) {
      return clip
    }
  }
  return null
}

/**
 * Snap a proposed clip placement to the nearest adjacent clip edge
 * if within `snapThresholdSec`. Returns the (possibly snapped) start time.
 */
export function snapToAdjacentClip(
  track: Track,
  durationSec: number,
  proposedStartSec: number,
  excludeClipId: string | null,
  audioFiles: Record<string, AudioFile>,
  snapThresholdSec: number
): number {
  const proposedEnd = proposedStartSec + durationSec
  let bestStart = proposedStartSec
  let bestDist = Infinity

  for (const clip of track.clips) {
    if (clip.id === excludeClipId) continue
    const clipEnd = getClipEndSec(clip, audioFiles)

    // Snap proposed start to existing clip's right edge (place after it)
    const distToRight = Math.abs(proposedStartSec - clipEnd)
    if (distToRight < snapThresholdSec && distToRight < bestDist) {
      bestDist = distToRight
      bestStart = clipEnd
    }

    // Snap proposed end to existing clip's left edge (place before it)
    const distToLeft = Math.abs(proposedEnd - clip.startSec)
    if (distToLeft < snapThresholdSec && distToLeft < bestDist) {
      bestDist = distToLeft
      bestStart = clip.startSec - durationSec
    }
  }

  return Math.max(0, bestStart)
}
