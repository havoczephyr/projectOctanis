import { useCallback } from 'react'
import { nanoid } from 'nanoid'
import { type GainControlPoint, DUCK_OFFSET } from '@octanis/shared'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'

interface UseFadeRegionActionsOptions {
  trackId: string
  clipId: string
}

export function useFadeRegionActions({ trackId, clipId }: UseFadeRegionActionsOptions) {
  const removeFadeRegion = useProjectStore((s) => s.removeFadeRegion)
  const openFadeGainEditor = useUiStore((s) => s.openFadeGainEditor)

  /** Double-click to delete a region */
  const onRegionDoubleClick = useCallback(
    (e: React.MouseEvent, regionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      removeFadeRegion(trackId, clipId, regionId)
    },
    [trackId, clipId, removeFadeRegion]
  )

  /** Click a bookmark to open the fade gain editor popup */
  const onBookmarkClick = useCallback(
    (e: React.MouseEvent, regionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      openFadeGainEditor(trackId, clipId, regionId)
    },
    [trackId, clipId, openFadeGainEditor]
  )

  return { onRegionDoubleClick, onBookmarkClick }
}

/**
 * Create a duck (rectangular gain notch) directly on the timeline.
 *
 * If an existing fade region covers the range, adds duck control points to it.
 * Otherwise creates a new fade region spanning the range with the duck points.
 */
export function createDuckOnTimeline(
  trackId: string,
  clipId: string,
  rangeStartSec: number,
  rangeEndSec: number,
  duckGain: number,
  clipVolume: number
): void {
  const store = useProjectStore.getState()
  const tracks = store.projectFile.project.tracks
  const track = tracks.find((t) => t.id === trackId)
  const clip = track?.clips.find((c) => c.id === clipId)
  if (!clip) return

  const regionDur = rangeEndSec - rangeStartSec
  if (regionDur < 0.01) return

  // Check if an existing fade region covers the range
  const coveringRegion = clip.fadeRegions.find(
    (r) => r.startSec <= rangeStartSec + 0.001 && r.endSec >= rangeEndSec - 0.001
  )

  if (coveringRegion) {
    // Add duck control points to existing region
    const rDur = coveringRegion.endSec - coveringRegion.startSec
    const normStart = (rangeStartSec - coveringRegion.startSec) / rDur
    const normEnd = (rangeEndSec - coveringRegion.startSec) / rDur

    // Remove any existing points in the duck range
    const remaining = coveringRegion.controlPoints.filter(
      (p) => p.x < normStart - DUCK_OFFSET || p.x > normEnd + DUCK_OFFSET
    )

    const duckPoints: GainControlPoint[] = [
      { id: nanoid(), x: normStart, gain: clipVolume, duck: true },
      { id: nanoid(), x: normStart + DUCK_OFFSET, gain: duckGain, duck: true },
      { id: nanoid(), x: normEnd - DUCK_OFFSET, gain: duckGain, duck: true },
      { id: nanoid(), x: normEnd, gain: clipVolume, duck: true },
    ]

    const newPoints = [...remaining, ...duckPoints].sort((a, b) => a.x - b.x)
    store.updateFadeRegion(trackId, clipId, coveringRegion.id, { controlPoints: newPoints })
  } else {
    // Create a new fade region spanning the range with duck points
    const regionId = nanoid()
    const duckPoints: GainControlPoint[] = [
      { id: nanoid(), x: 0, gain: clipVolume, duck: true },
      { id: nanoid(), x: DUCK_OFFSET, gain: duckGain, duck: true },
      { id: nanoid(), x: 1 - DUCK_OFFSET, gain: duckGain, duck: true },
      { id: nanoid(), x: 1, gain: clipVolume, duck: true },
    ]

    store.addFadeRegion(trackId, clipId, {
      id: regionId,
      startSec: rangeStartSec,
      endSec: rangeEndSec,
      startGain: clipVolume,
      endGain: clipVolume,
      controlPoints: duckPoints,
    })
  }
}
