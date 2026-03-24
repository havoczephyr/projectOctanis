import { useCallback } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore, isPointSelected } from '../store/uiStore'
import { useTimeToPixel } from './useTimeToPixel'
import type { EnvelopePoint } from '@octanis/shared'

interface UseWaveformDragOptions {
  trackId: string
  clipId: string
  clipDurationSec: number
  canvasWidth: number
  canvasHeight: number
}

export function useWaveformDrag({
  trackId,
  clipId,
  clipDurationSec,
  canvasWidth,
  canvasHeight,
}: UseWaveformDragOptions) {
  const upsertEnvelopePoint = useProjectStore((s) => s.upsertEnvelopePoint)
  const removeEnvelopePoint = useProjectStore((s) => s.removeEnvelopePoint)
  const moveEnvelopePoints = useProjectStore((s) => s.moveEnvelopePoints)
  const selectEnvelopePoint = useUiStore((s) => s.selectEnvelopePoint)
  const deselectAllEnvelopePoints = useUiStore((s) => s.deselectAllEnvelopePoints)
  const { pixelToTime } = useTimeToPixel()

  function pixelToGain(y: number): number {
    return Math.max(0, Math.min(2, 2 - (y / canvasHeight) * 2))
  }

  function pixelToTimeSec(x: number): number {
    return Math.max(0, Math.min(clipDurationSec, pixelToTime(x)))
  }

  /**
   * Click on empty SVG background — create a new point, deselect all.
   */
  const onSvgMouseDown = useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const svgRect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - svgRect.left
      const y = e.clientY - svgRect.top
      const newPoint: EnvelopePoint = {
        timeSec: pixelToTimeSec(x),
        gain: pixelToGain(y),
      }

      deselectAllEnvelopePoints()
      upsertEnvelopePoint(trackId, clipId, newPoint)
      selectEnvelopePoint(newPoint.timeSec, false)

      // Allow drag to refine the new point's gain
      function onMouseMove(ev: MouseEvent): void {
        const my = ev.clientY - svgRect.top
        upsertEnvelopePoint(trackId, clipId, {
          timeSec: newPoint.timeSec,
          gain: pixelToGain(my),
        })
      }

      function onMouseUp(): void {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [clipId, clipDurationSec, canvasHeight, trackId, upsertEnvelopePoint, selectEnvelopePoint, deselectAllEnvelopePoints, pixelToTime]
  )

  /**
   * Click on an existing point handle — select and optionally drag.
   */
  const onHandleMouseDown = useCallback(
    (
      e: React.MouseEvent<SVGElement>,
      point: EnvelopePoint,
      svgElement?: SVGElement
    ) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const selectedPoints = useUiStore.getState().selectedEnvelopePoints

      // Selection logic
      if (e.shiftKey) {
        selectEnvelopePoint(point.timeSec, true)
      } else if (!isPointSelected(selectedPoints, point.timeSec)) {
        selectEnvelopePoint(point.timeSec, false)
      }

      // Snapshot all selected points for multi-drag
      const svgEl = svgElement ?? (e.currentTarget as SVGElement)
      const svgRect = svgEl.getBoundingClientRect()
      const startX = e.clientX - svgRect.left
      const startY = e.clientY - svgRect.top

      // Read the updated selection after the selection logic above
      const currentSelected = useUiStore.getState().selectedEnvelopePoints
      const clip = useProjectStore.getState().projectFile.project.tracks
        .find((t) => t.id === trackId)
        ?.clips.find((c) => c.id === clipId)
      if (!clip) return

      const snapshots: EnvelopePoint[] = clip.envelope.filter((p) =>
        isPointSelected(currentSelected, p.timeSec)
      )
      // If the clicked point wasn't in the selection yet (non-shift click), include it
      if (!snapshots.some((s) => Math.abs(s.timeSec - point.timeSec) < 0.001)) {
        snapshots.push({ ...point })
      }

      let hasMoved = false

      function onMouseMove(ev: MouseEvent): void {
        hasMoved = true
        const cx = ev.clientX - svgRect.left
        const cy = ev.clientY - svgRect.top
        const deltaTime = pixelToTimeSec(cx) - pixelToTimeSec(startX)
        const deltaGain = pixelToGain(cy) - pixelToGain(startY)

        const moves = snapshots.map((snap) => ({
          fromTimeSec: snap.timeSec,
          to: {
            timeSec: Math.max(0, Math.min(clipDurationSec, snap.timeSec + deltaTime)),
            gain: Math.max(0, Math.min(2, snap.gain + deltaGain)),
          },
        }))

        moveEnvelopePoints(trackId, clipId, moves)

        // Update snapshots' fromTimeSec to track the moved positions
        for (let i = 0; i < snapshots.length; i++) {
          snapshots[i] = { ...moves[i].to }
        }

        // Update selection to new timeSec values
        useUiStore.setState({
          selectedEnvelopePoints: moves.map((m) => m.to.timeSec),
        })
      }

      function onMouseUp(): void {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [clipId, clipDurationSec, canvasHeight, trackId, moveEnvelopePoints, selectEnvelopePoint, pixelToTime]
  )

  const onHandleDoubleClick = useCallback(
    (e: React.MouseEvent, timeSec: number) => {
      e.preventDefault()
      e.stopPropagation()
      removeEnvelopePoint(trackId, clipId, timeSec)
      // Remove from selection too
      const selected = useUiStore.getState().selectedEnvelopePoints
      useUiStore.setState({
        selectedEnvelopePoints: selected.filter(
          (t) => Math.abs(t - timeSec) >= 0.001
        ),
      })
    },
    [clipId, removeEnvelopePoint, trackId]
  )

  return { onSvgMouseDown, onHandleMouseDown, onHandleDoubleClick }
}
