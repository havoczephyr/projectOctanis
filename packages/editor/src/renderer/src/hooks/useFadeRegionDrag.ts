import { useCallback, useRef } from 'react'
import { nanoid } from 'nanoid'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import { useTimeToPixel } from './useTimeToPixel'
import type { FadeRegion } from '@octanis/shared'

interface UseFadeRegionDragOptions {
  trackId: string
  clipId: string
  clipDurationSec: number
  canvasWidth: number
  canvasHeight: number
}

export function useFadeRegionDrag({
  trackId,
  clipId,
  clipDurationSec,
  canvasWidth,
  canvasHeight,
}: UseFadeRegionDragOptions) {
  const addFadeRegion = useProjectStore((s) => s.addFadeRegion)
  const updateFadeRegion = useProjectStore((s) => s.updateFadeRegion)
  const removeFadeRegion = useProjectStore((s) => s.removeFadeRegion)
  const enterFadeRegionEditMode = useUiStore((s) => s.enterFadeRegionEditMode)
  const { pixelToTime } = useTimeToPixel()

  const dragRef = useRef<{ type: string } | null>(null)

  function pixelToGain(y: number): number {
    return Math.max(0, Math.min(2, 2 - (y / canvasHeight) * 2))
  }

  function pixelToTimeSec(x: number): number {
    return Math.max(0, Math.min(clipDurationSec, pixelToTime(x)))
  }

  /** Click-drag on SVG background to create a new region */
  const onBackgroundMouseDown = useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const svgRect = e.currentTarget.getBoundingClientRect()
      const startX = e.clientX - svgRect.left
      const startTimeSec = pixelToTimeSec(startX)
      let currentTimeSec = startTimeSec

      const regionId = nanoid()
      let created = false

      function onMouseMove(ev: MouseEvent): void {
        const cx = ev.clientX - svgRect.left
        currentTimeSec = pixelToTimeSec(cx)

        if (!created && Math.abs(currentTimeSec - startTimeSec) > 0.05) {
          const region: FadeRegion = {
            id: regionId,
            startSec: Math.min(startTimeSec, currentTimeSec),
            endSec: Math.max(startTimeSec, currentTimeSec),
            peakGain: 1.0,
            controlPointX: 0.5,
          }
          addFadeRegion(trackId, clipId, region)
          created = true
          enterFadeRegionEditMode(clipId, regionId)
        } else if (created) {
          updateFadeRegion(trackId, clipId, regionId, {
            startSec: Math.min(startTimeSec, currentTimeSec),
            endSec: Math.max(startTimeSec, currentTimeSec),
          })
        }
      }

      function onMouseUp(): void {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [trackId, clipId, clipDurationSec, addFadeRegion, updateFadeRegion, enterFadeRegionEditMode, pixelToTime]
  )

  /** Drag control point up/down to change peakGain */
  const onControlPointMouseDown = useCallback(
    (e: React.MouseEvent<SVGElement>, region: FadeRegion, svgElement?: SVGElement) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const svgEl = svgElement ?? (e.currentTarget as SVGElement)
      const svgRect = svgEl.getBoundingClientRect()

      function onMouseMove(ev: MouseEvent): void {
        const y = ev.clientY - svgRect.top
        const newGain = pixelToGain(y)
        updateFadeRegion(trackId, clipId, region.id, { peakGain: newGain })
      }

      function onMouseUp(): void {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [trackId, clipId, canvasHeight, updateFadeRegion]
  )

  /** Drag region edge to resize */
  const onEdgeMouseDown = useCallback(
    (e: React.MouseEvent<SVGElement>, region: FadeRegion, edge: 'start' | 'end', svgElement?: SVGElement) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const svgEl = svgElement ?? (e.currentTarget as SVGElement)
      const svgRect = svgEl.getBoundingClientRect()

      function onMouseMove(ev: MouseEvent): void {
        const x = ev.clientX - svgRect.left
        const timeSec = pixelToTimeSec(x)

        if (edge === 'start') {
          const newStart = Math.min(timeSec, region.endSec - 0.05)
          updateFadeRegion(trackId, clipId, region.id, { startSec: Math.max(0, newStart) })
        } else {
          const newEnd = Math.max(timeSec, region.startSec + 0.05)
          updateFadeRegion(trackId, clipId, region.id, { endSec: Math.min(clipDurationSec, newEnd) })
        }
      }

      function onMouseUp(): void {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [trackId, clipId, clipDurationSec, updateFadeRegion, pixelToTime]
  )

  /** Double-click to delete a region */
  const onRegionDoubleClick = useCallback(
    (e: React.MouseEvent, regionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      removeFadeRegion(trackId, clipId, regionId)
      useUiStore.getState().exitFadeRegionEditMode()
    },
    [trackId, clipId, removeFadeRegion]
  )

  /** Click a bookmark to enter edit mode */
  const onBookmarkClick = useCallback(
    (e: React.MouseEvent, regionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      enterFadeRegionEditMode(clipId, regionId)
    },
    [clipId, enterFadeRegionEditMode]
  )

  return {
    onBackgroundMouseDown,
    onControlPointMouseDown,
    onEdgeMouseDown,
    onRegionDoubleClick,
    onBookmarkClick,
  }
}
