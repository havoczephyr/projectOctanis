import { useCallback } from 'react'
import { useProjectStore } from '../store/projectStore'
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
  const { pixelToTime } = useTimeToPixel()

  function pixelToGain(y: number): number {
    // Top of canvas = gain 2.0, center = 1.0, bottom = 0.0
    return Math.max(0, Math.min(2, 2 - (y / canvasHeight) * 2))
  }

  function pixelToTimeSec(x: number): number {
    // x is relative to clip start
    return Math.max(0, Math.min(clipDurationSec, pixelToTime(x)))
  }

  const onSvgMouseDown = useCallback(
    (
      e: React.MouseEvent<SVGElement>,
      existingPoint?: EnvelopePoint
    ) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const svgRect = (e.currentTarget as SVGElement).getBoundingClientRect()

      function getPoint(ev: MouseEvent): EnvelopePoint {
        const x = ev.clientX - svgRect.left
        const y = ev.clientY - svgRect.top
        return {
          timeSec: existingPoint
            ? existingPoint.timeSec // locked in time for existing point moves
            : pixelToTimeSec(x),
          gain: pixelToGain(y),
        }
      }

      // For moving an existing point, allow time axis movement too
      function getPointFree(ev: MouseEvent): EnvelopePoint {
        const x = ev.clientX - svgRect.left
        const y = ev.clientY - svgRect.top
        return {
          timeSec: pixelToTimeSec(x),
          gain: pixelToGain(y),
        }
      }

      const initialPoint = existingPoint ?? getPoint(e.nativeEvent)
      upsertEnvelopePoint(trackId, clipId, initialPoint)

      function onMouseMove(ev: MouseEvent): void {
        const point = existingPoint ? getPointFree(ev) : getPoint(ev)
        upsertEnvelopePoint(trackId, clipId, point)
      }

      function onMouseUp(): void {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [clipId, clipDurationSec, pixelToGain, pixelToTimeSec, trackId, upsertEnvelopePoint]
  )

  const onHandleDoubleClick = useCallback(
    (e: React.MouseEvent, timeSec: number) => {
      e.preventDefault()
      e.stopPropagation()
      removeEnvelopePoint(trackId, clipId, timeSec)
    },
    [clipId, removeEnvelopePoint, trackId]
  )

  return { onSvgMouseDown, onHandleDoubleClick }
}
